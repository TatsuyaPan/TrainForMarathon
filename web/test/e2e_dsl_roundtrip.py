"""Workout DSL 往返与深嵌套的浏览器验收。

覆盖课程库交互设计 §19.2 的两条验收项：

- 导出后重新导入，结构与展示一致；
- 在长课程和十层边界循环下页面仍可操作。

前置：在 core/web 目录执行 `npm run build`，并保持 `npm run preview`（4173 端口）运行。
运行：`python test/e2e_dsl_roundtrip.py`
"""
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE_URL = "http://127.0.0.1:4173"

# 一份覆盖主要结构的课程：嵌套循环、主动恢复、被动休息、配速区间、心率目标、坡度与备注
RICH_DSL = "\n".join(
    [
        "WORKOUT/1",
        "TITLE:往返校验课程",
        "GOAL:综合强度与恢复",
        "NOTE:含嵌套循环、恢复、休息与心率目标",
        "WU:15min@E",
        'MS:2x(4x(800m@R+2min@jog)+8min@P4:45-5:00/km+2min@rest)@note("主课")+20min@HR65-78%max@inc1.5',
        "CD:10min@E",
    ]
)

SHOTS = Path(__file__).resolve().parent.parent / "test-results"


def shot(page, name: str) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


def card_titled(page, title: str):
    """按卡片标题精确匹配（预览与备注里也可能出现同样的文字）。"""
    return page.locator('[data-testid="course-card"]').filter(
        has=page.locator("strong.card-title", has_text=re.compile(f"^{re.escape(title)}$"))
    )


def nested_dsl(levels: int) -> str:
    """构造 levels 层嵌套循环的最小课程。"""
    inner = "2x(" * levels + "1min@T" + ")" * levels
    return f"GOAL:深嵌套校验\nMS:{inner}"


def dsl_of(card) -> str:
    return card.get_by_test_id("course-dsl").evaluate("(node) => node.textContent")


def structure_of(card) -> str:
    return card.get_by_test_id("course-structure").inner_text()


def without_title(dsl: str) -> str:
    """忽略 TITLE 行，用于对比两份课程的结构是否一致。"""
    return "\n".join(line for line in dsl.splitlines() if not line.startswith("TITLE:"))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

    page.goto(f"{BASE_URL}/#/library")
    page.wait_for_load_state("networkidle")

    # 1) 导入复杂课程并保存
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(RICH_DSL)
    first_summary = page.get_by_test_id("import-summary").inner_text()
    assert "3 个阶段" in first_summary, first_summary
    assert "2 个循环" in first_summary, first_summary
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("往返校验课程")
    expect(page.locator('[data-testid="editor-repeat"]')).to_have_count(2)
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("save-course").click()

    original = card_titled(page, "往返校验课程")
    expect(original).to_have_count(1)
    original.get_by_test_id("toggle-structure").click()
    original.get_by_test_id("toggle-dsl").click()
    export_dsl = dsl_of(original)
    export_structure = structure_of(original)
    export_badges = original.locator(".card-metrics").inner_text()
    assert export_dsl.startswith("WORKOUT/1"), export_dsl
    assert "GOAL:综合强度与恢复" in export_dsl, export_dsl
    assert "@rest" in export_dsl and "@jog" in export_dsl, export_dsl
    shot(page, "roundtrip-export")

    # 2) 把导出的 DSL 原样重新导入：解析摘要必须与原课程一致
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(export_dsl)
    again_summary = page.get_by_test_id("import-summary").inner_text()
    assert again_summary == first_summary, (again_summary, first_summary)
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("往返校验课程")
    # 改标题只为在课程库里区分两份课程，结构一个字都不动
    page.get_by_test_id("course-title").fill("往返校验课程 B")
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("save-course").click()

    reimported = card_titled(page, "往返校验课程 B")
    expect(reimported).to_have_count(1)
    reimported.get_by_test_id("toggle-structure").click()
    reimported.get_by_test_id("toggle-dsl").click()
    reimported_dsl = dsl_of(reimported)
    reimported_structure = structure_of(reimported)
    reimported_badges = reimported.locator(".card-metrics").inner_text()
    shot(page, "roundtrip-reimported")

    # 3) 结构与展示一致：步骤树、汇总徽标完全相同，DSL 仅 TITLE 行不同
    assert reimported_structure == export_structure, (reimported_structure, export_structure)
    assert reimported_badges == export_badges, (reimported_badges, export_badges)
    assert without_title(reimported_dsl) == without_title(export_dsl), (reimported_dsl, export_dsl)

    # 再次导出也必须幂等：同一结构永远序列化成同一份 DSL
    assert dsl_of(reimported) == reimported_dsl

    # 4) 十层嵌套循环：能导入、能渲染、能继续编辑并保存
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(nested_dsl(10))
    page.get_by_test_id("import-confirm").click()
    expect(page.locator('[data-testid="editor-repeat"]')).to_have_count(10)
    page.locator('[data-testid^="segment-row-"]').first.click()
    expect(page.get_by_test_id("focused-editor")).to_be_visible()
    page.get_by_test_id("step-editor").get_by_role("button", name="关闭步骤编辑").click()
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("save-course").click()
    deep_card = card_titled(page, "深嵌套校验")
    expect(deep_card).to_have_count(1)
    deep_card.get_by_test_id("toggle-dsl").click()
    assert dsl_of(deep_card).count("2x(") == 10, dsl_of(deep_card)
    shot(page, "roundtrip-deep-nesting")

    # 5) 十一层嵌套必须被拒绝，并给出可读提示，不写入任何课程
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(nested_dsl(11))
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("import-error")).to_contain_text("循环嵌套不能超过 10 层")
    page.get_by_role("button", name="关闭导入").click()
    expect(card_titled(page, "深嵌套校验")).to_have_count(1)

    # 6) 长课程：预览自动压缩而不是堆出无界 DOM，页面仍然可以继续编辑
    long_dsl = "\n".join(
        [
            "TITLE:长课程容量校验",
            "GOAL:长课程容量",
            "WU:15min@E",
            "MS:30x(3min@T+2min@jog)",
            "CD:10min@E",
        ]
    )
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(long_dsl)
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("长课程容量校验")
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("save-course").click()

    long_card = card_titled(page, "长课程容量校验")
    expect(long_card).to_have_count(1)
    expect(long_card.get_by_test_id("structure-preview")).to_have_attribute("aria-label", re.compile("预览已压缩"))
    long_card.get_by_test_id("toggle-structure").click()
    expect(long_card.get_by_test_id("course-structure")).to_be_visible()
    page.get_by_test_id("new-course").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("新建课程")
    page.get_by_test_id("back-to-library").click()
    shot(page, "roundtrip-long-course")

    # 7) 刷新页面后，自定义课程与它的结构必须原样持久化
    page.reload()
    page.wait_for_load_state("networkidle")
    persisted = card_titled(page, "往返校验课程 B")
    expect(persisted).to_have_count(1)
    persisted.get_by_test_id("toggle-dsl").click()
    assert dsl_of(persisted) == reimported_dsl, dsl_of(persisted)
    expect(card_titled(page, "深嵌套校验")).to_have_count(1)
    expect(card_titled(page, "长课程容量校验")).to_have_count(1)
    shot(page, "roundtrip-persisted")

    assert not console_errors, console_errors
    browser.close()

print("workout DSL round-trip browser smoke test passed")
