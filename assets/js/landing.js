// Scroll reveal: add .visible when elements enter viewport
const revealEls = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target); // animate only once
      }
    });
  },
  {
    threshold: 0.2,
  }
);

revealEls.forEach((el) => observer.observe(el));

// Active nav link highlighting based on scroll position
const sections = document.querySelectorAll("section[id]");
const navLinks = document.querySelectorAll(".menu a[href^='#']");

function onScroll() {
  let currentId = "";

  sections.forEach((section) => {
    const rect = section.getBoundingClientRect();
    const offsetTop = rect.top + window.scrollY;
    if (window.scrollY + 120 >= offsetTop && window.scrollY < offsetTop + section.offsetHeight) {
      currentId = section.id;
    }
  });

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${currentId}`);
  });
}

window.addEventListener("scroll", onScroll);

// Set footer year
const yearSpan = document.getElementById("year");
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}
