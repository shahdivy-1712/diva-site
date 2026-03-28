/**
 * DiVa — static love chart with hash routes and localStorage (no backend).
 * #       → landing
 * #divy   → Divy portal
 * #purva  → Purva portal
 */

const STORAGE_KEY = "diVa_loveChart_v2";
const CHART_WINDOW_DAYS = 30;

const CHART_COLORS = {
  line: "rgba(240, 102, 142, 0.95)",
  fill: "rgba(240, 102, 142, 0.14)",
  grid: "rgba(255,255,255,0.06)",
  text: "#b8a8b2",
};

let appState = null;
let portalChart = null;
let activePersonId = null;

function parseDate(s) {
  return new Date(s + "T12:00:00");
}

function formatShortDate(s) {
  const d = parseDate(s);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ymd(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/** Parse love-meter input: any finite number (no 0–100 restriction). */
function parseLoveValue(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(/,/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Y-axis range from data with padding so the line breathes. */
function computeYScaleBounds(values) {
  const nums = values.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!nums.length) return { min: 0, max: 100 };
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    const pad = Math.abs(min) * 0.08 || 5;
    return { min: min - pad, max: max + pad };
  }
  const span = max - min;
  const pad = Math.max(span * 0.15, 1);
  return { min: min - pad, max: max + pad };
}

function sortHistory(person) {
  if (!person.history) person.history = [];
  person.history.sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

function filterHistoryLastDays(history, days) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return (history || [])
    .filter((h) => {
      const d = parseDate(h.date);
      return d >= start && d <= end;
    })
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState() {
  if (!appState) return;
  appState.updated = ymd(new Date());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.warn("Could not save to localStorage", e);
  }
}

function mergePeopleFromStored(basePeople, storedPeople) {
  if (!storedPeople || !Array.isArray(storedPeople)) return basePeople;
  const byId = {};
  storedPeople.forEach((p) => {
    if (p && p.id) byId[p.id] = p;
  });
  return basePeople.map((base) => {
    const s = byId[base.id];
    if (!s) return { ...base, history: [...(base.history || [])], buckets: { ...base.buckets }, bucketLog: [...(base.bucketLog || [])] };
    return {
      ...base,
      ...s,
      history: Array.isArray(s.history) ? [...s.history] : [...(base.history || [])],
      buckets: {
        love: [...(s.buckets?.love ?? base.buckets?.love ?? [])],
        tolerate: [...(s.buckets?.tolerate ?? base.buckets?.tolerate ?? [])],
        hate: [...(s.buckets?.hate ?? base.buckets?.hate ?? [])],
      },
      bucketLog: Array.isArray(s.bucketLog) ? [...s.bucketLog] : [...(base.bucketLog || [])],
    };
  });
}

async function loadApp() {
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const base = await res.json();
  const stored = loadStored();
  const people = mergePeopleFromStored(base.people || [], stored?.people);
  people.forEach(sortHistory);
  appState = {
    updated: stored?.updated || base.updated,
    people,
  };
}

function getPerson(id) {
  return appState?.people?.find((p) => p.id === id);
}

function destroyPortalChart() {
  if (portalChart) {
    portalChart.destroy();
    portalChart = null;
  }
}

function buildPortalChart(canvas, person) {
  destroyPortalChart();
  const hist = filterHistoryLastDays(person.history, CHART_WINDOW_DAYS);
  const emptyMsg = document.getElementById("chart-empty");
  if (emptyMsg) {
    emptyMsg.hidden = hist.length > 0;
  }

  if (hist.length === 0) {
    return;
  }

  const labels = hist.map((h) => formatShortDate(h.date));
  const data = hist.map((h) => Number(h.percent));
  const milestoneIndices = [];
  hist.forEach((h, i) => {
    if (h.label && String(h.label).trim()) milestoneIndices.push(i);
  });

  const yBounds = computeYScaleBounds(data);

  const isMilestone = (i) => milestoneIndices.includes(i);

  portalChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Love meter",
          data,
          borderColor: CHART_COLORS.line,
          backgroundColor: CHART_COLORS.fill,
          fill: true,
          tension: 0.52,
          borderWidth: 3,
          cubicInterpolationMode: "default",
          pointRadius: (ctx) => (isMilestone(ctx.dataIndex) ? 12 : 4),
          pointHoverRadius: (ctx) => (isMilestone(ctx.dataIndex) ? 15 : 7),
          pointBackgroundColor: (ctx) =>
            isMilestone(ctx.dataIndex) ? "#fff8fa" : "rgba(240, 102, 142, 0.95)",
          pointBorderColor: (ctx) =>
            isMilestone(ctx.dataIndex) ? "#f0c860" : "#120a10",
          pointBorderWidth: (ctx) => (isMilestone(ctx.dataIndex) ? 4 : 2),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1c1219",
          titleColor: "#fdf5f8",
          bodyColor: "#b8a8b2",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(item) {
              const v = item.parsed?.y;
              return ` ${Number.isFinite(v) ? v : item.raw}`;
            },
            afterBody(items) {
              const i = items[0].dataIndex;
              const row = hist[i];
              return row && row.label ? String(row.label) : "";
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: CHART_COLORS.grid },
          ticks: { color: CHART_COLORS.text, maxRotation: 45, minRotation: 0, font: { size: 10 } },
        },
        y: {
          min: yBounds.min,
          max: yBounds.max,
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.text,
            font: { size: 10 },
            maxTicksLimit: 8,
          },
        },
      },
    },
  });
}

