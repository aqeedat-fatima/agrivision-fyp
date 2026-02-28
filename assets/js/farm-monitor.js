const API_BASE = "http://127.0.0.1:8000";
const STORAGE_KEY = "agrivision_farm_geometry";

function isoDate(d){ return d.toISOString().slice(0,10); }

// default last 90 days
const end = new Date();
const start = new Date();
start.setDate(end.getDate() - 90);
document.getElementById("startDate").value = isoDate(start);
document.getElementById("endDate").value = isoDate(end);

// MAP
const map = L.map("map").setView([33.6844, 73.0479], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  draw: { polygon:true, rectangle:true, circle:false, marker:false, polyline:false, circlemarker:false },
  edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);

let ndviLayer = null;
let trendChart = null;

function setBadge(level, text){
  const el = document.getElementById("healthBadge");
  el.className =
    "fm-badge " +
    (level === "good" ? "fm-good" :
     level === "warn" ? "fm-warn" :
     level === "bad"  ? "fm-bad"  : "fm-unknown");
  el.textContent = text || "Unknown";
}

function setKpis(s){
  const f = (v) => (v === null || v === undefined) ? "—" : Number(v).toFixed(2);
  document.getElementById("kpiMean").textContent = f(s.mean);
  document.getElementById("kpiMin").textContent  = f(s.min);
  document.getElementById("kpiMax").textContent  = f(s.max);
}

function setAdvice(list){
  const ul = document.getElementById("adviceList");
  ul.innerHTML = "";
  (list || []).forEach(t => {
    const li = document.createElement("li");
    li.textContent = t;
    ul.appendChild(li);
  });
}

function getCurrentGeometry(){
  const layers = drawnItems.getLayers();
  if (!layers.length) return null;
  return layers[0].toGeoJSON().geometry;
}

function saveGeometry(geom){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(geom));
}

function loadGeometry(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function renderGeometry(geom){
  drawnItems.clearLayers();
  const layer = L.geoJSON({ type:"Feature", properties:{}, geometry: geom });
  layer.eachLayer(l => drawnItems.addLayer(l));
  try { map.fitBounds(layer.getBounds(), { padding:[20,20] }); } catch {}
}

function setOverlay(tilesUrl){
  if (!tilesUrl) return; // ✅ safe
  if (ndviLayer) { map.removeLayer(ndviLayer); ndviLayer = null; }
  ndviLayer = L.tileLayer(tilesUrl, { opacity: 0.70 });
  ndviLayer.addTo(map);
}

function renderTrend(timeseries){
  const labels = timeseries.map(p => p.date);
  const values = timeseries.map(p =>
    (p.mean_ndvi === null || p.mean_ndvi === undefined) ? null : Number(p.mean_ndvi)
  );

  const canvas = document.getElementById("trendChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (trendChart) trendChart.destroy();

  trendChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label:"Mean NDVI", data: values, spanGaps:true, tension:0.25 }] },
    options: { plugins:{ legend:{display:false} }, scales:{ y:{ suggestedMin:0, suggestedMax:1 } } }
  });
}

// draw event
map.on(L.Draw.Event.CREATED, (e) => {
  drawnItems.clearLayers();
  drawnItems.addLayer(e.layer);

  const geom = getCurrentGeometry();
  saveGeometry(geom);
  setBadge("unknown", "Farm Saved");
  setAdvice(["Farm saved.", "Tap “Update Now” to check health."]);
});

async function updateNow(){
  const btn = document.getElementById("btnUpdate");

  let geom = getCurrentGeometry() || loadGeometry();
  if (!geom){
    setBadge("unknown", "No Farm Yet");
    setAdvice(["Draw your farm boundary first.", "Then press “Update Now”."]);
    return;
  }

  // if it was loaded from storage, render it visually
  if (!getCurrentGeometry()) renderGeometry(geom);

  const start_date = document.getElementById("startDate").value;
  const end_date   = document.getElementById("endDate").value;

  // loading state (disable button)
  setBadge("unknown", "Updating…");
  setAdvice(["Fetching satellite health…", "This can take a few seconds."]);
  btn.disabled = true;
  btn.textContent = "Updating…";

  try {
    const res = await fetch(`${API_BASE}/satellite/ndvi/mvp`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ geometry: geom, start_date, end_date })
    });

    if (!res.ok){
      const err = await res.json().catch(() => ({}));
      setBadge("unknown", "Error");
      setAdvice([err.detail || "Check backend logs."]);
      return;
    }

    const data = await res.json();

    // ✅ overlay is optional (won't crash)
    if (data.tiles_url) setOverlay(data.tiles_url);

    // KPIs
    setKpis(data.summary || {});

    // Health badge
    const h = (data.health || {});
    const lvl = h.level || "unknown"; // swagger shows "bad" already
    const emoji = lvl === "good" ? "✅ " : lvl === "warn" ? "⚠️ " : lvl === "bad" ? "🚨 " : "";
    setBadge(lvl, emoji + (h.label || "Unknown"));

    // Advice + chart
    setAdvice(h.advice || []);
    renderTrend((data.timeseries || []).slice(-12));

  } catch (e) {
    setBadge("unknown", "Error");
    setAdvice(["Network error. Is the backend running on port 8000?"]);
  } finally {
    // ✅ ALWAYS re-enable button
    btn.disabled = false;
    btn.textContent = "Update Now";
  }
}

// buttons
document.getElementById("btnUpdate").addEventListener("click", updateNow);

document.getElementById("btnLoadFarm").addEventListener("click", () => {
  const geom = loadGeometry();
  if (!geom){
    setBadge("unknown","No Saved Farm");
    setAdvice(["Draw your farm boundary to save it."]);
    return;
  }
  renderGeometry(geom);
  setBadge("unknown","Farm Loaded");
  setAdvice(["Tap “Update Now” to check health."]);
});

document.getElementById("btnClearFarm").addEventListener("click", () => {
  drawnItems.clearLayers();
  localStorage.removeItem(STORAGE_KEY);

  if (ndviLayer){ map.removeLayer(ndviLayer); ndviLayer = null; }

  setBadge("unknown","Cleared");
  setKpis({mean:null,min:null,max:null});
  setAdvice(["Draw your farm boundary again to monitor."]);

  if (trendChart){ trendChart.destroy(); trendChart = null; }
});

// auto-load
const saved = loadGeometry();
if (saved){
  renderGeometry(saved);
  setBadge("unknown","Farm Loaded");
  setAdvice(["Tap “Update Now” to check health."]);
}