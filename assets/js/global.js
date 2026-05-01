const TRANSLATE_API = "/api/translate";

async function translateOneText(text, targetLang = "ur") {
  if (!text || !text.trim()) return text;

  try {
    const res = await fetch(TRANSLATE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: text.trim(),
        target: targetLang
      })
    });

    const data = await res.json();

    return (
      data.translated_text ||
      data.translated ||
      data.translation ||
      data.text ||
      text
    );
  } catch (err) {
    console.error("Translation failed:", err);
    return text;
  }
}

async function translatePage(targetLang = "ur") {
  const elements = document.querySelectorAll(
    "h1, h2, h3, p, span, button, label, small"
  );

  for (const el of elements) {
    const original = el.dataset.originalText || el.innerText.trim();

    if (!original) continue;
    if (original === "undefined") continue;
    if (el.closest("script")) continue;

    el.dataset.originalText = original;

    const translated = await translateOneText(original, targetLang);
    el.innerText = translated || original;
  }
}

function resetToEnglish() {
  document.querySelectorAll("[data-original-text]").forEach((el) => {
    el.innerText = el.dataset.originalText;
  });
}

function toggleLanguage() {
  const current = localStorage.getItem("lang") || "en";

  if (current === "en") {
    localStorage.setItem("lang", "ur");
    translatePage("ur");
  } else {
    localStorage.setItem("lang", "en");
    resetToEnglish();
  }
}

window.addEventListener("load", () => {
  const lang = localStorage.getItem("lang") || "en";

  if (lang === "ur") {
    setTimeout(() => translatePage("ur"), 500);
  }
});