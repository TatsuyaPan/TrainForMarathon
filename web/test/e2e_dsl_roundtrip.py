"""Workout DSL å¾€è¿”ä¸Žæ·±åµŒå¥—çš„æµè§ˆå™¨éªŒæ”¶ã€‚

è¦†ç›–è¯¾ç¨‹åº“äº¤äº’è®¾è®¡ Â§19.2 çš„ä¸¤æ¡éªŒæ”¶é¡¹ï¼š

- å¯¼å‡ºåŽé‡æ–°å¯¼å…¥ï¼Œç»“æž„ä¸Žå±•ç¤ºä¸€è‡´ï¼›
- åœ¨é•¿è¯¾ç¨‹å’Œåå±‚è¾¹ç•Œå¾ªçŽ¯ä¸‹é¡µé¢ä»å¯æ“ä½œã€‚

å‰ç½®ï¼šåœ¨ core/web ç›®å½•æ‰§è¡Œ `npm run build`ï¼Œå¹¶ä¿æŒ `npm run preview`ï¼ˆ4173 ç«¯å£ï¼‰è¿è¡Œã€‚
è¿è¡Œï¼š`python test/e2e_dsl_roundtrip.py`
"""
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE_URL = "http://127.0.0.1:4173"

# ä¸€ä»½è¦†ç›–ä¸»è¦ç»“æž„çš„è¯¾ç¨‹ï¼šåµŒå¥—å¾ªçŽ¯ã€ä¸»åŠ¨æ¢å¤ã€è¢«åŠ¨ä¼‘æ¯ã€é…é€ŸåŒºé—´ã€å¿ƒçŽ‡ç›®æ ‡ã€å¡åº¦ä¸Žå¤‡æ³¨
RICH_DSL = "\n".join(
    [
        "WORKOUT/2",
        "TITLE:å¾€è¿”æ ¡éªŒè¯¾ç¨‹",
        "GOAL:ç»¼åˆå¼ºåº¦ä¸Žæ¢å¤",
        "NOTE:å«åµŒå¥—å¾ªçŽ¯ã€æ¢å¤ã€ä¼‘æ¯ä¸Žå¿ƒçŽ‡ç›®æ ‡",
        "WU:15min@E",
        'MS:2x(4x(800m@R+2min@jog)+8min@P4:45-5:00/km+2min@rest)@note("ä¸»è¯¾")+20min@HR65-78%max@inc1.5',
        "CD:10min@E",
    ]
)

SHOTS = Path(__file__).resolve().parent.parent / "test-results"


def shot(page, name: str) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


def card_titled(page, title: str):
    """æŒ‰å¡ç‰‡æ ‡é¢˜ç²¾ç¡®åŒ¹é…ï¼ˆé¢„è§ˆä¸Žå¤‡æ³¨é‡Œä¹Ÿå¯èƒ½å‡ºçŽ°åŒæ ·çš„æ–‡å­—ï¼‰ã€‚"""
    return page.locator('[data-testid="course-card"]').filter(
        has=page.locator("strong.card-title", has_text=re.compile(f"^{re.escape(title)}$"))
    )


def nested_dsl(levels: int) -> str:
    """æž„é€  levels å±‚åµŒå¥—å¾ªçŽ¯çš„æœ€å°è¯¾ç¨‹ã€‚"""
    inner = "2x(" * levels + "1min@T" + ")" * levels
    return f"GOAL:æ·±åµŒå¥—æ ¡éªŒ\nMS:{inner}"


def dsl_of(card) -> str:
    return card.get_by_test_id("course-dsl").evaluate("(node) => node.textContent")


def structure_of(card) -> str:
    return card.get_by_test_id("course-structure").inner_text()


