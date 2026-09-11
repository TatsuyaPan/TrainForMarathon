"""档位写法 / 配速写法 Workout DSL 的浏览器验收。

同一份含档位的课表可以导出两种写法，两种都落在冻结版本 `WORKOUT/1` 之内：

- 档位写法：`MS:6x(8min@T+90s@jog)`——规范往返口径，与个人能力无关；
- 配速写法：`MS:6x(8min@P3:45-4:00/km+90s@jog)`——按当前能力换算出来的派生投影。

投影是单向的：只有含档位的课表才有两种写法；明确配速（`@P4:45-5:00/km`）本身就是事实，
不会被反推成 E/M/T/I/R 档位。这里验证四件事：

1. 含档位的课程卡片能在两种写法之间切换，且版本行始终是 `WORKOUT/1`；
2. 配速写法按当前能力换算（阈值 4:00/km → T 3:45-4:00/km、E 3:10-3:30/km）；
3. 只有明确配速的课表没有写法开关，也不会被换算成档位；
4. 全流程没有任何控制台错误。

前置：core/web 目录先 `npm run build`，再 `npm run preview`（默认 4173）。
运行：`python test/e2e_dsl_flavors.py`
"""
import json
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
SHOTS = Path(__file__).resolve().parent.parent / "test-results"

# 含档位的课表：阈值 4:00/km 的能力下 T = 3:45-4:00/km、E = 3:10-3:30/km
ZONE_DSL = "\n".join(
    [
        "TITLE:写法校验课",
        "GOAL:乳酸阈能力",
        "WU:15min@E",
        "MS:6x(8min@T+90s@jog)",
        "CD:10min@E",
    ]
)

# 只有明确配速的课表：一个档位都没有，因此不该出现写法开关
PACE_ONLY_DSL = "\n".join(
    [
        "TITLE:配速写法课",
        "GOAL:马拉松专项适应",
        "WU:15min@P3:10-3:30/km",
        "MS:6x(8min@P3:45-4:00/km+90s@jog)",
        "CD:10min@P3:10-3:30/km",
    ]
)


def seed_athlete(threshold_seconds_per_km: int) -> str:
    athlete = {
        "id": "local-e2e",
        "provider": "local",
        "schemaVersion": 1,
        "maxWeeklyKm": 60,
        "thresholdPaceSecondsPerKm": threshold_seconds_per_km,
        "isBeginner": False,
        "createdAt": "2026-09-10T08:00:00.000Z",
        "updatedAt": "2026-09-10T08:00:00.000Z",
    }
    return (
        "localStorage.setItem('tfm:athletes:current', "
        f"{json.dumps(json.dumps(athlete, ensure_ascii=False))});"
    )


def shot(page, name: str) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / f"dsl-flavors-{name}.png"), full_page=True)


def card_titled(page, title: str):
    return page.locator('[data-testid="course-card"]').filter(
        has=page.locator("strong.card-title", has_text=re.compile(rf"^{re.escape(title)}$"))
    )


def dsl_of(card) -> str:
    return card.get_by_test_id("course-dsl").evaluate("(node) => node.textContent")


