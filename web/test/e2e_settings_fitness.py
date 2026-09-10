"""能力与配置的浏览器冒烟：配速计算器 -> 我的能力 -> 重建课表 -> 重置全部数据。

重点覆盖跨页面一致性：能力缓存如果不同步，别的页面会继续用旧配速。
"""

import json
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
RACE_DATE = "2026-11-15"
PLAN_ID = f"20-week:{RACE_DATE}"


def storage_script() -> str:
    athlete = {
        "id": "local-e2e",
        "provider": "local",
        "planId": PLAN_ID,
        "templateId": "20-week",
        "raceDate": RACE_DATE,
        "maxWeeklyKm": 60,
        "vdot": 40.0,
        "raceResults": [{"distanceM": 10000, "timeSeconds": 2900, "date": "2026-08-01"}],
        "isBeginner": False,
        "schemaVersion": 1,
        "createdAt": "2026-09-10T08:00:00.000Z",
        "updatedAt": "2026-09-10T08:00:00.000Z",
    }
    plan = {
        "id": PLAN_ID,
        "templateId": "20-week",
        "templateVersion": 1,
        "raceDate": RACE_DATE,
        "paces": {},
        "weeks": [],
    }
    session = {
        "id": f"{PLAN_ID}:day-e2e:0",
        "planId": PLAN_ID,
        "dayId": "day-e2e",
        "seq": 0,
        "label": "轻松跑",
        "status": "planned",
        "createdAt": "2026-09-10T08:00:00.000Z",
        "updatedAt": "2026-09-10T08:00:00.000Z",
    }
    # 自定义课程库与训练数据分开存储：重置训练数据时必须保留
    course = {
        "id": "course-e2e-keep",
        "origin": "custom",
        "category": "E",
        "tags": ["E"],
        "source": "自定义",
        "workout": {
            "dslVersion": 1,
            "goal": "有氧基础",
            "phases": [
                {
                    "role": "main",
                    "segments": [
                        {
                            "kind": "run",
                            "load": {"type": "time", "seconds": 2400},
                            "target": {"type": "daniels", "zone": "E"},
                        }
                    ],
                }
            ],
        },
    }
    values = {
        "tfm:athletes:current": athlete,
        f"tfm:plans:{PLAN_ID}": plan,
        f"tfm:sessions:{session['id']}": session,
        "tfm:course-library:v1": [course],
    }
    statements = [
        f"localStorage.setItem({json.dumps(key)}, {json.dumps(json.dumps(value, ensure_ascii=False))});"
        for key, value in values.items()
    ]
    # 只在首次进入时注入：重置流程会 reload，重复注入会让「已清空」的断言失真
    return "\n".join(
        [
            "if (!sessionStorage.getItem('e2e-seeded')) {",
            *statements,
            "sessionStorage.setItem('e2e-seeded', '1');",
            "}",
        ]
    )


