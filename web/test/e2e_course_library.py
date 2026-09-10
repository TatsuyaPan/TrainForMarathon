"""课程库浏览器冒烟测试：展示、展开、导入、新建、编辑、复制、删除。

前置：先在 core/web 目录执行 `npm run build`，再 `npm run preview`（默认 4173 端口）。
运行：`python test/e2e_course_library.py`
"""
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
IMPORT_DSL = "\n".join(
    [
        "WORKOUT/1",
        "TITLE:导入的阈值课",
        "GOAL:乳酸阈能力",
        "NOTE:每组稳定完成",
        "WU:15min@E",
        "MS:6x(8min@T@RPE8+90s@jog)",
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


def builtin_card(page, index: int = 0):
    """内置课程分区里的第 index 张卡片（第 1 个分区是「我的课程」）。"""
    return page.locator("section.library-section").nth(1).locator('[data-testid="course-card"]').nth(index)


def dsl_of(card) -> str:
    return card.get_by_test_id("course-dsl").evaluate("(node) => node.textContent")


def without_title(dsl: str) -> str:
    """忽略 TITLE 行，用于对比两份课程的结构是否一致。"""
    return "\n".join(line for line in dsl.splitlines() if not line.startswith("TITLE:"))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

    # 1) 课程库默认视图
    page.goto(f"{BASE_URL}/#/library")
    page.wait_for_load_state("networkidle")
    expect(page.locator('[data-testid="course-card"]').first).to_be_visible()
    assert page.locator('[data-testid="course-dsl"]').count() == 0, "DSL 不应出现在默认摘要里"
    shot(page, "library")

    # 2) 展开内置课程结构
    first_card = page.locator('[data-testid="course-card"]').first
    first_card.get_by_test_id("toggle-structure").click()
    expect(first_card.get_by_test_id("course-structure")).to_be_visible()
    shot(page, "library-expanded")

    # 3) 展开 DSL 折叠区
    first_card.get_by_test_id("toggle-dsl").click()
    expect(first_card.get_by_test_id("course-dsl")).to_contain_text("GOAL:")
    shot(page, "library-dsl")

    # 4) 导入：先验证错误信息带行列
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill("GOAL:有氧基础\nMS:40min@H")
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("import-error")).to_contain_text("第 2 行")
    shot(page, "import-error")

    # 5) 导入合法课程 → 进入编辑器
    page.get_by_test_id("import-textarea").fill(IMPORT_DSL)
    expect(page.get_by_test_id("import-summary")).to_contain_text("循环")
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("导入的阈值课")
    expect(page.locator('[data-testid="editor-repeat"]').first).to_be_visible()
    shot(page, "editor-import")

    # 6) 点击步骤 → 聚焦编辑面板
    page.locator('[data-testid^="segment-row-"]').nth(1).click()
    expect(page.get_by_test_id("focused-editor")).to_be_visible()
    shot(page, "editor-step")
    page.get_by_test_id("step-editor").get_by_role("button", name="关闭步骤编辑").click()

    # 7) 补充元数据并保存
    page.get_by_test_id("course-category").select_option("T")
    page.get_by_test_id("course-weekly").fill("周跑量 ≥100km")
    page.get_by_test_id("save-course").click()
    expect(page.get_by_test_id("library-notice")).to_have_count(0)
    expect(page.locator('[data-testid="course-card"]').filter(has_text="导入的阈值课")).to_have_count(1)
    shot(page, "library-after-save")

    # 8) 新建课程：默认草稿 → 保存
    page.get_by_test_id("new-course").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("新建课程")
    page.get_by_test_id("course-goal").fill("轻松有氧")
    page.get_by_test_id("course-title").fill("我的轻松跑 30 分钟")
    page.get_by_test_id("save-course").click()
    expect(page.locator('[data-testid="course-card"]').filter(has_text="我的轻松跑 30 分钟")).to_have_count(1)

    # 9) 编辑自定义课程：结构操作 + 保存
    card = card_titled(page, "我的轻松跑 30 分钟")
    card.get_by_test_id("edit-course").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("我的轻松跑 30 分钟")
    page.get_by_test_id("add-repeat").first.click()
    page.get_by_test_id("course-goal").fill("轻松有氧 + 循环")
    page.get_by_test_id("save-course").click()
    edited = card_titled(page, "我的轻松跑 30 分钟")
    expect(edited).to_contain_text("轻松有氧 + 循环")
    shot(page, "library-edited")

    # 10) 复制内置课程 → 标题自动追加（副本），内置课程本身一个字都不能改
    source = builtin_card(page)
    builtin_title = source.locator("strong.card-title").inner_text()
    source.get_by_test_id("toggle-dsl").click()
    builtin_dsl = dsl_of(source)
    source.get_by_test_id("copy-course").click()
    expect(page.get_by_test_id("editor-title")).to_contain_text("（副本）")
    shot(page, "editor-copy")
    page.get_by_test_id("save-course").click()

    untouched = card_titled(page, builtin_title)
    expect(untouched).to_have_count(1)
    untouched.get_by_test_id("toggle-dsl").click()
    assert dsl_of(untouched) == builtin_dsl, "复制课程不应改动内置课程"

    copied = card_titled(page, f"{builtin_title}（副本）")
    expect(copied).to_have_count(1)
    copied.get_by_test_id("toggle-dsl").click()
    assert without_title(dsl_of(copied)) == without_title(builtin_dsl), "副本结构应与内置课程一致"

    # 11) 删除自定义课程（二次确认）
    target = card_titled(page, "我的轻松跑 30 分钟")
    target.get_by_test_id("delete-course").click()
    expect(page.get_by_test_id("delete-confirm")).to_contain_text("我的轻松跑 30 分钟")
    page.get_by_test_id("confirm-delete").click()
    expect(card_titled(page, "我的轻松跑 30 分钟")).to_have_count(0)
    shot(page, "library-final")

    stored = page.evaluate(
        "JSON.parse(localStorage.getItem('tfm:course-library:v1') || '[]').map((course) => course.workout.title)"
    )
    assert "我的轻松跑 30 分钟" not in stored, stored
    assert any("（副本）" in (title or "") for title in stored), stored
    assert not console_errors, console_errors

    browser.close()

print("course library browser smoke test passed")
