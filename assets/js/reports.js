// assets/js/reports.js
document.addEventListener("DOMContentLoaded", () => {
  // -----------------------
  // Config / Keys
  // -----------------------
  const STORAGE_KEY_REPORTS = "agrivision_reports"; // disease reports
  const USER_KEY = "agrivision_user";
  const STORAGE_KEY_SCANS = "agrivision_scans"; // all scans (healthy + diseased)

  // IMPORTANT:
  // Use BOTH keys for backward compatibility:
  // - old: agrivision_satellite_reports
  // - new: agrivision_satellite_runs (recommended from farm-monitor.js)
  const STORAGE_KEY_SAT_REPORTS_OLD = "agrivision_satellite_reports";
  const STORAGE_KEY_SAT_RUNS_NEW = "agrivision_satellite_runs";

  const historyListEl = document.getElementById("reportHistoryList");
  const emptyEl = document.getElementById("reportHistoryEmpty");

  const satHistoryListEl = document.getElementById("satReportHistoryList");
  const satEmptyEl = document.getElementById("satReportHistoryEmpty");

  // jsPDF is loaded as window.jspdf.jsPDF (UMD build)
  const getJsPdf = () => window.jspdf && window.jspdf.jsPDF;

  // -----------------------
  // Utilities
  // -----------------------
  const safeJSON = (v, fallback) => {
    try {
      const parsed = JSON.parse(v);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  };

  const getUser = () => {
    const raw = localStorage.getItem(USER_KEY);
    return safeJSON(raw, null);
  };

  const getReports = () => {
    const raw = localStorage.getItem(STORAGE_KEY_REPORTS);
    const arr = safeJSON(raw, []);
    return Array.isArray(arr) ? arr : [];
  };

  const getScans = () => {
    const raw = localStorage.getItem(STORAGE_KEY_SCANS);
    const arr = safeJSON(raw, []);
    return Array.isArray(arr) ? arr : [];
  };

  // ✅ Satellite runs (new + old)
  const getSatReports = () => {
    const rawNew = localStorage.getItem(STORAGE_KEY_SAT_RUNS_NEW);
    const arrNew = safeJSON(rawNew, []);
    const rawOld = localStorage.getItem(STORAGE_KEY_SAT_REPORTS_OLD);
    const arrOld = safeJSON(rawOld, []);

    const merged = [
      ...(Array.isArray(arrNew) ? arrNew : []),
      ...(Array.isArray(arrOld) ? arrOld : []),
    ];

    // de-dupe by id if possible
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
    return out;
  };

  // ===== Profile / Logout (shared) =====
  const profileBtn = document.querySelector(".top-profile");
  const profileDropdown = document.getElementById("profileDropdown");
  const logoutBtn = document.getElementById("logoutBtn");

  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("is-hidden");
    });

    profileDropdown?.addEventListener("click", (e) => e.stopPropagation());

    document.addEventListener("click", () => {
      profileDropdown.classList.add("is-hidden");
    });
  }

  // Logout
  logoutBtn?.addEventListener("click", () => {
    const ok = confirm("Do you want to log out?");
    if (!ok) return;

    // Clear session user ONLY
    localStorage.removeItem("agrivision_user");

    // ❗ DO NOT clear reports or scan counts (demo continuity)
    window.location.href = "login.html";
  });

  const pad2 = (n) => String(n).padStart(2, "0");
  const formatDateTime = (ts) => {
    const d = new Date(ts || Date.now());
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
      d.getDate()
    )} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const cleanText = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

  const normalizePercent = (v) => {
    // accepts 0.82, "82%", "82.0"
    if (v == null) return null;
    if (typeof v === "string" && v.includes("%")) {
      const n = Number(v.replace("%", "").trim());
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    // if 0..1 convert
    if (n > 0 && n <= 1) return Math.round(n * 1000) / 10;
    return n; // already percent
  };

  const riskLabel = (r) => {
    const x = String(r || "").toLowerCase();
    if (x.includes("high")) return "High";
    if (x.includes("med")) return "Medium";
    return "Low";
  };

  const getDiseaseKey = (rep) =>
    rep.labelKey ||
    rep.label_key ||
    rep.label ||
    rep.pred_label ||
    rep.diseaseKey ||
    rep.disease_key ||
    "unknown";

  const getDiseaseName = (rep) =>
    rep.diseaseName ||
    rep.disease_name ||
    rep.name ||
    rep.pred_label ||
    rep.label ||
    "Unknown";

  const getTimestamp = (rep) =>
    rep.timestamp || rep.ts || rep.createdAt || rep.created_at || Date.now();

  const fmt = (v, digits = 2) => {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(digits);
  };

  // -----------------------
  // PDF helpers (simple clean layout)
  // -----------------------
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

  const downloadDoc = (doc, filename) => {
    doc.save(filename);
  };

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

  // -----------------------
  // Chart -> Image helper (needs Chart.js CDN in reports.html)
  // -----------------------
  const makeLineChartImage = async ({ labels, series, title }) => {
    if (!window.Chart) {
      console.warn("Chart.js not loaded; skipping charts.");
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: title,
            data: series,
            spanGaps: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: { y: { suggestedMin: -0.5, suggestedMax: 2 } },
      },
    });

    chart.update();
    const img = canvas.toDataURL("image/jpeg", 0.88);
    chart.destroy();
    return img;
  };

  // -----------------------
  // Build PDFs
  // -----------------------
  const buildSingleDetectionPDF = (rep) => {
    const doc = makeDoc();
    if (!doc) return null;

    const user = getUser();
    const diseaseName = cleanText(getDiseaseName(rep));

    const confidencePct = normalizePercent(
      rep.confidencePct ?? rep.confidence ?? rep.confidence_pct
    );
    const qualityPct = normalizePercent(
      rep.qualityPct ?? rep.quality_pct ?? rep.photoQuality
    );
    const agreementPct = normalizePercent(
      rep.agreementPct ?? rep.agreement_pct ?? rep.agreement
    );

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
      `User: ${cleanText(user?.name || user?.username || "Administrator")}`,
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

    if (confidencePct != null)
      doc.text(`Model confidence: ${confidencePct.toFixed(1)}%`, margin, y);
    y += 6;

    doc.text(`Risk level: ${risk}`, margin, y);
    y += 8;

    // ---------- Scan Image ----------
    const img = rep.imageDataUrl || rep.thumbnail;
    if (img) {
      try {
        doc.addImage(img, "JPEG", margin, y, 60, 60);
        y += 66;
      } catch (e) {
        console.warn("Could not add image to PDF", e);
      }
    }

    // Risk bullets
    const bullets = Array.isArray(rep.riskBullets || rep.bullets)
      ? rep.riskBullets || rep.bullets
      : [];

    if (bullets.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Risk Alerts", margin, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      bullets.slice(0, 4).forEach((b) => {
        y = addWrappedText(doc, `• ${b}`, margin, y, 180, 5);
      });
      y += 6;
    }

    // Disease info blocks
    const symptoms = rep.symptoms || rep.diseaseSymptoms;
    const cause = rep.cause || rep.diseaseCause;
    const prevention = rep.prevention || rep.diseasePrevention;

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

    // Footer small metrics
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Quality Metrics", margin, 285);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Confidence: ${confidencePct != null ? confidencePct.toFixed(1) + "%" : "—"}   •   Photo quality: ${
        qualityPct != null ? qualityPct.toFixed(1) + "%" : "—"
      }   •   Agreement: ${agreementPct != null ? agreementPct.toFixed(1) + "%" : "—"}`,
      margin,
      292
    );

    return doc;
  };

  const buildCropHealthSummaryPDF = () => {
    const doc = makeDoc();
    if (!doc) return null;

    const user = getUser();
    const scans = getScans();

    const margin = 14;
    let y = 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – Crop Health Summary", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDateTime(Date.now())}`, margin, y);
    y += 5;
    doc.text(
      `User: ${cleanText(user?.name || user?.username || "Administrator")}`,
      margin,
      y
    );
    y += 10;

    const diseased = scans.filter((s) => {
      const key = String(s?.diseaseKey || s?.labelKey || s?.pred_label || "")
        .toLowerCase()
        .trim();
      return key && key !== "healthy_leaf" && key !== "healthy";
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("This Month Overview (from detections)", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Total scans: ${scans.length}`, margin, y);
    y += 5;
    doc.text(`Diseased detections: ${diseased.length}`, margin, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.text("Notes", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    y = addWrappedText(
      doc,
      "This summary is generated from recent AI detections on uploaded leaf images. For full field health, combine with satellite indices and on-ground scouting.",
      margin,
      y,
      180,
      5
    );

    return doc;
  };

  const buildAIModelReportPDF = () => {
    const doc = makeDoc();
    if (!doc) return null;

    const margin = 14;
    let y = 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – AI Model Report", margin, y);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    y = addWrappedText(
      doc,
      "This section can include model training stats, dataset size, class distribution, and Grad-CAM explainability visuals. (Placeholder for now.)",
      margin,
      y,
      180,
      6
    );

    return doc;
  };

  // ✅ FIXED: Satellite Insights now includes NDVI + NDMI + EVI trends
  const buildSatelliteInsightsPDF = async () => {
    const doc = makeDoc();
    if (!doc) return null;

    const margin = 14;
    let y = 16;

    const runs = getSatReports();
    const user = getUser();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – Satellite Insights Report", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDateTime(Date.now())}`, margin, y);
    y += 5;
    doc.text(
      `User: ${cleanText(user?.name || user?.username || "Administrator")}`,
      margin,
      y
    );
    y += 10;

    if (!runs.length) {
      doc.setFontSize(12);
      doc.text(
        "No satellite runs found. Go to Farm Monitoring and click Update Now first.",
        margin,
        y
      );
      return doc;
    }

    // Latest per farm
    const latestByFarm = {};
    runs.forEach((r) => {
      const fid = r.farmId || r.farm_id || r.farm || null;
      if (!fid) return;
      const cur = latestByFarm[fid];
      const t = new Date(r.createdAt || r.timestamp || r.ts || 0).getTime();
      const tc = cur
        ? new Date(cur.createdAt || cur.timestamp || cur.ts || 0).getTime()
        : -1;
      if (!cur || t > tc) latestByFarm[fid] = r;
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Latest Status by Farm", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    Object.values(latestByFarm)
      .slice(0, 12)
      .forEach((r) => {
        const farm = cleanText(r.farmName || "Farm");
        const ndvi = r.summary?.ndvi ?? r.summary?.mean;
        const ndmi = r.summary?.ndmi;
        const evi = r.summary?.evi;
        const label = cleanText(r.health?.label || "—");
        const date = String(r.createdAt || r.timestamp || r.ts || "").slice(0, 10);
        doc.text(
          `• ${farm} (${date}) — ${label} — NDVI ${fmt(ndvi)} / NDMI ${fmt(
            ndmi
          )} / EVI ${fmt(evi)}`,
          margin,
          y
        );
        y += 5;
        if (y > 270) {
          doc.addPage();
          y = 16;
        }
      });

    // Overall trends across all runs (by run date)
    const sorted = [...runs].sort((a, b) => {
      const ta = new Date(a.createdAt || a.timestamp || a.ts || 0).getTime();
      const tb = new Date(b.createdAt || b.timestamp || b.ts || 0).getTime();
      return ta - tb;
    });

    const labels = sorted.map((r) =>
      String(r.createdAt || r.timestamp || r.ts || "").slice(0, 10)
    );

    const ndviSeries = sorted.map((r) => {
      const v = r.summary?.ndvi ?? r.summary?.mean;
      return v == null ? null : Number(v);
    });

    const ndmiSeries = sorted.map((r) => {
      const v = r.summary?.ndmi;
      return v == null ? null : Number(v);
    });

    const eviSeries = sorted.map((r) => {
      const v = r.summary?.evi;
      return v == null ? null : Number(v);
    });

    const addTrendChart = async (title, series) => {
      if (!labels.length) return;
      if (y > 210) {
        doc.addPage();
        y = 16;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, y);
      y += 6;

      const img = await makeLineChartImage({
        labels,
        series,
        title,
      });

      if (img) {
        try {
          doc.addImage(img, "JPEG", margin, y, 182, 72);
          y += 78;
        } catch (e) {
          console.warn("Could not add chart image", e);
        }
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("Chart unavailable (Chart.js missing).", margin, y);
        y += 8;
      }
    };

    await addTrendChart("Overall NDVI Trend (all runs)", ndviSeries);
    await addTrendChart("Overall NDMI Trend (all runs)", ndmiSeries);
    await addTrendChart("Overall EVI Trend (all runs)", eviSeries);

    return doc;
  };

  // -----------------------
  // Render History Lists
  // -----------------------
  const renderDiseaseHistory = () => {
    const reps = getReports().sort(
      (a, b) => new Date(getTimestamp(b)) - new Date(getTimestamp(a))
    );

    if (!historyListEl || !emptyEl) return;

    historyListEl.innerHTML = "";

    if (!reps.length) {
      emptyEl.classList.remove("is-hidden");
      return;
    }
    emptyEl.classList.add("is-hidden");

    reps.slice(0, 30).forEach((rep, idx) => {
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
  };

  const renderSatHistory = () => {
    const reps = getSatReports().sort((a, b) => {
      const ta = new Date(a.createdAt || a.timestamp || a.ts || 0).getTime();
      const tb = new Date(b.createdAt || b.timestamp || b.ts || 0).getTime();
      return tb - ta;
    });

    if (!satHistoryListEl || !satEmptyEl) return;

    satHistoryListEl.innerHTML = "";

    if (!reps.length) {
      satEmptyEl.classList.remove("is-hidden");
      return;
    }
    satEmptyEl.classList.add("is-hidden");

    reps.slice(0, 30).forEach((rep, idx) => {
      const farm = cleanText(rep.farmName || "Farm");
      const date = String(rep.createdAt || rep.timestamp || rep.ts || "").slice(0, 10);
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
  };

  // -----------------------
  // Build Satellite Run PDF (single run)
  // -----------------------
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
    doc.text(`Run time: ${formatDateTime(rep.createdAt || rep.timestamp || rep.ts)}`, margin, y);
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

    // Trend chart if timeseries exists
    const rows = Array.isArray(rep.timeseries) ? rep.timeseries : [];
    const labels = rows.map((r) => String(r.date || r.ts || "").slice(0, 10));
    const ndviSeries = rows.map((r) => (r.ndvi == null ? null : Number(r.ndvi)));
    const ndmiSeries = rows.map((r) => (r.ndmi == null ? null : Number(r.ndmi)));
    const eviSeries = rows.map((r) => (r.evi == null ? null : Number(r.evi)));

    const addSeries = async (title, series) => {
      if (!labels.length) return;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, y);
      y += 6;

      const img = await makeLineChartImage({ labels, series, title });
      if (img) {
        doc.addImage(img, "JPEG", margin, y, 182, 72);
        y += 78;
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("Chart unavailable (Chart.js missing).", margin, y);
        y += 8;
      }
    };

    await addSeries("NDVI Trend", ndviSeries);
    await addSeries("NDMI Trend", ndmiSeries);
    await addSeries("EVI Trend", eviSeries);

    return doc;
  };

  // -----------------------
  // Delegated click handlers
  // -----------------------
  // Delegate clicks for Satellite Download/Print
  satHistoryListEl?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const idx = Number(btn.getAttribute("data-idx"));

    const sorted = [...getSatReports()].sort((a, b) => {
      const ta = new Date(a.createdAt || a.timestamp || a.ts || 0).getTime();
      const tb = new Date(b.createdAt || b.timestamp || b.ts || 0).getTime();
      return tb - ta;
    });

    const rep = sorted[idx];
    if (!rep) return;

    const farm = cleanText(rep.farmName || "Farm").replace(/\s+/g, "_");
    const end = cleanText(rep.end_date || new Date().toISOString().slice(0, 10));
    const filename = `AgriVision_Satellite_${farm}_${end}.pdf`;

    const doc = await buildSatelliteRunPDF(rep);
    if (!doc) return;

    if (action === "download") downloadDoc(doc, filename);
    if (action === "print") printDoc(doc);
  });

  // Delegate clicks for Disease Download/Print
  historyListEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const idx = Number(btn.getAttribute("data-idx"));

    const sorted = [...getReports()].sort(
      (a, b) => new Date(getTimestamp(b)) - new Date(getTimestamp(a))
    );
    const rep = sorted[idx];
    if (!rep) return;

    const disease = cleanText(getDiseaseName(rep)).replace(/\s+/g, "_");
    const filename = `AgriVision_${disease}_${new Date(getTimestamp(rep))
      .toISOString()
      .slice(0, 10)}.pdf`;

    const doc = buildSingleDetectionPDF(rep);
    if (!doc) return;

    if (action === "download") downloadDoc(doc, filename);
    if (action === "print") printDoc(doc);
  });

  // -----------------------
  // Top 3 Generate Buttons
  // -----------------------
  const findTopButton = (titleText) => {
    const cards = document.querySelectorAll(".rep-gen-card");
    for (const c of cards) {
      const t = c.querySelector(".rep-gen-title")?.textContent?.trim() || "";
      if (t.toLowerCase() === titleText.toLowerCase()) {
        return c.querySelector(".rep-gen-btn");
      }
    }
    return null;
  };

  const cropBtn = findTopButton("Crop Health Summary");
  const satBtn = findTopButton("Satellite Insights Report");
  const aiBtn = findTopButton("AI Model Report");

  cropBtn?.addEventListener("click", () => {
    const doc = buildCropHealthSummaryPDF();
    if (!doc) return;
    downloadDoc(
      doc,
      `AgriVision_Crop_Health_Summary_${new Date().toISOString().slice(0, 10)}.pdf`
    );
  });

  satBtn?.addEventListener("click", async () => {
    const doc = await buildSatelliteInsightsPDF();
    if (!doc) return;
    downloadDoc(
      doc,
      `AgriVision_Satellite_Insights_${new Date().toISOString().slice(0, 10)}.pdf`
    );
  });

  aiBtn?.addEventListener("click", () => {
    const doc = buildAIModelReportPDF();
    if (!doc) return;
    downloadDoc(
      doc,
      `AgriVision_AI_Model_Report_${new Date().toISOString().slice(0, 10)}.pdf`
    );
  });

  // -----------------------
  // Init render
  // -----------------------
  renderDiseaseHistory();
  renderSatHistory();
});