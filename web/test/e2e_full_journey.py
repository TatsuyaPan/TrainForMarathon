"""整系统连贯验收：从零配置一路走到记录、课程库、改课表、追加训练，最后刷新验证持久化。

与单页冒烟不同，这条用例在同一个浏览器会话里连续跨模块操作，用来发现
「各页单独都正常、串起来就坏」的问题：

    建立配置 → 生成课表 → 完成计划训练 → 新建自定义课程
      → 用自定义课程替换当天课表 → 追加一次引用课程库的训练并完成
      → 刷新页面，课表 / 记录 / 自定义课程全部仍在

前置：在 core/web 目录执行 `npm run build`，并保持 `npm run preview`（4173 端口）运行。
运行：`python test/e2e_full_journey.py`
"""
import datetime as dt
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
COURSE_TITLE = "我的长距离课"
COURSE_GOAL = "长距离有氧"

SHOTS = Path(__file__).resolve().parent.parent / "test-results"


def race_sunday() -> str:
    """约 5 周之后的周日：既在 20 周计划内，又让“今天”落在当前周。"""
    day = dt.date.today() + dt.timedelta(days=35)
    day += dt.timedelta(days=(6 - day.weekday()) % 7)
    return day.isoformat()


RACE_DATE = race_sunday()


def shot(page, name: str) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / f"journey-{name}.png"), full_page=True)


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


def plan_of(page) -> dict:
    key = page.evaluate("Object.keys(localStorage).find((entry) => entry.startsWith('tfm:plans:'))")
    assert key, page.evaluate("Object.keys(localStorage)")
    return page.evaluate("(entry) => JSON.parse(localStorage.getItem(entry))", key)


