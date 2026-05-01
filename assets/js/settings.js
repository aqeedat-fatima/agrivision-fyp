const API_BASE = "";

function safeJSON(value, fallback = null) {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
}

let user = safeJSON(localStorage.getItem("agrivision_user"));

if (!user?.id) {
  alert("Please login first");
  window.location.href = "login.html";
}

const $ = (id) => document.getElementById(id);

const fullNameEl = $("fullName");
const emailEl = $("email");
const phoneEl = $("phone");
const locationEl = $("location");
const saveProfileBtn = $("saveProfile");

const currentPasswordEl = $("currentPassword");
const newPasswordEl = $("newPassword");
const changePasswordBtn = $("changePassword");

const profileBtn = $("profileBtn");
const profileDropdown = $("profileDropdown");
const logoutBtn = $("logoutBtn");
const profileNameEl = $("profileName");

function setProfileName() {
  if (profileNameEl) {
    profileNameEl.textContent =
      user.full_name || user.fullName || user.name || user.email || "Profile";
  }
}

function fillProfileForm() {
  if (fullNameEl) fullNameEl.value = user.full_name || "";
  if (emailEl) emailEl.value = user.email || "";
  if (phoneEl) phoneEl.value = user.phone || "";
  if (locationEl) locationEl.value = user.location || "";
}

setProfileName();
fillProfileForm();

profileBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  profileDropdown?.classList.toggle("is-hidden");
});

profileDropdown?.addEventListener("click", (e) => e.stopPropagation());

document.addEventListener("click", () => {
  profileDropdown?.classList.add("is-hidden");
});

logoutBtn?.addEventListener("click", () => {
  const ok = confirm("Do you want to log out?");
  if (!ok) return;

  localStorage.removeItem("agrivision_user");
  window.location.href = "login.html";
});

saveProfileBtn?.addEventListener("click", async () => {
  const fullName = fullNameEl?.value.trim();
  const email = emailEl?.value.trim();
  const phone = phoneEl?.value.trim();
  const location = locationEl?.value.trim();

  if (!fullName || !email) {
    alert("Full name and email are required.");
    return;
  }

  saveProfileBtn.disabled = true;
  saveProfileBtn.textContent = "Saving...";

  try {
    const res = await fetch(`${API_BASE}/auth/update-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: user.id,
        full_name: fullName,
        email,
        phone,
        location,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || "Failed to update profile.");
      return;
    }

    user = data.user;
    localStorage.setItem("agrivision_user", JSON.stringify(user));

    setProfileName();
    fillProfileForm();

    alert("Profile updated successfully.");
  } catch (err) {
    console.error(err);
    alert("Could not update profile. Please check backend connection.");
  } finally {
    saveProfileBtn.disabled = false;
    saveProfileBtn.textContent = "Save Profile";
  }
});

changePasswordBtn?.addEventListener("click", async () => {
  const currentPassword = currentPasswordEl?.value.trim();
  const newPassword = newPasswordEl?.value.trim();

  if (!currentPassword || !newPassword) {
    alert("Please enter both current and new password.");
    return;
  }

  if (newPassword.length < 6) {
    alert("New password must be at least 6 characters.");
    return;
  }

  changePasswordBtn.disabled = true;
  changePasswordBtn.textContent = "Updating...";

  try {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: user.id,
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || "Failed to change password.");
      return;
    }

    alert("Password updated successfully.");

    if (currentPasswordEl) currentPasswordEl.value = "";
    if (newPasswordEl) newPasswordEl.value = "";
  } catch (err) {
    console.error(err);
    alert("Could not update password. Please check backend connection.");
  } finally {
    changePasswordBtn.disabled = false;
    changePasswordBtn.textContent = "Update Password";
  }
});