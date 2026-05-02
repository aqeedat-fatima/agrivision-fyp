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

let FARMS_CACHE = [];

function getUserId() {
  try {
    const user = JSON.parse(localStorage.getItem("agrivision_user") || "{}");
    return user.id || user.user_id || null;
  } catch {
    return null;
  }
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

function fmtValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return Number(value).toFixed(2);
}

function setLoadingState(isLoading) {
  btnDetectStage.disabled = isLoading;
  btnDetectStage.textContent = isLoading ? "Detecting..." : "Detect Stage";
}

function getSelectedFarm() {
  const selectedId = farmSelect.value;

  return FARMS_CACHE.find((farm) => String(farm.id) === String(selectedId));
}

async function loadFarms() {
  farmSelect.innerHTML = `<option value="">Select Farm</option>`;

  const userId = getUserId();

  if (!userId) {
    window.location.href = "login.html";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/db/farms`, {
      headers: {
        "X-User-Id": String(userId)
      }
    });

    if (!res.ok) {
      throw new Error("Could not load farms");
    }

    const farms = await res.json();

    FARMS_CACHE = Array.isArray(farms) ? farms : [];

    if (!FARMS_CACHE.length) {
      farmSelect.innerHTML = `<option value="">No saved farms found</option>`;
      return;
    }

    FARMS_CACHE.forEach((farm, index) => {
      const option = document.createElement("option");
      option.value = farm.id;
      option.textContent = farm.name || farm.farm_name || `Farm ${index + 1}`;
      farmSelect.appendChild(option);
    });
  } catch (err) {
    console.error("Farm loading failed:", err);
    farmSelect.innerHTML = `<option value="">Could not load farms</option>`;
  }
}

async function detectStage() {
  const userId = getUserId();
  const selectedFarm = getSelectedFarm();
  const dateValue = sowingDate.value;

  if (!userId) {
    window.location.href = "login.html";
    return;
  }

  if (!selectedFarm) {
    alert("Please select a saved farm first.");
    return;
  }

  if (!dateValue) {
    alert("Please select the sowing date.");
    return;
  }

  setLoadingState(true);

  try {
    const res = await fetch(`${API_BASE}/crop-stage/detect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": String(userId)
      },
      body: JSON.stringify({
        farm_id: selectedFarm.id,
        farm_name: selectedFarm.name || selectedFarm.farm_name || "Farm",
        sowing_date: dateValue
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Crop stage detection failed");
    }

    stageName.textContent = data.stage || "—";
    stageIcon.textContent = data.icon || "🌱";
    cropAge.textContent = `${data.crop_age_days} days`;
    confidence.textContent = data.confidence || "—";
    satSupport.textContent = data.satellite_support || "—";

    ndviVal.textContent = fmtValue(data.satellite?.ndvi);
    eviVal.textContent = fmtValue(data.satellite?.evi);
    ndmiVal.textContent = fmtValue(data.satellite?.ndmi);

    satNote.textContent =
      data.satellite_note ||
      "Stage estimated from sowing date and available satellite support.";

    stageBadge.textContent = "Detected";

    if (data.confidence === "High") {
      stageBadge.className = "cs-badge cs-good";
    } else if (data.confidence === "Low") {
      stageBadge.className = "cs-badge cs-bad";
    } else {
      stageBadge.className = "cs-badge cs-warn";
    }

    highlightStage(data.stage);
    setRecommendations(data.recommendations || []);
  } catch (err) {
    console.error(err);

    stageBadge.textContent = "Error";
    stageBadge.className = "cs-badge cs-bad";

    alert(err.message || "Crop stage detection failed.");
  } finally {
    setLoadingState(false);
  }
}

btnDetectStage.addEventListener("click", detectStage);

document.addEventListener("DOMContentLoaded", () => {
  loadFarms();

  const today = new Date();
  today.setDate(today.getDate() - 60);
  sowingDate.value = today.toISOString().slice(0, 10);
});