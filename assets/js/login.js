// ===============================
// Password Show / Hide Toggle
// ===============================
const passwordInput = document.getElementById("password");
const toggleBtn = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");

let isVisible = false;

toggleBtn.addEventListener("click", () => {
    isVisible = !isVisible;

    if (isVisible) {
        passwordInput.type = "text";
        passwordInput.classList.remove("hidden-password");
        passwordInput.classList.add("visible-password");
        eyeIcon.src = "assets/icons/eye.png";
        toggleBtn.setAttribute("aria-label", "Hide password");
    } else {
        passwordInput.type = "password";
        passwordInput.classList.remove("visible-password");
        passwordInput.classList.add("hidden-password");
        eyeIcon.src = "assets/icons/eye-slash.png";
        toggleBtn.setAttribute("aria-label", "Show password");
    }
});


// ===============================
// REAL Backend Login Handler
// ===============================
const API = "";

document.getElementById("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const emailVal = document.getElementById("email").value.trim();
    const passVal = passwordInput.value.trim();

    try {
        const res = await fetch(`${API}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: emailVal,
                password: passVal
            })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.detail || "Login failed");
            return;
        }

        // ✅ Store logged-in user session
        localStorage.setItem("agrivision_user", JSON.stringify(data));

        // Redirect to dashboard
        window.location.href = "dashboard.html";

    } catch (err) {
        alert("Server error. Is backend running?");
        console.error(err);
    }
});