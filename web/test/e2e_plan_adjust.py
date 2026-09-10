"""课表调整浏览器冒烟：互换训练日后结构化课表与计划训练一起搬动、有记录的一天拒绝调整。

前置：core/web 目录先 `npm run build`，再 `npm run preview`（默认 4173）。
运行：`python test/e2e_plan_adjust.py`
"""
import datetime as dt
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
SHOTS = Path(__file__).resolve().parent.parent / "test-results"


def race_sunday() -> str:
    day = dt.date.today() + dt.timedelta(days=35)
    day += dt.timedelta(days=(6 - day.weekday()) % 7)
    return day.isoformat()


RACE_DATE = race_sunday()


def shot(page, name: str) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / f"adjust-{name}.png"), full_page=True)


def pick_date(page, placeholder: str, target: dt.date) -> None:
    page.get_by_placeholder(placeholder).click()
    panel = page.locator(".t-date-picker__panel").first
    expect(panel).to_be_visible()
    today = dt.date.today()
    months = (target.year - today.year) * 12 + (target.month - today.month)
    for _ in range(abs(months)):
        panel.locator(".t-pagination-mini__next" if months > 0 else ".t-pagination-mini__prev").click()
    panel.locator(".t-date-picker__cell-inner").filter(has_text=re.compile(rf"^{target.day}$")).first.click()


def read_plan(page):
    plan_key = page.evaluate("Object.keys(localStorage).find((key) => key.startsWith('tfm:plans:'))")
    assert plan_key, page.evaluate("Object.keys(localStorage)")
    return page.evaluate("(key) => JSON.parse(localStorage.getItem(key))", plan_key)


def assert_rest_invariant(page, note: str) -> None:
    """跑休日不能带结构化课表；没有课表的日子只能是跑休或比赛日。"""
    plan = read_plan(page)
    for week in plan["weeks"]:
        for day in week["days"]:
            label = day["label"]
            if label == "跑休":
                assert day.get("workout") is None, f"{note}: 跑休日带着课表 {day}"
            if day.get("workout") is None:
                assert "跑休" in label or "比赛" in label, f"{note}: 无课表的训练日 {day}"


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(str(error)))
    # confirm 弹窗（互换课表、移除训练）统一确认
    page.on("dialog", lambda dialog: dialog.accept())

    # 1) 建立配置
    page.goto(f"{BASE_URL}/#/settings")
    page.wait_for_load_state("networkidle")
    page.get_by_placeholder("例：阿跑").fill("课表调整冒烟")
    pick_date(page, "选择比赛日", dt.date.fromisoformat(RACE_DATE))
    page.get_by_role("button", name="生成课表").click()
    page.wait_for_url(re.compile(r"#/training$"))
    assert_rest_invariant(page, "生成课表后")

    # 2) 挑当前周的一个训练日与一个跑休日
    today = dt.date.today().isoformat()
    plan = read_plan(page)
    week = next(w for w in plan["weeks"] if any(day["date"] == today for day in w["days"]))
    training_day = next(day for day in week["days"] if day.get("workout"))
    rest_day = next(day for day in week["days"] if day["label"] == "跑休")
    training_label = training_day["label"]

    # 3) 先访问训练日，生成计划位训练
    page.goto(f"{BASE_URL}/#/training/day?date={training_day['date']}")
    page.wait_for_load_state("networkidle")
    expect(page.locator("[data-session-id]")).to_have_count(1)
    expect(page.locator(".day-hero h1")).to_contain_text(training_label)

    # 4) 在跑休日把训练换过来
    page.goto(f"{BASE_URL}/#/training/day?date={rest_day['date']}")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("无训练安排")).to_be_visible()
    page.get_by_test_id("open-day-adjust").click()
    expect(page.get_by_test_id("day-adjust")).to_be_visible()
    shot(page, "dialog")
    page.get_by_test_id(f"swap-with-{training_day['date']}").click()
    page.wait_for_timeout(400)

    # 换入的这天拿到课表与计划训练
    expect(page.locator(".day-hero h1")).to_contain_text(training_label)
    expect(page.locator("[data-session-id]")).to_have_count(1)
    shot(page, "swapped-in")

    # 换出的那天变成跑休，且计划训练被移除
    page.goto(f"{BASE_URL}/#/training/day?date={training_day['date']}")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("无训练安排")).to_be_visible()
    expect(page.locator("[data-session-id]")).to_have_count(0)
    shot(page, "swapped-out")
    assert_rest_invariant(page, "互换之后")

    # 5) 有记录的一天拒绝调整
    page.goto(f"{BASE_URL}/#/training/day?date={rest_day['date']}")
    page.wait_for_load_state("networkidle")
    page.locator("[data-session-id]").first.get_by_role("button", name="记录并完成").click()
    metrics = page.locator(".metrics-grid input")
    metrics.nth(0).fill("10.2")
    metrics.nth(1).fill("58")
    metrics.nth(2).fill("6")
    page.get_by_test_id("save-record").click()
    expect(page.locator("[data-session-id]").first).to_contain_text("已完成")

    page.get_by_test_id("open-day-adjust").click()
    page.locator('[data-testid^="swap-with-"]').first.click()
    expect(page.get_by_test_id("adjust-error")).to_contain_text("已有训练记录")
    shot(page, "refused")

    # 6) 计划数据保持一致
    plan = read_plan(page)
    assert len(plan["weeks"]) == 20, plan["weeks"][0]
    assert_rest_invariant(page, "调整并打卡后")
    sessions = page.evaluate("Object.keys(localStorage).filter((key) => key.startsWith('tfm:sessions:'))")
    assert len(sessions) == 1, sessions
    assert not console_errors, console_errors

    browser.close()

print(f"plan adjust browser smoke test passed (race date {RACE_DATE})")
