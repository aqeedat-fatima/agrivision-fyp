console.log("signup.js loaded ✅");
const API = "";

// Password toggle (emoji version)
const passwordInput = document.getElementById("password");
const toggleBtn = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");
let visible = false;

toggleBtn.addEventListener("click", () => {
  visible = !visible;
  passwordInput.type = visible ? "text" : "password";
  eyeIcon.textContent = visible ? "🙈" : "👁";
  toggleBtn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
});

// Signup submit
document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const full_name = document.getElementById("full_name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const res = await fetch(`${API}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || "Signup failed");
      return;
    }

    alert("Account created! Please log in.");
    window.location.href = "login.html";

  } catch (err) {
    console.error(err);
    alert("Server error. Is backend running on port 8000?");
  }
});