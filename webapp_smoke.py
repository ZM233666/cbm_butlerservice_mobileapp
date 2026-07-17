import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright


ROOT = os.getenv("FRONTEND_URL", "http://127.0.0.1:5174")
BACKEND = os.getenv("BACKEND_URL", "http://127.0.0.1:3100")
PROJECT_DIR = Path(__file__).resolve().parent
SHOT_DIR = PROJECT_DIR / "test-artifacts"
SHOT_DIR.mkdir(parents=True, exist_ok=True)
CERT_PHOTO = PROJECT_DIR / "RVSChinaDT_Logo.png"

AUTH_TOKEN_SECRET = os.getenv("AUTH_TOKEN_SECRET", "butler-dev-secret").encode("utf-8")

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def issue_local_token(employee_id: str, role: str = "fse") -> str:
    now = int(time.time())
    payload = {"employeeId": str(employee_id), "role": role, "iat": now, "exp": now + 3600}
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(AUTH_TOKEN_SECRET, payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def set_session(page: Page, employee_id: str, username: str) -> None:
    token = issue_local_token(employee_id, "fse")
    user = {
        "employeeId": str(employee_id),
        "username": username,
        "email": "",
        "department": "",
        "region": "Shanghai",
        "role": "fse",
    }
    page.add_init_script(
        f"""
        localStorage.setItem('butler.auth.token', {json.dumps(token)});
        localStorage.setItem('butler.auth.refresh', '');
        localStorage.setItem('butler.auth.user', JSON.stringify({json.dumps(user, ensure_ascii=False)}));
        """
    )


def open_my_page(page: Page) -> None:
    page.goto(f"{ROOT}/my", wait_until="domcontentloaded")
    page.wait_for_selector(".my-profile-card", timeout=15000)


def logout(page: Page) -> None:
    page.click("text=退出登录")
    page.wait_for_timeout(300)


def open_certificate_dialog(page: Page):
    # 优先点空态按钮，其次点证件面板 action（文案中英会变）
    empty_btn = page.locator(".my-certificate-empty__btn")
    if empty_btn.count() > 0:
        empty_btn.first.click()
    else:
        page.locator(".my-panel--wide .my-panel__action").first.click()
    page.wait_for_selector("dialog.my-dialog--editor[open]")
    return page.locator("dialog.my-dialog--editor")


def remove_all_certificate_rows(page: Page) -> None:
    dialog = page.locator(".my-dialog--editor")
    # 目标：把现有证件“清空”为 1 行空草稿（无预览图、无名称）
    remove_btn = dialog.locator(".my-cert-editor__remove").first
    name_input = dialog.locator(".my-cert-editor__input").first
    preview = dialog.locator(".my-cert-editor__preview-img")

    for _ in range(10):
        if preview.count() == 0 and (name_input.input_value().strip() == ""):
            return
        if remove_btn.count() > 0:
            remove_btn.click()
            page.wait_for_timeout(160)
        # 再主动清一下名称，确保 normalized 为空
        try:
            name_input.fill("")
        except Exception:
            pass
        page.wait_for_timeout(80)
    return


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
    set_session(page, "1", "Zhen Miao")
    print("[smoke] employee1: open root", flush=True)
    page.goto(ROOT, wait_until="domcontentloaded")
    print("[smoke] employee1: open my", flush=True)
    open_my_page(page)
    print(f"[smoke] employee1: my loaded url={page.url}", flush=True)
    page.screenshot(path=str(SHOT_DIR / "employee1-my-page.png"), full_page=True)

    expect(page.locator(".my-certificate-card__name").first).to_have_text("登高证")
    expect(page.locator(".my-certificate-card").first).to_contain_text("20240108001")
    expect(page.locator(".my-certificate-card").first).to_contain_text("2028.01.01")

    open_certificate_dialog(page)
    print("[smoke] employee1: cert dialog opened", flush=True)
    width_diff = assert_dialog_aligned(page)
    page.screenshot(path=str(SHOT_DIR / "employee1-cert-dialog.png"), full_page=True)
    page.locator(".my-dialog--editor .my-dialog__ghost").click()
    page.wait_for_timeout(200)
    logout(page)
    print("[smoke] employee1: done", flush=True)
    return {
        "employee1_first_certificate": "登高证",
        "employee1_dialog_width_delta": f"{width_diff:.1f}px",
    }


def test_employee_three_certificate_flow(page: Page) -> dict:
    set_session(page, "3", "Zhen Miao")
    print("[smoke] employee3: open root", flush=True)
    page.goto(ROOT, wait_until="domcontentloaded")
    # 确保用例幂等：先把证件清空
    page.evaluate(
        """
        async () => {
          const token = localStorage.getItem('butler.auth.token') || '';
          await fetch('/api/users/self-certificates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
            body: JSON.stringify({ specialWorkCertificates: [] }),
          });
        }
        """
    )
    print("[smoke] employee3: open my", flush=True)
    open_my_page(page)
    print(f"[smoke] employee3: my loaded url={page.url}", flush=True)

    page.screenshot(path=str(SHOT_DIR / "employee3-my-page.png"), full_page=True)
    print("[smoke] employee3: check empty state", flush=True)
    try:
        expect(page.locator(".my-certificate-empty__text")).to_be_visible(timeout=8000)
    except Exception:
        page.screenshot(path=str(SHOT_DIR / "employee3-my-page-missing-empty.png"), full_page=True)
        raise
    page.screenshot(path=str(SHOT_DIR / "employee3-empty-state.png"), full_page=True)

    print("[smoke] employee3: open cert dialog", flush=True)
    dialog = open_certificate_dialog(page)
    print("[smoke] employee3: cert dialog opened", flush=True)
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
    # 回滚后：允许两种表现（空态文案出现 / 卡片列表为空）
    empty_text = page.locator(".my-certificate-empty__text")
    cards = page.locator(".my-certificate-card")
    if empty_text.count() > 0:
        expect(empty_text).to_be_visible()
    else:
        expect(cards).to_have_count(0)
    page.screenshot(path=str(SHOT_DIR / "employee3-restored-empty.png"), full_page=True)
    logout(page)
    return {
        "employee3_add_remove_flow": "OK",
        "employee3_uploaded_photo": CERT_PHOTO.name,
    }


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
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
