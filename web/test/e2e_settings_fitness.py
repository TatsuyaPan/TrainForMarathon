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
    values = {
        "tfm:athletes:current": athlete,
        f"tfm:plans:{PLAN_ID}": plan,
        f"tfm:sessions:{session['id']}": session,
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
    expect(page.get_by_text("VDOT 40.0")).to_be_visible()
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

    stored_vdot = page.evaluate("JSON.parse(localStorage.getItem('tfm:athletes:current')).vdot")
    assert stored_vdot and abs(stored_vdot - computed) < 0.05, (stored_vdot, computed)

    # 3) 跨页面一致性：能力管理页应立即显示新能力，而不是旧缓存
    page.goto(f"{BASE_URL}/#/fitness")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text(f"VDOT {stored_vdot:.1f}")).to_be_visible()
    expect(page.get_by_text("VDOT 40.0")).to_have_count(0)
    shot(page, "fitness-refreshed")

    # 4) 配置页：用最新能力重建课表
    page.goto(f"{BASE_URL}/#/settings")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text(f"VDOT {stored_vdot:.1f}")).to_be_visible()
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

    # 6) 重置全部数据：配置、课表、会话一并清空
    page.goto(f"{BASE_URL}/#/settings")
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="删除课表并重置全部数据").click()
    page.wait_for_timeout(500)
    keys = page.evaluate("Object.keys(localStorage)")
    assert not [key for key in keys if key.startswith("tfm:plans:")], keys
    assert not [key for key in keys if key.startswith("tfm:sessions:")], keys
    assert not [key for key in keys if key.startswith("tfm:progress:")], keys
    reset_athlete = page.evaluate("JSON.parse(localStorage.getItem('tfm:athletes:current'))")
    assert not reset_athlete.get("planId"), reset_athlete

    page.goto(f"{BASE_URL}/#/training")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("建立训练配置")).to_be_visible()
    expect(page.get_by_role("button", name="建立配置")).to_be_visible()
    shot(page, "settings-reset")

    assert any("已保存为我的能力" in message for message in dialogs), dialogs
    assert not console_errors, console_errors
    browser.close()

print("settings & fitness browser smoke test passed")
