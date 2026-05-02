const API_BASE = "";

const farmSelect = document.getElementById("farmSelect");
const sowingDate = document.getElementById("sowingDate");
const btnDetectStage = document.getElementById("btnDetectStage");

const stageBadge = document.getElementById("stageBadge");
const stageIcon = document.getElementById("stageIcon");
const stageName = document.getElementById("stageName");
const cropAge = document.getElementById("cropAge");
const confidence = document.getElementById("confidence");
const satSupport = document.getElementById("satSupport");

const ndviVal = document.getElementById("ndviVal");
const eviVal = document.getElementById("eviVal");
const ndmiVal = document.getElementById("ndmiVal");
const satNote = document.getElementById("satNote");
const recommendationList = document.getElementById("recommendationList");

function getUserId() {
  try {
    const user = JSON.parse(localStorage.getItem("agrivision_user") || "{}");
    return user.id || user.user_id || user.email || "demo-user";
  } catch {
    return "demo-user";
  }
}

function getStageFromDays(days) {
  if (days <= 15) {
    return {
      name: "Seedling",
      icon: "🌱",
      advice: [
        "Ensure light and frequent irrigation.",
        "Protect young seedlings from pests and early stress."
      ]
    };
  }

  if (days <= 35) {
    return {
      name: "Vegetative",
      icon: "🌿",
      advice: [
        "Support strong leaf and stem growth with balanced nutrition.",
        "Monitor weeds because competition is high in this stage."
      ]
    };
  }

  if (days <= 55) {
    return {
      name: "Budding",
      icon: "🌾",
      advice: [
        "Monitor square formation carefully.",
        "Check for sucking pests and early bollworm activity."
      ]
    };
  }

  if (days <= 80) {
    return {
      name: "Flowering",
      icon: "🌸",
      advice: [
        "Maintain proper irrigation during flowering.",
        "Monitor pest attacks because flowering is a sensitive stage."
      ]
    };
  }

  if (days <= 120) {
    return {
      name: "Boll Formation",
      icon: "🟢",
      advice: [
        "Avoid water stress during boll development.",
        "Monitor bollworm and nutrient deficiency symptoms."
      ]
    };
  }

  return {
    name: "Harvesting",
    icon: "🌾",
    advice: [
      "Prepare for picking when bolls are mature and open.",
      "Avoid unnecessary irrigation close to harvesting."
    ]
  };
}

function calculateDaysAfterSowing(dateValue) {
  const sowing = new Date(dateValue);
  const today = new Date();

  sowing.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diff = today - sowing;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function highlightStage(stage) {
  document.querySelectorAll(".cs-stage-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.stage === stage);
  });
}

function setRecommendations(items) {
  recommendationList.innerHTML = "";
  items.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    recommendationList.appendChild(li);
  });
}

function getMockSatelliteSupport(days) {
  /*
    Temporary frontend-only satellite support.

    Later, replace this with latest real satellite run from DB/backend.
    Keep fallback awareness in backend:
    data_source: "real" or "fallback"
  */

  let ndvi = 0.28;
  let evi = 0.20;
  let ndmi = 0.05;

  if (days <= 15) {
    ndvi = 0.25;
    evi = 0.18;
    ndmi = 0.02;
  } else if (days <= 35) {
    ndvi = 0.48;
    evi = 0.34;
    ndmi = 0.12;
  } else if (days <= 55) {
    ndvi = 0.62;
    evi = 0.44;
    ndmi = 0.18;
  } else if (days <= 80) {
    ndvi = 0.72;
    evi = 0.52;
    ndmi = 0.22;
  } else if (days <= 120) {
    ndvi = 0.66;
    evi = 0.47;
    ndmi = 0.16;
  } else {
    ndvi = 0.42;
    evi = 0.31;
    ndmi = 0.06;
  }

  return {
    data_source: "demo",
    ndvi,
    evi,
    ndmi
  };
}