def without_title(dsl: str) -> str:
    """å¿½ç•¥ TITLE è¡Œï¼Œç”¨äºŽå¯¹æ¯”ä¸¤ä»½è¯¾ç¨‹çš„ç»“æž„æ˜¯å¦ä¸€è‡´ã€‚"""
    return "\n".join(line for line in dsl.splitlines() if not line.startswith("TITLE:"))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

    page.goto(f"{BASE_URL}/#/library")
    page.wait_for_load_state("networkidle")

    # 1) å¯¼å…¥å¤æ‚è¯¾ç¨‹å¹¶ä¿å­˜
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(RICH_DSL)
    first_summary = page.get_by_test_id("import-summary").inner_text()
    assert "3 ä¸ªé˜¶æ®µ" in first_summary, first_summary
    assert "2 ä¸ªå¾ªçŽ¯" in first_summary, first_summary
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("å¾€è¿”æ ¡éªŒè¯¾ç¨‹")
    expect(page.locator('[data-testid="editor-repeat"]')).to_have_count(2)
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("save-course").click()

    original = card_titled(page, "å¾€è¿”æ ¡éªŒè¯¾ç¨‹")
    expect(original).to_have_count(1)
    original.get_by_test_id("toggle-structure").click()
    original.get_by_test_id("toggle-dsl").click()
    export_dsl = dsl_of(original)
    export_structure = structure_of(original)
    export_badges = original.locator(".card-metrics").inner_text()
    assert export_dsl.startswith("WORKOUT/2"), export_dsl
    assert "GOAL:ç»¼åˆå¼ºåº¦ä¸Žæ¢å¤" in export_dsl, export_dsl
    assert "@rest" in export_dsl and "@jog" in export_dsl, export_dsl
    shot(page, "roundtrip-export")

    # 2) æŠŠå¯¼å‡ºçš„ DSL åŽŸæ ·é‡æ–°å¯¼å…¥ï¼šè§£æžæ‘˜è¦å¿…é¡»ä¸ŽåŽŸè¯¾ç¨‹ä¸€è‡´
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(export_dsl)
    again_summary = page.get_by_test_id("import-summary").inner_text()
    assert again_summary == first_summary, (again_summary, first_summary)
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("å¾€è¿”æ ¡éªŒè¯¾ç¨‹")
    # æ”¹æ ‡é¢˜åªä¸ºåœ¨è¯¾ç¨‹åº“é‡ŒåŒºåˆ†ä¸¤ä»½è¯¾ç¨‹ï¼Œç»“æž„ä¸€ä¸ªå­—éƒ½ä¸åŠ¨
    page.get_by_test_id("course-title").fill("å¾€è¿”æ ¡éªŒè¯¾ç¨‹ B")
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("save-course").click()

    reimported = card_titled(page, "å¾€è¿”æ ¡éªŒè¯¾ç¨‹ B")
    expect(reimported).to_have_count(1)
    reimported.get_by_test_id("toggle-structure").click()
    reimported.get_by_test_id("toggle-dsl").click()
    reimported_dsl = dsl_of(reimported)
    reimported_structure = structure_of(reimported)
    reimported_badges = reimported.locator(".card-metrics").inner_text()
    shot(page, "roundtrip-reimported")

    # 3) ç»“æž„ä¸Žå±•ç¤ºä¸€è‡´ï¼šæ­¥éª¤æ ‘ã€æ±‡æ€»å¾½æ ‡å®Œå…¨ç›¸åŒï¼ŒDSL ä»… TITLE è¡Œä¸åŒ
    assert reimported_structure == export_structure, (reimported_structure, export_structure)
    assert reimported_badges == export_badges, (reimported_badges, export_badges)
    assert without_title(reimported_dsl) == without_title(export_dsl), (reimported_dsl, export_dsl)

    # å†æ¬¡å¯¼å‡ºä¹Ÿå¿…é¡»å¹‚ç­‰ï¼šåŒä¸€ç»“æž„æ°¸è¿œåºåˆ—åŒ–æˆåŒä¸€ä»½ DSL
    assert dsl_of(reimported) == reimported_dsl

    # 4) åå±‚åµŒå¥—å¾ªçŽ¯ï¼šèƒ½å¯¼å…¥ã€èƒ½æ¸²æŸ“ã€èƒ½ç»§ç»­ç¼–è¾‘å¹¶ä¿å­˜
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(nested_dsl(10))
    page.get_by_test_id("import-confirm").click()
    expect(page.locator('[data-testid="editor-repeat"]')).to_have_count(10)
    page.locator('[data-testid^="segment-row-"]').first.click()
    expect(page.get_by_test_id("focused-editor")).to_be_visible()
    page.get_by_test_id("step-editor").get_by_role("button", name="å…³é—­æ­¥éª¤ç¼–è¾‘").click()
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("save-course").click()
    deep_card = card_titled(page, "æ·±åµŒå¥—æ ¡éªŒ")
    expect(deep_card).to_have_count(1)
    deep_card.get_by_test_id("toggle-dsl").click()
    assert dsl_of(deep_card).count("2x(") == 10, dsl_of(deep_card)
    shot(page, "roundtrip-deep-nesting")

    # 5) åä¸€å±‚åµŒå¥—å¿…é¡»è¢«æ‹’ç»ï¼Œå¹¶ç»™å‡ºå¯è¯»æç¤ºï¼Œä¸å†™å…¥ä»»ä½•è¯¾ç¨‹
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(nested_dsl(11))
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("import-error")).to_contain_text("å¾ªçŽ¯åµŒå¥—ä¸èƒ½è¶…è¿‡ 10 å±‚")
    page.get_by_role("button", name="å…³é—­å¯¼å…¥").click()
    expect(card_titled(page, "æ·±åµŒå¥—æ ¡éªŒ")).to_have_count(1)

    # 6) é•¿è¯¾ç¨‹ï¼šé¢„è§ˆè‡ªåŠ¨åŽ‹ç¼©è€Œä¸æ˜¯å †å‡ºæ— ç•Œ DOMï¼Œé¡µé¢ä»ç„¶å¯ä»¥ç»§ç»­ç¼–è¾‘
    long_dsl = "\n".join(
        [
            "TITLE:é•¿è¯¾ç¨‹å®¹é‡æ ¡éªŒ",
            "GOAL:é•¿è¯¾ç¨‹å®¹é‡",
            "WU:15min@E",
            "MS:30x(3min@T+2min@jog)",
            "CD:10min@E",
        ]
    )
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(long_dsl)
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("é•¿è¯¾ç¨‹å®¹é‡æ ¡éªŒ")
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("save-course").click()

    long_card = card_titled(page, "é•¿è¯¾ç¨‹å®¹é‡æ ¡éªŒ")
    expect(long_card).to_have_count(1)
    expect(long_card.get_by_test_id("structure-preview")).to_have_attribute("aria-label", re.compile("é¢„è§ˆå·²åŽ‹ç¼©"))
    long_card.get_by_test_id("toggle-structure").click()
    expect(long_card.get_by_test_id("course-structure")).to_be_visible()
    page.get_by_test_id("new-course").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("æ–°å»ºè¯¾ç¨‹")
    page.get_by_test_id("back-to-library").click()
    shot(page, "roundtrip-long-course")

    # 7) åˆ·æ–°é¡µé¢åŽï¼Œè‡ªå®šä¹‰è¯¾ç¨‹ä¸Žå®ƒçš„ç»“æž„å¿…é¡»åŽŸæ ·æŒä¹…åŒ–
    page.reload()
    page.wait_for_load_state("networkidle")
    persisted = card_titled(page, "å¾€è¿”æ ¡éªŒè¯¾ç¨‹ B")
    expect(persisted).to_have_count(1)
    persisted.get_by_test_id("toggle-dsl").click()
    assert dsl_of(persisted) == reimported_dsl, dsl_of(persisted)
    expect(card_titled(page, "æ·±åµŒå¥—æ ¡éªŒ")).to_have_count(1)
    expect(card_titled(page, "é•¿è¯¾ç¨‹å®¹é‡æ ¡éªŒ")).to_have_count(1)
    shot(page, "roundtrip-persisted")

    assert not console_errors, console_errors
    browser.close()

print("workout DSL round-trip browser smoke test passed")
