// assets/js/reports.js
document.addEventListener("DOMContentLoaded", () => {
  // -----------------------
  // Config / Keys
  // -----------------------
  const STORAGE_KEY_REPORTS = "agrivision_reports"; // must match what dashboard saves
  const USER_KEY = "agrivision_user";
  const STORAGE_KEY_SCANS = "agrivision_scans"; // ✅ all scans including healthy


  const historyListEl = document.getElementById("reportHistoryList");
  const emptyEl = document.getElementById("reportHistoryEmpty");

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



  const saveReports = (arr) => {
    localStorage.setItem(
      STORAGE_KEY_REPORTS,
      JSON.stringify(Array.isArray(arr) ? arr : [])
    );
  };

  const pad2 = (n) => String(n).padStart(2, "0");
  const formatDateTime = (ts) => {
    const d = new Date(ts || Date.now());
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
      d.getHours()
    )}:${pad2(d.getMinutes())}`;
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
    const qualityPct = normalizePercent(rep.qualityPct ?? rep.quality_pct ?? rep.photoQuality);
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

    if (confidencePct != null) doc.text(`Model confidence: ${confidencePct.toFixed(1)}%`, margin, y);
    y += 6;

    doc.text(`Risk level: ${risk}`, margin, y);
    y += 8;

    // ---------- Scan Image ----------
    const img = rep.imageDataUrl || rep.thumbnail;
    if (img) {
      try {
        // keep it modest so it doesn't overflow page
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

      if (Array.isArray(prevention)) {
        prevention.slice(0, 6).forEach((p) => {
          y = addWrappedText(doc, `• ${p}`, margin, y, 180, 5);
        });
      } else {
        y = addWrappedText(doc, prevention, margin, y, 180, 5);
      }
      y += 5;
    }

    // Model stats
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Model Stats", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Photo quality: ${qualityPct != null ? `${qualityPct.toFixed(0)}%` : "—"}`, margin, y);
    y += 5;
    doc.text(`Agreement: ${agreementPct != null ? `${agreementPct.toFixed(0)}%` : "—"}`, margin, y);

    doc.setFontSize(9);
    doc.text(
      "Disclaimer: This is an AI-assisted prediction. Confirm with field scouting or an agronomist before taking action.",
      margin,
      285
    );

    return doc;
  };

  const buildCropHealthSummaryPDF = () => {
    const doc = makeDoc();
    if (!doc) return null;

    const reports = getReports();
    const user = getUser();

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
    doc.text(`User: ${cleanText(user?.name || user?.username || "Administrator")}`, margin, y);
    y += 8;

    if (!scans.length) {
      doc.setFontSize(12);
      doc.text("No reports yet. Run disease detection to generate history.", margin, y);
      return doc;
    }

    const totalScans = reports.length;
    const diseaseScans = reports.filter(
      (r) => String(getDiseaseKey(r)).toLowerCase() !== "healthy_leaf"
    ).length;

    const byDisease = {};
    reports.forEach((r) => {
      const key = String(getDiseaseKey(r)).toLowerCase();
      const name = cleanText(getDiseaseName(r));
      const k = key === "healthy_leaf" ? "Healthy" : name;
      byDisease[k] = (byDisease[k] || 0) + 1;
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Summary", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Total scans: ${totalScans}`, margin, y); y += 6;
    doc.text(`Diseases detected (non-healthy): ${diseaseScans}`, margin, y); y += 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Detections by Type", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    Object.entries(byDisease)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([name, count]) => {
        doc.text(`• ${name}: ${count}`, margin, y);
        y += 5;
      });

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Recent Detections", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const recent = [...reports]
      .sort((a, b) => (new Date(getTimestamp(b))) - (new Date(getTimestamp(a))))
      .slice(0, 10);

    recent.forEach((r) => {
      const ts = formatDateTime(getTimestamp(r));
      const name = cleanText(getDiseaseName(r));
      const conf = normalizePercent(r.confidencePct ?? r.confidence);
      const risk = riskLabel(r.risk || r.riskLevel);

      y = addWrappedText(
        doc,
        `${ts} — ${name} — ${conf != null ? conf.toFixed(1) + "%" : "—%"} — ${risk} risk`,
        margin,
        y,
        180,
        5
      );
      y += 2;

      if (y > 270) {
        doc.addPage();
        y = 16;
      }
    });

    return doc;
  };

  const buildSatelliteInsightsPDF = () => {
    const doc = makeDoc();
    if (!doc) return null;

    const margin = 14;
    let y = 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – Satellite Insights Report", margin, y);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    y = addWrappedText(
      doc,
      "Satellite Insights is a placeholder in this demo. Once NDVI/NDWI/SAVI data is connected, this report will include time-series graphs and zone-wise vegetation health analytics.",
      margin,
      y,
      180,
      6
    );

    y += 10;
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDateTime(Date.now())}`, margin, y);

    return doc;
  };

  const buildAIModelReportPDF = () => {
    const doc = makeDoc();
    if (!doc) return null;

    const reports = getReports(); // disease-only reports
    const scans = getScans();     // ✅ ALL scans (healthy + diseased)
    const user = getUser();

    const margin = 14;
    let y = 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AgriVision – AI Model Report", margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDateTime(Date.now())}`, margin, y);
    y += 5;
    doc.text(`User: ${cleanText(user?.name || user?.username || "Administrator")}`, margin, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Model Summary", margin, y);
    y += 6;

    const modelSummaryText =
      "The AgriVision disease detection system is built using a Convolutional Neural Network (CNN) trained on a curated dataset of cotton leaf images representing both healthy plants and multiple disease conditions. The training data includes real field images captured under varying lighting, backgrounds, and growth stages, allowing the model to learn robust visual patterns such as color changes, texture irregularities, vein distortion, and lesion formation. During inference, an uploaded leaf image is first pre-processed through resizing and normalization before being passed into the trained model, which outputs the most probable disease class along with a confidence score. To improve reliability and practical usability, AgriVision combines the model’s confidence with image quality analysis and prediction agreement metrics, enabling the system to generate risk-aware insights and actionable recommendations rather than a single raw prediction.";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    y = addWrappedText(doc, modelSummaryText, margin, y, 180, 5);
    y += 6;

    if (!reports.length) {
      doc.setFontSize(11);
      doc.text("No detection history found. Run detections to generate model analytics.", margin, y);
      return doc;
    }

    // Compute stats from history
    const total = scans.length;
    const nonHealthy = reports.length; // because reports already excludes healthy


    const avg = (arr) => {
      const nums = arr.filter((x) => Number.isFinite(x));
      if (!nums.length) return null;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    };

    const confs = reports
      .map((r) => normalizePercent(r.confidencePct ?? r.confidence))
      .filter((x) => x != null);

    const quals = reports
      .map((r) => normalizePercent(r.qualityPct ?? r.photoQuality))
      .filter((x) => x != null);

    const agrees = reports
      .map((r) => normalizePercent(r.agreementPct ?? r.agreement))
      .filter((x) => x != null);

    const avgConf = avg(confs);
    const avgQual = avg(quals);
    const avgAgree = avg(agrees);

    const counts = {};
    reports.forEach((r) => {
      const name = cleanText(getDiseaseName(r));
      counts[name] = (counts[name] || 0) + 1;
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Session Analytics", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Total scans: ${total}`, margin, y); y += 5;
    doc.text(`Non-healthy detections: ${nonHealthy}`, margin, y); y += 5;
    doc.text(`Avg confidence: ${avgConf != null ? avgConf.toFixed(1) + "%" : "—"}`, margin, y); y += 5;
    doc.text(`Avg photo quality: ${avgQual != null ? avgQual.toFixed(0) + "%" : "—"}`, margin, y); y += 5;
    doc.text(`Avg agreement: ${avgAgree != null ? avgAgree.toFixed(0) + "%" : "—"}`, margin, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Detections by Label", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([name, c]) => {
        doc.text(`• ${name}: ${c}`, margin, y);
        y += 5;
      });

    y += 8;

    // Recent Predictions (with images)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Recent Predictions (latest 10)", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const recent = [...reports]
      .sort((a, b) => (new Date(getTimestamp(b))) - (new Date(getTimestamp(a))))
      .slice(0, 10);

    recent.forEach((r) => {
      if (y > 260) {
        doc.addPage();
        y = 16;
      }

      const ts = formatDateTime(getTimestamp(r));
      const name = cleanText(getDiseaseName(r));
      const conf = normalizePercent(r.confidencePct ?? r.confidence);
      const risk = riskLabel(r.risk || r.riskLevel);

      const img = r.imageDataUrl || r.thumbnail;

      // Image (left)
      if (img) {
        try {
          doc.addImage(img, "JPEG", margin, y, 34, 34);
        } catch (e) {
          console.warn("Could not add scan image in AI report", e);
        }
      }

      // Text (right)
      const textX = margin + 40;
      doc.text(`${ts}`, textX, y + 6);
      doc.text(`${name}`, textX, y + 12);
      doc.text(
        `Confidence: ${conf != null ? conf.toFixed(1) + "%" : "—"} | Risk: ${risk}`,
        textX,
        y + 18
      );

      y += 40;
    });

    return doc;
  };

  // -----------------------
  // History UI Rendering
  // -----------------------
  const setEmptyState = (isEmpty) => {
    if (!emptyEl || !historyListEl) return;
    if (isEmpty) {
      emptyEl.classList.remove("is-hidden");
      historyListEl.classList.add("is-hidden");
    } else {
      emptyEl.classList.add("is-hidden");
      historyListEl.classList.remove("is-hidden");
    }
  };

  const makeHistoryRow = (rep, idx) => {
    const ts = getTimestamp(rep);
    const title = cleanText(getDiseaseName(rep));
    const sub = `Detected on ${formatDateTime(ts)} • Risk: ${riskLabel(rep.risk || rep.riskLevel)}`;

    const row = document.createElement("div");
    row.className = "rep-item";

    const imgSrc = rep.thumbnail || rep.imageDataUrl || "";

    row.innerHTML = `
      <div class="rep-item-left">
        ${imgSrc ? `<img class="rep-thumb" src="${imgSrc}" alt="Leaf scan">` : ""}
        <div class="rep-item-text">
          <div class="rep-item-title">${title}</div>
          <div class="rep-item-sub">${sub}</div>
        </div>
      </div>

      <div class="rep-item-right">
        <div class="rep-format">PDF</div>
        <button class="rep-edit-btn" data-action="download" data-idx="${idx}" type="button">Download</button>
        <button class="rep-edit-btn" data-action="print" data-idx="${idx}" type="button">Print</button>
      </div>
    `;

    return row;
  };

  const renderHistory = () => {
    const reports = getReports();
    if (!historyListEl) return;

    historyListEl.innerHTML = "";
    setEmptyState(reports.length === 0);

    const sorted = [...reports].sort(
      (a, b) => (new Date(getTimestamp(b))) - (new Date(getTimestamp(a)))
    );

    sorted.forEach((rep, idx) => {
      historyListEl.appendChild(makeHistoryRow(rep, idx));
    });
  };

  // Delegate clicks for Download/Print
  historyListEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const idx = Number(btn.getAttribute("data-idx"));

    const sorted = [...getReports()].sort(
      (a, b) => (new Date(getTimestamp(b))) - (new Date(getTimestamp(a)))
    );
    const rep = sorted[idx];
    if (!rep) return;

    const disease = cleanText(getDiseaseName(rep)).replace(/\s+/g, "_");
    const filename = `AgriVision_${disease}_${new Date(getTimestamp(rep)).toISOString().slice(0, 10)}.pdf`;

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
    downloadDoc(doc, `AgriVision_Crop_Health_Summary_${new Date().toISOString().slice(0, 10)}.pdf`);
  });

  satBtn?.addEventListener("click", () => {
    const doc = buildSatelliteInsightsPDF();
    if (!doc) return;
    downloadDoc(doc, `AgriVision_Satellite_Insights_${new Date().toISOString().slice(0, 10)}.pdf`);
  });

  aiBtn?.addEventListener("click", () => {
    const doc = buildAIModelReportPDF();
    if (!doc) return;
    downloadDoc(doc, `AgriVision_AI_Model_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  });

  // -----------------------
  // Initial render
  // -----------------------
  renderHistory();
  window.addEventListener("focus", renderHistory);

  // (Optional) expose clear-all helper for demo
  // window.clearReports = () => { saveReports([]); renderHistory(); };
});
