(async function () {
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
    console.log("Not a supported site.");
    return;
  }

  console.log("Supported site detected.");

  const pageText = document.body.innerText.slice(0, 20000);

  try {
    const response = await fetch("http://localhost:3000/api/analyze", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        text: pageText,
      }),
    });

    const analysis = await response.json();

    console.log("Analysis received:", analysis);

    createLensOverlay(analysis);
  } catch (error) {
    console.error("Cognitive Lens error:", error);
  }

  function createLensOverlay(data) {
    const existing = document.getElementById("cognitive-lens-overlay");

    if (existing) {
      existing.remove();
    }

    const panel = document.createElement("div");

    panel.id = "cognitive-lens-overlay";

    panel.innerHTML = `
            <div>
                <h2>🧠 Cognitive Lens</h2>

                <h3>Summary</h3>
                <p>
                ${data.analysis?.summary ?? "No summary available"}
                </p>


                <h3>First Action</h3>
                <p>
                ${data.analysis?.firstAction ?? "No action detected"}
                </p>


                <h3>Mode</h3>
                <p>
                ${data.analysis?.interfaceMode ?? "Normal"}
                </p>

            </div>
        `;

    document.body.appendChild(panel);
  }
})();
