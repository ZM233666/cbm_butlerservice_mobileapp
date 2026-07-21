(function () {
  const STORAGE_KEY = "butlerTaskListDraft";
  const TASK_STATUS_KEY = "butlerTaskStatusMap";
  const TASK_STATUS_API = "/api/task-status";
  const DATA_URL = "/data/brake-guidance-tasks.json";
  const SCHEMATIC_SEQS = new Set([
    "1",
    "2",
    "3",
    "3.1",
    "3.2",
    "3.3",
    "4",
    "5",
    "5.1",
    "6",
    "6.1",
    "7",
    "8",
    "8.1",
    "8.2",
    "9",
    "9.1",
    "10",
    "11",
    "11.1",
    "12",
    "13",
    "14",
    "15",
    "17.1",
    "17.2",
    "17.3",
    "17.4",
    "17.5",
    "17.6",
  ]);

  let guidanceRows = [];
  let lang = "zh";
  let activeIssueRowId = "";
  let lastClientGeo = null;
  let schematicZoom = 1;
  let pinchActive = false;
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;
  const SCHEMATIC_ZOOM_MIN = 1;
  const SCHEMATIC_ZOOM_MAX = 3;
  const SCHEMATIC_ZOOM_STEP = 0.25;

  const i18n = {
    zh: {
      back: "← 返回",
      title: "任务列表",
      basicInfo: "基本信息",
      subtask: "子任务",
      employee: "员工工号",
      depot: "车辆段",
      project: "项目编号",
      train: "列车号",
      maint: "修程",
      deadline: "截止日期",
      taskid: "主任务 ID",
      colSeq: "序号",
      colDesc: "操作说明",
      colUpload: "上传图片",
      save: "保存",
      submit: "提交",
      saved: "已保存草稿",
      submitted: "已提交",
      savedToDoing: "已保存，任务状态已更新为 Doing",
      submitNeedAllUploads: "请先完成本任务全部图片上传后再提交",
      submitReady: "全部图片已上传，可提交",
      submitPendingPrefix: "还需上传图片：",
      uploadFail: "上传失败",
      locating: "正在获取定位...",
      locationNeedHttps: "当前网络环境限制定位（iPhone 需 HTTPS 或 localhost）",
      locationDenied: "定位权限被拒绝，请在浏览器设置中允许定位",
      locationTimeout: "定位超时，已继续上传",
      locationFailed: "定位获取失败，已继续上传",
      reportIssue: "上报问题",
      issueDialogTitle: "上报问题",
      issueDialogHelp: "请输入拍照和检查过程中遇到的问题。",
      issuePlaceholder: "请描述问题现象、位置和处理建议",
      issueSave: "保存",
      issueCancel: "取消",
      issueSaved: "问题已保存",
      issueCleared: "问题已清除",
      issueNotePrefix: "已上报：",
      schematicTitle: "位置示意图",
      zoomReset: "重置",
      close: "关闭",
      filterHint:
        "依据 GL-CN-FS-020-BRAKE-004《作业指导书》",
      maintC1C3: "C1～C3",
      maintC4C6: "C4～C6",
      schematicLink: "（点击可查看机车位置示意图）",
      noUpload: "无需上传",
    },
    en: {
      back: "← Back",
      title: "Task List",
      basicInfo: "Basic Info",
      subtask: "Subtask",
      employee: "Employee ID",
      depot: "Depot",
      project: "Project No.",
      train: "Train No.",
      maint: "Maintenance Type",
      deadline: "Deadline",
      taskid: "Main Task ID",
      colSeq: "No.",
      colDesc: "Instructions",
      colUpload: "Upload",
      save: "Save",
      submit: "Submit",
      saved: "Draft saved",
      submitted: "Submitted",
      savedToDoing: "Saved. Task status moved to Doing",
      submitNeedAllUploads: "Upload all required photos before submitting",
      submitReady: "All required photos uploaded. Ready to submit",
      submitPendingPrefix: "Photos remaining: ",
      uploadFail: "Upload failed",
      locating: "Getting location...",
      locationNeedHttps: "Location is blocked in current context (iPhone needs HTTPS or localhost)",
      locationDenied: "Location permission denied. Please allow location in browser settings",
      locationTimeout: "Location timeout, upload continued",
      locationFailed: "Location failed, upload continued",
      reportIssue: "Report Issue",
      issueDialogTitle: "Report Issue",
      issueDialogHelp: "Describe issues found during photo taking and inspection.",
      issuePlaceholder: "Describe symptom, location and suggestion",
      issueSave: "Save",
      issueCancel: "Cancel",
      issueSaved: "Issue saved",
      issueCleared: "Issue cleared",
      issueNotePrefix: "Reported: ",
      schematicTitle: "Schematic",
      zoomReset: "Reset",
      close: "Close",
      filterHint:
        "Tasks follow the work instruction and current Maintenance Type. Basic info is read-only.",
      maintC1C3: "C1–C3",
      maintC4C6: "C4–C6",
      schematicLink: "(tap for locomotive schematic)",
      noUpload: "No upload",
    },
  };

  function getMaintType() {
    const el = document.getElementById("f-maint-type");
    return el && el.value === "c1c3" ? "c1c3" : "c4c6";
  }

  function allowedByMaintCategory(row, maintType) {
    const s = row.scopeTags;
    if (maintType === "c1c3") {
      if (s.length === 1 && s[0] === "c4c6") return false;
      return true;
    }
    if (maintType === "c4c6") {
      if (s.length === 1 && s[0] === "c1c3") return false;
      return true;
    }
    return true;
  }

  function buildC1C3DisplaySeqMap(rows) {
    const majorOrder = [];
    const seen = new Set();
    rows.forEach((row) => {
      const major = Number.parseInt(String(row.seq || "").split(".")[0] || "", 10);
      if (!Number.isFinite(major) || seen.has(major)) return;
      seen.add(major);
      majorOrder.push(major);
    });
    const majorMap = new Map();
    majorOrder.forEach((oldMajor, index) => {
      majorMap.set(oldMajor, index + 1);
    });

    const intermediates = rows.map((row) => {
      const parts = String(row.seq || "").split(".");
      const oldMajor = Number.parseInt(parts[0] || "", 10);
      const newMajor = majorMap.get(oldMajor);
      if (newMajor == null) {
        return { id: row.id, newMajor: -1, isChild: false, seq: row.seq };
      }
      return {
        id: row.id,
        newMajor,
        isChild: parts.length > 1,
        seq: row.seq,
      };
    });

    const byMajor = new Map();
    intermediates.forEach((item) => {
      if (item.newMajor < 0) return;
      const list = byMajor.get(item.newMajor) || [];
      list.push(item);
      byMajor.set(item.newMajor, list);
    });

    const out = {};
    intermediates.forEach((item) => {
      if (item.newMajor < 0) out[item.id] = item.seq;
    });

    byMajor.forEach((group, newMajor) => {
      const parents = group.filter((x) => !x.isChild);
      const children = group.filter((x) => x.isChild);
      parents.forEach((p) => {
        out[p.id] = String(newMajor);
      });
      if (parents.length > 0) {
        children.forEach((child, index) => {
          out[child.id] = `${newMajor}.${index + 1}`;
        });
        return;
      }
      if (children.length === 1) {
        out[children[0].id] = String(newMajor);
        return;
      }
      children.forEach((child, index) => {
        out[child.id] = index === 0 ? String(newMajor) : `${newMajor}.${index}`;
      });
    });

    return out;
  }

  function visibleRows() {
    const maintType = getMaintType();
    const filtered = guidanceRows.filter((row) => allowedByMaintCategory(row, maintType));
    if (maintType !== "c1c3") {
      return filtered.map((row) => ({ ...row, displaySeq: row.seq }));
    }
    const displaySeqMap = buildC1C3DisplaySeqMap(filtered);
    return filtered.map((row) => ({
      ...row,
      displaySeq: displaySeqMap[row.id] || row.seq,
    }));
  }

  function syncMaintDisplay() {
    const hidden = document.getElementById("f-maint-type");
    const label = document.getElementById("f-maint-type-label");
    if (!hidden || !label) return;
    const t = i18n[lang];
    label.value = hidden.value === "c1c3" ? t.maintC1C3 : t.maintC4C6;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderTable() {
    const tbody = document.getElementById("guidance-tbody");
    if (!tbody) return;
    const rows = visibleRows();
    const t = i18n[lang];
    const hint = document.getElementById("tl-filter-hint");
    if (hint) {
      hint.textContent = t.filterHint + " " + (rows.length ? `（${rows.length}）` : "");
    }

    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="3" style="text-align:center;color:#71717a;padding:1rem">—</td></tr>';
      return;
    }

    const parts = [];
    rows.forEach((row) => {
      const descHtml = buildDescCell(row);
      const uploadHtml = buildUploadCell(row);
      parts.push(
        `<tr data-row-id="${escapeHtml(row.id)}"><td>${escapeHtml(row.displaySeq || row.seq)}</td><td class="tl-desc-cell">${descHtml}</td><td class="tl-upload-cell">${uploadHtml}</td></tr>`
      );
    });
    tbody.innerHTML = parts.join("");
    tbody.querySelectorAll(".tl-upload-slot[data-slot]").forEach(bindSlot);
    tbody.querySelectorAll(".tl-issue-btn[data-issue-row]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openIssueDialog(btn.getAttribute("data-issue-row") || "");
      });
    });
    refreshIssueNotes();
    tbody.querySelectorAll(".tl-desc-btn[data-schematic]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const imgUrl = btn.getAttribute("data-schematic");
        const dlg = document.getElementById("dlg-schematic");
        const img = dlg?.querySelector("img");
        const title = dlg?.querySelector("#schematic-title");
        if (img && imgUrl) {
          img.src = imgUrl;
          img.alt = lang === "zh" ? "位置示意图" : "Schematic";
        }
        if (title) title.textContent = i18n[lang].schematicTitle;
        resetSchematicZoom();
        dlg?.showModal();
      });
    });
  }

  function buildDescCell(row) {
    const text = escapeHtml(row.description);
    if (SCHEMATIC_SEQS.has(row.seq)) {
      const link = lang === "zh" ? "查看位置示意图" : "View schematic";
      const imgUrl = `/PicSamples/${encodeURIComponent(row.seq)}.png`;
      return `<span class="tl-desc-text">${text}</span><button type="button" class="tl-desc-btn tl-desc-btn--inline" data-schematic="${escapeHtml(imgUrl)}">${escapeHtml(link)}</button>`;
    }
    return text;
  }

  function buildUploadCell(row) {
    const btns = row.buttons || [];
    let uploadPart = "";
    if (!btns.length) {
      if (row.uploadHint) {
        uploadPart = `<span class="tl-upload-na">${escapeHtml(row.uploadHint)}</span>`;
      } else {
        const na = i18n[lang].noUpload;
        uploadPart = `<span class="tl-upload-na">${escapeHtml(na)}</span>`;
      }
    } else if (btns.length === 1) {
      uploadPart = wrapSlot(btns[0].slot, btns[0].label, 0);
    } else {
      const inner = btns.map((b, i) => wrapSlot(b.slot, b.label, i)).join("");
      uploadPart = `<div class="tl-upload-row">${inner}</div>`;
    }
    return `<div class="tl-upload-stack">${uploadPart}${buildIssueCell(row.id)}</div>`;
  }

  function buildIssueCell(rowId) {
    const t = i18n[lang];
    const safeId = escapeHtml(rowId || "");
    return `<div class="tl-issue-wrap">
      <div class="tl-issue-note" data-issue-note="${safeId}"></div>
      <button type="button" class="tl-issue-btn" data-issue-row="${safeId}">${escapeHtml(t.reportIssue)}</button>
    </div>`;
  }

  function refreshIssueNotes() {
    const t = i18n[lang];
    const store = window.__issueRecords || {};
    document.querySelectorAll("[data-issue-note]").forEach((el) => {
      const rowId = el.getAttribute("data-issue-note") || "";
      const issue = store[rowId];
      if (!issue || !issue.text) {
        el.textContent = "";
        return;
      }
      const text = String(issue.text).trim();
      const short = text.length > 44 ? text.slice(0, 44) + "..." : text;
      el.textContent = `${t.issueNotePrefix}${short}`;
    });
  }

  function wrapSlot(slotId, label, idx) {
    const inputId = `f-${slotId.replace(/[^a-zA-Z0-9-_]/g, "_")}-${idx}`;
    return `<div class="tl-upload-slot" data-slot="${escapeHtml(slotId)}">
      <input class="tl-file" type="file" id="${inputId}" accept="image/*" />
      <label class="tl-upload-btn" for="${inputId}">${escapeHtml(label)}</label>
      <div class="tl-thumb" hidden>
        <img alt="" />
        <div class="tl-thumb__meta"></div>
      </div>
    </div>`;
  }

  function applyLang() {
    const t = i18n[lang];
    const back = document.getElementById("tl-back");
    const title = document.getElementById("tl-page-title");
    const langBtn = document.getElementById("tl-lang");
    if (back) back.textContent = t.back;
    if (title) title.textContent = t.title;
    if (langBtn) langBtn.textContent = lang === "zh" ? "CN/EN" : "EN/CN";

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      const map = {
        depot: t.depot,
        employee: t.employee,
        project: t.project,
        train: t.train,
        maint: t.maint,
        deadline: t.deadline,
        taskid: t.taskid,
        "col-seq": t.colSeq,
        "col-desc": t.colDesc,
        "col-upload": t.colUpload,
      };
      if (map[k]) el.textContent = map[k];
    });

    const hBasic = document.getElementById("basic-info-title");
    const hSub = document.getElementById("subtask-title");
    if (hBasic) hBasic.textContent = t.basicInfo;
    if (hSub) hSub.textContent = t.subtask;

    const btnSave = document.getElementById("btn-save");
    const btnSubmit = document.getElementById("btn-submit");
    if (btnSave) btnSave.textContent = t.save;
    if (btnSubmit) btnSubmit.textContent = t.submit;

    const st = document.getElementById("schematic-title");
    const cl = document.getElementById("dlg-close");
    const zr = document.getElementById("dlg-zoom-reset");
    const issueTitle = document.getElementById("issue-title");
    const issueHelp = document.getElementById("issue-help");
    const issueText = document.getElementById("issue-text");
    const issueSave = document.getElementById("issue-save");
    const issueCancel = document.getElementById("issue-cancel");
    if (st) st.textContent = t.schematicTitle;
    if (cl) cl.textContent = t.close;
    if (zr) zr.textContent = t.zoomReset;
    if (issueTitle) issueTitle.textContent = t.issueDialogTitle;
    if (issueHelp) issueHelp.textContent = t.issueDialogHelp;
    if (issueText) issueText.setAttribute("placeholder", t.issuePlaceholder);
    if (issueSave) issueSave.textContent = t.issueSave;
    if (issueCancel) issueCancel.textContent = t.issueCancel;

    syncMaintDisplay();
    renderTable();
    updateSubmitButtonState();
  }

  function updateSchematicZoomUI() {
    const dlg = document.getElementById("dlg-schematic");
    const img = dlg?.querySelector("img");
    const level = document.getElementById("dlg-zoom-level");
    const zoomInBtn = document.getElementById("dlg-zoom-in");
    const zoomOutBtn = document.getElementById("dlg-zoom-out");
    if (img) {
      img.style.transform = "none";
      img.style.width = `${schematicZoom * 100}%`;
    }
    if (level) level.textContent = `${Math.round(schematicZoom * 100)}%`;
    if (zoomInBtn) zoomInBtn.disabled = schematicZoom >= SCHEMATIC_ZOOM_MAX;
    if (zoomOutBtn) zoomOutBtn.disabled = schematicZoom <= SCHEMATIC_ZOOM_MIN;
  }

  function setSchematicZoom(nextZoom, anchorPoint) {
    const fig = document.querySelector("#dlg-schematic .tl-modal__fig");
    const img = document.querySelector("#dlg-schematic .tl-modal__fig img");
  
    if (!fig || !img) return;
  
    const oldZoom = schematicZoom;
    const newZoom = Math.max(
      SCHEMATIC_ZOOM_MIN,
      Math.min(SCHEMATIC_ZOOM_MAX, nextZoom)
    );
  
    // ====== 1. 记录缩放前几何信息（关键） ======
    const figRect = fig.getBoundingClientRect();
    const imgRectBefore = img.getBoundingClientRect();
  
    let anchorLocalX = null;
    let anchorLocalY = null;
    let anchorU = null;
    let anchorV = null;
  
    if (anchorPoint) {
      // anchor 在 fig 内的位置
      anchorLocalX = anchorPoint.clientX - figRect.left;
      anchorLocalY = anchorPoint.clientY - figRect.top;
  
      // anchor 在 img 内的比例位置（0~1）
      const rawU =
        (anchorPoint.clientX - imgRectBefore.left) /
        Math.max(imgRectBefore.width, 1);
      const rawV =
        (anchorPoint.clientY - imgRectBefore.top) /
        Math.max(imgRectBefore.height, 1);
  
      anchorU = Math.max(0, Math.min(1, rawU));
      anchorV = Math.max(0, Math.min(1, rawV));
    }
  
    schematicZoom = newZoom;
    updateSchematicZoomUI();
  
    if (
      anchorLocalX == null ||
      anchorLocalY == null ||
      anchorU == null ||
      anchorV == null ||
      oldZoom <= 0
    ) {
      return;
    }
  
    // ====== 2. 缩放后重新定位 ======
    requestAnimationFrame(() => {
      const imgRectAfter = img.getBoundingClientRect();
      const figRectAfter = fig.getBoundingClientRect();
  
      const contentX =
        anchorU * imgRectAfter.width +
        (imgRectAfter.left - figRectAfter.left);
  
      const contentY =
        anchorV * imgRectAfter.height +
        (imgRectAfter.top - figRectAfter.top);
  
      fig.scrollLeft = contentX - anchorLocalX;
      fig.scrollTop = contentY - anchorLocalY;
    });
  }

  function resetSchematicZoom() {
    schematicZoom = SCHEMATIC_ZOOM_MIN;
    pinchActive = false;
    const fig = document.querySelector("#dlg-schematic .tl-modal__fig");
    if (fig) {
      fig.scrollTop = 0;
      fig.scrollLeft = 0;
    }
    updateSchematicZoomUI();
  }

  function touchDistance(t0, t1) {
    const dx = t1.clientX - t0.clientX;
    const dy = t1.clientY - t0.clientY;
    return Math.hypot(dx, dy);
  }

  function touchMidpoint(t0, t1) {
    return {
      clientX: (t0.clientX + t1.clientX) / 2,
      clientY: (t0.clientY + t1.clientY) / 2,
    };
  }

  function bindSchematicPinch() {
    const fig = document.querySelector("#dlg-schematic .tl-modal__fig");
    if (!fig || fig.dataset.pinchBound === "1") return;
    fig.dataset.pinchBound = "1";
  
    fig.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 2) {
          pinchActive = true;
          pinchStartDistance = touchDistance(e.touches[0], e.touches[1]);
          pinchStartZoom = schematicZoom;
          e.preventDefault();
        }
      },
      { passive: false }
    );
  
    fig.addEventListener(
      "touchmove",
      (e) => {
        if (!pinchActive || e.touches.length !== 2) return;
  
        const d = touchDistance(e.touches[0], e.touches[1]);
        if (!pinchStartDistance) return;
  
        const scale = d / pinchStartDistance;
        const midpoint = touchMidpoint(e.touches[0], e.touches[1]);
  
        setSchematicZoom(pinchStartZoom * scale, midpoint);
  
        e.preventDefault();
      },
      { passive: false }
    );
  
    fig.addEventListener("touchend", () => {
      pinchActive = false;
      pinchStartDistance = 0;
    });
  
    fig.addEventListener("touchcancel", () => {
      pinchActive = false;
      pinchStartDistance = 0;
    });
  }

  function toast(msg) {
    const el = document.getElementById("tl-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-show"), 2200);
  }

  function collectBasicInfo() {
    return {
      employeeId: document.getElementById("f-employee-id")?.value ?? "",
      depot: document.getElementById("f-depot")?.value ?? "",
      project: document.getElementById("f-project")?.value ?? "",
      train: document.getElementById("f-train")?.value ?? "",
      maintenanceType: getMaintType(),
      deadline: document.getElementById("f-deadline")?.value ?? "",
      mainTaskId: document.getElementById("f-task-id")?.value ?? "",
    };
  }

  function collectUploadState() {
    return window.__uploadRecords || {};
  }

  function collectIssueState() {
    return window.__issueRecords || {};
  }

  function getRequiredSlots() {
    const slots = new Set();
    const rows = visibleRows();
    rows.forEach((row) => {
      const btns = Array.isArray(row.buttons) ? row.buttons : [];
      btns.forEach((btn) => {
        const slot = String((btn && btn.slot) || "").trim();
        if (slot) slots.add(slot);
      });
    });
    return Array.from(slots);
  }

  function hasTaskProgress() {
    const uploads = collectUploadState();
    const issues = collectIssueState();
    const hasUpload = Object.keys(uploads).length > 0;
    const hasIssue = Object.values(issues).some((v) => v && String(v.text || "").trim());
    return hasUpload || hasIssue;
  }

  function getIncompleteSlots() {
    const required = getRequiredSlots();
    if (!required.length) return [];
    const uploads = collectUploadState();
    return required.filter((slot) => !uploads[slot] || !uploads[slot].url);
  }

  function isSubmitReady() {
    return getIncompleteSlots().length === 0;
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
      localStorage.setItem(TASK_STATUS_KEY, JSON.stringify(next));
    } catch (_e) {
      // ignore quota/storage failures
    }
  }

  function getCurrentEmployeeId() {
    const inputValue = String(document.getElementById("f-employee-id")?.value || "").trim();
    if (inputValue) return inputValue;
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
      writeTaskStatusStore(data.statuses);
    } catch (_e) {
      // keep local fallback
    }
  }

  async function setCurrentTaskStatus(status) {
    const maint = getMaintType();
    const store = readTaskStatusStore();
    store[maint] = {
      status,
      updatedAt: new Date().toISOString(),
    };
    writeTaskStatusStore(store);
    const employeeId = getCurrentEmployeeId();
    if (!employeeId) return;
    try {
      await fetch(TASK_STATUS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, maint, status }),
      });
    } catch (_e) {
      // keep local fallback
    }
  }

  function updateSubmitButtonState() {
    const btn = document.getElementById("btn-submit");
    if (!btn) return;
    const t = i18n[lang];
    const missing = getIncompleteSlots();
    const ready = missing.length === 0;
    btn.disabled = !ready;
    if (ready) {
      btn.title = t.submitReady;
      return;
    }
    btn.title = `${t.submitPendingPrefix}${missing.length}`;
  }

  document.getElementById("tl-lang")?.addEventListener("click", () => {
    lang = lang === "zh" ? "en" : "zh";
    applyLang();
  });

  document.getElementById("dlg-close")?.addEventListener("click", () => {
    document.getElementById("dlg-schematic")?.close();
  });
  document.getElementById("issue-cancel")?.addEventListener("click", () => {
    document.getElementById("dlg-issue")?.close();
  });
  document.getElementById("issue-save")?.addEventListener("click", () => {
    const textEl = document.getElementById("issue-text");
    if (!textEl || !activeIssueRowId) return;
    const content = textEl.value.trim();
    window.__issueRecords = window.__issueRecords || {};
    if (content) {
      window.__issueRecords[activeIssueRowId] = {
        text: content,
        updatedAt: new Date().toISOString(),
      };
      toast(i18n[lang].issueSaved);
    } else {
      delete window.__issueRecords[activeIssueRowId];
      toast(i18n[lang].issueCleared);
    }
    refreshIssueNotes();
    document.getElementById("dlg-issue")?.close();
    updateSubmitButtonState();
  });
  document.getElementById("dlg-zoom-in")?.addEventListener("click", () => {
    setSchematicZoom(schematicZoom + SCHEMATIC_ZOOM_STEP);
  });
  document.getElementById("dlg-zoom-out")?.addEventListener("click", () => {
    setSchematicZoom(schematicZoom - SCHEMATIC_ZOOM_STEP);
  });
  document.getElementById("dlg-zoom-reset")?.addEventListener("click", () => {
    resetSchematicZoom();
  });
  document
  .querySelector("#dlg-schematic .tl-modal__fig img")
  ?.addEventListener("dblclick", (e) => {
    const fig = document.querySelector("#dlg-schematic .tl-modal__fig");
    if (!fig) return;

    const rect = fig.getBoundingClientRect();

    // 转换为 fig 内坐标体系
    const anchorPoint = {
      clientX: rect.left + (e.clientX - rect.left),
      clientY: rect.top + (e.clientY - rect.top),
    };

    const nextZoom = schematicZoom === 1 ? 2 : 1;

    if (nextZoom === 1) {
      resetSchematicZoom();
    } else {
      setSchematicZoom(nextZoom, anchorPoint);
    }
  });

  window.__uploadRecords = window.__uploadRecords || {};
  window.__issueRecords = window.__issueRecords || {};

  function openIssueDialog(rowId) {
    if (!rowId) return;
    activeIssueRowId = rowId;
    const dlg = document.getElementById("dlg-issue");
    const textEl = document.getElementById("issue-text");
    if (!dlg || !textEl) return;
    textEl.value = window.__issueRecords?.[rowId]?.text || "";
    dlg.showModal();
    textEl.focus();
  }

  function getGeoPosition(timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("geolocation_unavailable"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      });
    });
  }

  function isGeoCacheFresh() {
    if (!lastClientGeo || !lastClientGeo.fetchedAt) return false;
    return Date.now() - lastClientGeo.fetchedAt < 2 * 60 * 1000;
  }

  function readCachedGeoResult(capturedAt) {
    if (!isGeoCacheFresh()) return null;
    return {
      capturedAt,
      location: {
        latitude: lastClientGeo.location.latitude,
        longitude: lastClientGeo.location.longitude,
        accuracy:
          typeof lastClientGeo.location.accuracy === "number"
            ? lastClientGeo.location.accuracy
            : null,
      },
      reason: "",
    };
  }

  function getLocationFailMessage(reason) {
    const t = i18n[lang];
    if (reason === "insecure_context") return t.locationNeedHttps;
    if (reason === "permission_denied") return t.locationDenied;
    if (reason === "timeout") return t.locationTimeout;
    return t.locationFailed;
  }

  async function primeClientLocation() {
    if (!window.isSecureContext || !navigator.geolocation) return;
    try {
      const pos = await getGeoPosition(4500);
      const lat = Number(pos?.coords?.latitude);
      const lng = Number(pos?.coords?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      lastClientGeo = {
        location: {
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
          accuracy: Number.isFinite(pos?.coords?.accuracy)
            ? Number(pos.coords.accuracy.toFixed(1))
            : null,
        },
        fetchedAt: Date.now(),
      };
    } catch (_e) {
      // 预取失败不阻断上传流程
    }
  }

  async function collectClientCaptureMeta() {
    const capturedAt = new Date().toISOString();
    const cached = readCachedGeoResult(capturedAt);
    if (cached) return cached;

    const result = { capturedAt, location: null, reason: "" };

    // iOS/Chrome 在拍照上传时可能不带 EXIF GPS，这里尽量使用浏览器定位兜底
    if (!window.isSecureContext) {
      result.reason = "insecure_context";
      return result;
    }
    if (!navigator.geolocation) {
      result.reason = "geo_unavailable";
      return result;
    }
    try {
      const pos = await getGeoPosition(5500);
      const lat = Number(pos?.coords?.latitude);
      const lng = Number(pos?.coords?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return result;
      result.location = {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        accuracy: Number.isFinite(pos?.coords?.accuracy)
          ? Number(pos.coords.accuracy.toFixed(1))
          : null,
      };
      lastClientGeo = {
        location: result.location,
        fetchedAt: Date.now(),
      };
      return result;
    } catch (_e) {
      if (_e && typeof _e.code === "number") {
        if (_e.code === 1) result.reason = "permission_denied";
        else if (_e.code === 3) result.reason = "timeout";
        else result.reason = "geo_failed";
      } else {
        result.reason = "geo_failed";
      }
      return result;
    }
  }

  async function uploadForSlot(slotId, file, displayName) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slotId", slotId);
    fd.append("clientDisplayName", String(displayName || "").trim());
    // 定位后台执行：不阻塞上传，不给用户感知
    const capturedAt = new Date().toISOString();
    const cached = readCachedGeoResult(capturedAt);
    const clientMeta = cached || { capturedAt, location: null };
    if (!cached) {
      collectClientCaptureMeta().catch(() => {});
    }
    fd.append("clientCapturedAt", clientMeta.capturedAt);
    if (clientMeta.location) {
      fd.append("clientLatitude", String(clientMeta.location.latitude));
      fd.append("clientLongitude", String(clientMeta.location.longitude));
      if (clientMeta.location.accuracy != null) {
        fd.append("clientLocationAccuracy", String(clientMeta.location.accuracy));
      }
    }
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "upload");
    return data;
  }

  function formatCaptureTime(value) {
    const text = String(value || "").trim();
    if (!text) return "未获取";
    const dt = new Date(text);
    if (Number.isNaN(dt.getTime())) return text;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    const ss = String(dt.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  function buildCaptureMetaHtml(data) {
    const timeValue = formatCaptureTime(data?.capture?.capturedAt || data?.uploadedAt || "");
    const loc = data?.capture?.location || {};
    let locValue = "未获取";
    if (loc.address) {
      locValue = loc.address;
    } else if (loc.province || loc.city || loc.district) {
      locValue = [loc.province, loc.city, loc.district].filter(Boolean).join(" ");
    } else if (loc.latitude != null && loc.longitude != null) {
      locValue = `${loc.latitude}, ${loc.longitude}`;
    }
    const nameValue = data?.displayName || data?.originalname || "未获取";
    return [
      `<span class="tl-thumb__meta-line">拍摄时间：${escapeHtml(timeValue)}</span>`,
      `<span class="tl-thumb__meta-line">拍摄地点：${escapeHtml(locValue)}</span>`,
      `<span class="tl-thumb__meta-line">文件名：${escapeHtml(nameValue)}</span>`,
    ].join("");
  }

  function bindSlot(slotRoot) {
    const slotId = slotRoot.getAttribute("data-slot");
    if (!slotId) return;
    const input = slotRoot.querySelector(".tl-file");
    const label = slotRoot.querySelector(".tl-upload-btn");
    const slotLabel = (label?.textContent || "").trim();
    const preview = slotRoot.querySelector(".tl-thumb");
    const img = preview?.querySelector("img");
    const meta = preview?.querySelector(".tl-thumb__meta");
    if (!input || !label || !preview || !img) return;

    label.addEventListener("click", () => {
      primeClientLocation();
    });

    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const data = await uploadForSlot(slotId, file, slotLabel);
        window.__uploadRecords[slotId] = {
          url: data.url,
          uploadedAt: data.uploadedAt,
          originalname: data.displayName || slotLabel || data.originalname,
          displayName: data.displayName || slotLabel || data.originalname,
        };
        img.src = data.url;
        img.alt = file.name;
        if (meta) meta.innerHTML = buildCaptureMetaHtml(data);
        label.classList.add("is-hidden");
        preview.hidden = false;
        preview.classList.add("is-visible");
        updateSubmitButtonState();
      } catch (e) {
        toast(i18n[lang].uploadFail);
        input.value = "";
      }
    });
  }

  document.getElementById("btn-save")?.addEventListener("click", async () => {
    const draft = {
      basicInfo: collectBasicInfo(),
      uploads: collectUploadState(),
      issues: collectIssueState(),
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      if (hasTaskProgress()) {
        await setCurrentTaskStatus("doing");
        toast(i18n[lang].savedToDoing);
      } else {
        toast(i18n[lang].saved);
      }
    } catch (e) {
      toast("Save failed");
    }
  });

  document.getElementById("btn-submit")?.addEventListener("click", async () => {
    if (!isSubmitReady()) {
      toast(i18n[lang].submitNeedAllUploads);
      updateSubmitButtonState();
      return;
    }
    const body = {
      basicInfo: collectBasicInfo(),
      uploads: collectUploadState(),
      issues: collectIssueState(),
    };
    try {
      const res = await fetch("/api/task-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error("submit");
      await setCurrentTaskStatus("done");
      toast(i18n[lang].submitted);
      updateSubmitButtonState();
    } catch (e) {
      toast("Submit failed");
    }
  });

  function readQuery() {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("maint");
    const hidden = document.getElementById("f-maint-type");
    if (!hidden) return;
    if (m === "c1c3") hidden.value = "c1c3";
    else if (m === "c4c6" || m === "c4-c6" || !m) hidden.value = "c4c6";
  }

  function applyAuthProfile() {
    const auth = window.ButlerAuth;
    if (!auth) return false;
    const user = auth.requireAuth({ redirectTo: "/login.html" });
    if (!user) return false;
    if (auth.enforcePageAccess && !auth.enforcePageAccess(user)) return false;
    const employeeInput = document.getElementById("f-employee-id");
    if (employeeInput) employeeInput.value = user.employeeId || "";
    return true;
  }

  async function boot() {
    if (!applyAuthProfile()) return;
    await fetchTaskStatusFromServer();
    readQuery();
    try {
      const res = await fetch(DATA_URL);
      const data = await res.json();
      guidanceRows = data.rows || [];
    } catch (e) {
      guidanceRows = [];
      toast("Load failed");
    }
    updateSchematicZoomUI();
    bindSchematicPinch();
    applyLang();
    updateSubmitButtonState();
  }

  boot();
})();
