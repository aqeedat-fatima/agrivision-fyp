const API_BASE = "";

const btnRefresh = document.getElementById("btnRefresh");
const emptyState = document.getElementById("emptyState");
const chartsGrid = document.getElementById("chartsGrid");

const kpiFields = document.getElementById("kpiFields");
const kpiNdvi = document.getElementById("kpiNdvi");
const kpiEvi = document.getElementById("kpiEvi");
const kpiNdmi = document.getElementById("kpiNdmi");

let ndviChart = null;
let eviChart = null;
let ndmiChart = null;

function getUserId() {
  try {
    const user = JSON.parse(localStorage.getItem("agrivision_user") || "{}");
    return user.id || user.user_id || null;
  } catch {
    return null;
  }
}

function toNum(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getSummary(run) {
  return run?.summary || run?.data?.summary || {};
}

function extractMetric(run, key) {
  const s = getSummary(run);

  if (key === "ndvi") {
    return toNum(s.ndvi ?? s.mean_ndvi ?? s.meanNdvi ?? s.mean);
  }

  if (key === "evi") {
    return toNum(s.evi ?? s.mean_evi ?? s.meanEvi);
  }

  if (key === "ndmi") {
    return toNum(s.ndmi ?? s.mean_ndmi ?? s.meanNdmi);
  }

  return null;
}

function getFarmId(run) {
  return String(run.farm_id ?? run.farmId ?? run.farm?.id ?? "unknown");
}

function getFarmName(run) {
  return (
    run.farm_name ||
    run.farmName ||
    run.farm?.name ||
    `Farm ${getFarmId(run)}`
  );
}

function getRunDate(run) {
  const raw =
    run.created_at ||
    run.createdAt ||
    run.timestamp ||
    run.ts ||
    getSummary(run).scene_date ||
    getSummary(run).sceneDate;

  const d = raw ? new Date(raw) : new Date();

  if (Number.isNaN(d.getTime())) return new Date();

  return d;
}

function shortDate(date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  });
}

async function fetchSatelliteHistory() {
  const userId = getUserId();

  if (!userId) {
    window.location.href = "login.html";
    return [];
  }

  const res = await fetch(`${API_BASE}/db/history/satellite`, {
    headers: {
      "X-User-Id": String(userId)
    }
  });

  if (!res.ok) {
    throw new Error("Could not load satellite history");
  }

  const data = await res.json();

  return Array.isArray(data) ? data : [];
}

function groupLatestByFarm(runs) {
  const latest = new Map();

  runs.forEach((run) => {
    const farmId = getFarmId(run);
    const date = getRunDate(run).getTime();

    const current = latest.get(farmId);
    const currentDate = current ? getRunDate(current).getTime() : -1;

    if (!current || date > currentDate) {
      latest.set(farmId, run);
    }
  });

  return [...latest.values()];
}

function average(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatMetric(value) {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function buildFieldSeries(runs, metric) {
  const sorted = [...runs].sort((a, b) => getRunDate(a) - getRunDate(b));

  const labels = [];
  const fieldMap = new Map();

  sorted.forEach((run) => {
    const dateLabel = shortDate(getRunDate(run));
    if (!labels.includes(dateLabel)) labels.push(dateLabel);

    const farmName = getFarmName(run);
    const value = extractMetric(run, metric);

    if (!fieldMap.has(farmName)) {
      fieldMap.set(farmName, {});
    }

    fieldMap.get(farmName)[dateLabel] = value;
  });

  const datasets = [...fieldMap.entries()].map(([farmName, valuesByDate]) => ({
    label: farmName,
    data: labels.map((label) => valuesByDate[label] ?? null),
    tension: 0.35,
    borderWidth: 3,
    pointRadius: 4,
    spanGaps: true
  }));

  return { labels, datasets };
}

function destroyChart(chart) {
  if (chart) chart.destroy();
}

function makeLineChart(canvasId, title, chartData) {
  const ctx = document.getElementById(canvasId);

  if (!ctx) return null;

  return new Chart(ctx, {
    type: "line",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "nearest",
        intersect: false
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 12,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.raw;
              return `${context.dataset.label}: ${
                value === null || value === undefined ? "No data" : Number(value).toFixed(3)
              }`;
            }
          }
        },
        title: {
          display: false,
          text: title
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          }
        },
        y: {
          suggestedMin: -0.2,
          suggestedMax: 1,
          ticks: {
            callback: (value) => Number(value).toFixed(1)
          }
        }
      }
    }
  });
}

function updateKpis(runs) {
  const latestRuns = groupLatestByFarm(runs);

  const fieldsCount = new Set(runs.map(getFarmId)).size;

  const latestNdvi = average(latestRuns.map((r) => extractMetric(r, "ndvi")));
  const latestEvi = average(latestRuns.map((r) => extractMetric(r, "evi")));
  const latestNdmi = average(latestRuns.map((r) => extractMetric(r, "ndmi")));

  kpiFields.textContent = String(fieldsCount);
  kpiNdvi.textContent = formatMetric(latestNdvi);
  kpiEvi.textContent = formatMetric(latestEvi);
  kpiNdmi.textContent = formatMetric(latestNdmi);
}

function renderCharts(runs) {
  destroyChart(ndviChart);
  destroyChart(eviChart);
  destroyChart(ndmiChart);

  ndviChart = makeLineChart(
    "ndviChart",
    "NDVI Trend",
    buildFieldSeries(runs, "ndvi")
  );

  eviChart = makeLineChart(
    "eviChart",
    "EVI Trend",
    buildFieldSeries(runs, "evi")
  );

  ndmiChart = makeLineChart(
    "ndmiChart",
    "NDMI Trend",
    buildFieldSeries(runs, "ndmi")
  );
}

async function loadTrends() {
  btnRefresh.disabled = true;
  btnRefresh.textContent = "Loading...";

  try {
    const runs = await fetchSatelliteHistory();

    if (!runs.length) {
      emptyState.style.display = "block";
      chartsGrid.style.display = "none";

      kpiFields.textContent = "0";
      kpiNdvi.textContent = "—";
      kpiEvi.textContent = "—";
      kpiNdmi.textContent = "—";
      return;
    }

    emptyState.style.display = "none";
    chartsGrid.style.display = "grid";

    updateKpis(runs);
    renderCharts(runs);
  } catch (err) {
    console.error("Trend loading failed:", err);
    emptyState.style.display = "block";
    chartsGrid.style.display = "none";
    emptyState.innerHTML = `
      <strong>Could not load trends.</strong>
      <p>${err.message || "Please try again."}</p>
      <a href="farm-monitor.html">Go to Farm Monitoring</a>
    `;
  } finally {
    btnRefresh.disabled = false;
    btnRefresh.textContent = "Refresh";
  }
}

btnRefresh.addEventListener("click", loadTrends);

document.addEventListener("DOMContentLoaded", () => {
  loadTrends();

  setTimeout(() => {
    if (typeof applyLanguage === "function") applyLanguage();
  }, 100);
});