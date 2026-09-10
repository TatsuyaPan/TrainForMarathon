import json
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
DATE = "2026-09-10"


def storage_script() -> str:
    workout = {
        "dslVersion": 1,
        "goal": "有氧耐力",
        "phases": [
            {
                "role": "main",
                "segments": [
                    {
                        "kind": "run",
                        "load": {"type": "distance", "meters": 8000},
                        "target": {"type": "daniels", "zone": "E"},
                    }
                ],
            }
        ],
    }
    athlete = {
        "id": "local-e2e",
        "provider": "local",
        "planId": "plan-e2e",
        "schemaVersion": 1,
        "createdAt": "2026-09-10T08:00:00.000Z",
        "updatedAt": "2026-09-10T08:00:00.000Z",
    }
    plan = {
        "id": "plan-e2e",
        "templateId": "20-week",
        "templateVersion": 1,
        "raceDate": "2026-09-13",
        "paces": {
            "E": {"fast": 290, "slow": 310},
            "M": {"fast": 260, "slow": 270},
            "T": {"fast": 245, "slow": 260},
            "I": {"fast": 230, "slow": 245},
            "R": {"fast": 215, "slow": 230},
        },
        "weeks": [
            {
                "week": 1,
                "phase": "验证周",
                "volume": {"min": 30, "max": 40},
                "targetKm": {"min": 30, "max": 40},
                "days": [
                    {
                        "id": "day-e2e",
                        "dayIndex": 3,
                        "date": DATE,
                        "label": "轻松跑",
                        "items": [{"type": "E"}],
                        "workout": workout,
                        "plannedDistanceKm": 8,
                    }
                ],
            }
        ],
    }
    values = {
        "tfm:athletes:current": athlete,
        "tfm:plans:plan-e2e": plan,
    }
    statements = [
        f"localStorage.setItem({json.dumps(key)}, {json.dumps(json.dumps(value, ensure_ascii=False))});"
        for key, value in values.items()
    ]
    return "\n".join(statements)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    # 保存/移除走 window.alert 与 window.confirm：统一接受，否则确认框会被自动取消
    page.on("dialog", lambda dialog: dialog.accept())
    page.add_init_script(storage_script())
    page.goto(f"{BASE_URL}/#/training/day?date={DATE}")
    page.wait_for_load_state("networkidle")

    expect(page.locator("[data-session-id]")).to_have_count(1)
    page.get_by_test_id("show-add-session").click()
    page.get_by_placeholder("例：晚间恢复跑").fill("晚间恢复跑")
    page.get_by_test_id("add-session").click()
    expect(page.locator("[data-session-id]")).to_have_count(2)

    first = page.locator('[data-session-id="plan-e2e:day-e2e:0"]')
    first.get_by_role("button", name="未进行").click()
    expect(first).to_contain_text("未进行")

    second = page.locator('[data-session-id="plan-e2e:day-e2e:1"]')
    second.get_by_role("button", name="记录并完成").click()
    expect(page.get_by_role("heading", name="完成这次训练")).to_be_visible()
    number_inputs = page.locator(".metrics-grid input")
    number_inputs.nth(0).fill("5")
    number_inputs.nth(1).fill("32")
    number_inputs.nth(2).fill("5")
    page.get_by_placeholder("身体感受、天气、补给、疼痛或值得记住的瞬间…").fill("晚间状态轻松")
    page.get_by_test_id("save-record").click()

    expect(page.locator('[data-session-id="plan-e2e:day-e2e:1"]')).to_contain_text("5 km")
    page.locator('[data-session-id="plan-e2e:day-e2e:1"]').get_by_role("button", name="查看或编辑记录").click()
    expect(page.get_by_role("heading", name="编辑训练记录")).to_be_visible()
    page.locator(".metrics-grid input").nth(0).fill("5.2")
    page.get_by_test_id("save-record").click()
    expect(page.locator('[data-session-id="plan-e2e:day-e2e:1"]')).to_contain_text("5.2 km")

    page.goto(f"{BASE_URL}/#/training")
    page.wait_for_load_state("networkidle")
    expect(page.locator('.period-cell.partial .cal-status')).to_have_text("部分完成")

    # 训练日课表编辑器：从训练日入口进入，复用课程库结构编辑器
    page.goto(f"{BASE_URL}/#/training/day?date={DATE}")
    page.wait_for_load_state("networkidle")
    page.get_by_test_id("edit-day-workout").click()
    expect(page).to_have_url(f"{BASE_URL}/#/edit?plan=plan-e2e&day=day-e2e")
    expect(page.get_by_test_id("day-goal")).to_have_value("有氧耐力")
    expect(page.get_by_test_id("workout-editor")).to_be_visible()
    page.get_by_test_id("toggle-library").click()
    page.get_by_test_id("library-entry-t-8min-x6").get_by_role("button", name="使用此课表").click()
    expect(page.locator('[data-testid="editor-repeat"]').first).to_be_visible()
    page.get_by_test_id("save-day").click()
    expect(page).to_have_url(f"{BASE_URL}/#/training/day?date={DATE}")
    saved_dsl = page.evaluate(
        "JSON.parse(localStorage.getItem('tfm:plans:plan-e2e')).weeks[0].days[0].workout.phases"
        ".find((phase) => phase.role === 'main').segments[0].kind"
    )
    assert saved_dsl == "repeat", saved_dsl
    # 改课表只影响未结束的训练：已跳过的计划位保留当时快照
    frozen_kind = page.evaluate(
        "JSON.parse(localStorage.getItem('tfm:sessions:plan-e2e:day-e2e:0')).plannedWorkout"
        ".phases[0].segments[0].kind"
    )
    assert frozen_kind == "run", frozen_kind

    # 追加训练可以在同一次交互里补齐结构化计划内容（只写这一次训练）
    page.get_by_test_id("show-add-session").click()
    page.get_by_placeholder("例：晚间恢复跑").fill("晚间放松跑")
    page.get_by_test_id("add-session").click()
    expect(page.locator('[data-session-id="plan-e2e:day-e2e:2"]')).to_contain_text("晚间放松跑")
    page.locator('[data-session-id="plan-e2e:day-e2e:2"]').get_by_role("button", name="设置计划内容").click()
    # 会话 id 含冒号：不同 router 版本对 : 的转义不一致，这里只约束语义部分
    expect(page).to_have_url(re.compile(r"#/edit\?plan=plan-e2e&day=day-e2e&session=plan-e2e(%3A|:)day-e2e(%3A|:)2"))
    expect(page.get_by_role("heading", name=re.compile("晚间放松跑"))).to_be_visible()
    expect(page.get_by_text("单独这次训练")).to_be_visible()
    page.get_by_test_id("day-goal").fill("恢复慢跑")
    page.get_by_test_id("save-day").click()
    expect(page).to_have_url(f"{BASE_URL}/#/training/day?date={DATE}")
    extra_goal = page.evaluate(
        "JSON.parse(localStorage.getItem('tfm:sessions:plan-e2e:day-e2e:2')).plannedWorkout.goal"
    )
    assert extra_goal == "恢复慢跑", extra_goal
    expect(page.locator('[data-session-id="plan-e2e:day-e2e:2"]')).to_contain_text("恢复慢跑")

    # 追加训练可以撤销：误添加不必留下「未进行」的假记录
    page.get_by_test_id("show-add-session").click()
    page.get_by_placeholder("例：晚间恢复跑").fill("误添加的训练")
    page.get_by_test_id("add-session").click()
    expect(page.locator('[data-session-id="plan-e2e:day-e2e:3"]')).to_contain_text("误添加的训练")
    page.locator('[data-session-id="plan-e2e:day-e2e:3"]').get_by_role("button", name="移除").click()
    expect(page.locator('[data-session-id="plan-e2e:day-e2e:3"]')).to_have_count(0)
    removed = page.evaluate("localStorage.getItem('tfm:sessions:plan-e2e:day-e2e:3')")
    assert removed is None, removed

    session_keys = page.evaluate("Object.keys(localStorage).filter((key) => key.startsWith('tfm:sessions:'))")
    assert len(session_keys) == 3, session_keys
    assert not console_errors, console_errors

    output = Path(__file__).resolve().parent.parent / "test-results" / "session-lifecycle.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(output), full_page=True)
    browser.close()

print("session lifecycle browser smoke test passed")
