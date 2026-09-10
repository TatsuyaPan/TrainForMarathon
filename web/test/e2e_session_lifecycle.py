import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
DATE = "2026-09-10"


def storage_script() -> str:
    workout = {
        "goal": "有氧耐力",
        "segments": [
            {
                "kind": "step",
                "intensity": {"type": "pace", "zone": "E"},
                "load": {"type": "distance", "meters": 8000},
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

    session_keys = page.evaluate("Object.keys(localStorage).filter((key) => key.startsWith('tfm:sessions:'))")
    assert len(session_keys) == 2, session_keys
    assert not console_errors, console_errors

    output = Path(__file__).resolve().parent.parent / "test-results" / "session-lifecycle.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(output), full_page=True)
    browser.close()

print("session lifecycle browser smoke test passed")
