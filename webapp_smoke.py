from pathlib import Path
from playwright.sync_api import Page, expect, sync_playwright


ROOT = "http://127.0.0.1:5173"
PROJECT_DIR = Path("/Users/God-Prime/Desktop/H5Projects/ButlerService")
SHOT_DIR = PROJECT_DIR / "test-artifacts"
SHOT_DIR.mkdir(parents=True, exist_ok=True)
CERT_PHOTO = PROJECT_DIR / "RVSChinaDT_Logo.png"


def login(page: Page, employee_id: str, email: str) -> None:
    page.goto(ROOT, wait_until="networkidle")
    page.fill("#login-username", "Zhen Miao")
    page.fill("#login-employee-id", employee_id)
    page.fill("#login-email", email)
    page.select_option("#login-role", "fse")
    page.click("button[type=submit]")
    page.wait_for_load_state("networkidle")


def open_my_page(page: Page) -> None:
    page.goto(f"{ROOT}/my", wait_until="networkidle")
    page.wait_for_selector("text=专业档案")


def logout(page: Page) -> None:
    page.click("text=退出登录")
    page.wait_for_selector("#login-username")


def open_certificate_dialog(page: Page):
    page.click("text=编辑证件")
    page.wait_for_selector("text=管理特殊工种证件")
    return page.locator(".my-dialog--editor")


def remove_all_certificate_rows(page: Page) -> None:
    dialog = page.locator(".my-dialog--editor")
    while dialog.locator(".my-cert-editor__remove").count() > 0:
      dialog.locator(".my-cert-editor__remove").first.click()
      page.wait_for_timeout(120)


def assert_dialog_aligned(page: Page) -> float:
    profile_box = page.locator(".my-profile-card").bounding_box()
    dialog_box = page.locator(".my-dialog--editor").bounding_box()
    if not profile_box or not dialog_box:
        raise AssertionError("Could not measure profile/dialog width")
    width_diff = abs(profile_box["width"] - dialog_box["width"])
    if width_diff > 1.0:
        raise AssertionError(f"Dialog width mismatch: {width_diff:.2f}px")
    return width_diff


def test_employee_one_profile(page: Page) -> dict:
    login(page, "1", "1@com")
    open_my_page(page)
    page.screenshot(path=str(SHOT_DIR / "employee1-my-page.png"), full_page=True)

    expect(page.locator(".my-certificate-card__name").first).to_have_text("登高证")
    expect(page.locator(".my-certificate-card").first).to_contain_text("20240108001")
    expect(page.locator(".my-certificate-card").first).to_contain_text("2028.01.01")

    open_certificate_dialog(page)
    width_diff = assert_dialog_aligned(page)
    page.screenshot(path=str(SHOT_DIR / "employee1-cert-dialog.png"), full_page=True)
    page.locator(".my-dialog--editor .my-dialog__ghost").click()
    page.wait_for_timeout(200)
    logout(page)
    return {
        "employee1_first_certificate": "登高证",
        "employee1_dialog_width_delta": f"{width_diff:.1f}px",
    }


def test_employee_three_certificate_flow(page: Page) -> dict:
    login(page, "3", "3@com")
    open_my_page(page)

    expect(page.locator(".my-certificate-empty__text")).to_be_visible()
    page.screenshot(path=str(SHOT_DIR / "employee3-empty-state.png"), full_page=True)

    dialog = open_certificate_dialog(page)
    assert_dialog_aligned(page)
    remove_all_certificate_rows(page)

    expect(dialog.locator(".my-cert-editor__card")).to_have_count(1)
    dialog.locator(".my-cert-editor__input").first.fill("测试登高证")
    dialog.locator(".my-cert-editor__file").first.set_input_files(str(CERT_PHOTO))
    page.wait_for_selector(".my-cert-editor__preview-img")
    dialog.locator(".my-dialog__ok").click()
    page.wait_for_timeout(900)
    expect(page.locator(".my-certificate-card__name").first).to_have_text("测试登高证")
    expect(page.locator(".my-certificate-card__photo").first).to_be_visible()
    page.screenshot(path=str(SHOT_DIR / "employee3-added-certificate.png"), full_page=True)

    dialog = open_certificate_dialog(page)
    remove_all_certificate_rows(page)
    dialog.locator(".my-dialog__ok").click()
    page.wait_for_timeout(900)
    expect(page.locator(".my-certificate-empty__text")).to_be_visible()
    page.screenshot(path=str(SHOT_DIR / "employee3-restored-empty.png"), full_page=True)
    logout(page)
    return {
        "employee3_add_remove_flow": "OK",
        "employee3_uploaded_photo": CERT_PHOTO.name,
    }


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 430, "height": 932})
        page.set_default_timeout(10000)

        summary = {}
        summary.update(test_employee_one_profile(page))
        summary.update(test_employee_three_certificate_flow(page))

        print("Smoke test summary")
        print("- Employee 1 profile and certificate detail: OK")
        print("- Employee 3 empty-state / add / rollback flow: OK")
        for key, value in summary.items():
            print(f"- {key}: {value}")

        browser.close()


if __name__ == "__main__":
    main()