def wait_for_fitness(page) -> None:
    """等展示口径提示出现，确认能力已经从存储读出来（配速写法依赖它）。"""
    expect(page.get_by_test_id("display-mode-hint")).to_contain_text("配速")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(str(error)))
    page.add_init_script(seed_athlete(240))

    page.goto(f"{BASE_URL}/#/library")
    page.wait_for_load_state("networkidle")
    wait_for_fitness(page)

    # 1) 导入含档位的课表：摘要正确，且因为是纯档位课表，不出现配速写法说明
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(ZONE_DSL)
    expect(page.get_by_test_id("import-summary")).to_contain_text("1 个循环")
    expect(page.get_by_test_id("import-pace-note")).to_have_count(0)
    shot(page, "import-zone")
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("写法校验课")
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("save-course").click()

    zone_card = card_titled(page, "写法校验课")
    expect(zone_card).to_have_count(1)

    # 2) 展开 DSL：默认跟随全局展示口径（配速），档位被换算成明确配速
    zone_card.get_by_test_id("toggle-dsl").click()
    pace_dsl = dsl_of(zone_card)
    assert pace_dsl.startswith("WORKOUT/1"), pace_dsl
    assert "8min@P3:45-4:00/km" in pace_dsl, pace_dsl
    assert "15min@P3:10-3:30/km" in pace_dsl, pace_dsl
    assert "@T" not in pace_dsl, pace_dsl
    assert "WORKOUT/2" not in pace_dsl, pace_dsl
    shot(page, "card-pace-dsl")

    # 3) 切到强度版：只剩档位，没有任何配速数值
    zone_card.get_by_test_id("dsl-flavor-zone").click()
    exported_zone = dsl_of(zone_card)
    assert exported_zone.startswith("WORKOUT/1"), exported_zone
    assert "6x(8min@T+90s@jog)" in exported_zone, exported_zone
    assert "@P" not in exported_zone, exported_zone
    shot(page, "card-zone-dsl")

    # 4) 切回配速版：文本与第 2 步一致，说明换算是确定性的
    zone_card.get_by_test_id("dsl-flavor-pace").click()
    assert dsl_of(zone_card) == pace_dsl

    # 5) 导入只有明确配速的课表：说明文字点明不会被反推成档位
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(PACE_ONLY_DSL)
    expect(page.get_by_test_id("import-pace-note")).to_contain_text("不会被换算成档位")
    shot(page, "import-pace-only")
    page.get_by_test_id("import-confirm").click()
    page.get_by_test_id("course-category").select_option("M")
    page.get_by_test_id("save-course").click()

    pace_card = card_titled(page, "配速写法课")
    expect(pace_card).to_have_count(1)
    pace_card.get_by_test_id("toggle-dsl").click()

    # 6) 课表数据里只有明确配速，没有任何 daniels 档位
    stored = page.evaluate(
        "JSON.parse(localStorage.getItem('tfm:course-library:v1') || '[]')"
        ".map((course) => JSON.stringify(course.workout))"
    )
    pace_only_workout = next(item for item in stored if "配速写法课" in item)
    assert "pace-range" in pace_only_workout, pace_only_workout
    assert "daniels" not in pace_only_workout, pace_only_workout

    # 7) 这份课表没有写法开关，DSL 原样保留明确配速
    expect(pace_card.get_by_test_id("dsl-single-flavor")).to_be_visible()
    expect(pace_card.get_by_test_id("dsl-flavor-zone")).to_have_count(0)
    expect(pace_card.get_by_test_id("dsl-flavor-pace")).to_have_count(0)
    pace_only_text = dsl_of(pace_card)
    assert "6x(8min@P3:45-4:00/km+90s@jog)" in pace_only_text, pace_only_text
    assert "@T" not in pace_only_text and "12min@E" not in pace_only_text, pace_only_text
    shot(page, "card-pace-only-dsl")

    assert not console_errors, console_errors

    # 8) 换一份能力（阈值 4:20/km）：同一份含档位课表换算出不同的配速写法
    other_page = browser.new_page(viewport={"width": 1280, "height": 1000})
    other_errors = []
    other_page.on("console", lambda message: other_errors.append(message.text) if message.type == "error" else None)
    other_page.on("pageerror", lambda error: other_errors.append(str(error)))
    other_page.add_init_script(seed_athlete(260))
    other_page.goto(f"{BASE_URL}/#/library")
    other_page.wait_for_load_state("networkidle")
    wait_for_fitness(other_page)
    other_page.get_by_test_id("open-import").click()
    other_page.get_by_test_id("import-textarea").fill(ZONE_DSL)
    other_page.get_by_test_id("import-confirm").click()
    other_page.get_by_test_id("save-course").click()

    other_card = card_titled(other_page, "写法校验课")
    other_card.get_by_test_id("toggle-dsl").click()
    other_pace_dsl = dsl_of(other_card)
    assert "@P" in other_pace_dsl, other_pace_dsl
    assert "8min@P3:45-4:00/km" not in other_pace_dsl, other_pace_dsl
    assert pace_dsl != other_pace_dsl
    shot(other_page, "card-pace-dsl-other-fitness")
    assert not other_errors, other_errors

    browser.close()

print("workout DSL flavor browser smoke test passed")
