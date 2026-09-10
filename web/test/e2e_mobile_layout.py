"""手机宽度（390×844）下的布局冒烟：核心页面不应出现横向溢出。

这套交互后续要在微信小程序里复刻，窄屏可读性属于验收的一部分。
"""

import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
PLAN_ID = "20-week:2026-11-15"
MOBILE = {"width": 390, "height": 844}


def workout(goal: str, segments: list) -> dict:
    return {"dslVersion": 1, "goal": goal, "phases": [{"role": "main", "segments": segments}]}


def day(day_id: str, date: str, label: str, types: list, planned: dict | None) -> dict:
    entry = {
        "id": day_id,
        "dayIndex": 0,
        "date": date,
        "label": label,
        "items": [{"type": t} for t in types],
    }
    if planned:
        entry.update(planned)
    return entry


def seed() -> dict:
    easy = workout(
        "有氧基础",
        [{"kind": "run", "load": {"type": "distance", "meters": 8000}, "target": {"type": "daniels", "zone": "E"}}],
    )
    interval = workout(
        "速度与跑步经济性",
        [{
            "kind": "repeat",
            "repetitions": 6,
            "segments": [
                {"kind": "run", "load": {"type": "distance", "meters": 400}, "target": {"type": "daniels", "zone": "R"}, "rpe": 9},
                {"kind": "recovery", "load": {"type": "distance", "meters": 400}},
            ],
        }],
    )
    weeks = []
    for index in range(3):
        days = []
        for offset, (label, types, planned) in enumerate([
            ("跑休", ["REST"], None),
            ("E", ["E"], easy),
            ("T + R", ["T", "R"], interval),
            ("E", ["E"], easy),
            ("跑休", ["REST"], None),
            ("E", ["E"], easy),
            ("L + E", ["L", "E"], easy),
        ]):
            days.append(
                day(
                    f"day-{index}-{offset}",
                    f"2026-09-{7 + index * 7 + offset:02d}",
                    label,
                    types,
                    {"workout": planned, "plannedDistanceKm": 8, "plannedDurationMinutes": 45} if planned else None,
                )
            )
        weeks.append({
            "week": index + 1,
            "phase": "基础期",
            "volume": {"min": 40, "max": 50},
            "targetKm": {"min": 40, "max": 50},
            "days": days,
        })
    athlete = {
        "id": "local-e2e",
        "provider": "local",
        "planId": PLAN_ID,
        "templateId": "20-week",
        "raceDate": "2026-11-15",
        "maxWeeklyKm": 60,
        "thresholdPaceSecondsPerKm": 240,
        "schemaVersion": 1,
        "createdAt": "2026-09-10T08:00:00.000Z",
        "updatedAt": "2026-09-10T08:00:00.000Z",
    }
    plan = {
        "id": PLAN_ID,
        "templateId": "20-week",
        "templateVersion": 1,
        "raceDate": "2026-11-15",
        "paces": {
            "E": {"fast": 190, "slow": 210},
            "M": {"fast": 220, "slow": 230},
            "T": {"fast": 235, "slow": 250},
            "I": {"fast": 215, "slow": 230},
            "R": {"fast": 200, "slow": 215},
        },
        "weeks": weeks,
    }
    return {
        "tfm:athletes:current": athlete,
        f"tfm:plans:{PLAN_ID}": plan,
    }


def storage_script() -> str:
    statements = [
        f"localStorage.setItem({json.dumps(key)}, {json.dumps(json.dumps(value, ensure_ascii=False))});"
        for key, value in seed().items()
    ]
    return "\n".join([
        "if (!sessionStorage.getItem('e2e-mobile-seeded')) {",
        *statements,
        "sessionStorage.setItem('e2e-mobile-seeded', '1');",
        "}",
    ])


def shot(page, name: str) -> None:
    output = Path(__file__).resolve().parent.parent / "test-results" / f"mobile-{name}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(output), full_page=True)


def overflow(page) -> int:
    return page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")


PAGES = [
    ("calendar", "/#/training"),
    ("week", "/#/training/week?date=2026-09-09"),
    ("day", "/#/training/day?date=2026-09-09"),
    ("record", f"/#/training/session?plan={PLAN_ID}&session={PLAN_ID}:day-1-2:0&date=2026-09-09"),
    ("library", "/#/library"),
    ("course-editor", "/#/library/new"),
    ("edit-day", f"/#/edit?plan={PLAN_ID}&day=day-2-2"),
    ("paces", "/#/paces"),
    ("fitness", "/#/fitness"),
    ("settings", "/#/settings"),
]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport=MOBILE)
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("dialog", lambda dialog: dialog.accept())
    page.add_init_script(storage_script())

    failures = []
    for name, path in PAGES:
        page.goto(f"{BASE_URL}{path}")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(150)
        width = overflow(page)
        shot(page, name)
        if width > 1:
            failures.append(f"{name}: 横向溢出 {width}px")

    expect(page.locator(".t-head-menu")).to_be_visible()
    assert not failures, failures

    # 手机端真的编辑一次课程：新建 → 步骤覆盖层 → 改强度 → 加循环 → 保存
    page.goto(f"{BASE_URL}/#/library/new")
    page.wait_for_load_state("networkidle")
    page.get_by_test_id("course-title").fill("手机端编辑课程")
    page.get_by_test_id("course-goal").fill("有氧基础")
    page.locator('[data-testid^="segment-row-"]').first.click()
    expect(page.get_by_test_id("focused-editor")).to_be_visible()
    overlay_width = overflow(page)
    shot(page, "editor-step-overlay")
    assert overlay_width <= 1, f"步骤覆盖层横向溢出 {overlay_width}px"

    page.get_by_test_id("target-zone").select_option("M")
    page.get_by_test_id("step-editor").get_by_role("button", name="关闭步骤编辑").click()
    page.get_by_test_id("add-repeat").first.click()
    expect(page.locator('[data-testid="editor-repeat"]').first).to_be_visible()
    page.get_by_test_id("save-course").click()

    card = page.locator('[data-testid="course-card"]').filter(has_text="手机端编辑课程")
    expect(card).to_have_count(1)
    card.get_by_test_id("toggle-structure").click()
    expect(card.get_by_test_id("course-structure")).to_be_visible()
    shot(page, "library-after-edit")
    assert overflow(page) <= 1, "保存后的课程库出现横向溢出"

    saved = page.evaluate(
        "JSON.parse(localStorage.getItem('tfm:course-library:v1'))"
        ".find((course) => course.workout.title === '手机端编辑课程').workout"
    )
    assert saved["phases"][0]["segments"][0]["target"]["zone"] == "M", saved
    assert saved["phases"][0]["segments"][1]["kind"] == "repeat", saved

    assert not console_errors, console_errors
    browser.close()

print(f"mobile layout & editing smoke test passed ({len(PAGES)} pages @ {MOBILE['width']}px)")
