(function () {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("agrivision_theme") || "light";

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem("agrivision_theme", theme);

    document.querySelectorAll(".theme-toggle-text").forEach((el) => {
      el.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
    });
  }

  applyTheme(savedTheme);

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const current = root.getAttribute("data-theme") || "light";
        applyTheme(current === "dark" ? "light" : "dark");
      });
    });
  });
})();

document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.querySelector(".sidebar");
  const closeBtn = document.querySelector(".sidebar-close");

  closeBtn?.addEventListener("click", () => {
    sidebar?.classList.toggle("collapsed");
  });
});