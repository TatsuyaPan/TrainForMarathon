"""课表展示口径浏览器冒烟：强度 ↔ 配速切换（课程库 / 训练周）与偏好持久化。

重点：课程都基于丹尼尔斯强度，展示层要能把 T、I 等档位换算成当前能力的配速；
没有能力时不伪造配速，偏好跨页面、跨刷新保持一致。
前置：core/web 目录先 `npm run build`，再 `npm run preview`（默认 4173）。
运行：`python test/e2e_pace_display.py`
"""

import datetime as dt
import json
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
SHOTS = Path(__file__).resolve().parent.parent / "test-results"
PACE_RE = re.compile(r"\d:\d\d–\d:\d\d/km")


def race_sunday() -> str:
    """约 5 周之后的周日：让「今天」落在 20 周计划的当前周内。"""
    day = dt.date.today() + dt.timedelta(days=35)
    day += dt.timedelta(days=(6 - day.weekday()) % 7)
    return day.isoformat()


RACE_DATE = race_sunday()


def seed_script() -> str:
    """只放能力（阈值配速 4:00/km），课表交给配置页真实生成。"""
    athlete = {
        "id": "local-e2e",
        "provider": "local",
        "templateId": "20-week",
        "raceDate": RACE_DATE,
        "maxWeeklyKm": 60,
        "thresholdPaceSecondsPerKm": 240,
        "isBeginner": False,
        "schemaVersion": 1,
        "createdAt": "2026-09-10T08:00:00.000Z",
        "updatedAt": "2026-09-10T08:00:00.000Z",
    }
    return (
        "localStorage.setItem('tfm:athletes:current', "
        f"{json.dumps(json.dumps(athlete, ensure_ascii=False))});"
    )


def shot(page, name: str) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / f"pace-display-{name}.png"), full_page=True)


def pick_date(page, placeholder: str, target: dt.date) -> None:
    """TDesign 日期选择器是只读输入：翻月后点日期格子。"""
    page.get_by_placeholder(placeholder).click()
    panel = page.locator(".t-date-picker__panel").first
    expect(panel).to_be_visible()
    today = dt.date.today()
    months = (target.year - today.year) * 12 + (target.month - today.month)
    for _ in range(abs(months)):
        panel.locator(".t-pagination-mini__next" if months > 0 else ".t-pagination-mini__prev").click()
    panel.locator(".t-date-picker__cell-inner").filter(has_text=re.compile(rf"^{target.day}$")).first.click()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(str(error)))
    page.add_init_script(seed_script())

    # 1) 课程库：默认按配速展示，T 档位换算成 4:00/km 阈值下的 3:45–4:00/km
    page.goto(f"{BASE_URL}/#/library")
    page.wait_for_load_state("networkidle")
    switch = page.get_by_test_id("display-mode-switch")
    expect(switch).to_be_visible()
    expect(page.get_by_test_id("display-mode-pace")).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_test_id("display-mode-hint")).to_contain_text("配速")

    card = page.locator('[data-testid="course-card"]').first
    card.get_by_test_id("toggle-structure").click()
    structure = card.get_by_test_id("course-structure")
    expect(structure).to_contain_text(PACE_RE)
    expect(structure).not_to_contain_text("乳酸阈配速（T）")
    assert "3:45–4:00/km（T）" in structure.inner_text(), structure.inner_text()
    shot(page, "library-pace")

    # 2) 切到强度：只留丹尼尔斯档位，配速文案消失
    page.get_by_test_id("display-mode-zone").click()
    expect(structure).not_to_contain_text(PACE_RE)
    expect(structure).to_contain_text("乳酸阈配速（T）")
    shot(page, "library-zone")

    # 3) 偏好持久化：刷新后仍然是「强度」
    page.reload()
    page.wait_for_load_state("networkidle")
    expect(page.get_by_test_id("display-mode-zone")).to_have_attribute("aria-pressed", "true")
    stored = page.evaluate("JSON.parse(localStorage.getItem('tfm:display-prefs:v1'))")
    assert stored == {"targetDisplayMode": "zone"}, stored

    # 4) 生成课表后，训练周同一开关生效（页面之间是同一个偏好）
    page.goto(f"{BASE_URL}/#/settings")
    page.wait_for_load_state("networkidle")
    pick_date(page, "选择比赛日", dt.date.fromisoformat(RACE_DATE))
    page.get_by_role("button", name="生成课表").click()
    expect(page).to_have_url(re.compile(r"#/training$"))
    page.get_by_test_id("view-current-week").click()
    expect(page).to_have_url(re.compile(r"#/training/week"))

    week_days = page.locator(".week-day")
    expect(week_days.first).to_be_visible()
    # 仍是「强度」口径：一周文案里没有配速区间
    expect(page.locator(".week-day").filter(has_text=PACE_RE)).to_have_count(0)
    shot(page, "week-zone")

    page.get_by_test_id("display-mode-pace").click()
    expect(page.locator(".week-day").filter(has_text=PACE_RE).first).to_be_visible()
    shot(page, "week-pace")

    # 5) 训练日同样跟随口径
    training_day = page.locator(".week-day").filter(has_text=PACE_RE).first
    training_day.click()
    expect(page).to_have_url(re.compile(r"#/training/day"))
    expect(page.get_by_test_id("display-mode-switch")).to_be_visible()
    sessions = page.locator(".session-card")
    expect(sessions.first).to_contain_text(PACE_RE)
    page.get_by_test_id("display-mode-zone").click()
    expect(sessions.first).not_to_contain_text(PACE_RE)
    shot(page, "day-zone")

    assert not console_errors, console_errors
    browser.close()

print("pace display browser smoke test passed")