def shot(page, name: str) -> None:
    output = Path(__file__).resolve().parent.parent / "test-results" / f"settings-{name}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(output), full_page=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    console_errors = []
    dialogs = []
    page.on(
        "console",
        lambda message: console_errors.append(message.text) if message.type == "error" else None,
    )

    def accept_dialog(dialog):
        dialogs.append(dialog.message)
        dialog.accept()

    page.on("dialog", accept_dialog)
    page.add_init_script(storage_script())

    # 1) 我的能力：显示已保存能力
    page.goto(f"{BASE_URL}/#/fitness")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_test_id("fitness-mode")).to_have_text("VDOT 40.0")
    shot(page, "fitness-vdot")

    # 2) 配速计算器：推算并保存为我的能力
    page.goto(f"{BASE_URL}/#/paces")
    page.wait_for_load_state("networkidle")
    page.get_by_placeholder("45:00 或 1:24:30").fill("40:00")
    page.get_by_role("button", name="推算 VDOT 与训练配速").click()
    expect(page.locator(".stats-number")).to_be_visible()
    computed = float(page.locator(".stats-number").inner_text())
    assert computed > 45, computed
    shot(page, "paces-vdot")
    page.locator(".result-block").get_by_role("button", name="保存为我的能力").click()
    page.wait_for_timeout(300)
    # 保存反馈是应用内消息（不再是阻塞式 window.alert）
    expect(page.locator(".t-message").filter(has_text="已保存为我的能力")).to_have_count(1)

    stored_vdot = page.evaluate("JSON.parse(localStorage.getItem('tfm:athletes:current')).vdot")
    assert stored_vdot and abs(stored_vdot - computed) < 0.05, (stored_vdot, computed)

    # 3) 跨页面一致性：能力管理页应立即显示新能力，而不是旧缓存
    page.goto(f"{BASE_URL}/#/fitness")
    page.wait_for_load_state("networkidle")
    # 断言落在能力卡片上，而不是刚弹出的应用内消息（消息里也会出现同一串配速文案）
    expect(page.get_by_test_id("fitness-mode")).to_have_text(f"VDOT {stored_vdot:.1f}")
    shot(page, "fitness-refreshed")

    # 4) 配置页：用最新能力重建课表
    page.goto(f"{BASE_URL}/#/settings")
    page.wait_for_load_state("networkidle")
    expect(page.locator(".kv").filter(has_text="配速基准")).to_contain_text(f"VDOT {stored_vdot:.1f}")
    page.get_by_role("button", name="保存并重建课表").click()
    expect(page).to_have_url(re.compile(r"#/training$"))

    plan = page.evaluate("(key) => JSON.parse(localStorage.getItem(key))", f"tfm:plans:{PLAN_ID}")
    assert len(plan["weeks"]) == 20, len(plan["weeks"])
    assert set(plan["paces"].keys()) >= {"E", "M", "T", "I", "R"}, plan["paces"]
    rebuilt = page.evaluate("JSON.parse(localStorage.getItem('tfm:athletes:current'))")
    assert abs(rebuilt["vdot"] - stored_vdot) < 0.05, rebuilt["vdot"]
    shot(page, "settings-rebuilt")

    # 5) 清除能力：立即回到「尚未建立能力」
    page.goto(f"{BASE_URL}/#/fitness")
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="清除能力").click()
    expect(page.get_by_text("尚未建立能力")).to_be_visible()
    cleared = page.evaluate("JSON.parse(localStorage.getItem('tfm:athletes:current'))")
    assert not cleared.get("vdot"), cleared
    shot(page, "fitness-cleared")

    # 5b) 直接在能力页设置阈值配速：对话框内先校验、再预览档位，最后保存
    page.get_by_test_id("open-six").click()
    six_dialog = page.get_by_test_id("six-dialog")
    expect(six_dialog).to_be_visible()
    expect(six_dialog).to_contain_text("4:00/km")

    # 非法值（0 分 0 秒）不开后门：给出提示且不保存
    page.get_by_test_id("six-min").locator("input").fill("0")
    page.get_by_test_id("six-sec").locator("input").fill("0")
    page.get_by_test_id("six-sec").locator("input").press("Tab")
    expect(six_dialog.get_by_test_id("six-error")).to_be_visible()

    page.get_by_test_id("six-min").locator("input").fill("4")
    page.get_by_test_id("six-sec").locator("input").fill("30")
    page.get_by_test_id("six-sec").locator("input").press("Tab")
    expect(six_dialog.get_by_test_id("six-error")).to_have_count(0)
    expect(six_dialog).to_contain_text("4:30/km")
    shot(page, "fitness-six-dialog")
    page.get_by_test_id("six-save").click()

    expect(page.get_by_test_id("fitness-mode")).to_have_text("6 秒规则（阈值配速）")
    saved_six = page.evaluate("JSON.parse(localStorage.getItem('tfm:athletes:current')).thresholdPaceSecondsPerKm")
    assert saved_six == 270, saved_six

    # 6) 清空训练数据：配置、课表、会话一并清空，自定义课程库保留
    page.goto(f"{BASE_URL}/#/settings")
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="删除课表并清空训练数据").click()
    page.wait_for_timeout(500)
    keys = page.evaluate("Object.keys(localStorage)")
    assert not [key for key in keys if key.startswith("tfm:plans:")], keys
    assert not [key for key in keys if key.startswith("tfm:sessions:")], keys
    assert not [key for key in keys if key.startswith("tfm:progress:")], keys
    reset_athlete = page.evaluate("JSON.parse(localStorage.getItem('tfm:athletes:current'))")
    assert not reset_athlete.get("planId"), reset_athlete
    kept_courses = page.evaluate("JSON.parse(localStorage.getItem('tfm:course-library:v1'))")
    assert [item.get("id") for item in kept_courses] == ["course-e2e-keep"], kept_courses

    page.goto(f"{BASE_URL}/#/training")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("建立训练配置")).to_be_visible()
    expect(page.get_by_role("button", name="建立配置")).to_be_visible()
    shot(page, "settings-reset")

    # 破坏性操作仍然用原生 confirm 二次确认
    assert any("清除能力" in message for message in dialogs), dialogs
    assert not console_errors, console_errors
    browser.close()

print("settings & fitness browser smoke test passed")