function renderBucketsDisplay(container, person) {
  const order = [
    { key: "love", cls: "love", title: "Love" },
    { key: "tolerate", cls: "tolerate", title: "Tolerate" },
    { key: "hate", cls: "hate", title: "Hate" },
  ];
  container.innerHTML = order
    .map(({ key, cls, title }) => {
      const items = person.buckets[key] || [];
      const lis = items
        .filter((t) => String(t).trim())
        .map((t) => `<li>${escapeHtml(t)}</li>`)
        .join("");
      return `
        <div class="bucket ${cls}">
          <h3>${title}</h3>
          <ul>${lis || "<li><em style='opacity:0.55'>Nothing listed yet</em></li>"}</ul>
        </div>`;
    })
    .join("");
}

function renderBucketEditor(container, person) {
  const order = [
    { key: "love", cls: "love", title: "Love" },
    { key: "tolerate", cls: "tolerate", title: "Tolerate" },
    { key: "hate", cls: "hate", title: "Hate" },
  ];
  container.innerHTML = order
    .map(({ key, cls, title }) => {
      const items = person.buckets[key] || [];
      const rows = items
        .map(
          (text, idx) => `
        <div class="bucket-item-row" data-bucket="${key}" data-idx="${idx}">
          <span>${escapeHtml(text)}</span>
          <button type="button" class="btn-icon btn-remove-bucket" aria-label="Remove">×</button>
        </div>`
        )
        .join("");
      return `
        <div class="bucket-edit ${cls}">
          <h3>${title}</h3>
          ${rows || "<p style='opacity:0.5;font-size:0.85rem;margin:0'>No items</p>"}
          <div class="add-row">
            <input type="text" class="input bucket-new-input" data-bucket="${key}" placeholder="Add something…" />
            <button type="button" class="btn btn-secondary btn-add-bucket" data-bucket="${key}" style="width:auto;min-width:72px;padding:0 1rem">Add</button>
          </div>
        </div>`;
    })
    .join("");
}

function renderLog(container, entries) {
  if (!entries || !entries.length) {
    container.innerHTML = "<p style='color:var(--muted);font-size:0.85rem;margin:0'>No notes yet.</p>";
    return;
  }
  const sorted = [...entries].sort((a, b) => parseDate(b.date) - parseDate(a.date));
  container.innerHTML = sorted
    .map(
      (e) => `
      <div class="log-item">
        <time>${formatShortDate(e.date)}</time>
        ${escapeHtml(e.text)}
      </div>`
    )
    .join("");
}

function renderHistoryManage(listEl, person) {
  const hist = filterHistoryLastDays(person.history, CHART_WINDOW_DAYS);
  if (!hist.length) {
    listEl.innerHTML = "<li style='color:var(--muted);font-size:0.8rem'>No points in this window yet.</li>";
    return;
  }
  listEl.innerHTML = hist
    .map((h) => {
      const encLabel = encodeURIComponent(h.label || "");
      return `
      <li class="history-li">
        <div class="history-li-meta">
          <strong>${escapeHtml(String(h.percent))}</strong> · ${formatShortDate(h.date)}
          ${h.label ? `<div style="margin-top:0.2rem;opacity:0.9">${escapeHtml(h.label)}</div>` : ""}
        </div>
        <button type="button" class="btn-icon btn-remove-history" data-date="${escapeHtml(h.date)}" data-percent="${h.percent}" data-enc-label="${encLabel}" aria-label="Remove point">×</button>
      </li>`;
    })
    .join("");
}

