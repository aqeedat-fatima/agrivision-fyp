// assets/js/farm-monitor.js
document.addEventListener("DOMContentLoaded", async () => {
  // ===============================
  // 🔐 AUTH HELPERS
  // ===============================
  function getSessionUser() {
    try {
      return JSON.parse(localStorage.getItem("agrivision_user") || "null");
    } catch {
      return null;
    }
  }

  function requireUser() {
    const u = getSessionUser();
    if (!u?.id) {
      window.location.href = "login.html";
    }
    return u;
  }

  function authHeaders() {
    const u = requireUser();
    return { "X-User-Id": String(u.id) };
  }

  function authHeadersJson() {
    const u = requireUser();
    return {
      "Content-Type": "application/json",
      "X-User-Id": String(u.id),
    };
  }

  // ⬇️ immediately force login
  const USER = requireUser();

  // ✅ show logged-in user name in top-right
  const profileNameEl = document.getElementById("profileName");
  if (profileNameEl) {
    profileNameEl.textContent =
      USER.full_name || USER.fullName || USER.name || USER.email || "Profile";
  }

  const API_BASE = "";

  // ✅ Keep only UI preference in localStorage
  const ACTIVE_FARM_KEY = "agrivision_active_farm_id";

  // ===== Utils =====
  function isoDate(d) {
    return d.toISOString().slice(0, 10);
  }
  function fmt(v, digits = 2) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(digits);
  }
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  // ===== DOM =====
  const elMap = document.getElementById("map");
  const elStart = document.getElementById("startDate");
  const elEnd = document.getElementById("endDate");

  const elKpiNdvi = document.getElementById("kpiNdvi");
  const elKpiNdmi = document.getElementById("kpiNdmi");
  const elKpiEvi = document.getElementById("kpiEvi");
  const elKpiCloud = document.getElementById("kpiCloud");
  const elKpiScene = document.getElementById("kpiScene");

  const elAdvice = document.getElementById("adviceList");
  const elBadge = document.getElementById("healthBadge");
  const elPill = document.getElementById("ndviChangePill");
  const elTip = document.getElementById("trendTip");

  const btnUpdate = document.getElementById("btnUpdate");
  const btnSaveFarm = document.getElementById("btnSaveFarm");
  const btnLoadFarm = document.getElementById("btnLoadFarm");
  const btnClear = document.getElementById("btnClearFarm");

  const btnSaveRun = document.getElementById("btnSaveRun");
  const btnDownloadRun = document.getElementById("btnDownloadRun");
  const btnPrintRun = document.getElementById("btnPrintRun");

  const selFarm = document.getElementById("farmSelect");

  const btnSeriesNdvi = document.getElementById("btnSeriesNdvi");
  const btnSeriesNdmi = document.getElementById("btnSeriesNdmi");
  const btnSeriesEvi = document.getElementById("btnSeriesEvi");

  // ===== Default dates: last 90 days =====
  if (elStart && elEnd) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 90);
    elStart.value = isoDate(start);
    elEnd.value = isoDate(end);
  }

  // ===== Leaflet Map (init safely) =====
  if (elMap && elMap.getBoundingClientRect().height < 50) {
    elMap.style.minHeight = "540px";
  }

  const map = L.map("map", { preferCanvas: false }).setView(
    [33.6844, 73.0479],
    12
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  const drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  const drawControl = new L.Control.Draw({
    draw: {
      polygon: true,
      rectangle: true,
      circle: false,
      marker: false,
      polyline: false,
      circlemarker: false,
    },
    edit: { featureGroup: drawnItems },
  });
  map.addControl(drawControl);

  let overlayLayer = null;
  let trendChart = null;
  let currentTrendKey = "ndvi";
  let lastFetchedRun = null;

  function fixMapSize() {
    setTimeout(() => map.invalidateSize(true), 50);
    setTimeout(() => map.invalidateSize(true), 250);
    setTimeout(() => map.invalidateSize(true), 600);
  }
  window.addEventListener("load", fixMapSize);
  window.addEventListener("resize", fixMapSize);

  // ===== UI Helpers =====
  function setBadge(level, text) {
    if (!elBadge) return;
    const css =
      level === "good"
        ? "fm-good"
        : level === "warn"
        ? "fm-warn"
        : level === "bad"
        ? "fm-bad"
        : "fm-unknown";
    elBadge.className = "fm-badge " + css;
    elBadge.textContent = text || "Unknown";
  }

  function setAdvice(list) {
    if (!elAdvice) return;
    elAdvice.innerHTML = "";
    (list || []).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      elAdvice.appendChild(li);
    });
  }

  function setOverlay(tilesUrl) {
    if (overlayLayer) {
      map.removeLayer(overlayLayer);
      overlayLayer = null;
    }
    if (!tilesUrl) return;
    overlayLayer = L.tileLayer(tilesUrl, { opacity: 0.7 });
    overlayLayer.addTo(map);
  }

  // ===== Geometry =====
  function getCurrentGeometry() {
    const layers = drawnItems.getLayers();
    if (!layers.length) return null;
    return layers[0].toGeoJSON().geometry;
  }

  function renderGeometry(geom) {
    drawnItems.clearLayers();
    if (!geom) return;

    const layer = L.geoJSON({ type: "Feature", properties: {}, geometry: geom });
    layer.eachLayer((l) => drawnItems.addLayer(l));

    try {
      const b = layer.getBounds();
      if (b && b.isValid()) map.fitBounds(b.pad(0.15));
    } catch {}
    fixMapSize();
  }

  // ===============================
  // ✅ DB: Farms + Satellite History
  // ===============================
  async function dbListFarms() {
    const res = await fetch(`${API_BASE}/db/farms`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to load farms");
    return await res.json();
  }

  async function dbUpsertFarm(name, geometry) {
    const res = await fetch(`${API_BASE}/db/farms/upsert`, {
      method: "POST",
      headers: authHeadersJson(),
      body: JSON.stringify({ name, geometry }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to save farm");
    }
    return await res.json(); // {id,name}
  }

  async function dbGetFarmById(id) {
    const farms = await dbListFarms();
    return farms.find((f) => String(f.id) === String(id)) || null;
  }

  async function dbGetRuns() {
    const res = await fetch(`${API_BASE}/db/history/satellite`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load satellite history");
    return await res.json();
  }

  // ✅ Robust to snake_case OR camelCase returned by API
  async function dbGetLatestRunForFarm(farmId) {
    const runs = await dbGetRuns();

    const filtered = runs.filter((r) => {
      const fid = r.farm_id ?? r.farmId ?? r.farmID ?? r.farm;
      return String(fid) === String(farmId);
    });

    filtered.sort((a, b) => {
      const ta = new Date(a.created_at ?? a.createdAt ?? a.timestamp ?? 0).getTime();
      const tb = new Date(b.created_at ?? b.createdAt ?? b.timestamp ?? 0).getTime();
      return tb - ta;
    });

    return filtered[0] || null;
  }

  async function dbCreateSatelliteReport(payload) {
    const res = await fetch(`${API_BASE}/db/history/satellite`, {
      method: "POST",
      headers: authHeadersJson(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to save satellite report");
    }
    return await res.json();
  }

  // ===== UI-only preference =====
  function setActiveFarmId(id) {
    if (!id) localStorage.removeItem(ACTIVE_FARM_KEY);
    else localStorage.setItem(ACTIVE_FARM_KEY, String(id));
  }
  function getActiveFarmId() {
    return localStorage.getItem(ACTIVE_FARM_KEY);
  }

  // ===== Health label helper =====
  function classifyHealth(ndvi) {
    const v = Number(ndvi);
    if (!Number.isFinite(v)) return { level: "unknown", label: "Unknown" };
    if (v < 0.30) return { level: "bad", label: "Stressed" };
    if (v < 0.50) return { level: "warn", label: "Moderate" };
    return { level: "good", label: "Healthy" };
  }

  // ===== Trend chart =====
  function destroyChart() {
    if (trendChart) {
      try {
        trendChart.destroy();
      } catch {}
      trendChart = null;
    }
  }

  function buildTrendChart(series) {
    if (!window.Chart) return;
    const canvas = document.getElementById("trendChart");
    if (!canvas) return;

    const labels = (series || []).map((r) =>
      String(r.date || r.ts || "").slice(0, 10)
    );
    const ndvi = (series || []).map((r) =>
      r.ndvi == null ? null : Number(r.ndvi)
    );
    const ndmi = (series || []).map((r) =>
      r.ndmi == null ? null : Number(r.ndmi)
    );
    const evi = (series || []).map((r) => (r.evi == null ? null : Number(r.evi)));

    const seriesMap = { ndvi, ndmi, evi };
    const y = seriesMap[currentTrendKey] || ndvi;

    destroyChart();
    const ctx = canvas.getContext("2d");

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: currentTrendKey.toUpperCase(),
            data: y,
            spanGaps: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        plugins: { legend: { display: false } },
        scales: { y: { suggestedMin: -0.2, suggestedMax: 1.2 } },
      },
    });
  }

  function setActiveToggle(key) {
    currentTrendKey = key;
    [btnSeriesNdvi, btnSeriesNdmi, btnSeriesEvi].forEach((b) =>
      b?.classList.remove("is-active")
    );
    if (key === "ndvi") btnSeriesNdvi?.classList.add("is-active");
    if (key === "ndmi") btnSeriesNdmi?.classList.add("is-active");
    if (key === "evi") btnSeriesEvi?.classList.add("is-active");

    if (elTip) {
      elTip.textContent =
        key === "ndmi"
          ? "Tip: NDMI helps indicate moisture stress. A dip can suggest drying soil or plant water stress."
          : key === "evi"
          ? "Tip: EVI is often more stable than NDVI under dense canopy and variable lighting."
          : "Tip: NDVI indicates vegetation vigor/greenness. A steady drop can signal stress.";
    }

    if (lastFetchedRun?.timeseries) buildTrendChart(lastFetchedRun.timeseries);
  }

  btnSeriesNdvi?.addEventListener("click", () => setActiveToggle("ndvi"));
  btnSeriesNdmi?.addEventListener("click", () => setActiveToggle("ndmi"));
  btnSeriesEvi?.addEventListener("click", () => setActiveToggle("evi"));

  // ===== Apply run to UI =====
  function applyRunToUI(run, opts = {}) {
    if (!run) return;

    const summary = run.summary || {};
    const health = run.health || classifyHealth(summary.ndvi ?? summary.mean);

    const ndvi = summary.ndvi ?? summary.mean ?? null;
    const ndmi = summary.ndmi ?? null;
    const evi = summary.evi ?? null;

    const cloud = summary.cloud_pct ?? summary.cloud ?? null;
    const scene =
      summary.scene_date ??
      summary.date ??
      run.scene_date ??
      run.end_date ??
      run.created_at ??
      run.createdAt ??
      null;

    if (elKpiNdvi) elKpiNdvi.textContent = fmt(ndvi);
    if (elKpiNdmi) elKpiNdmi.textContent = fmt(ndmi);
    if (elKpiEvi) elKpiEvi.textContent = fmt(evi);
    if (elKpiCloud)
      elKpiCloud.textContent =
        cloud == null ? "—" : `${Number(cloud).toFixed(0)}%`;
    if (elKpiScene)
      elKpiScene.textContent = scene ? String(scene).slice(0, 10) : "—";

    setOverlay(run.tiles_url || run.tilesUrl || null);

    const h = health?.level ? health : classifyHealth(ndvi);
    const emoji =
      h.level === "good"
        ? "✅ "
        : h.level === "warn"
        ? "⚠️ "
        : h.level === "bad"
        ? "🚨 "
        : "ℹ️ ";
    setBadge(h.level, emoji + (h.label || "Satellite Result"));

    const advice = Array.isArray(h.advice) ? [...h.advice] : [];
    const ch = run.change || {};
    if (ch.ndvi_change_pct !== null && ch.ndvi_change_pct !== undefined) {
      const pct = Number(ch.ndvi_change_pct);
      const sign = pct > 0 ? "+" : "";
      if (elPill) {
        elPill.style.display = "inline-flex";
        elPill.textContent = `NDVI change: ${sign}${pct.toFixed(1)}%`;
      }
      advice.unshift(
        `NDVI change (${ch.period_days || 30}d vs previous): ${sign}${pct.toFixed(
          1
        )}%`
      );
    } else {
      if (elPill) elPill.style.display = "none";
    }

    if (!advice.length) advice.push("Loaded satellite indices.");
    if (opts.extraAdvice) advice.push(opts.extraAdvice);
    setAdvice(advice);

    const series = run.timeseries || [];
    buildTrendChart(series);
    fixMapSize();
  }

  // ===== Farm dropdown =====
  async function fillFarmSelect() {
    const sel = document.getElementById("farmSelect");
    if (!sel) return;

    const farms = await dbListFarms();
    sel.innerHTML = "";

    const optNew = document.createElement("option");
    optNew.value = "__new__";
    optNew.textContent = "➕ Add new farm…";
    sel.appendChild(optNew);

    if (!farms.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No farms yet";
      sel.appendChild(opt);
      sel.value = "__new__";
      return;
    }

    farms.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = String(f.id); // ✅ always string
      opt.textContent = f.name;
      sel.appendChild(opt);
    });

    const active = getActiveFarmId();
    if (active && farms.some((f) => String(f.id) === String(active))) {
      sel.value = String(active);
    } else {
      sel.value = String(farms[0].id);
      setActiveFarmId(String(farms[0].id));
    }
  }

  function getSelectedFarmId() {
    const sel = document.getElementById("farmSelect");
    const v = sel?.value || null;
    if (!v || v === "__new__") return null;
    return v;
  }

  // ===== Draw event =====
  map.on(L.Draw.Event.CREATED, (e) => {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    setBadge("unknown", "Boundary drawn");

    if (e.layer?.editing?.enable) {
      try {
        e.layer.editing.enable();
      } catch {}
    }

    setAdvice([
      "Boundary drawn.",
      "Click “Save Farm” to store it, then “Update Now”.",
    ]);
    fixMapSize();
  });

  map.on(L.Draw.Event.EDITED, () => {
    const g = getCurrentGeometry();
    if (g) {
      setBadge("unknown", "Boundary updated");
      setAdvice(["Boundary updated.", "Click Update Now to fetch latest indices."]);
    }
  });

  // ===== Actions =====
  async function updateNow() {
    const farmId = getSelectedFarmId();
    const farm = farmId ? await dbGetFarmById(farmId) : null;

    let geom = getCurrentGeometry() || farm?.geometry;
    if (!geom) {
      setBadge("unknown", "No Farm Yet");
      setAdvice(["Draw your farm boundary and click “Save Farm”."]);
      return;
    }
    if (!getCurrentGeometry()) renderGeometry(geom);

    const start_date = elStart?.value;
    const end_date = elEnd?.value;

    setBadge("unknown", "Updating…");
    setAdvice([
      "Fetching Sentinel-2 indices (NDVI/NDMI/EVI)…",
      "This can take a few seconds.",
    ]);
    if (btnUpdate) {
      btnUpdate.disabled = true;
      btnUpdate.textContent = "Updating…";
    }

    try {
      const res = await fetch(`${API_BASE}/satellite/ndvi/mvp`, {
        method: "POST",
        headers: authHeadersJson(),
        body: JSON.stringify({ geometry: geom, start_date, end_date }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setBadge("unknown", "Error");
        setAdvice([err.detail || "Check backend logs."]);
        return;
      }

      const data = await res.json();

      applyRunToUI(data);

      lastFetchedRun = {
        ...data,
        geometry: geom,
        start_date,
        end_date,
      };

      setAdvice([
        "Updated indices shown.",
        "Click “Save Result” to store it for this farm (then it will appear in Reports).",
      ]);
    } catch (e) {
      setBadge("unknown", "Error");
      setAdvice(["Network error. Is the backend running on port 8001?"]);
    } finally {
      if (btnUpdate) {
        btnUpdate.disabled = false;
        btnUpdate.textContent = "Update Now";
      }
    }
  }

  async function saveFarm() {
    const geom = getCurrentGeometry();
    if (!geom) {
      alert("Draw a boundary first.");
      return;
    }

    const farmId = getSelectedFarmId();
    const existing = farmId ? await dbGetFarmById(farmId) : null;

    const name = prompt("Farm name:", existing?.name || "My Farm");
    if (!name) return;

    try {
      const saved = await dbUpsertFarm(name, geom);
      setActiveFarmId(saved.id);

      await fillFarmSelect();
      if (selFarm) selFarm.value = String(saved.id);

      setBadge("unknown", "Farm Saved");
      setAdvice([`Saved: ${saved.name}`, "Now click “Update Now” to fetch indices."]);
    } catch (e) {
      alert(e.message);
    }
  }

  async function loadFarm() {
    const farmId = getSelectedFarmId();
    if (!farmId) {
      setBadge("unknown", "Select Farm");
      setAdvice(["Select a saved farm from the dropdown, then click Load."]);
      return;
    }

    const farm = await dbGetFarmById(farmId);
    if (!farm) return;

    renderGeometry(farm.geometry);

    const latest = await dbGetLatestRunForFarm(farm.id);
    if (latest) {
      lastFetchedRun = latest;
      applyRunToUI(latest, { extraAdvice: "Loaded latest saved result." });
    } else {
      lastFetchedRun = null;
      setBadge("unknown", "Farm Loaded");
      setAdvice([`Loaded: ${farm.name}`, "Click “Update Now” to fetch indices."]);
    }
  }

  function clearFarm() {
    const ok = confirm("Clear the drawn boundary from the map?");
    if (!ok) return;

    drawnItems.clearLayers();
    setOverlay(null);
    destroyChart();
    lastFetchedRun = null;

    if (elKpiNdvi) elKpiNdvi.textContent = "—";
    if (elKpiNdmi) elKpiNdmi.textContent = "—";
    if (elKpiEvi) elKpiEvi.textContent = "—";
    if (elKpiCloud) elKpiCloud.textContent = "—";
    if (elKpiScene) elKpiScene.textContent = "—";
    if (elPill) elPill.style.display = "none";

    setBadge("unknown", "Ready");
    setAdvice([
      "Select or draw a farm boundary.",
      'Tap "Update Now" to fetch satellite indices.',
    ]);
  }

  async function saveRun() {
    const farmId = getSelectedFarmId();
    const farm = farmId ? await dbGetFarmById(farmId) : null;

    if (!farmId || !farm) {
      alert("Select a saved farm first (Save Farm).");
      return;
    }
    if (!lastFetchedRun) {
      alert("Click Update Now first.");
      return;
    }

    try {
      await dbCreateSatelliteReport({
        farmId: Number(farm.id),
        farmName: farm.name,
        geometry: lastFetchedRun.geometry || farm.geometry,
        summary: lastFetchedRun.summary || {},
        timeseries: lastFetchedRun.timeseries || [],
        change: lastFetchedRun.change || null,
        createdAt: new Date().toISOString(),
      });

      setBadge("unknown", "Saved");
      setAdvice([
        "Saved result for this farm.",
        "Go to Reports → Satellite Insights to download/print.",
      ]);
    } catch (e) {
      alert(e.message);
    }
  }

  // ===== PDF (Download/Print current run) =====
  const getJsPdf = () => window.jspdf && window.jspdf.jsPDF;

  function makeDoc() {
    const JsPDF = getJsPdf();
    if (!JsPDF) {
      alert("jsPDF not loaded.");
      return null;
    }
    return new JsPDF({ unit: "mm", format: "a4" });
  }

  async function makeChartImage(labels, series, title) {
    if (!window.Chart) return null;

    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{ label: title, data: series, spanGaps: true, tension: 0.25 }],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { display: false } },
      },
    });

    chart.update();
    const img = canvas.toDataURL("image/jpeg", 0.88);
    chart.destroy();
    return img;
  }

  async function buildRunPDF() {
    const run = lastFetchedRun;
    if (!run) return null;

    const doc = makeDoc();
    if (!doc) return null;

    const margin = 14;
    let y = 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – Farm Monitoring Snapshot", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
      margin,
      y
    );
    y += 8;

    const farmId = getSelectedFarmId();
    const farm = farmId ? await dbGetFarmById(farmId) : null;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Farm: ${farm?.name || "Unsaved boundary"}`, margin, y);
    y += 7;

    const summary = run.summary || {};
    const ndvi = summary.ndvi ?? summary.mean;
    const ndmi = summary.ndmi;
    const evi = summary.evi;
    const cloud = summary.cloud_pct ?? summary.cloud;
    const scene =
      summary.scene_date ??
      summary.date ??
      run.end_date ??
      run.created_at ??
      run.createdAt ??
      null;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`NDVI: ${fmt(ndvi)}   NDMI: ${fmt(ndmi)}   EVI: ${fmt(evi)}`, margin, y);
    y += 6;
    doc.text(
      `Cloud: ${
        cloud == null ? "—" : Number(cloud).toFixed(0) + "%"
      }   Scene: ${scene ? String(scene).slice(0, 10) : "—"}`,
      margin,
      y
    );
    y += 10;

    const series = Array.isArray(run.timeseries) ? run.timeseries : [];
    const labels = series.map((r) => String(r.date || r.ts || "").slice(0, 10));
    const ndviSeries = series.map((r) => (r.ndvi == null ? null : Number(r.ndvi)));
    const ndmiSeries = series.map((r) => (r.ndmi == null ? null : Number(r.ndmi)));
    const eviSeries = series.map((r) => (r.evi == null ? null : Number(r.evi)));

    async function addChart(title, s) {
      if (!labels.length) return;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, y);
      y += 6;

      const img = await makeChartImage(labels, s, title);
      if (img) {
        doc.addImage(img, "JPEG", margin, y, 182, 72);
        y += 78;
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("Chart unavailable (Chart.js missing).", margin, y);
        y += 8;
      }
    }

    await addChart("NDVI Trend", ndviSeries);
    await addChart("NDMI Trend", ndmiSeries);
    await addChart("EVI Trend", eviSeries);

    return doc;
  }

  async function downloadRunPDF() {
    const doc = await buildRunPDF();
    if (!doc) return;

    const farmId = getSelectedFarmId();
    const farm = farmId ? await dbGetFarmById(farmId) : null;
    const farmName = (farm?.name || "Farm").replace(/\s+/g, "_");
    const end = (lastFetchedRun?.end_date || new Date().toISOString().slice(0, 10))
      .slice(0, 10);

    doc.save(`AgriVision_FarmMonitoring_${farmName}_${end}.pdf`);
  }

  async function printRunPDF() {
    const doc = await buildRunPDF();
    if (!doc) return;

    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      alert("Popup blocked. Allow popups to print.");
      return;
    }
    w.onload = () => {
      w.focus();
      w.print();
    };
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // ===== Bind buttons =====
  btnUpdate?.addEventListener("click", updateNow);
  btnSaveFarm?.addEventListener("click", saveFarm);
  btnLoadFarm?.addEventListener("click", loadFarm);
  btnClear?.addEventListener("click", clearFarm);

  btnSaveRun?.addEventListener("click", saveRun);
  btnDownloadRun?.addEventListener("click", downloadRunPDF);
  btnPrintRun?.addEventListener("click", printRunPDF);

  // ===== Init =====
  try {
    await fillFarmSelect();

    const activeId = getActiveFarmId();

    if (!activeId) {
      setBadge("unknown", "Ready");
      setAdvice([
        "Select or draw a farm boundary.",
        'Tap "Update Now" to fetch satellite indices.',
      ]);
      return;
    }

    const f = await dbGetFarmById(activeId);
    if (!f) {
      setBadge("unknown", "Ready");
      setAdvice([
        "Saved farm not found (maybe deleted).",
        'Select or draw a farm boundary, then tap "Save Farm".',
      ]);
      return;
    }

    renderGeometry(f.geometry);

    const latest = await dbGetLatestRunForFarm(activeId);
    if (latest) applyRunToUI(latest);

    setBadge("unknown", "Farm Loaded");
    setAdvice([
      `Loaded: ${f.name}`,
      latest ? "Showing latest saved results." : 'Click "Update Now" to fetch indices.',
    ]);
  } catch (e) {
    console.error(e);
    setBadge("bad", "Init error");
    setAdvice(["Could not load farms/history.", e?.message || String(e)]);
  }
});