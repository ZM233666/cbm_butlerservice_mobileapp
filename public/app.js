(function () {
  const auth = window.ButlerAuth;
  const currentUser = auth?.getUser?.() || null;
  const MANAGER_DASHBOARD_API = "/api/manager/dashboard";
  const MANAGER_ASSIGNMENTS_API = "/api/manager/assignments";
  const TASK_STATUS_KEY = "butlerTaskStatusMap";
  const TASK_STATUS_API = "/api/task-status";
  const filters = document.querySelectorAll(".task-filter");
  const emptyEl = document.getElementById("tasks-empty");
  const todoPanel = document.getElementById("tasks-todo-events");
  const cbmRecoList = document.getElementById("cbm-reco-list");
  const summaryApi = "/api/task-summary";
  const homeConfigApi = "/api/home-config";
  let selectedManagerMonth = "";
  let activeFilter = "todo";

  const messages = {
    todo: "No tasks found",
    doing: "No tasks in progress for this view",
    done: "No completed tasks in this view",
    all: "No tasks found",
  };
  const defaultStatsByMaint = {
    c1c3: { items: 21, photos: 19 },
    c4c6: { items: 32, photos: 45 },
  };
  let statusStore = readTaskStatusStore();

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isManagerUser() {
    return currentUser?.role === "manager";
  }

  function managerEl(id) {
    return document.getElementById(id);
  }

  function getCurrentMonthText() {
    return new Date().toISOString().slice(0, 7);
  }

  function placeProfileAboveManagerBoard() {
    const main = document.querySelector(".main");
    const profileCard = document.querySelector(".profile-card");
    const managerBoard = managerEl("manager-dashboard");
    if (!main || !profileCard || !managerBoard) return;
    if (profileCard.compareDocumentPosition(managerBoard) & Node.DOCUMENT_POSITION_FOLLOWING) return;
    main.insertBefore(profileCard, managerBoard);
  }

  function setManagerHint(msg, isError) {
    const el = managerEl("mgr-assign-hint");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isError ? "#dc2626" : "#0f766e";
  }

  function renderManagerList(targetId, rows, emptyText, mapItem) {
    const list = managerEl(targetId);
    if (!list) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      list.innerHTML = `<li class="manager-list__empty">${escapeHtml(emptyText)}</li>`;
      return;
    }
    list.innerHTML = rows
      .map((item) => `<li class="manager-list__item">${mapItem(item)}</li>`)
      .join("");
  }

  function renderManagerAssignments(rows) {
    const tbody = managerEl("mgr-assignments-body");
    if (!tbody) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="manager-table__empty">暂无派发任务</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((row) => {
        return `<tr>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.vehicleNo || "-")}</td>
          <td>${escapeHtml(String(row.maint || "").toUpperCase())}</td>
          <td>${escapeHtml(row.assignedTo?.name || row.assignedTo?.employeeId || "-")}</td>
          <td>${escapeHtml((row.status || "todo").toUpperCase())}</td>
          <td>${escapeHtml(row.deadline || "-")}</td>
        </tr>`;
      })
      .join("");
  }

  function renderManagerFseOptions(members) {
    const select = managerEl("mgr-assignee");
    if (!select) return;
    const currentValue = select.value;
    const options = Array.isArray(members) ? members : [];
    select.innerHTML = '<option value="">请选择 FieldServiceEngineer</option>' +
      options
        .map((m) => {
          const name = m.name || m.employeeId;
          const email = m.email ? ` · ${m.email}` : "";
          return `<option value="${escapeHtml(m.employeeId)}">${escapeHtml(name)} (${escapeHtml(m.employeeId)})${escapeHtml(email)}</option>`;
        })
        .join("");
    if (currentValue && options.some((m) => m.employeeId === currentValue)) {
      select.value = currentValue;
    }
  }

  function openManagerReport(row) {
    const reportUrl = String(row?.reportUrl || "").trim();
    if (reportUrl) {
      window.open(reportUrl, "_blank", "noopener,noreferrer");
      return;
    }
    window.alert("测试版本暂没有报告，报告功能正在联调中。");
  }

  function bindManagerReportActions(rows) {
    const list = managerEl("mgr-reports-list");
    if (!list) return;
    const reportMap = new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.id || ""), row]));
    list.querySelectorAll("[data-report-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = String(btn.getAttribute("data-report-id") || "");
        const row = reportMap.get(id);
        if (!row) return;
        openManagerReport(row);
      });
    });
  }

  function renderManagerDashboard(data) {
    if (!data || typeof data !== "object") return;
    selectedManagerMonth = String(data.month || "").trim() || getCurrentMonthText();
    const monthPicker = managerEl("mgr-month-picker");
    if (monthPicker && monthPicker.value !== selectedManagerMonth) {
      monthPicker.value = selectedManagerMonth;
    }
    managerEl("mgr-overview-total").textContent = String(data.overview?.total ?? 0);
    managerEl("mgr-overview-split").textContent = `ToDo ${data.overview?.todo ?? 0} / Doing ${data.overview?.doing ?? 0} / Done ${data.overview?.done ?? 0}`;
    managerEl("mgr-monthly-total").textContent = String(data.monthlyServiceTotal ?? 0);

    const done = Number(data.overview?.done || 0);
    const doing = Number(data.overview?.doing || 0);
    const total = Number(data.overview?.total || 0);
    const percent = Number(data.progress?.percentage || 0);
    managerEl("mgr-progress-done").textContent = String(done);
    managerEl("mgr-progress-doing").textContent = String(doing);
    managerEl("mgr-progress-total").textContent = String(total);
    managerEl("mgr-progress-fill").style.width = `${Math.max(0, Math.min(100, percent))}%`;
    managerEl("mgr-progress-text").textContent = `已完成 ${done} / 总任务 ${total}（完成率 ${percent}%）`;

    renderManagerList(
      "mgr-vehicles-list",
      data.vehiclesNeedService,
      "当前没有待服务车辆",
      (row) =>
        `<strong>${escapeHtml(row.vehicleNo || "-")}</strong> · ${escapeHtml(String(row.maint || "").toUpperCase())} · 负责人 ${escapeHtml(row.assignedTo?.name || row.assignedTo?.employeeId || "-")} · 截止 ${escapeHtml(row.deadline || "-")}`
    );
    renderManagerList(
      "mgr-reports-list",
      data.reports,
      "当前无报告",
      (row) =>
        `<button type="button" class="manager-report-btn" data-report-id="${escapeHtml(row.id || "")}">
          <strong>${escapeHtml(row.title || "-")}</strong>
          <span>${escapeHtml(row.vehicleNo || "-")} · ${escapeHtml(String(row.status || "").toUpperCase())}</span>
        </button>`
    );
    bindManagerReportActions(data.reports);
    renderManagerFseOptions(data.fseMembers);
    renderManagerAssignments(data.assignments);
  }

  async function fetchManagerDashboard(month) {
    const m = String(month || "").trim();
    const url = m ? `${MANAGER_DASHBOARD_API}?month=${encodeURIComponent(m)}` : MANAGER_DASHBOARD_API;
    const res = await fetch(url);
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    const isJson = contentType.includes("application/json");
    const data = isJson ? await res.json() : null;
    if (!res.ok || !data || !data.ok) {
      const err = new Error("manager_dashboard_failed");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function submitManagerAssignment() {
    const assignee = managerEl("mgr-assignee")?.value || "";
    const maint = managerEl("mgr-maint")?.value || "";
    const vehicleNo = String(managerEl("mgr-vehicle")?.value || "").trim();
    const deadline = managerEl("mgr-deadline")?.value || "";
    if (!assignee || !maint || !vehicleNo || !deadline) {
      setManagerHint("请完整填写派发信息后再提交", true);
      return;
    }
    const res = await fetch(MANAGER_ASSIGNMENTS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignedToEmployeeId: assignee,
        maint,
        vehicleNo,
        deadline,
        createdBy: {
          employeeId: currentUser?.employeeId || "",
          name: currentUser?.username || "",
        },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setManagerHint("派发失败，请检查数据后重试", true);
      return;
    }
    setManagerHint("派发成功，已同步到对应 FieldServiceEngineer 待办", false);
    managerEl("mgr-vehicle").value = "";
    const dash = await fetchManagerDashboard();
    renderManagerDashboard(dash);
  }

  function bindManagerForm() {
    const form = managerEl("mgr-assign-form");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitManagerAssignment().catch(() => {
        setManagerHint("派发失败，请稍后重试", true);
      });
    });
  }

  function bindManagerMonthPicker() {
    const input = managerEl("mgr-month-picker");
    if (!input || input.dataset.bound === "1") return;
    input.dataset.bound = "1";
    input.addEventListener("change", async () => {
      const value = String(input.value || "").trim();
      selectedManagerMonth = value || getCurrentMonthText();
      setManagerHint("正在刷新该月份统计...", false);
      try {
        const dash = await fetchManagerDashboard(selectedManagerMonth);
        renderManagerDashboard(dash);
        setManagerHint("", false);
      } catch (_e) {
        setManagerHint("月份切换失败，请稍后重试", true);
      }
    });
  }

  async function bootManagerDashboard() {
    placeProfileAboveManagerBoard();
    bindManagerForm();
    bindManagerMonthPicker();
    try {
      if (!selectedManagerMonth) selectedManagerMonth = getCurrentMonthText();
      const data = await fetchManagerDashboard(selectedManagerMonth);
      renderManagerDashboard(data);
    } catch (e) {
      if (e && e.status === 404) {
        setManagerHint("看板接口未生效，请重启后端服务后刷新页面", true);
        return;
      }
      setManagerHint("看板加载失败，请稍后重试", true);
    }
  }

  function readTaskStatusStore() {
    try {
      const raw = localStorage.getItem(TASK_STATUS_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : {};
    } catch (_e) {
      return {};
    }
  }

  function writeTaskStatusStore(next) {
    try {
      localStorage.setItem(TASK_STATUS_KEY, JSON.stringify(next || {}));
    } catch (_e) {
      // ignore storage failures
    }
  }

  function getCurrentEmployeeId() {
    const auth = window.ButlerAuth;
    const user = auth?.getUser?.();
    return String(user?.employeeId || "").trim();
  }

  async function fetchTaskStatusFromServer() {
    const employeeId = getCurrentEmployeeId();
    if (!employeeId) return;
    try {
      const q = new URLSearchParams({ employeeId });
      const res = await fetch(`${TASK_STATUS_API}?${q.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.ok || !data.statuses || typeof data.statuses !== "object") return;
      statusStore = data.statuses;
      writeTaskStatusStore(statusStore);
    } catch (_e) {
      // keep local fallback
    }
  }

  function getCardStatus(card, store) {
    const maint = (card.getAttribute("data-maint") || "").toLowerCase();
    const status = store?.[maint]?.status;
    if (status === "doing" || status === "done" || status === "todo") return status;
    return "todo";
  }

  function parseDeadlineFromCard(card) {
    const explicit = String(card.getAttribute("data-deadline") || "").trim();
    const text = explicit || String(card.querySelector(".event-card__deadline")?.textContent || "").trim();
    const matched = text.match(/\d{4}-\d{2}-\d{2}/);
    if (!matched) return null;
    const d = new Date(`${matched[0]}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function getDaysUntilDeadline(deadlineDate) {
    if (!deadlineDate) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ddl = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
    return Math.floor((ddl.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  }

  function upsertDeadlineAlert(card, status) {
    let badge = card.querySelector(".event-card__deadline-alert");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "event-card__deadline-alert";
      card.appendChild(badge);
    }

    // 已完成不提示风险
    if (status === "done") {
      badge.hidden = true;
      badge.textContent = "";
      badge.classList.remove("event-card__deadline-alert--urgent", "event-card__deadline-alert--expired");
      return;
    }

    const days = getDaysUntilDeadline(parseDeadlineFromCard(card));
    badge.classList.remove("event-card__deadline-alert--urgent", "event-card__deadline-alert--expired");

    if (days == null) {
      badge.hidden = true;
      badge.textContent = "";
      return;
    }
    if (days < 0) {
      badge.textContent = "已过期";
      badge.classList.add("event-card__deadline-alert--expired");
      badge.hidden = false;
      return;
    }
    if (days <= 3) {
      badge.textContent = `剩${days}天`;
      badge.classList.add("event-card__deadline-alert--urgent");
      badge.hidden = false;
      return;
    }

    badge.hidden = true;
    badge.textContent = "";
  }

  function applyPanel(filter) {
    activeFilter = filter || "todo";
    if (!todoPanel) return;
    const store = statusStore && typeof statusStore === "object" ? statusStore : {};
    let visible = 0;
    todoPanel.querySelectorAll(".event-card[data-maint]").forEach((card) => {
      const status = getCardStatus(card, store);
      upsertDeadlineAlert(card, status);
      const show = activeFilter === "all" ? true : status === activeFilter;
      card.hidden = !show;
      if (show) visible += 1;
    });
    todoPanel.hidden = false;
    if (emptyEl) {
      const showEmpty = visible === 0;
      emptyEl.hidden = !showEmpty;
      if (showEmpty) emptyEl.textContent = messages[activeFilter] || "";
    }
  }

  function setCount(key, value) {
    const el = document.querySelector(`.task-filter__count[data-count="${key}"]`);
    if (!el) return;
    el.textContent = String(value);
  }

  function buildCardHtml(card) {
    const href = escapeHtml(card.href || "#");
    const maint = escapeHtml(card.maint || "");
    const title = escapeHtml(card.title || "");
    const meta = escapeHtml(card.meta || "");
    const deadline = escapeHtml(card.deadline || "");
    const key = String(card.maint || "").toLowerCase();
    const fallback = defaultStatsByMaint[key] || {};
    const statsText = `项目 ${fallback.items ?? "--"} · 照片 ${fallback.photos ?? "--"}`;
    return `<a href="${href}" class="event-card" data-maint="${maint}">
      <span class="event-card__title">${title}</span>
      <span class="event-card__meta">${meta}</span>
      <span class="event-card__stats">${statsText}</span>
      <span class="event-card__deadline">${deadline}</span>
    </a>`;
  }

  function buildCbmCardHtmlFromTask(card) {
    const maint = String(card?.maint || "").trim().toUpperCase();
    const meta = escapeHtml(card?.meta || "CCBII · Maintenance");
    const deadline = escapeHtml(card?.deadline || "-");
    const title = `${escapeHtml(maint || "TASK")} 推荐巡检`;
    const levelClass = String(card?.maint || "").toLowerCase() === "c4c6" ? "cbm-card__dot--high" : "cbm-card__dot--medium";
    return `<article class="cbm-card">
      <p class="cbm-card__title">${title}<br /></p>
      <p class="cbm-card__meta">${meta}</p>
      <p class="cbm-card__date">${deadline}</p>
      <span class="cbm-card__dot ${levelClass}" aria-hidden="true"></span>
    </article>`;
  }

  function renderCbmCardsFromTasks(cards) {
    if (!cbmRecoList || !Array.isArray(cards) || cards.length === 0) return;
    cbmRecoList.innerHTML = cards.map(buildCbmCardHtmlFromTask).join("");
  }

  function renderCards(cards) {
    if (!todoPanel || !Array.isArray(cards) || cards.length === 0) return;
    todoPanel.innerHTML = cards.map(buildCardHtml).join("");
  }

  function hydrateCountsFromCards() {
    const cards = todoPanel ? Array.from(todoPanel.querySelectorAll(".event-card[data-maint]")) : [];
    const store = statusStore && typeof statusStore === "object" ? statusStore : {};
    let todo = 0;
    let doing = 0;
    let done = 0;
    cards.forEach((card) => {
      const status = getCardStatus(card, store);
      if (status === "doing") doing += 1;
      else if (status === "done") done += 1;
      else todo += 1;
    });
    setCount("todo", todo);
    setCount("doing", doing);
    setCount("done", done);
    setCount("all", todo + doing + done);
  }

  function hydrateCardStats(summary) {
    if (!summary || !summary.maint) return;
    const maintainSummary = {
      c1c3: summary.maint.c1c3 || {},
      c4c6: summary.maint.c4c6 || {},
    };
    (todoPanel ? todoPanel.querySelectorAll(".event-card[data-maint]") : []).forEach((card) => {
      const maint = (card.getAttribute("data-maint") || "").toLowerCase();
      const row = maintainSummary[maint] || {};
      const fallback = defaultStatsByMaint[maint] || {};
      const statsEl = card.querySelector(".event-card__stats");
      if (statsEl) {
        statsEl.textContent = `项目 ${row.items ?? fallback.items ?? "--"} · 照片 ${row.photos ?? fallback.photos ?? "--"}`;
      }
    });
  }

  async function bootHomeConfig() {
    try {
      const res = await fetch(homeConfigApi);
      const data = await res.json();
      if (!res.ok || !data.ok || !Array.isArray(data.tasks)) return;
      renderCards(data.tasks);
      renderCbmCardsFromTasks(data.tasks);
    } catch (_e) {
      // keep HTML fallback cards
    }
  }

  async function bootSummary() {
    hydrateCountsFromCards();
    try {
      const res = await fetch(summaryApi);
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      hydrateCardStats(data);
      hydrateCountsFromCards();
      applyPanel(activeFilter);
    } catch (_e) {
      // keep fallback values in markup when summary API unavailable
    }
  }

  function refreshTaskFilterView() {
    statusStore = readTaskStatusStore();
    hydrateCountsFromCards();
    applyPanel(activeFilter);
  }

  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-filter");
      filters.forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      if (key) applyPanel(key);
    });
  });

  async function boot() {
    if (isManagerUser()) {
      await bootManagerDashboard();
      return;
    }
    applyPanel("todo");
    await bootHomeConfig();
    await fetchTaskStatusFromServer();
    refreshTaskFilterView();
    await bootSummary();
    window.addEventListener("focus", async () => {
      await fetchTaskStatusFromServer();
      refreshTaskFilterView();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        fetchTaskStatusFromServer().then(refreshTaskFilterView);
      }
    });
  }

  boot();
})();