function removeHistoryPoint(person, date, percent, label) {
  const p = Number(percent);
  const idx = person.history.findIndex(
    (h) => h.date === date && Number(h.percent) === p && (h.label || "") === (label || "")
  );
  if (idx >= 0) person.history.splice(idx, 1);
}

function refreshPortalUI() {
  const person = getPerson(activePersonId);
  if (!person) return;

  const cur = person.currentPercent;
  document.getElementById("portal-pct").textContent =
    cur !== undefined && cur !== null && Number.isFinite(Number(cur)) ? String(cur) : "—";

  const canvas = document.getElementById("portal-chart");
  buildPortalChart(canvas, person);

  renderBucketsDisplay(document.getElementById("buckets-display"), person);

  const editOpen = document.getElementById("buckets-edit");
  if (!editOpen.hidden) {
    renderBucketEditor(editOpen, person);
  }

  renderLog(document.getElementById("portal-log"), person.bucketLog || []);
  renderHistoryManage(document.getElementById("history-list"), person);
}

function showLanding() {
  activePersonId = null;
  destroyPortalChart();
  document.getElementById("view-landing").hidden = false;
  document.getElementById("view-portal").hidden = true;
}

function showPortal(personId) {
  const person = getPerson(personId);
  if (!person) {
    location.hash = "";
    return;
  }

  activePersonId = personId;
  document.getElementById("view-landing").hidden = true;
  document.getElementById("view-portal").hidden = false;

  document.getElementById("portal-title").textContent = person.displayName;
  document.getElementById("portal-sub").textContent = person.subtitle || "";

  document.getElementById("panel-meter").hidden = true;
  document.getElementById("btn-toggle-meter").setAttribute("aria-expanded", "false");
  document.getElementById("buckets-edit").hidden = true;
  document.getElementById("btn-toggle-buckets").setAttribute("aria-expanded", "false");
  document.getElementById("buckets-display").hidden = false;
  document.getElementById("panel-log").hidden = true;
  document.getElementById("btn-toggle-log").setAttribute("aria-expanded", "false");

  const today = ymd(new Date());
  document.getElementById("input-current-pct").value = person.currentPercent ?? "";
  document.getElementById("input-today-label").value = "";
  document.getElementById("input-pt-date").value = today;
  document.getElementById("input-pt-pct").value = "";
  document.getElementById("input-pt-label").value = "";
  document.getElementById("input-log-date").value = today;
  document.getElementById("input-log-text").value = "";

  refreshPortalUI();
}

