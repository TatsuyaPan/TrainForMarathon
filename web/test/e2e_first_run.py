"""首次使用全流程浏览器冒烟：建立配置 → 生成课表 → 日历 → 训练周 → 训练日 → 记录 → 工具页。

前置：core/web 目录先 `npm run build`，再 `npm run preview`（默认 4173）。
运行：`python test/e2e_first_run.py`
"""
import datetime as dt
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
SHOTS = Path(__file__).resolve().parent.parent / "test-results"


def race_sunday() -> str:
    """约 5 周之后的周日：既在 20 周计划内，又让“今天”落在当前周。"""
    day = dt.date.today() + dt.timedelta(days=35)
    day += dt.timedelta(days=(6 - day.weekday()) % 7)
    return day.isoformat()


RACE_DATE = race_sunday()


def shot(page, name: str) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


def pick_date(page, placeholder: str, target: dt.date) -> None:
    """TDesign 日期选择器是只读输入，用面板的月份翻页 + 点击日期来选择。"""
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

    # 1) 空白数据进入训练页 → 引导建立配置
    page.goto(f"{BASE_URL}/#/training")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("开始训练")).to_be_visible()
    shot(page, "first-run-empty")

    page.get_by_role("button", name="建立配置").click()
    expect(page).to_have_url(re.compile(r"#/settings$"))

    # 2) 填写配置并生成课表（VDOT 模式，10km 45:00）
    page.get_by_placeholder("例：阿跑").fill("冒烟测试")
    pick_date(page, "选择比赛日", dt.date.fromisoformat(RACE_DATE))
    shot(page, "first-run-settings")
    page.get_by_role("button", name="生成课表").click()
    expect(page).to_have_url(re.compile(r"#/training$"))

    # 3) 训练周期：20 周、当前周、完成统计
    expect(page.get_by_text("训练周期")).to_be_visible()
    # 限定在页面标题里：保存课表的应用内消息也含「共 20 周」，避免命中两处
    expect(page.locator(".page-hero").get_by_text("共 20 周")).to_be_visible()
    expect(page.locator(".period-row")).to_have_count(20)
    expect(page.locator(".period-cell")).to_have_count(140)
    shot(page, "first-run-calendar")

    # 4) 训练周视图
    page.get_by_role("button", name="查看本周").click()
    expect(page).to_have_url(re.compile(r"#/training/week"))
    expect(page.locator(".week-day")).to_have_count(7)
    shot(page, "first-run-week")

    # 5) 训练日：零会话 → 记录一次训练
    training_day = page.locator(".week-day").filter(has_text="计划").first
    expect(training_day).to_be_visible()
    training_day.click()
    expect(page).to_have_url(re.compile(r"#/training/day"))
    day_heading = page.locator(".day-hero h1")
    expect(day_heading).to_be_visible()
    day_title = day_heading.inner_text()

    planned = page.locator("[data-session-id]")
    expect(planned).to_have_count(1)
    planned.first.get_by_role("button", name="记录并完成").click()
    expect(page.get_by_role("heading", name="完成这次训练")).to_be_visible()
    metrics = page.locator(".metrics-grid input")
    metrics.nth(0).fill("8.4")
    metrics.nth(1).fill("52")
    metrics.nth(2).fill("6")
    page.get_by_placeholder("身体感受、天气、补给、疼痛或值得记住的瞬间…").fill("首次全流程冒烟")
    shot(page, "first-run-session")
    page.get_by_test_id("save-record").click()

    expect(page.locator(".day-hero h1")).to_have_text(day_title)
    expect(page.locator("[data-session-id]").first).to_contain_text("已完成")
    expect(page.locator("[data-session-id]").first).to_contain_text("8.4 km")
    date = page.evaluate("new URLSearchParams(location.hash.split('?')[1]).get('date')")
    shot(page, "first-run-day")

    # 6) 日历反映完成状态
    page.goto(f"{BASE_URL}/#/training")
    page.wait_for_load_state("networkidle")
    expect(page.locator(".period-cell.completed")).to_have_count(1)
    expect(page.locator(".stats-row")).to_contain_text("1/")

    # 7) 工具页：配速计算器 / 能力管理 / 训练思想 / 文章正文
    page.goto(f"{BASE_URL}/#/paces")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("配速", exact=False).first).to_be_visible()
    shot(page, "first-run-paces")

    page.goto(f"{BASE_URL}/#/fitness")
    page.wait_for_load_state("networkidle")
    expect(page.locator("h4").first).to_be_visible()
    shot(page, "first-run-fitness")

    page.goto(f"{BASE_URL}/#/courses")
    page.wait_for_load_state("networkidle")
    first_doc = page.locator(".doc-link").first
    expect(first_doc).to_be_visible()
    title = first_doc.inner_text().strip()
    shot(page, "first-run-contents")
    first_doc.click()
    expect(page).to_have_url(re.compile(r"#/course/"))
    expect(page.locator(".t-card__body").first).to_be_visible()
    shot(page, "first-run-doc")

    # 8) 计划数据结构与已保存记录保持一致
    plan_key = page.evaluate("Object.keys(localStorage).find((key) => key.startsWith('tfm:plans:'))")
    assert plan_key, list(page.evaluate("Object.keys(localStorage)"))
    plan = page.evaluate("(key) => JSON.parse(localStorage.getItem(key))", plan_key)
    assert len(plan["weeks"]) == 20, plan_key
    workouts = [
        day["workout"]
        for week in plan["weeks"]
        for day in week["days"]
        if day.get("workout")
    ]
    assert workouts, "训练日应带有结构化课表"
    assert all(workout["dslVersion"] == 1 and workout["phases"] for workout in workouts), workouts[0]
    assert all(workout["goal"] for workout in workouts), "每个结构化课表都必须有训练目的"
    sessions = page.evaluate("Object.keys(localStorage).filter((key) => key.startsWith('tfm:sessions:'))")
    assert len(sessions) == 1, sessions
    assert not console_errors, console_errors

    browser.close()

print(f"first-run browser smoke test passed (race date {RACE_DATE}, first doc {title!r})")
