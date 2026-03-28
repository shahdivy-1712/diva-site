/**
 * DiVa — static love chart. Data only from data.json (read-only, no localStorage).
 */

const LEGACY_STORAGE_KEY = "diVa_loveChart_v2";
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

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

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

function clearLegacyStorage() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function loadApp() {
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const base = await res.json();
  clearLegacyStorage();
  const people = base.people || [];
  people.forEach(sortHistory);
  appState = {
    updated: base.updated,
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
          <ul>${lis || "<li><em style='opacity:0.55'>Nothing here yet</em></li>"}</ul>
        </div>`;
    })
    .join("");
}

function refreshPortalUI() {
  const person = getPerson(activePersonId);
  if (!person) return;

  const cur = person.currentPercent;
  document.getElementById("portal-pct").textContent =
    cur !== undefined && cur !== null && String(cur) !== "" && Number.isFinite(Number(cur))
      ? String(cur)
      : "—";

  const canvas = document.getElementById("portal-chart");
  buildPortalChart(canvas, person);

  renderBucketsDisplay(document.getElementById("buckets-display"), person);
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
