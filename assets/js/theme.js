(function () {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("agrivision_theme") || "light";

  function getText(key, fallback) {
    if (typeof t === "function") return t(key);
    return fallback;
  }

  function updateThemeLabel(theme) {
    document.querySelectorAll(".theme-toggle-text").forEach((el) => {
      el.textContent =
        theme === "dark"
          ? getText("light_mode", "Light Mode")
          : getText("dark_mode", "Dark Mode");
    });
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem("agrivision_theme", theme);
    updateThemeLabel(theme);
  }

  applyTheme(savedTheme);

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(localStorage.getItem("agrivision_theme") || "light");

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

  if (!sidebar || !closeBtn) return;

  const savedSidebarState = localStorage.getItem("agrivision_sidebar");

  if (savedSidebarState === "collapsed") {
    sidebar.classList.add("collapsed");
  }

  closeBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");

    localStorage.setItem(
      "agrivision_sidebar",
      sidebar.classList.contains("collapsed") ? "collapsed" : "expanded"
    );
  });
});