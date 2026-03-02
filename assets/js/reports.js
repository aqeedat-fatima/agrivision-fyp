// assets/js/reports.js
document.addEventListener("DOMContentLoaded", () => {
  // ===============================
  // 🔐 AUTH HELPERS
  // ===============================
  const API_BASE = "http://localhost:8001";

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
  const buildSingleDetectionPDF = (rep) => {
    const doc = makeDoc();
    if (!doc) return null;

    const diseaseName = cleanText(getDiseaseName(rep));
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
    doc.text(`Generated: ${formatDateTime(Date.now())}`, margin, y);
    y += 5;
    doc.text(`Detection time: ${formatDateTime(ts)}`, margin, y);
    y += 5;
    doc.text(
      `User: ${cleanText(USER.full_name || USER.email || "User")}`,
      margin,
      y
    );
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Diagnosis", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    y = addWrappedText(doc, `Disease: ${diseaseName}`, margin, y, 180);
    y += 2;

    if (confidencePct != null) doc.text(`Model confidence: ${confidencePct.toFixed(1)}%`, margin, y);
    y += 6;

    doc.text(`Risk level: ${risk}`, margin, y);
    y += 8;

    // DB stores imagePath but you are NOT serving /uploads publicly
    // so we skip embedding image in PDF for now.

    const symptoms = rep.symptoms;
    const cause = rep.cause;
    const prevention = rep.prevention;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Disease Information", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    if (symptoms) {
      doc.setFont("helvetica", "bold");
      doc.text("Symptoms", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      y = addWrappedText(doc, symptoms, margin, y, 180, 5);
      y += 5;
    }

    if (cause) {
      doc.setFont("helvetica", "bold");
      doc.text("Cause", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      y = addWrappedText(doc, cause, margin, y, 180, 5);
      y += 5;
    }

    if (prevention) {
      doc.setFont("helvetica", "bold");
      doc.text("Prevention", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      y = addWrappedText(doc, prevention, margin, y, 180, 5);
      y += 5;
    }

    return doc;
  };

  const buildSatelliteRunPDF = async (rep) => {
    const doc = makeDoc();
    if (!doc) return null;

    const margin = 14;
    let y = 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – Satellite Run Report", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDateTime(Date.now())}`, margin, y);
    y += 5;
    doc.text(`Run time: ${formatDateTime(rep.createdAt)}`, margin, y);
    y += 8;

    const farm = cleanText(rep.farmName || "Farm");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Farm: ${farm}`, margin, y);
    y += 7;

    const ndvi = rep.summary?.ndvi ?? rep.summary?.mean;
    const ndmi = rep.summary?.ndmi;
    const evi = rep.summary?.evi;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`NDVI: ${fmt(ndvi)}   NDMI: ${fmt(ndmi)}   EVI: ${fmt(evi)}`, margin, y);
    y += 10;

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