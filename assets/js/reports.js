// assets/js/reports.js
document.addEventListener("DOMContentLoaded", () => {
  // ===============================
  // 🔐 AUTH HELPERS
  // ===============================
  const API_BASE = "http://51.21.180.202:8001";

  function safeJSON(v, fallback) {
    try {
      const parsed = JSON.parse(v);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function getSessionUser() {
    return safeJSON(localStorage.getItem("agrivision_user"), null);
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

  // force login check
  const USER = requireUser();

  // ===============================
  // ✅ TOP RIGHT NAME FIX
  // ===============================
  const profileBtn = document.querySelector(".top-profile");
  const profileNameEl =
    document.getElementById("profileName") ||
    profileBtn?.querySelector(".profile-name") ||
    profileBtn?.querySelector("span");

  if (profileNameEl) {
    profileNameEl.textContent =
      USER.full_name || USER.fullName || USER.name || USER.email || "Profile";
  }

  // ===============================
  // DOM
  // ===============================
  const historyListEl = document.getElementById("reportHistoryList");
  const emptyEl = document.getElementById("reportHistoryEmpty");

  const satHistoryListEl = document.getElementById("satReportHistoryList");
  const satEmptyEl = document.getElementById("satReportHistoryEmpty");

  const profileDropdown = document.getElementById("profileDropdown");
  const logoutBtn = document.getElementById("logoutBtn");

  // jsPDF is loaded as window.jspdf.jsPDF (UMD build)
  const getJsPdf = () => window.jspdf && window.jspdf.jsPDF;

  // ===============================
  // Profile dropdown + logout
  // ===============================
  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("is-hidden");
    });

    profileDropdown.addEventListener("click", (e) => e.stopPropagation());

    document.addEventListener("click", () => {
      profileDropdown.classList.add("is-hidden");
    });
  }

  logoutBtn?.addEventListener("click", () => {
    const ok = confirm("Do you want to log out?");
    if (!ok) return;
    localStorage.removeItem("agrivision_user");
    window.location.href = "login.html";
  });

  // ===============================
  // Utilities
  // ===============================
  const pad2 = (n) => String(n).padStart(2, "0");
  const formatDateTime = (ts) => {
    const d = new Date(ts || Date.now());
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
      d.getDate()
    )} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const cleanText = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

  const normalizePercent = (v) => {
    if (v == null) return null;
    if (typeof v === "string" && v.includes("%")) {
      const n = Number(v.replace("%", "").trim());
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n > 0 && n <= 1) return Math.round(n * 1000) / 10;
    return n;
  };

  const fmt = (v, digits = 2) => {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(digits);
  };

  const riskLabel = (r) => {
    const x = String(r || "").toLowerCase();
    if (x.includes("high")) return "High";
    if (x.includes("med")) return "Medium";
    return "Low";
  };

  const getTimestamp = (rep) =>
    rep.timestamp || rep.ts || rep.createdAt || rep.created_at || Date.now();

  const getDiseaseName = (rep) =>
    rep.diseaseName || rep.disease_name || rep.name || rep.pred_label || rep.label || "Unknown";

  // ===============================
  // ✅ DB FETCH (THIS IS THE FIX)
  // ===============================
  async function dbListDiseaseReports() {
    const res = await fetch(`${API_BASE}/db/history/disease`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load disease history");
    return await res.json(); // [{id,diseaseName,...,createdAt}]
  }

  async function dbListSatelliteReports() {
    const res = await fetch(`${API_BASE}/db/history/satellite`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load satellite history");
    return await res.json(); // [{id,farmName,summary,timeseries,createdAt}]
  }

  // ===============================
  // PDF helpers
  // ===============================
  const addWrappedText = (doc, text, x, y, maxWidth, lineHeight = 6) => {
    const lines = doc.splitTextToSize(cleanText(text), maxWidth);
    lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
    return y + lines.length * lineHeight;
  };

  const makeDoc = () => {
    const JsPDF = getJsPdf();
    if (!JsPDF) {
      alert("jsPDF not loaded. Check the CDN script in reports.html.");
      return null;
    }
    return new JsPDF({ unit: "mm", format: "a4" });
  };

  const downloadDoc = (doc, filename) => doc.save(filename);

  const printDoc = (doc) => {
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
  };

  // ===============================
  // Build PDFs
  // ===============================
  const DISEASE_GUIDE = {
    "bacterial blight": {
      symptoms: "Angular or irregular water-soaked spots, yellow halos, browning leaf tissue, leaf drying, and possible defoliation in severe cases.",
      cause: "A bacterial infection that spreads through infected seed, rain splash, irrigation water, contaminated tools, and crop debris.",
      advice: "Remove severely infected plant material, avoid overhead irrigation, improve field drainage, and use locally recommended copper-based bactericide if infection is spreading.",
      prevention: "Use certified disease-free seed, rotate crops, sanitize tools, avoid working in wet fields, and remove infected crop residue after harvest."
    },

    "curl virus": {
      symptoms: "Upward or downward leaf curling, vein thickening, stunted growth, reduced flowering, and poor boll development.",
      cause: "A viral disease commonly transmitted by whiteflies. It spreads faster when vector pressure is high.",
      advice: "Control whiteflies immediately, remove severely infected plants, monitor nearby plants, and avoid unnecessary pesticide mixing.",
      prevention: "Use resistant varieties, manage weeds, monitor whiteflies early, and apply integrated pest management practices."
    },

    "fusarium wilt": {
      symptoms: "Yellowing, drooping, internal vascular browning, slow wilting, and plant decline even when moisture is available.",
      cause: "A soil-borne fungal disease that enters through roots and blocks water movement inside the plant.",
      advice: "Remove infected plants, improve drainage, avoid overwatering, and avoid replanting cotton repeatedly in infected soil.",
      prevention: "Use resistant varieties, rotate with non-host crops, improve soil health, and avoid waterlogging."
    },

    "leaf redding": {
      symptoms: "Reddish discoloration of leaves, weak crop growth, possible nutrient stress, and uneven leaf color.",
      cause: "Often linked to nutrient imbalance, moisture stress, pest pressure, temperature stress, or crop-stage related stress.",
      advice: "Check soil nutrients, irrigation schedule, and pest presence. Apply balanced fertilizer only after confirming deficiency.",
      prevention: "Maintain balanced nutrition, avoid irrigation stress, monitor pests regularly, and track crop health weekly."
    },

    "leaf reddening": {
      symptoms: "Reddish discoloration of leaves, weak crop growth, possible nutrient stress, and uneven leaf color.",
      cause: "Often linked to nutrient imbalance, moisture stress, pest pressure, temperature stress, or crop-stage related stress.",
      advice: "Check soil nutrients, irrigation schedule, and pest presence. Apply balanced fertilizer only after confirming deficiency.",
      prevention: "Maintain balanced nutrition, avoid irrigation stress, monitor pests regularly, and track crop health weekly."
    },

    "leaf variegation": {
      symptoms: "Patchy yellow-green patterns, uneven pigmentation, pale streaks, mottling, or abnormal leaf coloration.",
      cause: "Can be caused by nutrient imbalance, viral infection, genetic variation, or environmental stress.",
      advice: "Inspect whether symptoms are spreading. Check for pests, compare with nearby plants, and review fertilizer and irrigation patterns.",
      prevention: "Use healthy seed, monitor early symptoms, maintain balanced nutrition, and remove suspicious plants if symptoms spread quickly."
    },

    "herbicide growth damage": {
      symptoms: "Distorted leaf shape, yellowing, burnt patches, curling, stunted growth, and uneven damage across the field.",
      cause: "Usually caused by herbicide drift, overdose, spray overlap, contaminated sprayers, or spraying during unsuitable weather.",
      advice: "Stop further herbicide application, irrigate normally to reduce stress, avoid applying extra chemicals, and monitor recovery for 7 to 14 days.",
      prevention: "Calibrate sprayers, avoid spraying in windy weather, clean equipment properly, follow label dosage, and separate herbicide equipment from nutrient sprays."
    },

    "healthy": {
      symptoms: "No visible disease symptoms were detected in the uploaded image.",
      cause: "The plant appears normal based on the image analysis.",
      advice: "Continue routine monitoring and maintain proper irrigation, nutrition, and pest scouting.",
      prevention: "Inspect crops weekly, keep the field clean, manage pests early, and use disease-free seed."
    }
  };

function getDiseaseGuide(name) {
  const key = String(name || "").toLowerCase();
  return (
    Object.entries(DISEASE_GUIDE).find(([k]) => key.includes(k))?.[1] || {
      symptoms: "Specific symptoms were not available for this class.",
      cause: "The exact cause depends on field conditions and crop stage.",
      advice: "Inspect the field manually, compare with nearby plants, and consult an agronomist if symptoms spread.",
      prevention: "Maintain irrigation balance, monitor pests, and keep field hygiene strong."
    }
  );
}

function satelliteInterpretation(ndvi, ndmi, evi) {
  let health, advice;

  if (ndvi == null || !Number.isFinite(Number(ndvi))) {
    health = "Unknown";
    advice = "NDVI was not available. Run monitoring again with a clear date range.";
  } else if (ndvi >= 0.6) {
    health = "Healthy";
    advice = "Vegetation is strong. Maintain current irrigation and crop management practices.";
  } else if (ndvi >= 0.35) {
    health = "Moderate";
    advice = "Crop condition is fair. Keep monitoring for early signs of stress.";
  } else if (ndvi >= 0.2) {
    health = "Stressed";
    advice = "Vegetation stress is visible. Check irrigation, pests, disease symptoms, and soil nutrition.";
  } else {
    health = "Critical";
    advice = "Very low vegetation signal. Immediate field inspection is recommended.";
  }

  const moisture =
    ndmi == null ? "Moisture status unavailable." :
    ndmi < 0 ? "NDMI suggests possible water stress." :
    ndmi < 0.15 ? "NDMI shows low to moderate moisture." :
    "NDMI suggests acceptable moisture condition.";

  const vigor =
    evi == null ? "EVI status unavailable." :
    evi < 0.2 ? "EVI indicates weak vegetation vigor." :
    evi < 0.5 ? "EVI indicates moderate vegetation vigor." :
    "EVI indicates strong vegetation response.";

  return { health, advice, moisture, vigor };
}

function makeTrendChartImage(timeseries = []) {
  const pts = timeseries
    .filter(p => p?.ndvi !== null && p?.ndvi !== undefined && Number.isFinite(Number(p.ndvi)))
    .slice(-12);

  if (pts.length < 2) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#dddddd";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = 40 + i * 50;
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(860, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#111827";
  ctx.font = "bold 22px Arial";
  ctx.fillText("NDVI Trend", 60, 28);

  const values = pts.map(p => Number(p.ndvi));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  const xFor = i => 60 + (i * 800) / (pts.length - 1);
  const yFor = v => 300 - ((v - min) / range) * 240;

  ctx.strokeStyle = "#1b7f3a";
  ctx.lineWidth = 4;
  ctx.beginPath();

  pts.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(Number(p.ndvi));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  ctx.fillStyle = "#1b7f3a";
  pts.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(Number(p.ndvi));
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#374151";
  ctx.font = "16px Arial";
  ctx.fillText(`Min: ${min.toFixed(2)}   Max: ${max.toFixed(2)}   Latest: ${values[values.length - 1].toFixed(2)}`, 60, 340);

  return canvas.toDataURL("image/png");
}

  const buildSingleDetectionPDF = (rep) => {
    const doc = makeDoc();
    if (!doc) return null;

    const diseaseName = cleanText(getDiseaseName(rep));
    const guide = getDiseaseGuide(diseaseName);
    const confidencePct = normalizePercent(rep.confidence);
    const risk = riskLabel(rep.risk || rep.riskLevel || rep.risk_level);
    const ts = getTimestamp(rep);

    const margin = 14;
    let y = 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – Disease Detection Report", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDateTime(Date.now())}`, margin, y); y += 5;
    doc.text(`Detection time: ${formatDateTime(ts)}`, margin, y); y += 5;
    doc.text(`User: ${cleanText(USER.full_name || USER.email || "User")}`, margin, y); y += 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Diagnosis", margin, y); y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    y = addWrappedText(doc, `Disease: ${diseaseName}`, margin, y, 180);
    y += 2;
    if (confidencePct != null) doc.text(`Model confidence: ${confidencePct.toFixed(1)}%`, margin, y);
    y += 6;
    doc.text(`Risk level: ${risk}`, margin, y);
    y += 8;

    const sections = [
      ["Symptoms", rep.symptoms || guide.symptoms],
      ["Possible Cause", rep.cause || guide.cause],
      ["Recommended Action", rep.advice || rep.recommendation || guide.advice],
      ["Prevention Tips", rep.prevention || guide.prevention],
      ["Note", "This report is AI-assisted and should be used as decision support. Field inspection is recommended before applying treatment."]
    ];

    sections.forEach(([title, body]) => {
      if (y > 260) {
        doc.addPage();
        y = 16;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      y = addWrappedText(doc, body, margin, y, 180, 5);
      y += 5;
    });

    return doc;
  };

  const buildSatelliteRunPDF = async (rep) => {
    const doc = makeDoc();
    if (!doc) return null;

    const margin = 14;
    let y = 16;

    const farm = cleanText(rep.farmName || "Farm");
    const summary = rep.summary || {};
    const ndvi = summary.ndvi ?? summary.mean;
    const ndmi = summary.ndmi;
    const evi = summary.evi;
    const cloud = summary.cloud_cover ?? summary.cloudCover;
    const sceneDate = summary.scene_date ?? summary.sceneDate;
    const interp = satelliteInterpretation(Number(ndvi), Number(ndmi), Number(evi));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – Satellite Run Report", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDateTime(Date.now())}`, margin, y); y += 5;
    doc.text(`Run time: ${formatDateTime(rep.createdAt)}`, margin, y); y += 5;
    doc.text(`User: ${cleanText(USER.full_name || USER.email || "User")}`, margin, y); y += 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Farm: ${farm}`, margin, y);
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`NDVI: ${fmt(ndvi)}   NDMI: ${fmt(ndmi)}   EVI: ${fmt(evi)}`, margin, y);
    y += 6;
    doc.text(`Cloud cover: ${cloud != null ? fmt(cloud) + "%" : "—"}   Scene date: ${sceneDate ? formatDateTime(sceneDate) : "—"}`, margin, y);
    y += 9;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Overall Health Assessment", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    y = addWrappedText(doc, `Status: ${interp.health}`, margin, y, 180, 5);
    y += 3;
    y = addWrappedText(doc, interp.advice, margin, y, 180, 5);
    y += 5;

    doc.setFont("helvetica", "bold");
    doc.text("Index Interpretation", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    y = addWrappedText(doc, `NDVI: Indicates vegetation greenness and crop vigor. Current value is ${fmt(ndvi)}.`, margin, y, 180, 5);
    y += 3;
    y = addWrappedText(doc, `NDMI: ${interp.moisture}`, margin, y, 180, 5);
    y += 3;
    y = addWrappedText(doc, `EVI: ${interp.vigor}`, margin, y, 180, 5);
    y += 7;

    const chartImg = makeTrendChartImage(rep.timeseries || []);
    if (chartImg) {
      if (y > 170) {
        doc.addPage();
        y = 16;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("NDVI Trend Chart", margin, y);
      y += 6;

      doc.addImage(chartImg, "PNG", margin, y, 180, 72);
      y += 80;
    }

    if (y > 230) {
      doc.addPage();
      y = 16;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Recommended Next Steps", margin, y);
    y += 6;

    const nextSteps = [
      "Inspect low-performing areas of the field manually.",
      "Compare satellite insights with visible crop symptoms.",
      "Check irrigation consistency and soil moisture.",
      "Monitor NDVI again after 7 to 14 days.",
      "Use disease detection module if visual symptoms are present."
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    nextSteps.forEach(step => {
      y = addWrappedText(doc, `• ${step}`, margin, y, 180, 5);
      y += 2;
    });

    return doc;
  };

  // ===============================
  // Render lists (DB data)
  // ===============================
  let diseaseCache = [];
  let satelliteCache = [];

  function renderDiseaseHistory(reps) {
    const sorted = [...reps].sort((a, b) => new Date(getTimestamp(b)) - new Date(getTimestamp(a)));

    if (!historyListEl || !emptyEl) return;
    historyListEl.innerHTML = "";

    if (!sorted.length) {
      emptyEl.classList.remove("is-hidden");
      return;
    }
    emptyEl.classList.add("is-hidden");

    sorted.slice(0, 30).forEach((rep, idx) => {
      const disease = cleanText(getDiseaseName(rep));
      const ts = formatDateTime(getTimestamp(rep));
      const risk = riskLabel(rep.risk || rep.riskLevel || rep.risk_level);

      const row = document.createElement("div");
      row.className = "rep-item";
      row.innerHTML = `
        <div class="rep-item-left">
          <div class="rep-item-text">
            <div class="rep-item-title">${disease}</div>
            <div class="rep-item-sub">${ts} • Risk: ${risk}</div>
          </div>
        </div>
        <div class="rep-item-right">
          <div class="rep-format">PDF</div>
          <button class="rep-edit-btn" type="button" data-action="download" data-idx="${idx}">Download</button>
          <button class="rep-edit-btn" type="button" data-action="print" data-idx="${idx}">Print</button>
        </div>
      `;
      historyListEl.appendChild(row);
    });

    diseaseCache = sorted;
  }

  function renderSatHistory(reps) {
    const sorted = [...reps].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });

    if (!satHistoryListEl || !satEmptyEl) return;
    satHistoryListEl.innerHTML = "";

    if (!sorted.length) {
      satEmptyEl.classList.remove("is-hidden");
      return;
    }
    satEmptyEl.classList.add("is-hidden");

    sorted.slice(0, 30).forEach((rep, idx) => {
      const farm = cleanText(rep.farmName || "Farm");
      const date = String(rep.createdAt || "").slice(0, 10);

      const ndvi = rep.summary?.ndvi ?? rep.summary?.mean;
      const ndmi = rep.summary?.ndmi;
      const evi = rep.summary?.evi;

      const row = document.createElement("div");
      row.className = "rep-item";
      row.innerHTML = `
        <div class="rep-item-left">
          <div class="rep-item-text">
            <div class="rep-item-title">${farm}</div>
            <div class="rep-item-sub">${date} • NDVI ${fmt(ndvi)} / NDMI ${fmt(ndmi)} / EVI ${fmt(evi)}</div>
          </div>
        </div>
        <div class="rep-item-right">
          <div class="rep-format">PDF</div>
          <button class="rep-edit-btn" type="button" data-action="download" data-idx="${idx}">Download</button>
          <button class="rep-edit-btn" type="button" data-action="print" data-idx="${idx}">Print</button>
        </div>
      `;
      satHistoryListEl.appendChild(row);
    });

    satelliteCache = sorted;
  }

  // ===============================
  // Delegated click handlers
  // ===============================
  historyListEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const idx = Number(btn.getAttribute("data-idx"));
    const rep = diseaseCache[idx];
    if (!rep) return;

    const disease = cleanText(getDiseaseName(rep)).replace(/\s+/g, "_");
    const filename = `AgriVision_${disease}_${new Date(getTimestamp(rep)).toISOString().slice(0, 10)}.pdf`;

    const doc = buildSingleDetectionPDF(rep);
    if (!doc) return;

    if (action === "download") downloadDoc(doc, filename);
    if (action === "print") printDoc(doc);
  });

  satHistoryListEl?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const idx = Number(btn.getAttribute("data-idx"));
    const rep = satelliteCache[idx];
    if (!rep) return;

    const farm = cleanText(rep.farmName || "Farm").replace(/\s+/g, "_");
    const day = String(rep.createdAt || new Date().toISOString()).slice(0, 10);
    const filename = `AgriVision_Satellite_${farm}_${day}.pdf`;

    const doc = await buildSatelliteRunPDF(rep);
    if (!doc) return;

    if (action === "download") downloadDoc(doc, filename);
    if (action === "print") printDoc(doc);
  });

  function buildCropHealthSummaryPDF() {
    const doc = makeDoc();
    if (!doc) return null;

    let y = 16;
    const margin = 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – Crop Health Summary", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDateTime(Date.now())}`, margin, y); y += 5;
    doc.text(`User: ${cleanText(USER.full_name || USER.email || "User")}`, margin, y); y += 9;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Summary Overview", margin, y);
    y += 6;

    const diseaseCount = diseaseCache.length;
    const satelliteCount = satelliteCache.length;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    y = addWrappedText(doc, `Total disease detections: ${diseaseCount}`, margin, y, 180, 5);
    y = addWrappedText(doc, `Total satellite monitoring runs: ${satelliteCount}`, margin, y + 2, 180, 5);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.text("Recent Disease Detections", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    diseaseCache.slice(0, 5).forEach(rep => {
      const disease = cleanText(getDiseaseName(rep));
      const risk = riskLabel(rep.risk || rep.riskLevel || rep.risk_level);
      y = addWrappedText(doc, `• ${disease} | Risk: ${risk} | ${formatDateTime(getTimestamp(rep))}`, margin, y, 180, 5);
      y += 2;
    });

    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text("Recent Satellite Insights", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    satelliteCache.slice(0, 5).forEach(rep => {
      const ndvi = rep.summary?.ndvi ?? rep.summary?.mean;
      const ndmi = rep.summary?.ndmi;
      const evi = rep.summary?.evi;
      y = addWrappedText(doc, `• ${rep.farmName || "Farm"} | NDVI: ${fmt(ndvi)} | NDMI: ${fmt(ndmi)} | EVI: ${fmt(evi)}`, margin, y, 180, 5);
      y += 2;
    });

    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text("Overall Recommendation", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    y = addWrappedText(
      doc,
      "Continue combining image-based disease detection with satellite monitoring. Disease reports help identify visible leaf problems, while NDVI/NDMI/EVI trends help detect field-level stress over time.",
      margin,
      y,
      180,
      5
    );

    return doc;
  }

  function buildSatelliteSummaryPDF() {
    if (!satelliteCache.length) {
      alert("No satellite reports available yet.");
      return null;
    }

    return buildSatelliteRunPDF(satelliteCache[0]);
  }

  function buildAIModelReportPDF() {
    const doc = makeDoc();
    if (!doc) return null;

    let y = 16;
    const margin = 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – AI Model Report", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDateTime(Date.now())}`, margin, y); y += 5;
    doc.text(`User: ${cleanText(USER.full_name || USER.email || "User")}`, margin, y); y += 9;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Model Purpose", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    y = addWrappedText(
      doc,
      "The AgriVision AI model analyzes uploaded cotton leaf images and predicts possible crop conditions using image-based classification. The output supports early diagnosis and decision-making.",
      margin,
      y,
      180,
      5
    );
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.text("Recent Predictions", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    diseaseCache.slice(0, 8).forEach(rep => {
      const disease = cleanText(getDiseaseName(rep));
      const conf = normalizePercent(rep.confidence);
      y = addWrappedText(
        doc,
        `• ${disease} | Confidence: ${conf != null ? conf.toFixed(1) + "%" : "—"} | ${formatDateTime(getTimestamp(rep))}`,
        margin,
        y,
        180,
        5
      );
      y += 2;
    });

    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text("Interpretation Note", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    y = addWrappedText(
      doc,
      "Higher confidence means the model is more certain about the detected class, but the result should still be verified through field inspection. The model is intended as decision support, not a replacement for expert diagnosis.",
      margin,
      y,
      180,
      5
    );

    return doc;
  }

  document.querySelectorAll(".rep-gen-btn").forEach((btn, index) => {
    btn.addEventListener("click", async () => {
      let doc = null;
      let filename = "AgriVision_Report.pdf";

      if (index === 0) {
        doc = buildCropHealthSummaryPDF();
        filename = "AgriVision_Crop_Health_Summary.pdf";
      }

      if (index === 1) {
        doc = await buildSatelliteSummaryPDF();
        filename = "AgriVision_Satellite_Insights_Report.pdf";
      }

      if (index === 2) {
        doc = buildAIModelReportPDF();
        filename = "AgriVision_AI_Model_Report.pdf";
      }

      if (doc) downloadDoc(doc, filename);
    });
  });

  // ===============================
  // Init (LOAD FROM DB)
  // ===============================
  (async function init() {
    try {
      const [diseaseRows, satRows] = await Promise.all([
        dbListDiseaseReports(),
        dbListSatelliteReports(),
      ]);

      renderDiseaseHistory(diseaseRows);
      renderSatHistory(satRows);
    } catch (err) {
      console.error(err);

      // show empty states
      if (emptyEl) emptyEl.classList.remove("is-hidden");
      if (satEmptyEl) satEmptyEl.classList.remove("is-hidden");

      alert(err?.message || "Failed to load reports. Check backend and headers.");
    }
  })();
});