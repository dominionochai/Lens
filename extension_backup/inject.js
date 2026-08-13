window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data.source !== "cognitive-lens") return;

  const analysis = event.data.analysis;

  createOverlay(analysis);
});

function createOverlay(analysis) {
  const existing = document.getElementById("cognitive-lens-overlay");

  if (existing) {
    existing.remove();
  }

  const panel = document.createElement("div");

  panel.id = "cognitive-lens-overlay";

  panel.innerHTML = `
        <div class="cl-header">
            🧠 Cognitive Lens
        </div>

        <div class="cl-section">
            <h3>Summary</h3>
            <p>${analysis.analysis?.summary ?? "No summary available."}</p>
        </div>

        <div class="cl-section">
            <h3>First Action</h3>
            <p>${analysis.analysis?.firstAction ?? "No action available."}</p>
        </div>

        <div class="cl-section">
            <h3>Mode</h3>
            <p>${analysis.analysis?.interfaceMode ?? "Normal"}</p>
        </div>
    `;

  document.body.appendChild(panel);
}