function evaluateSatelliteConsistency(stage, sat) {
  if (!sat || sat.data_source === "fallback") {
    return {
      confidenceText: "Medium",
      supportText: "Limited",
      note: "Satellite data is unavailable or fallback-based, so stage is estimated mainly from sowing date."
    };
  }

  if (sat.data_source === "demo") {
    return {
      confidenceText: "Medium",
      supportText: "Demo",
      note: "Demo satellite indicators are shown for frontend testing. Later this will use real NDVI, EVI and NDMI from the selected farm."
    };
  }

  if (sat.ndvi < 0.3) {
    return {
      confidenceText: "Low",
      supportText: "Weak",
      note: "Vegetation appears weaker than expected for this stage. Field inspection is recommended."
    };
  }

  if (sat.ndvi >= 0.55) {
    return {
      confidenceText: "High",
      supportText: "Strong",
      note: "Satellite vegetation indicators support the estimated crop stage."
    };
  }

  return {
    confidenceText: "Medium",
    supportText: "Moderate",
    note: "Satellite indicators partially support the estimated crop stage."
  };
}

async function loadFarms() {
  farmSelect.innerHTML = `<option value="">Select Farm</option>`;

  try {
    const userId = getUserId();

    const res = await fetch(`${API_BASE}/db/farms`, {
      headers: {
        "X-User-Id": userId
      }
    });

    if (!res.ok) throw new Error("Could not load farms");

    const farms = await res.json();

    if (!Array.isArray(farms) || farms.length === 0) {
      farmSelect.innerHTML = `<option value="">No saved farms found</option>`;
      return;
    }

    farms.forEach((farm, index) => {
      const option = document.createElement("option");
      option.value = farm.id || farm.farm_id || index;
      option.textContent = farm.name || farm.farm_name || `Farm ${index + 1}`;
      farmSelect.appendChild(option);
    });
  } catch (err) {
    console.warn("Farm loading failed, using demo farms:", err);

    ["Demo Farm 1", "Demo Farm 2"].forEach((name, index) => {
      const option = document.createElement("option");
      option.value = `demo-${index + 1}`;
      option.textContent = name;
      farmSelect.appendChild(option);
    });
  }
}

function detectStage() {
  const selectedFarm = farmSelect.value;
  const dateValue = sowingDate.value;

  if (!selectedFarm) {
    alert("Please select a farm first.");
    return;
  }

  if (!dateValue) {
    alert("Please select the sowing date.");
    return;
  }

  const days = calculateDaysAfterSowing(dateValue);

  if (days < 0) {
    alert("Sowing date cannot be in the future.");
    return;
  }

  const stage = getStageFromDays(days);

  /*
    Later:
    replace getMockSatelliteSupport(days) with latest saved satellite run
    for selected farm from backend.
  */
  const sat = getMockSatelliteSupport(days);
  const evaluation = evaluateSatelliteConsistency(stage.name, sat);

  stageName.textContent = stage.name;
  stageIcon.textContent = stage.icon;
  cropAge.textContent = `${days} days`;
  confidence.textContent = evaluation.confidenceText;
  satSupport.textContent = evaluation.supportText;

  ndviVal.textContent = sat.ndvi.toFixed(2);
  eviVal.textContent = sat.evi.toFixed(2);
  ndmiVal.textContent = sat.ndmi.toFixed(2);
  satNote.textContent = evaluation.note;

  stageBadge.textContent = "Detected";
  stageBadge.className = "cs-badge cs-good";

  highlightStage(stage.name);

  const finalAdvice = [
    `Estimated cotton stage is ${stage.name} based on ${days} days after sowing.`,
    ...stage.advice
  ];

  setRecommendations(finalAdvice);
}

btnDetectStage.addEventListener("click", detectStage);

document.addEventListener("DOMContentLoaded", () => {
  loadFarms();

  const today = new Date();
  today.setDate(today.getDate() - 60);
  sowingDate.value = today.toISOString().slice(0, 10);
});