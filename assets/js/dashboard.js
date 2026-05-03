
// assets/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
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
  const USER = requireUser();
  const USER_SUFFIX = `_${USER.id}`;

  // ===============================
  // ✅ DB + KPI HELPERS
  // ===============================
  const API_BASE = "";
  const API_URL = `${API_BASE}/predict`;

  const authHeaders = () => ({ "X-User-Id": String(USER.id) });

  const dbListFarms = async () => {
    const res = await fetch(`${API_BASE}/db/farms`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to load farms");
    return await res.json();
  };

  const dbListDiseaseHistory = async () => {
    const res = await fetch(`${API_BASE}/db/history/disease`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to load disease history");
    return await res.json();
  };

  const dbListSatelliteHistory = async () => {
    const res = await fetch(`${API_BASE}/db/history/satellite`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to load satellite history");
    return await res.json();
  };
  const uploadCard = document.getElementById("uploadCard");
  const fileInput = document.getElementById("imageUploadInput");
  // API_URL is defined above (API_BASE + /predict)
  // ===== Profile / Logout =====
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");
  const logoutBtn = document.getElementById("logoutBtn");

  // ✅ show logged-in user name (not hardcoded)
  const profileNameEl =
    document.getElementById("profileName") ||
    profileBtn?.querySelector(".profile-name") ||
    profileBtn?.querySelector("span");

  if (profileNameEl) {
    profileNameEl.textContent =
      USER.full_name || USER.fullName || USER.name || USER.email || "Profile";
  }

  profileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdown?.classList.toggle("is-hidden");
  });

  document.addEventListener("click", () => {
    profileDropdown?.classList.add("is-hidden");
  });

  logoutBtn?.addEventListener("click", () => {
    const ok = confirm("Do you want to log out?");
    if (!ok) return;

    localStorage.removeItem("agrivision_user");
    // NOTE: we do NOT delete reports/scans on logout (demo continuity)
    window.location.href = "login.html";
  });

  if (!uploadCard || !fileInput) {
    console.error("Upload card or file input not found in DOM.");
    return;
  }

  // ===== Result panel elements =====
  const resultStatusPill = document.getElementById("resultStatusPill");
  const resultEmptyState = document.getElementById("resultEmptyState");
  const resultMain = document.getElementById("resultMain");

  const resultImage = document.getElementById("resultImage");
  const resultDiseaseName = document.getElementById("resultDiseaseName");
  const resultConfidenceChip = document.getElementById("resultConfidenceChip");
  const resultSymptoms = document.getElementById("resultSymptoms");
  const resultCause = document.getElementById("resultCause");
  const resultPrevention = document.getElementById("resultPrevention");

  const recOrganic = document.getElementById("recOrganic");
  const recChemical = document.getElementById("recChemical");

  let LAST_DIAGNOSIS = null;

  // ===== Right Column UI (Risk template) =====
  const riskCard = document.getElementById("riskCard");
  const riskIcon = document.getElementById("riskIcon");
  const riskTitle = document.getElementById("alertTitle");
  const riskSub = document.getElementById("riskSub");
  const riskBullets = document.getElementById("riskBullets");
  const riskBadge = document.getElementById("riskBadge");
  const riskCount = document.getElementById("riskCount");
  const riskDiseaseName = document.getElementById("riskDiseaseName");

  // ===== Explain =====
  const explainText = document.getElementById("explainText");
  const explainTip = document.getElementById("explainTip");
  const pillQuality = document.getElementById("pillQuality");
  const pillAgreement = document.getElementById("pillAgreement");

  // ===== Charts =====
  const chartBadge1 = document.getElementById("chartBadge1");
  const chartHint1 = document.getElementById("chartHint1");
  const chartHint2 = document.getElementById("chartHint2");

  const ctxGauge = document.getElementById("chartConfidenceGauge");
  const ctxReliability = document.getElementById("chartReliability");
  let gaugeChart = null;
  let reliabilityChart = null;

  // ==========================================================
  // STORAGE KEYS
  // ==========================================================
  const STORAGE_KEY_DISEASE_COUNT = "agrivision_detected_diseases_count";
  const REPORTS_KEY = "agrivision_reports";
  const SCANS_KEY = "agrivision_scans";

  // KPI elements
  const kpiDetectedDiseasesEl = document.getElementById("kpiDetectedDiseases");
  const kpiDiseasesMoMValueEl = document.getElementById("kpiDiseasesMoMValue");

  // ==========================================================
  // ✅ DB-driven KPI refresh (Farms monitored, Diseases detected, Avg NDVI)
  // ==========================================================
  // (removed duplicate toNum helper; using DB KPI version above)
  const extractNdvi = (run) => {
    const s = run?.summary || {};
    return toNum(s.ndvi ?? s.mean ?? s.mean_ndvi ?? s.meanNdvi);
  };

  const isHealthyDiseaseRow = (row) => {
    const k = String(
      row?.diseaseKey ||
        row?.disease_key ||
        row?.labelKey ||
        row?.label_key ||
        row?.pred_label ||
        row?.label ||
        ""
    )
      .toLowerCase()
      .trim();
    return k === "healthy" || k === "healthy_leaf";
  };

  const refreshDashboardKPIs = async () => {
    const elFields = document.getElementById("kpiFieldsMonitored");
    const elDetected = document.getElementById("kpiDetectedDiseases");
    const elAvgNdvi = document.getElementById("kpiAvgNdvi");

    if (!elFields && !elDetected && !elAvgNdvi) return;

    try {
      const [farms, diseaseRows, satRows] = await Promise.all([
        dbListFarms(),
        dbListDiseaseHistory(),
        dbListSatelliteHistory(),
      ]);

      const fieldsCount = Array.isArray(farms) ? farms.length : 0;

      const diseasedCount = Array.isArray(diseaseRows)
        ? diseaseRows.filter((r) => !isHealthyDiseaseRow(r)).length
        : 0;

      // latest sat run per farm
      const latestByFarm = new Map();
      (Array.isArray(satRows) ? satRows : []).forEach((r) => {
        const fid = r.farm_id ?? r.farmId ?? r.farm;
        if (!fid) return;

        const t = new Date(r.created_at || r.createdAt || r.timestamp || r.ts || 0).getTime();
        const cur = latestByFarm.get(String(fid));
        const tc = cur
          ? new Date(cur.created_at || cur.createdAt || cur.timestamp || cur.ts || 0).getTime()
          : -1;

        if (!cur || t > tc) latestByFarm.set(String(fid), r);
      });

      const ndvis = [...latestByFarm.values()]
        .map(extractNdvi)
        .filter((v) => v != null);

      const avgNdvi =
        ndvis.length > 0 ? ndvis.reduce((a, b) => a + b, 0) / ndvis.length : null;

      if (elFields) elFields.textContent = String(fieldsCount);
      if (elDetected) elDetected.textContent = String(diseasedCount);
      if (elAvgNdvi) elAvgNdvi.textContent = avgNdvi == null ? "—" : avgNdvi.toFixed(2);
    } catch (e) {
      console.error("KPI refresh failed:", e);
    }
  };

  // ==========================================================
  // STORAGE HELPERS (single source of truth)
  // ==========================================================
  const uuid = () =>
    (window.crypto?.randomUUID?.() ||
      `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);

  const getDiseaseCount = () =>
    Number(localStorage.getItem(STORAGE_KEY_DISEASE_COUNT) || 0);

  const setDiseaseCount = (n) =>
    localStorage.setItem(STORAGE_KEY_DISEASE_COUNT, String(Math.max(0, n)));

  const renderDiseaseCount = () => {
    if (kpiDetectedDiseasesEl) {
      kpiDetectedDiseasesEl.textContent = String(getDiseaseCount());
    }
  };

  const getReports = () => {
    try {
      return JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]");
    } catch {
      return [];
    }
  };

  const setReports = (arr) =>
    localStorage.setItem(
      REPORTS_KEY,
      JSON.stringify(Array.isArray(arr) ? arr : [])
    );

  const addReport = (report) => {
    const reports = getReports();
    reports.unshift(report);
    setReports(reports);
  };

  const getScans = () => {
    try {
      return JSON.parse(localStorage.getItem(SCANS_KEY) || "[]");
    } catch {
      return [];
    }
  };

  const setScans = (arr) =>
    localStorage.setItem(
      SCANS_KEY,
      JSON.stringify(Array.isArray(arr) ? arr : [])
    );

  const addScan = (scan) => {
    const scans = getScans();
    scans.unshift(scan);
    setScans(scans);
  };

  // =====================
  // DASHBOARD KPI: Farms + Satellite
  // =====================
  const FARMS_KEY = "agrivision_farms";

  const getFarms = () => {
    try {
      return JSON.parse(localStorage.getItem(FARMS_KEY) || "[]");
    } catch {
      return [];
    }
  };

  // Satellite runs (for KPI fallback if farms don't have lastRun saved yet)
  const SAT_RUNS_KEY = "agrivision_satellite_runs";
  const SAT_REPORTS_KEY = "agrivision_satellite_reports"; // legacy

  const safeJSON = (raw, fallback) => {
    try {
      const p = JSON.parse(raw);
      return p ?? fallback;
    } catch {
      return fallback;
    }
  };

  const getSatRuns = () => {
    const a = safeJSON(localStorage.getItem(SAT_RUNS_KEY), []);
    const b = safeJSON(localStorage.getItem(SAT_REPORTS_KEY), []);
    const merged = [
      ...(Array.isArray(a) ? a : []),
      ...(Array.isArray(b) ? b : []),
    ];

    // de-dupe by id if present
    const seen = new Set();
    const out = [];
    for (const r of merged) {
      const id = r?.id || null;
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      out.push(r);
    }

    // newest first
    out.sort((x, y) => {
      const tx = new Date(x.createdAt || x.timestamp || x.ts || 0).getTime();
      const ty = new Date(y.createdAt || y.timestamp || y.ts || 0).getTime();
      return ty - tx;
    });

    return out;
  };

  const getLatestSatRunForFarm = (farmId) => {
    if (!farmId) return null;
    return (
      getSatRuns().find((r) => (r?.farmId || r?.farm_id) === farmId) || null
    );
  };

  const toNum = (v) => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  //const extractNdvi = (run) => {
    //if (!run) return null;
    //const s = run.summary || {};
    //return toNum(s.ndvi ?? s.mean ?? s.mean_ndvi ?? s.meanNdvi);
  //};

  const extractNdmi = (run) => {
    if (!run) return null;
    const s = run.summary || {};
    return toNum(s.ndmi ?? s.mean_ndmi ?? s.meanNdmi);
  };

  const extractChangePct = (run) => {
    const c = run?.change || {};
    return toNum(c.ndvi_change_pct ?? c.ndviChangePct ?? c.ndvi_change);
  };

  const extractHealthLevel = (run) => {
    return run?.health?.level || null;
  };

  const computeFarmKPIs = () => {
    const farms = getFarms();

    // Fields monitored
    const fieldsCount = farms.length;

    // Avg NDVI (prefer farm.lastRun; fallback to latest satellite run for that farm)
    const ndvis = farms
      .map((f) => {
        const fromFarm = extractNdvi(f?.lastRun);
        if (fromFarm != null) return fromFarm;

        const latest = getLatestSatRunForFarm(f?.id);
        return extractNdvi(latest);
      })
      .map(toNum)
      .filter((v) => Number.isFinite(v));

    const avgNdvi = ndvis.length
      ? ndvis.reduce((a, b) => a + b, 0) / ndvis.length
      : null;

    // Active alerts: stressed OR big NDVI drop OR moisture stress
    const alerts = farms.filter((f) => {
      const run = f?.lastRun || getLatestSatRunForFarm(f?.id) || null;

      const h = extractHealthLevel(run); // good/warn/bad
      const ch = extractChangePct(run);
      const ndmi = extractNdmi(run);

      const stressed = h === "bad";
      const bigDrop = ch != null ? ch <= -10 : false;
      const moistureStress = ndmi != null ? ndmi <= -0.1 : false;

      return stressed || bigDrop || moistureStress;
    }).length;

    return { fieldsCount, avgNdvi, alerts };
  };

  const renderFarmKPIs = () => {
    const { fieldsCount, avgNdvi, alerts } = computeFarmKPIs();

    const elFields = document.getElementById("kpiFieldsMonitored");
    const elAvgNdvi = document.getElementById("kpiAvgNdvi");
    const elAlerts = document.getElementById("kpiActiveAlerts");

    if (elFields) elFields.textContent = String(fieldsCount);
    if (elAvgNdvi)
      elAvgNdvi.textContent = avgNdvi == null ? "—" : avgNdvi.toFixed(2);
    if (elAlerts) elAlerts.textContent = String(alerts);
  };

  // Make KPI cards clickable (navigate to farm monitor)
  const wireKpiNav = () => {
    document.getElementById("cardFields")?.addEventListener("click", () => {
      window.location.href = "farm-monitor.html";
    });
    document.getElementById("cardAvgNdvi")?.addEventListener("click", () => {
      window.location.href = "farm-monitor.html";
    });
    document.getElementById("cardAlerts")?.addEventListener("click", () => {
      window.location.href = "farm-monitor.html";
    });
  };

  refreshDashboardKPIs();
  wireKpiNav();

  // Refresh when returning from farm monitor
  window.addEventListener("focus", refreshDashboardKPIs);

  // ==========================================================
  // MoM logic (based on scans history)
  // ==========================================================
  const isNonHealthy = (scan) => {
    const key = String(
      scan?.diseaseKey || scan?.labelKey || scan?.pred_label || ""
    ).toLowerCase();
    return key && key !== "healthy_leaf" && key !== "healthy";
  };

  const countDiseasedInMonth = (scans, year, monthIndex0) =>
    scans.filter((s) => {
      const dt = new Date(s.createdAt || s.timestamp || s.ts || Date.now());
      return (
        dt.getFullYear() === year &&
        dt.getMonth() === monthIndex0 &&
        isNonHealthy(s)
      );
    }).length;

  const computeMoMDiseaseDetections = () => {
    const scans = getScans();
    const now = new Date();

    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();

    const prev = new Date(thisYear, thisMonth - 1, 1);
    const prevYear = prev.getFullYear();
    const prevMonth = prev.getMonth();

    const thisCount = countDiseasedInMonth(scans, thisYear, thisMonth);
    const prevCount = countDiseasedInMonth(scans, prevYear, prevMonth);

    if (prevCount === 0 && thisCount === 0) return { text: "0% MoM", cls: "" };
    if (prevCount === 0 && thisCount > 0)
      return { text: "New MoM", cls: "kpi-change-up" };

    const pct = ((thisCount - prevCount) / prevCount) * 100;
    const rounded = Math.round(pct);

    if (rounded > 0) return { text: `+${rounded}% MoM`, cls: "kpi-change-up" };
    if (rounded < 0) return { text: `${rounded}% MoM`, cls: "kpi-change-down" };
    return { text: "0% MoM", cls: "" };
  };

  const renderDiseasesMoM = () => {
    if (!kpiDiseasesMoMValueEl) return;
    const { text, cls } = computeMoMDiseaseDetections();
    kpiDiseasesMoMValueEl.textContent = text;
    kpiDiseasesMoMValueEl.classList.remove(
      "kpi-change-up",
      "kpi-change-down"
    );
    if (cls) kpiDiseasesMoMValueEl.classList.add(cls);
  };

  // Render KPIs on load
  refreshDashboardKPIs();
  renderDiseasesMoM();
  loadLastCropStageKPI();

  // ==========================================================
  // optional thumbnail helper for PDF / history
  // ==========================================================
  const getImageThumbnailDataURL = (imgEl) => {
    try {
      if (!imgEl?.naturalWidth) return null;

      const maxW = 420;
      const ratio = imgEl.naturalHeight / imgEl.naturalWidth;
      const w = Math.min(maxW, imgEl.naturalWidth || maxW);
      const h = Math.round(w * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgEl, 0, 0, w, h);

      return canvas.toDataURL("image/jpeg", 0.72);
    } catch {
      return null;
    }
  };

  // --------------------------
  // Utils
  // --------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const toKey = (label) => {
    if (!label) return "unknown";
    return String(label)
      .trim()
      .toLowerCase()
      .replace(/[()]/g, "")
      .replace(/[%]/g, "")
      .replace(/&/g, "and")
      .replace(/[-/]/g, " ")
      .replace(/[^a-z0-9\s_]/g, "")
      .replace(/\s+/g, "_");
  };

  const LABEL_ALIASES = {
    healthy: "healthy_leaf",
    healthy_leaf: "healthy_leaf",
    "healthy leaf": "healthy_leaf",

    bacterial_blight: "bacterial_blight",
    "bacterial blight": "bacterial_blight",
    bacterialblight: "bacterial_blight",

    curl_virus: "curl_virus",
    "curl virus": "curl_virus",
    "leaf curl": "curl_virus",
    "leaf curl virus": "curl_virus",
    curlvirus: "curl_virus",

    leaf_redding: "leaf_redding",
    "leaf redding": "leaf_redding",
    leafredding: "leaf_redding",

    herbicide_growth_damage: "herbicide_growth_damage",
    "herbicide growth damage": "herbicide_growth_damage",
  };

  const getLang = () => localStorage.getItem("agrivision_lang") || "en";

  const diagnosisText = {
    en: {
      organic: "Organic Control",
      chemical: "Chemical Control",
      model_confidence: "Model confidence:",
    },
    ur: {
      organic: "نامیاتی علاج",
      chemical: "کیمیائی علاج",
      model_confidence: "ماڈل کا اعتماد:",
    }
  };

  const T = (key) => diagnosisText[getLang()]?.[key] || diagnosisText.en[key];

  // --------------------------
  // LEFT PANEL (Plantix-style LONG content)
  // --------------------------
  const DISEASE_BASE = {
    bacterial_blight: {
      name: "Bacterial Blight",
      symptoms:
        "Bacterial blight begins as small, water-soaked lesions on cotton leaves, typically limited by veins, giving them an angular appearance. Under warm and humid conditions, these lesions enlarge, darken, and may merge into scorched patches. Severely affected leaves become brittle, tear easily, and may fall prematurely, reducing the plant’s photosynthetic capacity and overall vigor.",
      organic:
        "At early stages, focus on reducing moisture retention within the crop canopy. Avoid overhead irrigation and minimize movement through the field when foliage is wet, as this spreads bacteria mechanically. Remove heavily infected plant debris where feasible and maintain clean field boundaries to reduce sources of reinfection.",
      chemical:
        "Chemical control is preventive rather than curative. Copper-based bactericides may be applied according to local agricultural guidelines during periods of high humidity or rainfall. Applications should target healthy foliage, as damaged tissue will not recover. Avoid unnecessary sprays to reduce resistance and phytotoxicity risks.",
      cause:
        "The disease is caused by bacterial pathogens that spread through rain splash, irrigation water, contaminated tools, and infected plant residue. Prolonged leaf wetness, high humidity, and warm temperatures significantly increase disease severity and rate of spread.",
      prevention: [
        "Use certified, disease-free seed and resistant cotton varieties where available.",
        "Avoid overhead irrigation and improve field drainage to reduce leaf wetness periods.",
        "Remove or bury infected crop residues after harvest to reduce carryover.",
        "Scout carefully after rain/humid spells and respond early to new lesions.",
      ],
    },

    curl_virus: {
      name: "Curl Virus",
      symptoms:
        "Cotton leaf curl virus primarily affects young leaves, causing curling, puckering, and thickened veins. As infection progresses, plants may become stunted, internodes shorten, and boll development can be reduced. Symptoms often start in patches and expand as insect vectors move through the field.",
      organic:
        "There is no cure once a plant is infected, so management is about protecting healthy plants. Reduce weed hosts and volunteer cotton around field edges, and if infection is localized early, consider removing severely affected plants to reduce the virus source. Increase scouting in hotspots and coordinate control with nearby fields if possible.",
      chemical:
        "Chemicals do not cure the virus inside the plant; they only reduce spread by targeting vectors (commonly whitefly). Apply insecticides only when vector populations exceed economic thresholds, ensure good underside coverage, and rotate modes of action to reduce resistance risk.",
      cause:
        "The virus is transmitted by sap-sucking insects, especially whitefly. It can persist in alternate host plants and weeds, allowing reinfection between seasons. Warm weather can accelerate vector reproduction and disease spread.",
      prevention: [
        "Use tolerant or resistant varieties where available and follow recommended sowing windows.",
        "Control weeds and alternate hosts around borders and irrigation channels.",
        "Monitor and manage whitefly early using integrated, threshold-based control.",
        "Remove volunteer cotton after harvest to reduce carryover sources.",
      ],
    },

    leaf_redding: {
      name: "Leaf Redding",
      symptoms:
        "Leaf redding appears as red to reddish-purple discoloration, often beginning on older leaves and sometimes spreading upward. It is commonly patchy and may correlate with stress zones in the field. In stronger cases, leaves may become dull, brittle, and the crop may show reduced vigor and boll set.",
      organic:
        "Start by comparing affected and unaffected areas for irrigation uniformity, compaction, drainage issues, and soil differences. Potassium imbalance is a frequent contributor, so a soil or leaf test is the most reliable way to confirm and guide correction. Stabilize moisture and reduce repeated drought–flood cycles that worsen stress expression.",
      chemical:
        "There is no pesticide cure unless a confirmed pest is driving the stress. Avoid random spraying. If nutrient deficiency is confirmed, follow a targeted correction plan based on testing and local recommendations to avoid wasting inputs and adding further stress.",
      cause:
        "Leaf redding is usually physiological and linked to nutrient imbalance (often potassium-related), moisture stress, cooler nights, or root stress. It can also be compounded by pest pressure or poor field conditions that reduce nutrient uptake.",
      prevention: [
        "Maintain balanced fertilization with attention to potassium and key micronutrients.",
        "Keep irrigation consistent and avoid long dry-down cycles and waterlogging.",
        "Improve soil structure/drainage in chronic stress zones.",
        "Scout routinely so you catch early stress signals before they spread.",
      ],
    },

    leaf_hopper_jassids: {
      name: "Leaf Hopper (Jassids)",
      symptoms:
        "Jassid injury typically starts as yellowing along the leaf margins, which can progress to browning and ‘hopper burn.’ Leaves may curl at the edges and plants can become stunted if pressure is high. Small green insects may be seen on the underside of leaves, especially on younger growth.",
      organic:
        "Scout the underside of leaves across multiple field sections to confirm presence and map hotspots. Manage weeds that act as alternate hosts and avoid excessive nitrogen, which can increase susceptibility. Maintain steady irrigation to reduce stress and improve plant tolerance while you confirm whether populations are increasing.",
      chemical:
        "Use insecticides only when populations cross local economic thresholds. Ensure thorough coverage of leaf undersides and rotate active ingredients/modes of action to reduce resistance. Avoid repeated back-to-back applications of the same chemistry.",
      cause:
        "Jassids are sap-sucking insects; feeding damage disrupts leaf tissue and causes characteristic margin burn and curling. Warm conditions can allow populations to rise quickly, making early scouting important.",
      prevention: [
        "Scout weekly (more often in warm spells) and treat only when thresholds are reached.",
        "Control weeds and maintain field sanitation around borders.",
        "Avoid excessive nitrogen and keep nutrition balanced.",
        "Encourage integrated control rather than routine calendar spraying.",
      ],
    },

    herbicide_growth_damage: {
      name: "Herbicide Growth Damage",
      symptoms:
        "Herbicide injury often shows as twisting, cupping, distorted new growth, uneven plant height, and abnormal leaf shape. Patterns may follow spray tracks, appear along downwind field edges, or concentrate in specific zones linked to drift or overlap.",
      organic:
        "Review recent spray history, wind direction, and equipment settings to confirm whether symptoms align with drift or overlap. Reduce additional stress by keeping irrigation consistent and avoiding extra shocks. Track recovery on new growth over 5–10 days; older damaged tissue will not revert, so improvement is judged by new leaves.",
      chemical:
        "There is no direct ‘cure’ spray for herbicide injury. Avoid random pesticide mixes that can add stress. If a nutrient deficiency is confirmed by testing and local guidance supports it, a targeted foliar correction may help recovery, but unnecessary inputs should be avoided.",
      cause:
        "The issue is typically phytotoxicity caused by herbicide contact (direct spray, drift, overlap, or tank contamination). Susceptibility depends on product, rate, crop stage, and environmental conditions.",
      prevention: [
        "Follow label rates and correct timing; avoid spraying in risky wind conditions.",
        "Use drift-reduction nozzles and maintain proper boom height.",
        "Calibrate equipment and prevent overlap; clean tanks thoroughly between products.",
        "Buffer sensitive areas and monitor edges after spraying events.",
      ],
    },

    leaf_variegation: {
      name: "Leaf Variegation",
      symptoms:
        "Variegation appears as mottled light–dark patterns, streaking, or uneven chlorophyll distribution on the leaf surface. In some cases it remains stable and non-progressive; in others it may spread or occur alongside curling, stunting, or pest pressure depending on the underlying driver.",
      organic:
        "Check whether the pattern is consistent across many plants or limited to a few (which can suggest localized stress). Inspect both leaf surfaces for pests/vectors and compare affected areas with healthy zones for irrigation or nutrition differences. Document changes on new leaves over several days to see if the pattern progresses.",
      chemical:
        "Avoid random spraying until the driver is clearer. If pests/vectors are confirmed, treat using threshold-based control and rotate modes of action. If the issue looks nutritional, confirm via testing before applying corrections.",
      cause:
        "Variegation can be physiological, nutritional, or linked to infections and stress. Field context—spread pattern, crop stage, vector presence, and associated symptoms—helps determine the most likely cause.",
      prevention: [
        "Maintain balanced nutrition and consistent irrigation to reduce stress-related patterns.",
        "Scout for pests/vectors and manage weed hosts around the field.",
        "Avoid unnecessary sprays and focus on confirmed causes.",
        "Monitor new growth; changes there are the best indicator of improvement/worsening.",
      ],
    },

    healthy_leaf: {
      name: "Healthy Leaf",
      symptoms:
        "The leaf shows no clear signs of disease or pest damage. Color, shape, and venation appear normal. Minor marks can occur due to natural variation, dust, lighting conditions, or leaf age rather than a pathological issue.",
      organic:
        "Maintain routine crop care: balanced fertilization, steady irrigation, and regular scouting. Continue checking leaf undersides for early pests such as whitefly, jassid, or mites, and keep field borders clean to reduce pest reservoirs.",
      chemical:
        "No chemical treatment is recommended for a healthy leaf. Avoid unnecessary spraying, as it adds cost, can stress the crop, and may disrupt beneficial insect populations.",
      cause:
        "No strong disease features were detected in this photo. If the field still looks stressed, investigate non-disease factors like irrigation inconsistency, nutrient imbalance, temperature stress, or localized soil issues.",
      prevention: [
        "Keep irrigation steady and avoid repeated drought–flood stress cycles.",
        "Maintain balanced nutrition; correct deficiencies based on testing where possible.",
        "Scout routinely to catch early pest or disease changes.",
        "Manage weeds and volunteer plants near borders and channels.",
      ],
    },
  };

  const DISEASE_UR = {
    healthy_leaf: {
      name: "صحتمند پتہ",
      symptoms: "پتے میں بیماری یا کیڑوں کے واضح آثار موجود نہیں۔ رنگ، شکل اور رگیں نارمل نظر آتی ہیں۔",
      organic: "معمول کی فصل دیکھ بھال جاری رکھیں، متوازن کھاد، مناسب آبپاشی اور باقاعدہ معائنہ کریں۔",
      chemical: "صحتمند پتے کے لیے کسی کیمیائی اسپرے کی ضرورت نہیں۔ غیر ضروری اسپرے فصل کو نقصان پہنچا سکتا ہے۔",
      cause: "اس تصویر میں بیماری کی واضح علامات نہیں ملتیں۔ اگر کھیت میں دباؤ نظر آئے تو آبپاشی، غذائی کمی یا موسمی دباؤ چیک کریں۔",
      prevention: [
        "آبپاشی کو متوازن رکھیں۔",
        "متوازن غذائیت برقرار رکھیں۔",
        "کیڑوں اور بیماریوں کے لیے باقاعدہ معائنہ کریں۔",
        "کھیت کے کناروں پر جڑی بوٹیاں کم رکھیں۔"
      ]
    },

    bacterial_blight: {
      name: "بیکٹیریل بلائٹ",
      symptoms: "پتوں پر پانی جیسے دھبے بنتے ہیں جو بعد میں سیاہ یا بھورے ہو سکتے ہیں۔ نمی میں بیماری تیزی سے پھیل سکتی ہے۔",
      organic: "پتوں پر نمی کم کریں، اوپر سے آبپاشی سے بچیں، متاثرہ پودوں کے قریب کام کرتے وقت احتیاط کریں۔",
      chemical: "کاپر بیسڈ بیکٹیریسائڈ مقامی زرعی ہدایات کے مطابق استعمال کیا جا سکتا ہے۔",
      cause: "یہ بیماری بیکٹیریا سے ہوتی ہے جو بارش، آبپاشی کے پانی، اوزاروں اور متاثرہ باقیات سے پھیلتا ہے۔",
      prevention: [
        "بیماری سے پاک بیج استعمال کریں۔",
        "اوپر سے آبپاشی سے بچیں۔",
        "فصل کی باقیات کو مناسب طریقے سے تلف کریں۔",
        "بارش کے بعد کھیت کا معائنہ کریں۔"
      ]
    },

    curl_virus: {
      name: "لیف کرل وائرس",
      symptoms: "نئے پتے مڑ جاتے ہیں، رگیں موٹی ہو سکتی ہیں اور پودا کمزور یا چھوٹا رہ سکتا ہے۔",
      organic: "متاثرہ پودوں کو الگ کریں، جڑی بوٹیاں ختم کریں اور سفید مکھی کی نگرانی کریں۔",
      chemical: "وائرس کا علاج نہیں، مگر سفید مکھی کو کنٹرول کرنے کے لیے مناسب کیڑے مار دوا استعمال کی جا سکتی ہے۔",
      cause: "یہ وائرس عموماً سفید مکھی کے ذریعے پھیلتا ہے اور متبادل میزبان پودوں میں بھی رہ سکتا ہے۔",
      prevention: [
        "مزاحم اقسام استعمال کریں۔",
        "سفید مکھی کی آبادی کو جلد کنٹرول کریں۔",
        "جڑی بوٹیوں کو ختم کریں۔",
        "کٹائی کے بعد رضاکار کپاس کے پودے ختم کریں۔"
      ]
    },

    leaf_redding: {
      name: "پتوں کا سرخ ہونا",
      symptoms: "پتے سرخ یا جامنی رنگ اختیار کر سکتے ہیں، عموماً پرانے پتوں سے شروع ہوتا ہے۔",
      organic: "آبپاشی، نکاسی آب اور غذائی توازن خاص طور پر پوٹاشیم کو چیک کریں۔",
      chemical: "بغیر تصدیق کے اسپرے نہ کریں۔ غذائی کمی ثابت ہو تو مقامی سفارشات کے مطابق اصلاح کریں۔",
      cause: "یہ عموماً غذائی کمی، پانی کے دباؤ، جڑوں کے مسئلے یا موسمی دباؤ سے ہوتا ہے۔",
      prevention: [
        "متوازن کھاد دیں۔",
        "پانی کی کمی یا زیادتی سے بچیں۔",
        "مٹی کی صحت بہتر رکھیں۔",
        "متاثرہ حصوں کی نگرانی کریں۔"
      ]
    },

    leaf_hopper_jassids: {
      name: "جیسڈ / لیف ہاپر",
      symptoms: "پتوں کے کنارے پیلے یا بھورے ہو سکتے ہیں اور پتے مڑ سکتے ہیں۔",
      organic: "پتوں کی نچلی سطح چیک کریں، جڑی بوٹیاں کم کریں اور اضافی نائٹروجن سے بچیں۔",
      chemical: "اگر آبادی حد سے زیادہ ہو تو مناسب کیڑے مار دوا استعمال کریں اور دوا بدل بدل کر استعمال کریں۔",
      cause: "جیسڈ رس چوسنے والے کیڑے ہیں جو پتوں کو کمزور کرتے ہیں۔",
      prevention: [
        "ہفتہ وار معائنہ کریں۔",
        "جڑی بوٹیاں کنٹرول کریں۔",
        "متوازن کھاد استعمال کریں۔",
        "کیڑے مار دوا صرف ضرورت پر استعمال کریں۔"
      ]
    },

    herbicide_growth_damage: {
      name: "ہربیسائڈ سے بڑھوتری کا نقصان",
      symptoms: "نئے پتے مڑ سکتے ہیں، شکل خراب ہو سکتی ہے اور پودے کی بڑھوتری غیر معمولی ہو سکتی ہے۔",
      organic: "اسپرے کی تاریخ، ہوا کا رخ اور اسپرے ٹریک چیک کریں۔ فصل کو مزید دباؤ سے بچائیں۔",
      chemical: "اس کا براہ راست علاج نہیں۔ اضافی اسپرے سے گریز کریں۔",
      cause: "یہ عموماً ہربیسائڈ ڈرفٹ، اوورلیپ یا ٹینک آلودگی سے ہوتا ہے۔",
      prevention: [
        "ہوا کے تیز رخ میں اسپرے نہ کریں۔",
        "درست مقدار استعمال کریں۔",
        "اسپرے مشین صاف رکھیں۔",
        "حساس علاقوں کے قریب احتیاط کریں۔"
      ]
    },

    leaf_variegation: {
      name: "پتوں کی رنگت میں فرق",
      symptoms: "پتے پر ہلکے اور گہرے رنگ کے دھبے یا غیر یکساں رنگت ظاہر ہو سکتی ہے۔",
      organic: "دیکھیں کہ مسئلہ چند پودوں تک محدود ہے یا پھیل رہا ہے۔ کیڑوں، غذائی کمی اور آبپاشی کا جائزہ لیں۔",
      chemical: "وجہ واضح ہونے سے پہلے اسپرے نہ کریں۔ اگر کیڑے موجود ہوں تو حد کے مطابق کنٹرول کریں۔",
      cause: "یہ غذائی کمی، فزیولوجیکل دباؤ، کیڑوں یا انفیکشن سے ہو سکتا ہے۔",
      prevention: [
        "متوازن غذائیت رکھیں۔",
        "آبپاشی مسلسل رکھیں۔",
        "کیڑوں کی نگرانی کریں۔",
        "نئی بڑھوتری کو مانیٹر کریں۔"
      ]
    }
  };

  const RIGHT_PANEL_TEXT = {
    en: {
      alert: "Crop Disease Alert",
      detected: "Disease Detected",
      decision_conf: "Decision Confidence",
      usable: "Result is usable — verify in field",
      reliable: "Result is reliable",
      uncertain: "Why it’s uncertain",
      improve: "Improve accuracy",
      tips: [
        "Move closer so the leaf fills most of the frame.",
        "Capture both front and back of the leaf.",
        "Keep the leaf flat and centered; avoid motion blur."
      ]
    },
    ur: {
      alert: "فصل کی بیماری کا انتباہ",
      detected: "بیماری کی نشاندہی",
      decision_conf: "فیصلے کا اعتماد",
      usable: "نتیجہ قابل استعمال ہے — میدان میں تصدیق کریں",
      reliable: "نتیجہ قابل اعتماد ہے",
      uncertain: "یہ غیر یقینی کیوں ہے",
      improve: "درستگی بہتر کریں",
      tips: [
        "قریب جائیں تاکہ پتا واضح نظر آئے۔",
        "پتے کی دونوں طرف کی تصویر لیں۔",
        "پتے کو سیدھا رکھیں اور حرکت سے بچیں۔"
      ]
    }
  };

  const RISK_TEXT = {
    en: {
      high: "High Priority — Take Action",
      med: "Medium Priority — Monitor Closely",
      low: "Low Risk",

      why: "Why it’s uncertain",
      improve: "Improve accuracy",

      bullets: {
        monitor: "Monitor closely — confirm on multiple plants.",
        airflow: "Improve airflow and avoid working in wet conditions.",
        spray: "Avoid unnecessary spraying.",
      },

      tips: [
        "Move closer so the leaf fills most of the frame.",
        "Capture both front and back of the leaf.",
        "Keep the leaf flat and centered; avoid motion blur."
      ]
    },

    ur: {
      high: "زیادہ ترجیح — فوری کارروائی کریں",
      med: "درمیانی ترجیح — قریب سے نگرانی کریں",
      low: "کم خطرہ",

      why: "یہ غیر یقینی کیوں ہے",
      improve: "درستگی بہتر کریں",

      bullets: {
        monitor: "قریب سے نگرانی کریں — مختلف پودوں پر تصدیق کریں۔",
        airflow: "ہوا کی آمدورفت بہتر بنائیں اور گیلی حالت میں کام نہ کریں۔",
        spray: "غیر ضروری سپرے سے پرہیز کریں۔",
      },

      tips: [
        "تصویر قریب سے لیں تاکہ پتا واضح نظر آئے۔",
        "پتے کے آگے اور پیچھے دونوں کی تصویر لیں۔",
        "پتے کو سیدھا رکھیں اور دھندلاہٹ سے بچیں۔"
      ]
    }
  };

  function getDiseaseBase(labelKey) {
    const en = DISEASE_BASE[labelKey] || DISEASE_BASE.healthy_leaf;
    if (getLang() !== "ur") return en;

    return {
      ...en,
      ...(DISEASE_UR[labelKey] || DISEASE_UR.healthy_leaf)
    };
  }

  function rerenderDiagnosisLanguage() {
  if (!LAST_DIAGNOSIS) return;

  const base = getDiseaseBase(LAST_DIAGNOSIS.labelKey);
  const lang = getLang();
  const t = RIGHT_PANEL_TEXT[lang];

  // =====================
  // LEFT SIDE (KEEP THIS)
  // =====================
  if (resultDiseaseName) resultDiseaseName.textContent = base.name;

  if (resultConfidenceChip) {
    resultConfidenceChip.textContent =
      `${T("model_confidence")} ${LAST_DIAGNOSIS.confidencePct}`;
  }

  if (resultSymptoms) resultSymptoms.textContent = base.symptoms || "";

  const ICON_ORGANIC = "assets/icons/organic.png";
  const ICON_CHEMICAL = "assets/icons/chemical.png";

  if (recOrganic) {
    recOrganic.innerHTML = renderRecBlock(
      T("organic"),
      ICON_ORGANIC,
      [base.organic || "—"]
    );
  }

  if (recChemical) {
    recChemical.innerHTML = renderRecBlock(
      T("chemical"),
      ICON_CHEMICAL,
      [base.chemical || "—"]
    );
  }

  if (resultCause) resultCause.textContent = base.cause || "";
    fillPreventionList(base.prevention);

    // =====================
    // RIGHT SIDE (ADD THIS)
    // =====================

    // Titles
    const alertTitle = document.getElementById("alertTitle");
    const diseaseDetectedLabel = document.getElementById("diseaseDetectedLabel");
    const decisionTitle = document.getElementById("decisionConfidenceTitle");

    if (alertTitle) alertTitle.textContent = t.alert;
    if (diseaseDetectedLabel) diseaseDetectedLabel.textContent = t.detected;
    if (decisionTitle) decisionTitle.textContent = t.decision_conf;

    // Status text
    const statusEl = document.getElementById("explainText");
    if (statusEl) {
      if (LAST_DIAGNOSIS.confidenceRaw < 0.6) {
        statusEl.textContent = t.usable;
      } else {
        statusEl.textContent = t.reliable;
      }
    }

    // Tips list
    const tipsContainer = document.getElementById("explainTip");
    if (tipsContainer) {
      tipsContainer.innerHTML = "";

      t.tips.forEach((tip, i) => {
        const li = document.createElement("div");
        li.textContent = `${i + 1}. ${tip}`;
        tipsContainer.appendChild(li);
      });
    }

    const risk = computeRiskLevel(LAST_DIAGNOSIS.labelKey, LAST_DIAGNOSIS.confidenceRaw);
    const bullets = buildRiskBullets({ risk, labelKey: LAST_DIAGNOSIS.labelKey });

    setRiskUI({
      risk,
      diseaseName: base.name,
      labelKey: LAST_DIAGNOSIS.labelKey,
      confidencePct: LAST_DIAGNOSIS.confidencePct,
      bullets
    });

    
    const rt = RISK_TEXT[lang];

    // Badge translation
    const riskBadge = document.getElementById("riskBadge");
    if (riskBadge) {
      if (risk === "high") riskBadge.textContent = rt.high;
      else if (risk === "med") riskBadge.textContent = rt.med;
      else riskBadge.textContent = rt.low;
    }

    // Sub text (optional simple version)
    const riskSub = document.getElementById("riskSub");
    if (riskSub) {
      riskSub.textContent = rt.bullets.monitor;
    }

    // Bullets
    const bulletsContainer = document.getElementById("riskBullets");
    if (bulletsContainer) {
      bulletsContainer.innerHTML = "";

      const items = Object.values(rt.bullets);

      items.forEach((b) => {
        const li = document.createElement("li");
        li.textContent = b;
        bulletsContainer.appendChild(li);
      });
    }
  }

  window.addEventListener("agrivision:languageChanged", rerenderDiagnosisLanguage);

  // --------------------------
  // RIGHT PANEL (Risk Alert)
  // --------------------------
  const ADVICE_7x3 = {
    bacterial_blight: {
      low: [
        "Low urgency — re-check multiple leaves and monitor after any rain/humidity.",
        "Reduce leaf wetness (avoid overhead irrigation) and keep tools/boots clean between blocks.",
      ],
      med: [
        "Monitor closely — confirm on multiple plants and watch for quick spread in humid weather.",
        "Improve airflow and avoid working in the field when foliage is wet.",
      ],
      high: [
        "Immediate action recommended — bacterial issues spread fast in wet conditions.",
        "Protect healthy foliage; prioritize hotspots and reduce leaf wetness right away.",
      ],
    },

    curl_virus: {
      low: [
        "Low urgency — confirm symptoms on youngest leaves and watch for patch expansion.",
        "Check for whitefly activity and remove weed hosts around edges.",
      ],
      med: [
        "Monitor closely — virus-like pattern: protect healthy plants by reducing vectors quickly.",
        "Scout underside of upper leaves; control weeds/alternate hosts nearby.",
      ],
      high: [
        "High priority — protect healthy plants now; focus on rapid vector suppression (whitefly).",
        "If localized, remove severely infected plants and coordinate control with nearby fields.",
      ],
    },

    leaf_redding: {
      low: [
        "Low urgency — likely stress-linked; compare affected vs healthy patches in the field.",
        "Check irrigation uniformity and nutrition balance (often potassium-related).",
      ],
      med: [
        "Monitor closely — investigate moisture + potassium; stabilize irrigation and reduce stress cycles.",
        "Consider a soil/leaf test if the pattern is expanding.",
      ],
      high: [
        "High priority — widespread redding suggests strong stress; act on irrigation + nutrition immediately.",
        "Reassess after 5–7 days by checking improvement on new leaves.",
      ],
    },

    leaf_hopper_jassids: {
      low: [
        "Low urgency — scout undersides for jassids; watch early hopper burn.",
        "Avoid excess nitrogen; keep field clean of weed hosts.",
      ],
      med: [
        "Monitor closely — map hotspots and verify population levels across rows.",
        "Protect new growth; maintain steady irrigation to reduce stress.",
      ],
      high: [
        "High priority — jassids can escalate quickly; protect new growth and treat based on thresholds.",
        "Re-scout after control to prevent rebound and rotate chemistry if needed.",
      ],
    },

    herbicide_growth_damage: {
      low: [
        "Low urgency — review spray history; check if symptoms follow spray tracks/edges.",
        "Stabilize irrigation and avoid extra stress while monitoring new growth.",
      ],
      med: [
        "Monitor closely — confirm drift/overlap pattern and document affected zones.",
        "Avoid additional sprays that can stress the crop while recovery is assessed.",
      ],
      high: [
        "High priority — stop suspect sprays and prevent further drift/overlap immediately.",
        "Track recovery on new leaves; old damaged tissue won’t revert.",
      ],
    },

    leaf_variegation: {
      low: [
        "Low urgency — confirm if pattern is stable or spreading across plants.",
        "Capture clearer close-ups (front + back) and scout for vectors/pests.",
      ],
      med: [
        "Monitor closely — if spreading, treat it as vector/stress risk until confirmed.",
        "Reduce stress (steady water/nutrition) while scouting for pests/hosts.",
      ],
      high: [
        "High priority — if spreading fast, intensify scouting and reduce infection sources.",
        "Coordinate vector control if confirmed and document progression.",
      ],
    },

    healthy_leaf: {
      low: [
        "No disease action needed — continue routine care and scouting.",
        "If the field looks stressed, check irrigation/nutrition and upload a clearer close-up of affected area.",
      ],
      med: [
        "Likely healthy, but model confidence is moderate — cross-check in field before acting.",
        "Inspect leaf undersides for pests and compare multiple plants/rows.",
      ],
      high: [
        "High confidence healthy — no disease treatment needed.",
        "If symptoms exist in-field, upload front + back close-ups in good light for verification.",
      ],
    },
  };

  const getLabelKey = (labelRaw) => {
    const raw = (labelRaw || "").toString().trim();
    const key0 = toKey(raw);

    if (DISEASE_BASE[key0]) return key0;
    if (LABEL_ALIASES[key0] && DISEASE_BASE[LABEL_ALIASES[key0]]) return LABEL_ALIASES[key0];

    const low = raw.toLowerCase();
    if (LABEL_ALIASES[low] && DISEASE_BASE[LABEL_ALIASES[low]]) return LABEL_ALIASES[low];

    return "healthy_leaf";
  };

  // --------------------------
  // Status helpers
  // --------------------------
  const setStatus = (text, mode) => {
    if (!resultStatusPill) return;
    resultStatusPill.textContent = text;
    resultStatusPill.classList.remove("result-pill-busy", "result-pill-ok");
    if (mode === "busy") resultStatusPill.classList.add("result-pill-busy");
    if (mode === "ok") resultStatusPill.classList.add("result-pill-ok");
  };

  const showEmptyState = () => {
    resultEmptyState?.classList.remove("is-hidden");
    resultMain?.classList.add("is-hidden");
    setStatus("No analysis yet", null);
  };

  const showResult = () => {
    resultEmptyState?.classList.add("is-hidden");
    resultMain?.classList.remove("is-hidden");
  };

  const showInvalidImageResult = (data) => {
    LAST_DIAGNOSIS = null;

    showResult();
    setStatus("Invalid image", "busy");

    if (resultDiseaseName) {
      resultDiseaseName.textContent = "Invalid Image";
    }

    if (resultConfidenceChip) {
      resultConfidenceChip.textContent =
        `Cotton confidence: ${data?.validator?.cotton_confidence ?? 0}%`;
    }

    if (resultSymptoms) {
      resultSymptoms.textContent =
        data?.message || "Please upload a clear cotton leaf image.";
    }

    if (recOrganic) {
      recOrganic.innerHTML = `
        <div class="rec-title-row">
          <h4 class="rec-h">What to upload</h4>
        </div>
        <div class="rec-body">
          <p class="rec-paragraph">Upload a clear cotton leaf image only.</p>
        </div>
      `;
    }

    if (recChemical) {
      recChemical.innerHTML = `
        <div class="rec-title-row">
          <h4 class="rec-h">Tips</h4>
        </div>
        <div class="rec-body">
          <p class="rec-paragraph">Avoid faces, screenshots, soil, or other leaves.</p>
        </div>
      `;
    }

    if (resultCause) {
      resultCause.textContent =
        `Validator classified this as ${data?.validator?.predicted_class || "non-cotton"}.`;
    }

    fillPreventionList([
      "Upload a cotton leaf close-up.",
      "Keep the leaf centered.",
      "Use good lighting."
    ]);

    setRiskUI({
      risk: "low",
      diseaseName: "Invalid Image",
      labelKey: "healthy_leaf",
      confidencePct: "—",
      bullets: [
        "Image rejected by cotton validator.",
        "Upload a cotton leaf to continue."
      ]
    });

    if (explainText) {
      explainText.textContent = "⚠️ Image rejected (not cotton).";
    }

    if (explainTip) {
      explainTip.innerHTML = `
        <div class="explain-minihead">Why rejected</div>
        <div class="explain-sub">
          This image is not recognized as a cotton leaf.
        </div>
      `;
    }

    if (pillQuality) pillQuality.textContent = "Photo quality: —";
    if (pillAgreement) pillAgreement.textContent = "Agreement: —";

    updateCharts({
      confidenceRaw: 0,
      qualityScore: 0,
      agreementScore: 0
    });
  };

  showEmptyState();

  // --------------------------
  // Photo quality (blur + brightness)
  // --------------------------
  const computePhotoQuality = async (imgEl) => {
    try {
      const w = 320;
      const h = Math.round((imgEl.naturalHeight / imgEl.naturalWidth) * w);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      ctx.drawImage(imgEl, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      const mean = sum / (w * h);
      const brightnessScore = 1 - clamp(Math.abs(mean - 140) / 140, 0, 1);

      const gray = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          gray[y * w + x] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
      }

      let lapSum = 0;
      let lapSum2 = 0;
      let count = 0;

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const c = gray[y * w + x];
          const lap =
            gray[(y - 1) * w + x] +
            gray[(y + 1) * w + x] +
            gray[y * w + (x - 1)] +
            gray[y * w + (x + 1)] -
            4 * c;

          lapSum += lap;
          lapSum2 += lap * lap;
          count++;
        }
      }

      const meanLap = lapSum / count;
      const varLap = lapSum2 / count - meanLap * meanLap;

      const blurScore = clamp(varLap / 800, 0, 1);

      const notes = [];
      if (blurScore < 0.35) notes.push("Image appears blurry");
      if (mean < 90) notes.push("Image is too dark");
      if (mean > 200) notes.push("Image is too bright");

      const qualityScore = clamp(0.6 * blurScore + 0.4 * brightnessScore, 0, 1);
      return { qualityScore, blurScore, brightnessScore, notes };
    } catch {
      return { qualityScore: 0.6, blurScore: 0.6, brightnessScore: 0.6, notes: ["Photo quality unavailable"] };
    }
  };

  // --------------------------
  // Agreement (use backend probabilities if available)
  // --------------------------
  const computeAgreementFromProbabilities = (probs) => {
    if (!Array.isArray(probs) || probs.length < 2) return null;
    const sorted = [...probs].sort((a, b) => b - a);
    const top1 = sorted[0];
    const top2 = sorted[1];
    const gap = clamp(top1 - top2, 0, 1);
    return clamp(0.15 + 0.85 * gap, 0, 1);
  };

  const computeAgreementFallback = (confidenceRaw, qualityScore) => {
    const c = confidenceRaw != null ? confidenceRaw : 0.65;
    const q = qualityScore != null ? qualityScore : 0.65;
    return clamp(0.75 * c + 0.25 * q - 0.2 * (1 - q), 0, 1);
  };

  // --------------------------
  // Risk logic
  // --------------------------
  const isVirusLike = (labelKey) => labelKey.includes("virus") || labelKey.includes("curl");

  const computeRiskLevel = (labelKey, confidenceRaw) => {
    const c = confidenceRaw != null ? confidenceRaw : 0.0;

    if (labelKey === "healthy_leaf") return "low";

    if (isVirusLike(labelKey)) {
      if (c >= 0.7) return "high";
      if (c >= 0.55) return "med";
      return "low";
    }

    if (c >= 0.85) return "high";
    if (c >= 0.6) return "med";
    return "low";
  };

  const buildRiskBullets = ({ risk, labelKey }) => {
    const base = ADVICE_7x3[labelKey] || ADVICE_7x3.healthy_leaf;
    const arr = base[risk] || base.low;

    const bullets = [];
    bullets.push(arr[0] || "Monitor and confirm in field.");
    bullets.push(arr[1] || "Follow the recommended action based on scouting.");
    return bullets.slice(0, 2);
  };

  const setRiskUI = ({ risk, diseaseName, labelKey, confidencePct, bullets }) => {
    if (!riskCard) return;

    riskCard.classList.remove("status-high", "status-med", "status-low");
    riskCard.classList.add(risk === "high" ? "status-high" : risk === "med" ? "status-med" : "status-low");

    if (riskTitle) {
      riskTitle.textContent =
        getLang() === "ur" ? "فصل کی بیماری کی اطلاع" : "Crop Disease Alert";
    }

    const isHealthy = labelKey === "healthy_leaf";
    if (riskCount) riskCount.textContent = isHealthy ? "0" : "1";
    if (riskDiseaseName) {
      riskDiseaseName.textContent =
        isHealthy
          ? (getLang() === "ur" ? "کوئی بیماری نہیں" : "No Disease")
          : diseaseName;
    }
    if (riskIcon) riskIcon.textContent = isHealthy ? "✓" : "!";

    if (riskBadge) {
      if (isHealthy) riskBadge.textContent = "Low Risk";
      else if (risk === "high") riskBadge.textContent = "High Priority – Immediate Action Recommended";
      else if (risk === "med") riskBadge.textContent = "Medium Priority – Monitor Closely";
      else riskBadge.textContent = "Low Priority – Recheck & Confirm";
    }

    if (riskSub) {
      if (isHealthy) {
        riskSub.textContent = "Leaf appears healthy. Keep normal care and continue routine scouting.";
      } else if (risk === "high") {
        riskSub.textContent = `High confidence detection of ${diseaseName} (${confidencePct}).`;
      } else if (risk === "med") {
        riskSub.textContent = `Moderate indication of ${diseaseName} (${confidencePct}). Cross-check in field.`;
      } else {
        riskSub.textContent = `Lower certainty for ${diseaseName} (${confidencePct}). Consider re-taking a clearer photo.`;
      }
    }

    if (riskBullets) {
      const arr = Array.isArray(bullets) ? bullets.slice(0, 2) : [];
      riskBullets.innerHTML = arr.map((t) => `<li>${t}</li>`).join("");
    }
  };

  // --------------------------
  // Decision Confidence
  // --------------------------
  const getReliabilityVerdict = ({ confidenceRaw, agreementScore, qualityScore, labelKey }) => {
    const c = confidenceRaw ?? 0;
    const a = agreementScore ?? 0;
    const q = qualityScore ?? 0;

    const reliability = clamp(0.55 * c + 0.25 * q + 0.20 * a, 0, 1);

    const photoNeedsWork = q < 0.72;
    const agreementLow = a < 0.45;

    let level = "low";
    let verdict = "Retake recommended for better accuracy";

    if (labelKey === "healthy_leaf" && reliability >= 0.62) {
      level = "high";
      verdict = "Result is reliable";
    } else if (reliability >= 0.72) {
      level = "high";
      verdict = "Result is reliable";
    } else if (reliability >= 0.55) {
      level = "med";
      verdict = "Result is usable — verify in field";
    }

    const reasons = [];
    if (agreementLow) reasons.push("Low agreement: the model is not strongly favoring one disease over others.");
    if (photoNeedsWork) reasons.push("Photo quality is not ideal (sharpness/lighting/angle can affect accuracy).");

    const improveSuggested = level === "high" && photoNeedsWork;

    return { reliability, level, verdict, reasons, improveSuggested, photoNeedsWork, agreementLow };
  };

  const buildRetakeChecklist = (notes, qualityScore) => {
    const n = Array.isArray(notes) ? notes : [];

    let first = "Move closer so the leaf fills most of the frame.";
    if (n.some((x) => x.toLowerCase().includes("blurry"))) first = "Tap to focus on the affected area and hold steady.";
    else if (n.some((x) => x.toLowerCase().includes("dark"))) first = "Take the photo in brighter light (avoid shadows).";
    else if (n.some((x) => x.toLowerCase().includes("bright"))) first = "Avoid glare; use soft daylight instead of flash.";
    else if (typeof qualityScore === "number" && qualityScore < 0.55) first = "Retake a sharper close-up of the most affected area.";

    return [first, "Capture both front and back of the leaf.", "Keep the leaf flat and centered; avoid motion blur."];
  };

  const setExplainUI = ({ qualityPct, agreementPct, verdictObj, notes, checklist }) => {
    if (pillQuality) pillQuality.textContent = `Photo quality: ${qualityPct}`;
    if (pillAgreement) pillAgreement.textContent = `Agreement: ${agreementPct}`;

    if (explainText) {
      const icon = verdictObj.level === "high" ? "✅" : verdictObj.level === "med" ? "⚠️" : "🔁";
      explainText.textContent = `${icon} ${verdictObj.verdict}`;
    }

    if (explainTip) {
      const reasons = (verdictObj.reasons || []).slice(0, 2);
      const showReasons = verdictObj.level !== "high";

      const nextTitle =
        verdictObj.level === "high"
          ? verdictObj.improveSuggested ? "Increase reliability (optional)" : "Next steps"
          : "Improve accuracy";

      const nextSubtitle =
        verdictObj.level === "high"
          ? verdictObj.improveSuggested
            ? "Your result is reliable, but a clearer photo can push reliability even higher."
            : "Result looks strong. Use field scouting to confirm and take action early if needed."
          : "This result is uncertain. A better photo usually improves confidence + agreement.";

      const showChecklist = verdictObj.level !== "high" || verdictObj.improveSuggested;

      const steps = (Array.isArray(checklist) ? checklist : buildRetakeChecklist(notes, 0.6))
        .slice(0, 3)
        .map((t, i) => `<li><span class="step-n">${i + 1}</span><span class="step-t">${t}</span></li>`)
        .join("");

      const whyHTML =
        showReasons && reasons.length
          ? `<div class="explain-minihead">Why it’s uncertain</div>
             <ul class="explain-mini">${reasons.map((r) => `<li>${r}</li>`).join("")}</ul>`
          : "";

      const stepsHTML = showChecklist
        ? `<div class="explain-minihead">${nextTitle}</div>
           <div class="explain-sub">${nextSubtitle}</div>
           <ul class="explain-steps">${steps}</ul>`
        : `<div class="explain-minihead">${nextTitle}</div>
           <div class="explain-sub">${nextSubtitle}</div>
           <div class="explain-good">Tip: If symptoms exist, upload a close-up of the most affected area (front + back).</div>`;

      explainTip.innerHTML = `${whyHTML}${stepsHTML}`;
    }
  };

  // --------------------------
  // Charts
  // --------------------------
  const ensureCharts = () => {
    if (!window.Chart || !ctxGauge || !ctxReliability) return;

    if (!gaugeChart) {
      gaugeChart = new Chart(ctxGauge, {
        type: "doughnut",
        data: { labels: ["Confidence", "Remaining"], datasets: [{ data: [0, 100], borderWidth: 0, hoverOffset: 6 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "74%",
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
        },
      });
    }

    if (!reliabilityChart) {
      reliabilityChart = new Chart(ctxReliability, {
        type: "bar",
        data: { labels: ["Confidence", "Photo Quality", "Agreement"], datasets: [{ label: "Score", data: [0, 0, 0], borderWidth: 0, borderRadius: 10 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => `${Math.round(ctx.raw)}%` } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#60717f", font: { weight: "700" } } },
            y: { beginAtZero: true, max: 100, ticks: { color: "#91a5b4" }, grid: { color: "rgba(145,165,180,0.20)" } },
          },
        },
      });
    }
  };

  const updateCharts = ({ confidenceRaw, qualityScore, agreementScore }) => {
    ensureCharts();

    const pct = confidenceRaw != null ? Math.round(confidenceRaw * 100) : null;
    const qp = Math.round((qualityScore ?? 0) * 100);
    const ap = Math.round((agreementScore ?? 0) * 100);

    if (chartBadge1) chartBadge1.textContent = pct != null ? `${pct}%` : "—%";

    if (chartHint1) {
      chartHint1.textContent =
        pct != null ? (pct >= 85 ? "High confidence" : pct >= 60 ? "Moderate confidence" : "Low confidence") : "No confidence returned";
    }
    if (chartHint2) chartHint2.textContent = "Agreement uses top-1 vs top-2 probability gap when available.";

    if (gaugeChart && pct != null) {
      gaugeChart.data.datasets[0].data = [pct, 100 - pct];
      gaugeChart.update();
    }

    if (reliabilityChart) {
      reliabilityChart.data.datasets[0].data = [pct ?? 0, qp, ap];
      reliabilityChart.update();
    }
  };

  // --------------------------
  // Render helpers (LEFT PANEL)
  // --------------------------
  const renderRecBlock = (title, iconPath, paragraphs) => {
    const body =
      (Array.isArray(paragraphs) && paragraphs.length ? paragraphs : ["Guidance not added yet."])
        .map((t) => `<p class="rec-paragraph">${t}</p>`)
        .join("");

    return `
      <div class="rec-title-row">
        <img class="rec-icon-img" src="${iconPath}" alt="">
        <h4 class="rec-h">${title}</h4>
      </div>
      <div class="rec-body">${body}</div>
    `;
  };

  const fillPreventionList = (items) => {
    if (!resultPrevention) return;
    const arr = Array.isArray(items) && items.length ? items : ["Maintain field hygiene and monitor nearby plants."];
    resultPrevention.innerHTML = arr.map((t) => `<li>${t}</li>`).join("");
  };

  // --------------------------
  // Upload card interaction
  // --------------------------
  const openFilePicker = () => fileInput.click();
  uploadCard.addEventListener("click", openFilePicker);
  uploadCard.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openFilePicker();
    }
  });

  // --------------------------
  // When user selects an image
  // --------------------------
  fileInput.addEventListener("change", async () => {
    if (!fileInput.files || fileInput.files.length === 0) return;
    const file = fileInput.files[0];

    if (resultImage) resultImage.src = URL.createObjectURL(file);
    setStatus("Analyzing leaf…", "busy");

    const formData = new FormData();
    formData.append("file", file);

    const user = requireUser();                 // ✅ get logged-in user
    formData.append("user_id", String(user.id)); // ✅ send user_id to backend

    try {
      // Wait for preview to load (quality scoring)
      await new Promise((resolve) => {
        if (!resultImage) return resolve();
        if (resultImage.complete && resultImage.naturalWidth) return resolve();
        resultImage.onload = () => resolve();
        resultImage.onerror = () => resolve();
      });

      const quality = await computePhotoQuality(resultImage);
      const qualityScore = quality.qualityScore;

      const response = await fetch(API_URL, { method: "POST", body: formData });
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);

      const data = await response.json();
      console.log("Prediction result:", data);

      // ✅ HANDLE INVALID IMAGE FIRST
      if (data.valid === false) {
        showInvalidImageResult(data);
        return;
      }

      const labelRaw = data.pred_label || data.label || data.disease_name || "unknown";
      const confidenceRaw = typeof data.confidence === "number" ? data.confidence : null;
      const probabilities = Array.isArray(data.probabilities) ? data.probabilities : null;

      const labelKey = getLabelKey(labelRaw);
      const base = getDiseaseBase(labelKey);


      // ✅ KPI cards are DB-driven now, so refresh them after a diseased detection
      if (labelKey !== "healthy_leaf") {
        refreshDashboardKPIs();
      }
      const confidencePct = confidenceRaw != null ? `${(confidenceRaw * 100).toFixed(1)}%` : "—%";

      const agreementFromProbs = computeAgreementFromProbabilities(probabilities);
      const agreementScore =
        agreementFromProbs != null ? agreementFromProbs : computeAgreementFallback(confidenceRaw, qualityScore);

      
      LAST_DIAGNOSIS = {
        labelKey,
        confidencePct,
        confidenceRaw,
        agreementScore,
        qualityScore
      };

      const risk = computeRiskLevel(labelKey, confidenceRaw);

      // ✅ SAVE EVERY scan (healthy + diseased)
      addScan({
        id: uuid(),
        createdAt: new Date().toISOString(),
        diseaseKey: labelKey,
        diseaseName: base.name,
        confidence: confidenceRaw,
        confidencePct,
        risk,
        photoQuality: qualityScore,
        agreement: agreementScore,
        thumbnail: resultImage ? getImageThumbnailDataURL(resultImage) : null,
      });

      // ✅ update MoM badge after scan is saved
      renderDiseasesMoM();

      // LEFT: content
      if (resultDiseaseName) resultDiseaseName.textContent = base.name;
      if (resultConfidenceChip) resultConfidenceChip.textContent = `${T("model_confidence")} ${confidencePct}`;
      if (resultSymptoms) resultSymptoms.textContent = base.symptoms || "";

      const ICON_ORGANIC = "assets/icons/organic.png";
      const ICON_CHEMICAL = "assets/icons/chemical.png";
      if (recOrganic) recOrganic.innerHTML = renderRecBlock(T("organic"), ICON_ORGANIC, [base.organic || "—"]);
      if (recChemical) recChemical.innerHTML = renderRecBlock(T("chemical"), ICON_CHEMICAL, [base.chemical || "—"]);

      if (resultCause) resultCause.textContent = base.cause || "";
      fillPreventionList(base.prevention);

      // RIGHT: risk bullets
      const bullets = buildRiskBullets({ risk, labelKey });
      setRiskUI({ risk, diseaseName: base.name, labelKey, confidencePct, bullets });

      // Explain
      const qualityPct = `${Math.round(qualityScore * 100)}%`;
      const agreementPct = `${Math.round(agreementScore * 100)}%`;
      const verdictObj = getReliabilityVerdict({ confidenceRaw, agreementScore, qualityScore, labelKey });
      const checklist = buildRetakeChecklist(quality.notes, qualityScore);

      setExplainUI({ qualityPct, agreementPct, verdictObj, notes: quality.notes, checklist });

      updateCharts({ confidenceRaw, qualityScore, agreementScore });

      // ✅ SAVE REPORT only when NOT healthy
      if (labelKey !== "healthy_leaf") {
        const report = {
          id: uuid(),
          createdAt: new Date().toISOString(),
          diseaseKey: labelKey,
          diseaseName: base.name,
          confidence: confidenceRaw,
          confidencePct,
          risk,
          riskBadge:
            risk === "high"
              ? "High Priority – Immediate Action Recommended"
              : risk === "med"
              ? "Medium Priority – Monitor Closely"
              : "Low Priority – Recheck & Confirm",
          photoQuality: qualityScore,
          agreement: agreementScore,
          symptoms: base.symptoms || "",
          cause: base.cause || "",
          prevention: Array.isArray(base.prevention) ? base.prevention : [],
          organic: base.organic || "",
          chemical: base.chemical || "",
          bullets: Array.isArray(bullets) ? bullets : [],
          thumbnail: resultImage ? getImageThumbnailDataURL(resultImage) : null,
        };

        addReport(report);
      }

      setStatus("Latest diagnosis ready", "ok");
      showResult();
    } catch (err) {
      console.error("Prediction error:", err);
      alert("There was a problem running the prediction. Please try again.");
      showEmptyState();
    } finally {
      fileInput.value = "";
    }
  });
});

document.addEventListener("DOMContentLoaded", function () {
    const satelliteCard = document.getElementById("satelliteCard");

    if (satelliteCard) {
        satelliteCard.addEventListener("click", function () {
            window.location.href = "farm-monitor.html";
        });

        // Optional: allow Enter key for accessibility
        satelliteCard.addEventListener("keypress", function (e) {
            if (e.key === "Enter") {
                window.location.href = "farm-monitor.html";
            }
        });
    }
});

function loadLastCropStageKPI() {
  const data = localStorage.getItem("last_crop_stage");
  if (!data) return;

  const parsed = JSON.parse(data);

  const valueEl = document.getElementById("lastStageValue");
  const subEl = document.getElementById("lastStageSub");

  if (!valueEl || !subEl) return;

  const icons = {
    Seedling: "🌱",
    Vegetative: "🌿",
    Budding: "🌾",
    Flowering: "🌸",
    "Boll Formation": "🟢",
    Harvesting: "🌾"
  };

  valueEl.textContent = `${icons[parsed.stage] || ""} ${parsed.stage}`;

  const daysAgo = Math.floor(
    (Date.now() - new Date(parsed.date)) / (1000 * 60 * 60 * 24)
  );

  const timeText =
    daysAgo === 0 ? "Today" : `${daysAgo} day${daysAgo > 1 ? "s" : ""} ago`;

  subEl.textContent = `${parsed.farmName} • ${timeText}`;
}