// ===============================
// Password Show / Hide Toggle
// ===============================
const passwordInput = document.getElementById("password");
const toggleBtn = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");

let isVisible = false; // starts hidden

toggleBtn.addEventListener("click", () => {
    isVisible = !isVisible;

    if (isVisible) {
        // SHOW PASSWORD
        passwordInput.type = "text";
        passwordInput.classList.remove("hidden-password");
        passwordInput.classList.add("visible-password");

        // switch to normal eye icon
        eyeIcon.src = "assets/icons/eye.png";
        toggleBtn.setAttribute("aria-label", "Hide password");
    } else {
        // HIDE PASSWORD
        passwordInput.type = "password";
        passwordInput.classList.remove("visible-password");
        passwordInput.classList.add("hidden-password");

        // switch to eye-slash icon
        eyeIcon.src = "assets/icons/eye-slash.png";
        toggleBtn.setAttribute("aria-label", "Show password");
    }
});

// ===============================
// TEMP Login Handler (demo only)
// ===============================
document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const emailVal = document.getElementById("email").value.trim();
    const passVal = passwordInput.value.trim();

    // Temporary login credentials
    if (emailVal === "admin@gmail.com" && passVal === "1234") {
        //alert("Login successful!");
        window.location.href = "dashboard.html"; 
    } else {
        alert("Invalid credentials. Try admin@gmail.com / 1234");
    }
});
