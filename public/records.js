(function () {
  const API_URL = "/api/records";

  const form = document.getElementById("records-search-form");
  const input = document.getElementById("records-query-input");
  const placeholder = document.getElementById("records-placeholder");
  const list = document.getElementById("records-result-list");

  if (!form || !input || !placeholder || !list) return;

  function normalize(s) {
    return String(s || "")
      .trim()
      .toLowerCase();
  }

  function render(rows, query) {
    if (!rows.length) {
      list.hidden = true;
      list.innerHTML = "";
      placeholder.hidden = false;
      placeholder.textContent = query ? "未找到匹配记录" : "查询结果展示";
      return;
    }

    const html = rows
      .map((r) => {
        return `<li class="records-item">
          <p class="records-item__title">${r.code}</p>
          <p class="records-item__meta">记录号：${r.id} · 序号：${r.taskSeq}</p>
          <p class="records-item__meta">车型：${r.trainNo} · 修程：${r.maintType} · 时间：${r.date}</p>
          <p class="records-item__desc">${r.desc}</p>
        </li>`;
      })
      .join("");

    list.innerHTML = html;
    list.hidden = false;
    placeholder.hidden = true;
  }

  async function searchRecords(keyword) {
    const q = encodeURIComponent(keyword);
    const res = await fetch(`${API_URL}?keyword=${q}&limit=100`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error("records_query_failed");
    return data.rows || [];
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const q = normalize(input.value);
    if (!q) {
      render([], "");
      return;
    }

    placeholder.hidden = false;
    placeholder.textContent = "查询中...";
    list.hidden = true;
    list.innerHTML = "";
    try {
      const rows = await searchRecords(q);
      render(rows, q);
    } catch (_e) {
      list.hidden = true;
      list.innerHTML = "";
      placeholder.hidden = false;
      placeholder.textContent = "查询失败，请稍后重试";
    }
  });
})();
