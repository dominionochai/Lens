async function observePage() {
  console.log("🧠 Cognitive Lens activated.");

  const supportedSites = [
    "canvas",
    "moodle",
    "blackboard",
    "notion",
    "docs.google",
    "wikipedia",
    "github",
    "medium",
  ];

  const currentURL = window.location.href.toLowerCase();

  const supported = supportedSites.some((site) => currentURL.includes(site));

  if (!supported) {
    console.log("❌ Unsupported website.");
    return;
  }

  console.log("✅ Supported website detected.");

  const page = {
    title: document.title,

    url: window.location.href,

    headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((h) => ({
      level: h.tagName,
      text: h.innerText.trim(),
    })),

    statistics: {
      paragraphs: document.querySelectorAll("p").length,
      images: document.querySelectorAll("img").length,
      links: document.querySelectorAll("a").length,
      buttons: document.querySelectorAll("button").length,
    },
  };

  const pageText = document.body.innerText.slice(0, 20000);

  try {
    const response = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        text: pageText,
        page,
      }),
    });

    const analysis = await response.json();

    console.log("🧠 Analysis:", analysis);

    window.postMessage({
      source: "cognitive-lens",
      analysis,
    });
  } catch (error) {
    console.error("❌ Cognitive Lens Error:", error);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "analyze") {
    observePage();
  }
});

observePage();
