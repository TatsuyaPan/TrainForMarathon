"""æ¡£ä½å†™æ³• / é…é€Ÿå†™æ³• Workout DSL çš„æµè§ˆå™¨éªŒæ”¶ã€‚

åŒä¸€ä»½å«æ¡£ä½çš„è¯¾è¡¨å¯ä»¥å¯¼å‡ºä¸¤ç§å†™æ³•ï¼Œä¸¤ç§éƒ½è½åœ¨å†»ç»“ç‰ˆæœ¬ `WORKOUT/2` ä¹‹å†…ï¼š

- æ¡£ä½å†™æ³•ï¼š`MS:6x(8min@T+90s@jog)`â€”â€”è§„èŒƒå¾€è¿”å£å¾„ï¼Œä¸Žä¸ªäººèƒ½åŠ›æ— å…³ï¼›
- é…é€Ÿå†™æ³•ï¼š`MS:6x(8min@P3:45-4:00/km+90s@jog)`â€”â€”æŒ‰å½“å‰èƒ½åŠ›æ¢ç®—å‡ºæ¥çš„æ´¾ç”ŸæŠ•å½±ã€‚

æŠ•å½±æ˜¯å•å‘çš„ï¼šåªæœ‰å«æ¡£ä½çš„è¯¾è¡¨æ‰æœ‰ä¸¤ç§å†™æ³•ï¼›æ˜Žç¡®é…é€Ÿï¼ˆ`@P4:45-5:00/km`ï¼‰æœ¬èº«å°±æ˜¯äº‹å®žï¼Œ
ä¸ä¼šè¢«åæŽ¨æˆ E/M/T/I/R æ¡£ä½ã€‚è¿™é‡ŒéªŒè¯å››ä»¶äº‹ï¼š

1. å«æ¡£ä½çš„è¯¾ç¨‹å¡ç‰‡èƒ½åœ¨ä¸¤ç§å†™æ³•ä¹‹é—´åˆ‡æ¢ï¼Œä¸”ç‰ˆæœ¬è¡Œå§‹ç»ˆæ˜¯ `WORKOUT/2`ï¼›
2. é…é€Ÿå†™æ³•æŒ‰å½“å‰èƒ½åŠ›æ¢ç®—ï¼ˆé˜ˆå€¼ 4:00/km â†’ T 3:45-4:00/kmã€E 3:10-3:30/kmï¼‰ï¼›
3. åªæœ‰æ˜Žç¡®é…é€Ÿçš„è¯¾è¡¨æ²¡æœ‰å†™æ³•å¼€å…³ï¼Œä¹Ÿä¸ä¼šè¢«æ¢ç®—æˆæ¡£ä½ï¼›
4. å…¨æµç¨‹æ²¡æœ‰ä»»ä½•æŽ§åˆ¶å°é”™è¯¯ã€‚

å‰ç½®ï¼šcore/web ç›®å½•å…ˆ `npm run build`ï¼Œå† `npm run preview`ï¼ˆé»˜è®¤ 4173ï¼‰ã€‚
è¿è¡Œï¼š`python test/e2e_dsl_flavors.py`
"""
import json
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
SHOTS = Path(__file__).resolve().parent.parent / "test-results"

# å«æ¡£ä½çš„è¯¾è¡¨ï¼šé˜ˆå€¼ 4:00/km çš„èƒ½åŠ›ä¸‹ T = 3:45-4:00/kmã€E = 3:10-3:30/km
ZONE_DSL = "\n".join(
    [
        "TITLE:å†™æ³•æ ¡éªŒè¯¾",
        "GOAL:ä¹³é…¸é˜ˆèƒ½åŠ›",
        "WU:15min@E",
        "MS:6x(8min@T+90s@jog)",
        "CD:10min@E",
    ]
)

