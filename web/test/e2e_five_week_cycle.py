"""五周循环计划的浏览器冒烟：模板选择 → 生成课表 → 周期日历 → 训练日。

重点：这个模板没有比赛日，锚点日期是周期结束日；之前的界面一律写成「比赛日」。
前置：core/web 目录先 npm run build，再 npm run preview（默认 4173）。
运行：python test/e2e_five_week_cycle.py
"""

import datetime as dt
import json
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
SHOTS = Path(__file__).resolve().parent.parent / "test-results"


def race_sunday() -> str:
    """三周之后的周日：让「今天」落在五周循环的周期内。"""
    day = dt.date.today() + dt.timedelta(days=21)
    day += dt.timedelta(days=(6 - day.weekday()) % 7)
    return day.isoformat()


RACE_DATE = race_sunday()
PLAN_ID = f"5-week-cycle:{RACE_DATE}"


def seed_script() -> str:
    """只放运动员档案、不放课表：课表由「我的」页面按所选模板真实生成。"""
    athlete = {
        "id": "local-e2e",
        "provider": "local",
        "templateId": "5-week-cycle",
        "raceDate": RACE_DATE,
        "maxWeeklyKm": 60,
        "thresholdPaceSecondsPerKm": 270,
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
    page.screenshot(path=str(SHOTS / f"five-week-{name}.png"), full_page=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(str(error)))
    page.add_init_script(seed_script())

    # 1) 还没课表 → 建立配置页；日期标签按模板说「周期结束日期」
    page.goto(f"{BASE_URL}/#/settings")
    page.wait_for_load_state("networkidle")
    # 模板下拉回填成档案里的模板；日期标签随模板改口，不再一律叫「比赛日期」
    expect(page.get_by_role("textbox", name="请选择")).to_have_value("五周循环训练计划（5 周）")
    expect(page.get_by_text("周期结束日期（必填", exact=False)).to_be_visible()
    expect(page.get_by_text("比赛日期（必填", exact=False)).to_have_count(0)
    shot(page, "settings")

    # 2) 生成课表
    page.get_by_role("button", name="生成课表").click()
    expect(page).to_have_url(re.compile(r"#/training$"))

    # 3) 周期日历：5 周 / 35 天，锚点是周期结束日而不是比赛日
    expect(page.locator(".period-row")).to_have_count(5)
    expect(page.locator(".period-cell")).to_have_count(35)
    hero = page.locator(".page-hero")
    expect(hero.get_by_text("共 5 周")).to_be_visible()
    expect(hero).to_contain_text(f"周期结束日 {RACE_DATE}")
    expect(hero).not_to_contain_text("比赛日")
    # 五周循环没有比赛日：日历格子不出现「赛」
    expect(page.locator(".cal-mark").filter(has_text="赛")).to_have_count(0)
    shot(page, "calendar")

    # 4) 训练日：进入某个训练日，计划位会话自动生成，当日小结可见
    page.locator(".period-cell").first.click()
    expect(page).to_have_url(re.compile(r"#/training/day"))
    expect(page.locator("[data-session-id]")).to_have_count(1)
    expect(page.get_by_test_id("day-summary")).to_contain_text("当天 1 次训练")
    expect(page.get_by_test_id("day-summary")).to_contain_text("待完成 1")
    shot(page, "day")

    # 5) 存储里的课表结构与模板一致，且每天的训练内容都可用
    plan = page.evaluate("(key) => JSON.parse(localStorage.getItem(key))", f"tfm:plans:{PLAN_ID}")
    assert len(plan["weeks"]) == 5, len(plan["weeks"])
    assert plan["raceDate"] == RACE_DATE, plan["raceDate"]
    days = [day for week in plan["weeks"] for day in week["days"]]
    assert len(days) == 35, len(days)
    workouts = [day["workout"] for day in days if day.get("workout")]
    assert len(workouts) == 35, len(workouts)
    assert all(workout["dslVersion"] == 1 and workout["phases"] for workout in workouts), workouts[0]
    assert all(workout["goal"] for workout in workouts), "每个结构化课表都必须有训练目的"

    athlete = page.evaluate("JSON.parse(localStorage.getItem('tfm:athletes:current'))")
    assert athlete["templateId"] == "5-week-cycle", athlete["templateId"]
    assert athlete["planId"] == PLAN_ID, athlete["planId"]
    assert not console_errors, console_errors

    browser.close()

print(f"five-week cycle browser smoke test passed (race date {RACE_DATE})")
