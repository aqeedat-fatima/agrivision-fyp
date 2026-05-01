// translate whole page
async function translatePage(targetLang = "ur") {
  const elements = document.querySelectorAll("h1, h2, h3, p, span, button, label");

  for (let el of elements) {
    if (!el.innerText.trim()) continue;

    const res = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: el.innerText,
        target: targetLang
      })
    });

    const data = await res.json();
    el.innerText = data.translated_text;
  }
}

// toggle language
function toggleLanguage() {
  const current = localStorage.getItem("lang") || "en";

  if (current === "en") {
    localStorage.setItem("lang", "ur");
    translatePage("ur");
  } else {
    localStorage.setItem("lang", "en");
    location.reload(); // reset to English
  }
}

window.addEventListener("load", () => {
  const lang = localStorage.getItem("lang");
  if (lang === "ur") {
    translatePage("ur");
  }
});