# åªæœ‰æ˜Žç¡®é…é€Ÿçš„è¯¾è¡¨ï¼šä¸€ä¸ªæ¡£ä½éƒ½æ²¡æœ‰ï¼Œå› æ­¤ä¸è¯¥å‡ºçŽ°å†™æ³•å¼€å…³
PACE_ONLY_DSL = "\n".join(
    [
        "TITLE:é…é€Ÿå†™æ³•è¯¾",
        "GOAL:é©¬æ‹‰æ¾ä¸“é¡¹é€‚åº”",
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
    """ç­‰å±•ç¤ºå£å¾„æç¤ºå‡ºçŽ°ï¼Œç¡®è®¤èƒ½åŠ›å·²ç»ä»Žå­˜å‚¨è¯»å‡ºæ¥ï¼ˆé…é€Ÿå†™æ³•ä¾èµ–å®ƒï¼‰ã€‚"""
    expect(page.get_by_test_id("display-mode-hint")).to_contain_text("é…é€Ÿ")


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

    # 1) å¯¼å…¥å«æ¡£ä½çš„è¯¾è¡¨ï¼šæ‘˜è¦æ­£ç¡®ï¼Œä¸”å› ä¸ºæ˜¯çº¯æ¡£ä½è¯¾è¡¨ï¼Œä¸å‡ºçŽ°é…é€Ÿå†™æ³•è¯´æ˜Ž
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(ZONE_DSL)
    expect(page.get_by_test_id("import-summary")).to_contain_text("1 ä¸ªå¾ªçŽ¯")
    expect(page.get_by_test_id("import-pace-note")).to_have_count(0)
    shot(page, "import-zone")
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("å†™æ³•æ ¡éªŒè¯¾")
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("save-course").click()

    zone_card = card_titled(page, "å†™æ³•æ ¡éªŒè¯¾")
    expect(zone_card).to_have_count(1)

    # 2) å±•å¼€ DSLï¼šé»˜è®¤è·Ÿéšå…¨å±€å±•ç¤ºå£å¾„ï¼ˆé…é€Ÿï¼‰ï¼Œæ¡£ä½è¢«æ¢ç®—æˆæ˜Žç¡®é…é€Ÿ
    zone_card.get_by_test_id("toggle-dsl").click()
    pace_dsl = dsl_of(zone_card)
    assert pace_dsl.startswith("WORKOUT/2"), pace_dsl
    assert "8min@P3:45-4:00/km" in pace_dsl, pace_dsl
    assert "15min@P3:10-3:30/km" in pace_dsl, pace_dsl
    assert "@T" not in pace_dsl, pace_dsl
    assert "WORKOUT/2" not in pace_dsl, pace_dsl
    shot(page, "card-pace-dsl")

    # 3) åˆ‡åˆ°å¼ºåº¦ç‰ˆï¼šåªå‰©æ¡£ä½ï¼Œæ²¡æœ‰ä»»ä½•é…é€Ÿæ•°å€¼
    zone_card.get_by_test_id("dsl-flavor-zone").click()
    exported_zone = dsl_of(zone_card)
    assert exported_zone.startswith("WORKOUT/2"), exported_zone
    assert "6x(8min@T+90s@jog)" in exported_zone, exported_zone
    assert "@P" not in exported_zone, exported_zone
    shot(page, "card-zone-dsl")

    # 4) åˆ‡å›žé…é€Ÿç‰ˆï¼šæ–‡æœ¬ä¸Žç¬¬ 2 æ­¥ä¸€è‡´ï¼Œè¯´æ˜Žæ¢ç®—æ˜¯ç¡®å®šæ€§çš„
    zone_card.get_by_test_id("dsl-flavor-pace").click()
    assert dsl_of(zone_card) == pace_dsl

    # 5) å¯¼å…¥åªæœ‰æ˜Žç¡®é…é€Ÿçš„è¯¾è¡¨ï¼šè¯´æ˜Žæ–‡å­—ç‚¹æ˜Žä¸ä¼šè¢«åæŽ¨æˆæ¡£ä½
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(PACE_ONLY_DSL)
    expect(page.get_by_test_id("import-pace-note")).to_contain_text("ä¸ä¼šè¢«æ¢ç®—æˆæ¡£ä½")
    shot(page, "import-pace-only")
    page.get_by_test_id("import-confirm").click()
    page.get_by_test_id("course-category").select_option("M")
    page.get_by_test_id("save-course").click()

    pace_card = card_titled(page, "é…é€Ÿå†™æ³•è¯¾")
    expect(pace_card).to_have_count(1)
    pace_card.get_by_test_id("toggle-dsl").click()

    # 6) è¯¾è¡¨æ•°æ®é‡Œåªæœ‰æ˜Žç¡®é…é€Ÿï¼Œæ²¡æœ‰ä»»ä½• daniels æ¡£ä½
    stored = page.evaluate(
        "JSON.parse(localStorage.getItem('tfm:course-library:v1') || '[]')"
        ".map((course) => JSON.stringify(course.workout))"
    )
    pace_only_workout = next(item for item in stored if "é…é€Ÿå†™æ³•è¯¾" in item)
    assert "pace-range" in pace_only_workout, pace_only_workout
    assert "daniels" not in pace_only_workout, pace_only_workout

    # 7) è¿™ä»½è¯¾è¡¨æ²¡æœ‰å†™æ³•å¼€å…³ï¼ŒDSL åŽŸæ ·ä¿ç•™æ˜Žç¡®é…é€Ÿ
    expect(pace_card.get_by_test_id("dsl-single-flavor")).to_be_visible()
    expect(pace_card.get_by_test_id("dsl-flavor-zone")).to_have_count(0)
    expect(pace_card.get_by_test_id("dsl-flavor-pace")).to_have_count(0)
    pace_only_text = dsl_of(pace_card)
    assert "6x(8min@P3:45-4:00/km+90s@jog)" in pace_only_text, pace_only_text
    assert "@T" not in pace_only_text and "12min@E" not in pace_only_text, pace_only_text
    shot(page, "card-pace-only-dsl")

    assert not console_errors, console_errors

    # 8) æ¢ä¸€ä»½èƒ½åŠ›ï¼ˆé˜ˆå€¼ 4:20/kmï¼‰ï¼šåŒä¸€ä»½å«æ¡£ä½è¯¾è¡¨æ¢ç®—å‡ºä¸åŒçš„é…é€Ÿå†™æ³•
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

    other_card = card_titled(other_page, "å†™æ³•æ ¡éªŒè¯¾")
    other_card.get_by_test_id("toggle-dsl").click()
    other_pace_dsl = dsl_of(other_card)
    assert "@P" in other_pace_dsl, other_pace_dsl
    assert "8min@P3:45-4:00/km" not in other_pace_dsl, other_pace_dsl
    assert pace_dsl != other_pace_dsl
    shot(other_page, "card-pace-dsl-other-fitness")
    assert not other_errors, other_errors

    browser.close()

print("workout DSL flavor browser smoke test passed")