def day_with_workout(plan: dict, date: str) -> dict:
    for week in plan["weeks"]:
        for day in week["days"]:
            if day["date"] == date:
                return day
    raise AssertionError(f"计划里没有 {date}")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(str(error)))
    # 破坏性操作与保存提示统一确认
    page.on("dialog", lambda dialog: dialog.accept())

    # 1) 零配置起步：建立配置并生成课表
    page.goto(f"{BASE_URL}/#/training")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("开始训练")).to_be_visible()
    page.get_by_role("button", name="建立配置").click()
    page.get_by_placeholder("例：阿跑").fill("连贯验收")
    pick_date(page, "选择比赛日", dt.date.fromisoformat(RACE_DATE))
    page.get_by_role("button", name="生成课表").click()
    expect(page).to_have_url(re.compile(r"#/training$"))
    expect(page.locator(".period-row")).to_have_count(20)
    shot(page, "plan")

    # 2) 走进本周的一个训练日，按计划完成它（含实际数据与训练日志）
    page.get_by_test_id("view-current-week").click()
    expect(page).to_have_url(re.compile(r"#/training/week"))
    training_day = page.locator(".week-day").filter(has_text="计划").first
    training_day.focus()
    page.keyboard.press("Enter")
    expect(page).to_have_url(re.compile(r"#/training/day"))
    date = page.evaluate("new URLSearchParams(location.hash.split('?')[1]).get('date')")
    assert date, page.url

    expect(page.locator("[data-session-id]")).to_have_count(1)
    page.locator("[data-session-id]").first.get_by_role("button", name="记录并完成").click()
    metrics = page.locator(".metrics-grid input")
    metrics.nth(0).fill("12.4")
    metrics.nth(1).fill("68")
    metrics.nth(2).fill("5")
    page.get_by_placeholder("身体感受、天气、补给、疼痛或值得记住的瞬间…").fill("连贯验收：按计划完成")
    page.get_by_test_id("save-record").click()
    expect(page.locator("[data-session-id]").first).to_contain_text("已完成")
    shot(page, "day-recorded")

    # 3) 课程库：新建一门自定义课程
    page.goto(f"{BASE_URL}/#/library")
    page.wait_for_load_state("networkidle")
    page.get_by_test_id("new-course").click()
    page.get_by_test_id("course-title").fill(COURSE_TITLE)
    page.get_by_test_id("course-goal").fill(COURSE_GOAL)
    page.get_by_test_id("course-category").select_option("E")
    page.get_by_test_id("add-repeat").first.click()
    page.get_by_test_id("save-course").click()
    custom_card = page.locator('[data-testid="course-card"]').filter(has_text=COURSE_TITLE)
    expect(custom_card).to_have_count(1)
    custom_course_id = page.evaluate(
        "JSON.parse(localStorage.getItem('tfm:course-library:v1')).find((course) => course.workout.title === "
        f"{COURSE_TITLE!r}).id"
    )
    assert custom_course_id, "自定义课程应写入本地课程库"
    shot(page, "library")

    # 4) 回到训练日，用刚建的课程替换当天课表
    page.goto(f"{BASE_URL}/#/training/day?date={date}")
    page.wait_for_load_state("networkidle")
    page.get_by_test_id("edit-day-workout").click()
    expect(page.get_by_test_id("workout-editor")).to_be_visible()
    page.get_by_test_id("toggle-library").click()
    page.locator(".library-picker .category-chip").filter(has_text=re.compile("^E$")).click()
    entry = page.locator(f'[data-testid="library-entry-{custom_course_id}"]')
    expect(entry).to_be_visible()
    entry.get_by_role("button", name="使用此课表").click()
    page.get_by_test_id("save-day").click()
    expect(page).to_have_url(re.compile(r"#/training/day"))

    plan = plan_of(page)
    assert day_with_workout(plan, date)["workout"]["goal"] == COURSE_GOAL, day_with_workout(plan, date)
    assert page.locator("[data-session-id]").first.get_by_role("button", name="查看或编辑记录").is_visible()
    shot(page, "day-plan-replaced")

    # 5) 追加一次训练，直接引用课程库里的这门课，然后完成它
    page.get_by_test_id("show-add-session").click()
    course_select = page.get_by_test_id("extra-session-course")
    option_value = None
    for option in course_select.locator("option").all():
        if COURSE_TITLE in (option.inner_text() or ""):
            option_value = option.get_attribute("value")
            break
    assert option_value, "追加训练应能选到刚建的自定义课程"
    course_select.select_option(option_value)
    expect(page.get_by_test_id("extra-session-preview")).to_contain_text("计划内容")
    # 选课会先把课程标题带进训练名称，用户可以改成自己的说法
    assert page.get_by_placeholder("例：晚间恢复跑").input_value() == COURSE_TITLE
    page.get_by_placeholder("例：晚间恢复跑").fill("课程库加练")
    page.get_by_test_id("add-session").click()

    extra_goal = page.evaluate(
        """
        () => {
          const keys = Object.keys(localStorage).filter((entry) => entry.startsWith("tfm:sessions:"));
          const extra = keys
            .map((key) => JSON.parse(localStorage.getItem(key)))
            .find((session) => session.label === "课程库加练");
          return extra?.plannedWorkout?.goal ?? null;
        }
        """
    )
    assert extra_goal == COURSE_GOAL, extra_goal

    sessions = page.locator("[data-session-id]")
    expect(sessions).to_have_count(2)
    sessions.nth(1).get_by_role("button", name="记录并完成").click()
    metrics = page.locator(".metrics-grid input")
    metrics.nth(0).fill("6.2")
    metrics.nth(1).fill("35")
    metrics.nth(2).fill("6")
    page.get_by_placeholder("身体感受、天气、补给、疼痛或值得记住的瞬间…").fill("连贯验收：课程库加练")
    page.get_by_test_id("save-record").click()
    expect(page.locator("[data-session-id]")).to_have_count(2)
    expect(page.locator("[data-session-id]").nth(1)).to_contain_text("6.2 km")
    shot(page, "day-extra-session")

    # 6) 刷新整个应用：课表、两次记录、自定义课程都必须还在
    page.reload()
    page.wait_for_load_state("networkidle")
    expect(page.locator("[data-session-id]")).to_have_count(2)
    expect(page.locator("[data-session-id]").first).to_contain_text("12.4 km")
    expect(page.locator("[data-session-id]").nth(1)).to_contain_text("6.2 km")

    page.goto(f"{BASE_URL}/#/training")
    page.wait_for_load_state("networkidle")
    # 同一天两次训练聚合成一条日进度：日历只标一天，跑量按两次记录相加
    expect(page.locator(".period-cell.completed")).to_have_count(1)
    expect(page.locator(".stats-row")).to_contain_text("1/")
    expect(page.locator(".stats-row")).to_contain_text("18.6 km")

    page.goto(f"{BASE_URL}/#/library")
    page.wait_for_load_state("networkidle")
    page.locator(".category-row .category-chip").filter(has_text=re.compile("^E$")).click()
    expect(page.locator('[data-testid="course-card"]').filter(has_text=COURSE_TITLE)).to_have_count(1)
    shot(page, "after-reload")

    plan = plan_of(page)
    assert day_with_workout(plan, date)["workout"]["goal"] == COURSE_GOAL, day_with_workout(plan, date)
    assert not console_errors, console_errors
    browser.close()

print(f"full journey browser smoke test passed (race date {RACE_DATE}, day {date})")
