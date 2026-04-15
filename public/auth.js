(function () {
  const USER_KEY = "butler.auth.user";
  const ROLE_FSE = "fse";
  const ROLE_MANAGER = "manager";
  const ROLE_THIRD_PARTY = "third_party";
  const WATERMARK_ID = "third-party-screenshot-watermark";
  let watermarkTimer = null;

  const ROLE_LABELS = {
    [ROLE_FSE]: "FSE",
    [ROLE_MANAGER]: "大区经理",
    [ROLE_THIRD_PARTY]: "第三方",
  };

  const PAGE_ACCESS = {
    "/index.html": [ROLE_FSE, ROLE_MANAGER, ROLE_THIRD_PARTY],
    "/": [ROLE_FSE, ROLE_MANAGER, ROLE_THIRD_PARTY],
    "/my.html": [ROLE_FSE, ROLE_MANAGER, ROLE_THIRD_PARTY],
    "/records.html": [ROLE_FSE, ROLE_MANAGER, ROLE_THIRD_PARTY],
    "/task-list.html": [ROLE_FSE, ROLE_THIRD_PARTY],
  };

  function normalizeText(v) {
    return String(v || "")
      .trim()
      .toLowerCase();
  }

  function includesAny(text, list) {
    return list.some((item) => text.includes(item));
  }

  function detectUserRole(input) {
    const src = input || {};
    const department = normalizeText(src.department);
    const username = normalizeText(src.username);
    const email = normalizeText(src.email);
    const employeeId = normalizeText(src.employeeId);
    const combined = [department, username, email, employeeId].filter(Boolean).join(" ");

    // 优先判断第三方，避免“manager”关键词误判。
    if (
      includesAny(combined, [
        "third",
        "third-party",
        "third_party",
        "vendor",
        "outsource",
        "contractor",
        "partner",
        "第三方",
        "外包",
        "合作方",
      ])
    ) {
      return ROLE_THIRD_PARTY;
    }

    if (
      includesAny(combined, [
        "manager",
        "regional manager",
        "region manager",
        "area manager",
        "rm",
        "mgr",
        "大区经理",
        "区域经理",
      ])
    ) {
      return ROLE_MANAGER;
    }

    if (
      includesAny(combined, [
        "fse",
        "field service",
        "service engineer",
        "现场工程师",
        "服务工程师",
      ])
    ) {
      return ROLE_FSE;
    }

    // 默认角色：FSE
    return ROLE_FSE;
  }

  function normalizeUser(input) {
    const src = input || {};
    const role = src.role ? normalizeText(src.role) : detectUserRole(src);
    return {
      username: String(src.username || "").trim(),
      employeeId: String(src.employeeId || "").trim(),
      email: String(src.email || "").trim(),
      department: String(src.department || "").trim(),
      role:
        role === ROLE_MANAGER || role === ROLE_THIRD_PARTY || role === ROLE_FSE
          ? role
          : ROLE_FSE,
    };
  }

  function setUser(user) {
    const payload = normalizeUser(user);
    localStorage.setItem(USER_KEY, JSON.stringify(payload));
    syncScreenshotWatermark(payload);
    return payload;
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const user = normalizeUser(parsed);
      if (!user.username || !user.employeeId || !user.email) return null;
      return user;
    } catch (_e) {
      return null;
    }
  }

  function clearUser() {
    localStorage.removeItem(USER_KEY);
    syncScreenshotWatermark(null);
  }

  function requireAuth(options) {
    const opts = options || {};
    const redirectTo = opts.redirectTo || "/login.html";
    const user = getUser();
    if (!user) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`${redirectTo}?next=${next}`);
      return null;
    }
    syncScreenshotWatermark(user);
    return user;
  }

  function applyUserToDom(user) {
    const profile = user || getUser();
    if (!profile) return;
    syncScreenshotWatermark(profile);
    const map = {
      "field-username": profile.username,
      "field-employee-id": profile.employeeId,
      "field-email": profile.email,
      "field-department": profile.department,
      "field-role": getRoleLabel(profile.role),
    };
    Object.entries(map).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });
  }

  function getWatermarkElement() {
    return document.getElementById(WATERMARK_ID);
  }

  function removeScreenshotWatermark() {
    const el = getWatermarkElement();
    if (el) el.remove();
    if (watermarkTimer) {
      clearInterval(watermarkTimer);
      watermarkTimer = null;
    }
  }

  function buildWatermarkSvgDataUrl(line1, line2) {
    const safe1 = String(line1 || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safe2 = String(line2 || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='240' viewBox='0 0 360 240'>
      <g transform='rotate(-24 180 120)' fill='rgba(127,29,29,0.16)'>
        <text x='18' y='96' font-size='18' font-family='Arial, PingFang SC, sans-serif' font-weight='700'>${safe1}</text>
        <text x='18' y='132' font-size='14' font-family='Arial, PingFang SC, sans-serif' font-weight='600'>${safe2}</text>
      </g>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function renderScreenshotWatermark(user) {
    if (!user || user.role !== ROLE_THIRD_PARTY) {
      removeScreenshotWatermark();
      return;
    }
    if (!document.body) return;
    let el = getWatermarkElement();
    if (!el) {
      el = document.createElement("div");
      el.id = WATERMARK_ID;
      el.className = "screenshot-watermark";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    el.style.position = "fixed";
    el.style.inset = "0";
    el.style.zIndex = "9999";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";
    el.style.webkitUserSelect = "none";
    el.style.backgroundRepeat = "repeat";
    el.style.backgroundSize = "320px 220px";
    const now = new Date();
    const timeText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const line1 = "第三方账号页面 · 截图追溯水印";
    const line2 = `${user.username || "-"} / ${user.employeeId || "-"} / ${timeText}`;
    el.style.backgroundImage = `url("${buildWatermarkSvgDataUrl(line1, line2)}")`;
  }

  function syncScreenshotWatermark(user) {
    if (!document.body) return;
    renderScreenshotWatermark(user);
    if (user && user.role === ROLE_THIRD_PARTY) {
      if (!watermarkTimer) {
        watermarkTimer = setInterval(function () {
          const latest = getUser();
          renderScreenshotWatermark(latest);
        }, 60 * 1000);
      }
      return;
    }
    if (watermarkTimer) {
      clearInterval(watermarkTimer);
      watermarkTimer = null;
    }
  }

  function getRoleLabel(role) {
    return ROLE_LABELS[role] || ROLE_LABELS[ROLE_FSE];
  }

  function canAccessPath(pathname, role) {
    const path = String(pathname || "");
    const allowedRoles = PAGE_ACCESS[path];
    if (!allowedRoles) return true;
    return allowedRoles.includes(role || ROLE_FSE);
  }

  function canAccessPage(role, pathname) {
    return canAccessPath(pathname || window.location.pathname, role);
  }

  function enforcePageAccess(user, options) {
    const profile = user || getUser();
    if (!profile) return false;
    const opts = options || {};
    const denyRedirectTo = opts.denyRedirectTo || "/index.html";
    if (canAccessPath(window.location.pathname, profile.role)) return true;
    window.location.replace(denyRedirectTo);
    return false;
  }

  window.ButlerAuth = {
    setUser,
    getUser,
    clearUser,
    requireAuth,
    applyUserToDom,
    detectUserRole,
    getRoleLabel,
    canAccessPage,
    enforcePageAccess,
    syncScreenshotWatermark,
    roles: {
      FSE: ROLE_FSE,
      MANAGER: ROLE_MANAGER,
      THIRD_PARTY: ROLE_THIRD_PARTY,
    },
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        syncScreenshotWatermark(getUser());
      });
    } else {
      syncScreenshotWatermark(getUser());
    }
  }
})();