function route() {
  const h = (location.hash || "").replace(/^#/, "").toLowerCase();
  if (h === "divy" || h === "purva") {
    showPortal(h);
  } else {
    showLanding();
  }
}

function setupPortalHandlers() {
  document.getElementById("portal-back").addEventListener("click", (e) => {
    e.preventDefault();
    location.hash = "";
  });

  document.getElementById("btn-toggle-meter").addEventListener("click", () => {
    const p = document.getElementById("panel-meter");
    const btn = document.getElementById("btn-toggle-meter");
    const open = p.hidden;
    p.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  });

  document.getElementById("btn-save-today").addEventListener("click", () => {
    const person = getPerson(activePersonId);
    if (!person) return;
    const pct = parseLoveValue(document.getElementById("input-current-pct").value);
    if (Number.isNaN(pct)) {
      alert("Enter a valid number for the love meter.");
      return;
    }
    const label = document.getElementById("input-today-label").value.trim();
    const date = ymd(new Date());
    person.currentPercent = pct;
    person.history = person.history.filter((h) => h.date !== date);
    person.history.push({ date, percent: pct, label: label || undefined });
    sortHistory(person);
    saveState();
    refreshPortalUI();
  });

  document.getElementById("btn-add-point").addEventListener("click", () => {
    const person = getPerson(activePersonId);
    if (!person) return;
    const date = document.getElementById("input-pt-date").value;
    const pct = parseLoveValue(document.getElementById("input-pt-pct").value);
    const label = document.getElementById("input-pt-label").value.trim();
    if (!date) {
      alert("Pick a date.");
      return;
    }
    if (Number.isNaN(pct)) {
      alert("Enter a valid number.");
      return;
    }
    person.history.push({ date, percent: pct, label: label || undefined });
    sortHistory(person);
    const last = person.history[person.history.length - 1];
    if (parseDate(last.date) >= parseDate(date)) person.currentPercent = last.percent;
    saveState();
    refreshPortalUI();
  });

  document.getElementById("history-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-history");
    if (!btn) return;
    const person = getPerson(activePersonId);
    if (!person) return;
    const date = btn.getAttribute("data-date");
    const percent = Number(btn.getAttribute("data-percent"));
    const enc = btn.getAttribute("data-enc-label") || "";
    let label = "";
    try {
      label = decodeURIComponent(enc);
    } catch {
      label = "";
    }
    if (!date || Number.isNaN(percent)) return;
    removeHistoryPoint(person, date, percent, label);
    saveState();
    refreshPortalUI();
  });

  document.getElementById("btn-toggle-buckets").addEventListener("click", () => {
    const edit = document.getElementById("buckets-edit");
    const disp = document.getElementById("buckets-display");
    const btn = document.getElementById("btn-toggle-buckets");
    const open = edit.hidden;
    edit.hidden = !open;
    disp.hidden = open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) {
      const person = getPerson(activePersonId);
      if (person) renderBucketEditor(edit, person);
    } else refreshPortalUI();
  });

  document.getElementById("buckets-edit").addEventListener("click", (e) => {
    const rm = e.target.closest(".btn-remove-bucket");
    if (rm) {
      const row = rm.closest(".bucket-item-row");
      const bucket = row?.dataset.bucket;
      const idx = Number(row?.dataset.idx);
      const person = getPerson(activePersonId);
      if (!person || !bucket || Number.isNaN(idx)) return;
      person.buckets[bucket].splice(idx, 1);
      saveState();
      renderBucketEditor(document.getElementById("buckets-edit"), person);
      renderBucketsDisplay(document.getElementById("buckets-display"), person);
      return;
    }
    const add = e.target.closest(".btn-add-bucket");
    if (add) {
      const bucket = add.dataset.bucket;
      const person = getPerson(activePersonId);
      if (!person || !bucket) return;
      const wrap = add.closest(".bucket-edit");
      const input = wrap?.querySelector(`.bucket-new-input[data-bucket="${bucket}"]`);
      const text = (input?.value || "").trim();
      if (!text) return;
      if (!person.buckets[bucket]) person.buckets[bucket] = [];
      person.buckets[bucket].push(text);
      input.value = "";
      saveState();
      renderBucketEditor(document.getElementById("buckets-edit"), person);
      renderBucketsDisplay(document.getElementById("buckets-display"), person);
    }
  });

  document.getElementById("btn-toggle-log").addEventListener("click", () => {
    const p = document.getElementById("panel-log");
    const btn = document.getElementById("btn-toggle-log");
    const open = p.hidden;
    p.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  });

  document.getElementById("btn-add-log").addEventListener("click", () => {
    const person = getPerson(activePersonId);
    if (!person) return;
    const date = document.getElementById("input-log-date").value;
    const text = document.getElementById("input-log-text").value.trim();
    if (!date || !text) {
      alert("Add a date and what changed.");
      return;
    }
    if (!person.bucketLog) person.bucketLog = [];
    person.bucketLog.push({ date, text });
    document.getElementById("input-log-text").value = "";
    saveState();
    renderLog(document.getElementById("portal-log"), person.bucketLog);
  });
}

async function main() {
  const err = document.getElementById("error");
  try {
    await loadApp();
  } catch (e) {
    err.hidden = false;
    err.textContent =
      "Could not load data.json. Serve this folder over HTTP (e.g. python3 -m http.server) or use GitHub Pages.";
    return;
  }

  setupPortalHandlers();
  window.addEventListener("hashchange", route);
  route();
}

document.addEventListener("DOMContentLoaded", main);
