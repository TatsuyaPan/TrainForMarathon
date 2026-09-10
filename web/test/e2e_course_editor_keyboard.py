"""课程编辑器的纯键盘验收。

覆盖课程库交互设计 §19.2 的「使用键盘完成步骤展开、移动和保存」：

- 用 Enter 展开步骤并在聚焦编辑面板与步骤之间往返焦点；
- 用键盘移动步骤、用键盘保存；
- 保存后的结构与键盘操作结果一致。

前置：在 core/web 目录执行 `npm run build`，并保持 `npm run preview`（4173 端口）运行。
运行：`python test/e2e_course_editor_keyboard.py`
"""
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
KEYBOARD_DSL = "\n".join(
    [
        "TITLE:键盘校验课程",
        "GOAL:键盘可操作性",
        "MS:8min@E+6min@T",
    ]
)

SHOTS = Path(__file__).resolve().parent.parent / "test-results"


def shot(page, name: str) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


def card_titled(page, title: str):
    return page.locator('[data-testid="course-card"]').filter(
        has=page.locator("strong.card-title", has_text=re.compile(f"^{re.escape(title)}$"))
    )


def active_testid(page) -> str:
    return page.evaluate("document.activeElement?.dataset?.segmentPath ?? document.activeElement?.dataset?.testid ?? ''")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

    page.goto(f"{BASE_URL}/#/library")
    page.wait_for_load_state("networkidle")

    # 导入一份结构确定的课程，全程只用键盘操作
    page.get_by_test_id("open-import").click()
    page.get_by_test_id("import-textarea").fill(KEYBOARD_DSL)
    page.get_by_test_id("import-confirm").click()
    expect(page.get_by_test_id("editor-title")).to_have_text("键盘校验课程")
    expect(page.locator('[data-testid^="segment-row-"]')).to_have_count(2)

    # 1) Enter 展开步骤：焦点应进入聚焦编辑面板
    first_row = page.locator('[data-segment-path="0-0"]')
    first_row.focus()
    page.keyboard.press("Enter")
    expect(page.get_by_test_id("focused-editor")).to_be_visible()
    assert active_testid(page) == "focused-editor", active_testid(page)
    shot(page, "keyboard-focused-editor")

    # 2) Esc 关闭：焦点回到刚才那个步骤
    page.keyboard.press("Escape")
    expect(page.get_by_test_id("focused-editor")).to_have_count(0)
    assert active_testid(page) == "0-0", active_testid(page)

    # 3) 键盘移动：Enter 触发「下移」，两个步骤顺序对调
    row = page.locator("div.segment-row").filter(has=page.locator('[data-segment-path="0-0"]'))
    row.locator('button[title="下移"]').focus()
    page.keyboard.press("Enter")
    page.wait_for_timeout(50)
    expect(page.get_by_test_id("dirty-badge")).to_be_visible()

    # 4) 键盘保存：Enter 触发保存并回到课程库
    page.get_by_test_id("save-course").focus()
    page.keyboard.press("Enter")

    saved = card_titled(page, "键盘校验课程")
    expect(saved).to_have_count(1)
    saved.get_by_test_id("toggle-dsl").click()
    stored_dsl = saved.get_by_test_id("course-dsl").evaluate("(node) => node.textContent")
    assert "MS:6min@T+8min@E" in stored_dsl, stored_dsl
    shot(page, "keyboard-saved")

    assert not console_errors, console_errors
    browser.close()

print("course editor keyboard browser smoke test passed")
