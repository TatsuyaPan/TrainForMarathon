import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://127.0.0.1:4173"
SHOTS = Path(__file__).resolve().parent.parent / "test-results"
SHOTS.mkdir(exist_ok=True)

console_errors = []
failures = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL"), name, detail)
    if not ok:
        failures.append(f"{name} {detail}")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1100, "height": 900})
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: console_errors.append(str(err)))

    # 1. T 课表文章：活课程卡列表
    page.goto(f"{BASE_URL}/#/course/training-types%2Fthreshold")
    page.wait_for_timeout(800)
    page.screenshot(path=str(SHOTS / "embed-threshold.png"), full_page=True)
    cards = page.locator('[data-testid^="embed-course-"]').count()
    check("T 文章活课程卡数量为 6", cards == 6, f"got {cards}")
    check("无 doc-code 代码块", page.locator("pre.doc-code").count() == 0)
    check("有出处链接", page.locator(".embed-source").first.is_visible())
    check("有收藏按钮", page.locator('[data-testid^="save-course-"]').first.is_visible())

    # 收藏动作：点击后 localStorage 写入
    page.locator('[data-testid="save-course-t-20min"]').click()
    page.wait_for_timeout(300)
    saved = page.evaluate("(JSON.parse(localStorage.getItem('tfm:course-library:v1') || '[]') || []).length")
    check("收藏后课程库写入 1 条", saved == 1, f"got {saved}")
    check("收藏后显示已收藏", "已收藏" in page.locator('[data-testid="embed-course-t-20min"]').inner_text())

    # 2. 计划文章：计划预览
    page.goto(f"{BASE_URL}/#/course/plans%2F20-week")
    page.wait_for_timeout(800)
    page.screenshot(path=str(SHOTS / "embed-plan.png"), full_page=True)
    plan = page.locator('[data-testid="embed-plan"]')
    check("计划预览存在", plan.is_visible())
    rows = page.locator(".plan-table tbody tr").count()
    check("20 周计划行数", rows == 20, f"got {rows}")
    check("计划表含阶段", "基础期" in plan.inner_text())
    check("采用按钮存在", page.locator('[data-testid="use-plan"]').is_visible())

    # 3. 配速基准文章：pace-table 嵌入（无能力 → 引导）
    page.goto(f"{BASE_URL}/#/course/training-types%2Fpace-baseline")
    page.wait_for_timeout(800)
    pace = page.locator('[data-testid="embed-pace-table"]')
    check("配速表嵌入存在", pace.is_visible())
    hint = pace.inner_text()
    if "尚未建立能力基准" in hint:
        check("无能力态引导", True)
    elif "我的训练配速表" in hint:
        check("有能力态实时配速表", True)
    else:
        check("配速表两态之一", False, hint[:80])

    # 4. 课程库：出处活链接
    page.goto(f"{BASE_URL}/#/library")
    page.wait_for_timeout(1000)
    link = page.locator('[data-testid="course-source-link"]')
    check("课程库出处链接可见", link.first.is_visible())

    # 5. I 文章 H 记法块
    page.goto(f"{BASE_URL}/#/course/training-types%2Finterval")
    page.wait_for_timeout(800)
    check("I 文章活课程卡 5 张", page.locator('[data-testid^="embed-course-"]').count() == 5)

    check("无 console 错误", len(console_errors) == 0, "; ".join(console_errors[:5]))

    browser.close()

if failures:
    print("\nFAILURES:")
    for f in failures:
        print(" -", f)
    sys.exit(1)
print("\nALL ASSERTIONS PASSED")
