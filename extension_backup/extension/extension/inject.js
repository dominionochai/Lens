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
            <strong>Summary</strong>

            <p>
                ${analysis.analysis?.summary ?? "No summary available"}
            </p>
        </div>


        <div class="cl-section">
            <strong>First Action</strong>

            <p>
                ${analysis.analysis?.firstAction ?? "No action available"}
            </p>
        </div>


        <div class="cl-section">
            <strong>Interface Mode</strong>

            <p>
                ${analysis.analysis?.interfaceMode ?? "Normal"}
            </p>
        </div>

    `;

  document.body.appendChild(panel);
}

window.addEventListener("message", (event) => {
  if (event.data.source !== "cognitive-lens") {
    return;
  }

  createOverlay(event.data.analysis);
});
