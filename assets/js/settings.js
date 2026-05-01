const API_BASE = "";

const user = JSON.parse(localStorage.getItem("agrivision_user"));

if (!user) {
  alert("Please login first");
  window.location.href = "login.html";
}

// PREFILL
document.getElementById("fullName").value = user.full_name;
document.getElementById("email").value = user.email;

// SAVE PROFILE
document.getElementById("saveProfile").onclick = async () => {
  const res = await fetch(`${API_BASE}/auth/update-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      user_id: user.id,
      full_name: document.getElementById("fullName").value,
      email: document.getElementById("email").value,
      phone: document.getElementById("phone").value,
      location: document.getElementById("location").value
    })
  });

  alert("Profile updated");
};

// CHANGE PASSWORD
document.getElementById("changePassword").onclick = async () => {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      user_id: user.id,
      current_password: document.getElementById("currentPassword").value,
      new_password: document.getElementById("newPassword").value
    })
  });

  const data = await res.json();
  alert(data.message);
};