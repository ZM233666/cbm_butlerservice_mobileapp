(function () {
  const auth = window.ButlerAuth;
  const form = document.getElementById("login-form");
  const errEl = document.getElementById("login-error");

  if (!auth || !form || !errEl) return;

  const existing = auth.getUser();
  if (existing) {
    window.location.replace("/index.html");
    return;
  }

  function showError(msg) {
    errEl.textContent = msg;
  }

  function readNextPath() {
    const query = new URLSearchParams(window.location.search);
    const raw = query.get("next");
    if (!raw) return "/index.html";
    try {
      const val = decodeURIComponent(raw);
      if (val.startsWith("/")) return val;
    } catch (_e) {
      // ignore malformed next path
    }
    return "/index.html";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    showError("");
    const data = new FormData(form);
    const payload = {
      username: String(data.get("username") || "").trim(),
      employeeId: String(data.get("employeeId") || "").trim(),
      email: String(data.get("email") || "").trim(),
      role: String(data.get("role") || "").trim(),
    };
    if (!payload.username || !payload.employeeId || !payload.email || !payload.role) {
      showError("请完整填写全部字段");
      return;
    }
    if (!["fse", "manager", "third_party"].includes(payload.role)) {
      showError("请选择有效角色");
      return;
    }
    auth.setUser(payload);
    window.location.replace(readNextPath());
  });
})();
