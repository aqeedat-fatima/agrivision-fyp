const API = "";

document.getElementById("forgotPasswordForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("resetEmail").value.trim();
  const newPassword = document.getElementById("resetPassword").value.trim();

  if (!email || !newPassword) {
    alert("Please enter email and new password.");
    return;
  }

  const res = await fetch(`${API}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      new_password: newPassword,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.detail || "Failed to reset password.");
    return;
  }

  alert("Password reset successfully. Please login again.");
  window.location.href = "login.html";
});