console.log("Cognitive Lens content loaded v4");

function clFirstSentence(text) {
  var t = (text || "").trim();
  if (!t) return "";
  var match = t.match(/^.{0,180}?[.!?](\s|$)/);
  return match ? match[0].trim() : t.slice(0, 140).trim();
}

function clGetArticleRoot() {
  var candidates = [
    "#mw-content-text .mw-parser-output", "#mw-content-text", "article", "main",
    ".post-content", ".article-content", ".entry-content", "#content"
  ];
  for (var i = 0; i < candidates.length; i++) {
    var el = document.querySelector(candidates[i]);
    if (el && (el.innerText || "").trim().length > 200) return el;
  }
  return document.body;
}

function clAnalyzeStructure() {
  var root = clGetArticleRoot();
  var headings = Array.prototype.slice.call(root.querySelectorAll("h1, h2, h3, .mw-heading h2, .mw-heading h3"));
  var junk = ["contents", "languages", "tools", "navigation", "menu", "share", "subscribe", "references", "external links", "see also", "notes"];

  var sections = [];
  headings.forEach(function (h, i) {
    var text = h.innerText.trim();
    if (!text || junk.indexOf(text.toLowerCase()) > -1) return;

    var startNode = h.closest(".mw-heading") || h;
    var node = startNode.nextElementSibling;
    var paras = [];
    var guard = 0;
    while (node && guard < 60) {
      guard++;
      var isHeadingWrapper = node.classList && node.classList.contains("mw-heading");
      var isDirectHeading = /^H[123]$/.test(node.tagName);
      if (isHeadingWrapper || isDirectHeading) break;
      if (node.tagName === "P") paras.push(node.innerText.trim());
      node = node.nextElementSibling;
    }
    var combined = paras.join(" ");
    if (combined.length < 20) return;

    var seen = {};
    var concepts = [];
    root.querySelectorAll("strong, b, a").forEach(function (b) {
      var t = b.innerText.trim();
      if (t.length > 2 && t.length < 40 && !seen[t.toLowerCase()] && concepts.length < 20) {
        seen[t.toLowerCase()] = true;
        concepts.push(t);
      }
    });

    var words = combined.split(/\s+/).filter(Boolean);
    sections.push({
      id: "cl-sec-" + i,
      title: text,
      takeaway: clFirstSentence(combined),
      estMinutes: Math.max(1, Math.round(words.length / 200)),
      concepts: concepts.slice(i * 2, i * 2 + 3)
    });
  });

  var allWords = (root.innerText || "").trim().split(/\s+/).length;
  return {
    title: (document.title || "").replace(/ - Wikipedia.*$/i, ""),
    sections: sections,
    readingMinutes: Math.max(1, Math.round(allWords / 220))
  };
}

var lastStructure = null;
var userNotes = {};

function clShowNotesPanel() {
  lastStructure = clAnalyzeStructure();

  var existing = document.getElementById("cl-panel");
  if (existing) existing.remove();

  var panel = document.createElement("div");
  panel.id = "cl-panel";
  Object.assign(panel.style, {
    position: "fixed", top: "20px", right: "20px", width: "360px", maxHeight: "85vh",
    overflowY: "auto", zIndex: "2147483647", background: "linear-gradient(180deg, #fdf1ea 0%, #fbe9de 100%)",
    borderRadius: "24px", boxShadow: "0 20px 60px rgba(43,47,42,0.25)", padding: "22px",
    fontFamily: "-apple-system, Segoe UI, Arial, sans-serif", border: "1px solid rgba(255,255,255,0.8)",
  });

  var header = document.createElement("div");
  Object.assign(header.style, { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" });
  var titleWrap = document.createElement("div");
  var title = document.createElement("div");
  title.textContent = "Cognitive Lens";
  Object.assign(title.style, { fontWeight: "700", fontSize: "17px", color: "#2b2f2a", fontFamily: "Georgia, serif" });
  var subtitle = document.createElement("div");
  subtitle.textContent = "notes for this page";
  Object.assign(subtitle.style, { fontSize: "11px", color: "#8a7e72", marginTop: "2px" });
  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);
  var closeBtn = document.createElement("button");
  closeBtn.textContent = "\u00D7";
  Object.assign(closeBtn.style, { background: "rgba(255,255,255,0.6)", border: "none", borderRadius: "50%", width: "28px", height: "28px", fontSize: "18px", cursor: "pointer", color: "#8a7e72" });
  closeBtn.onclick = function () { panel.remove(); };
  header.appendChild(titleWrap);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  var meta = document.createElement("div");
  meta.textContent = lastStructure.readingMinutes + " min read \u00B7 " + lastStructure.sections.length + " sections";
  Object.assign(meta.style, { fontSize: "11px", color: "#8a7e72", margin: "10px 0 16px", padding: "6px 12px", background: "rgba(255,255,255,0.6)", borderRadius: "20px", display: "inline-block" });
  panel.appendChild(meta);

  if (lastStructure.sections.length === 0) {
    var empty = document.createElement("div");
    empty.textContent = "No clear sections found on this page.";
    Object.assign(empty.style, { fontSize: "12px", color: "#8a7e72", padding: "16px", textAlign: "center" });
    panel.appendChild(empty);
  }

  lastStructure.sections.forEach(function (s) {
    var card = document.createElement("div");
    Object.assign(card.style, {
      marginBottom: "10px", padding: "14px", borderRadius: "16px",
      background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.9)",
    });

    var sTitle = document.createElement("div");
    sTitle.textContent = s.title;
    Object.assign(sTitle.style, { fontWeight: "600", fontSize: "13px", color: "#2b2f2a", marginBottom: "5px" });
    card.appendChild(sTitle);

    if (s.takeaway) {
      var takeaway = document.createElement("div");
      takeaway.textContent = s.takeaway;
      Object.assign(takeaway.style, { fontSize: "12px", color: "#4a4540", lineHeight: "1.5", marginBottom: "8px" });
      card.appendChild(takeaway);
    }

    if (s.concepts.length > 0) {
      var tags = document.createElement("div");
      Object.assign(tags.style, { display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" });
      s.concepts.forEach(function (c) {
        var tag = document.createElement("span");
        tag.textContent = c;
        Object.assign(tag.style, { fontSize: "10px", background: "#fbe9de", color: "#c97b6e", padding: "2px 9px", borderRadius: "10px", fontWeight: "500" });
        tags.appendChild(tag);
      });
      card.appendChild(tags);
    }

    var noteBox = document.createElement("textarea");
    noteBox.placeholder = "write a note about this section...";
    noteBox.value = userNotes[s.id] || "";
    Object.assign(noteBox.style, {
      width: "100%", minHeight: "44px", fontSize: "12px", padding: "8px 10px",
      borderRadius: "10px", border: "1px solid #e9d9cc", background: "rgba(255,255,255,0.8)",
      resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", color: "#2b2f2a",
    });
    noteBox.addEventListener("input", function () { userNotes[s.id] = noteBox.value; });
    card.appendChild(noteBox);

    panel.appendChild(card);
  });

  var downloadBtn = document.createElement("button");
  downloadBtn.textContent = "Download notes (.txt)";
  Object.assign(downloadBtn.style, {
    width: "100%", padding: "12px", borderRadius: "14px", border: "none",
    background: "#3f4a3a", color: "#fbe9de", fontSize: "12.5px", fontWeight: "600",
    cursor: "pointer", marginTop: "6px",
  });
  downloadBtn.onclick = clDownloadNotes;
  panel.appendChild(downloadBtn);

  document.documentElement.appendChild(panel);
}

function clDownloadNotes() {
  if (!lastStructure) return;
  var lines = [];
  lines.push(lastStructure.title);
  lines.push("=".repeat(lastStructure.title.length || 5));
  lines.push("");
  lines.push("Estimated reading time: " + lastStructure.readingMinutes + " min");
  lines.push("Sections: " + lastStructure.sections.length);
  lines.push("");
  lastStructure.sections.forEach(function (s, i) {
    lines.push((i + 1) + ". " + s.title + " (~" + s.estMinutes + " min)");
    if (s.takeaway) lines.push("   Key point: " + s.takeaway);
    if (s.concepts.length > 0) lines.push("   Concepts: " + s.concepts.join(", "));
    if (userNotes[s.id]) lines.push("   My note: " + userNotes[s.id]);
    lines.push("");
  });

  var blob = new Blob([lines.join("\n")], { type: "text/plain" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = (lastStructure.title || "notes").replace(/[^a-z0-9]/gi, "_").toLowerCase() + "_notes.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function clInjectButtons() {
  if (document.getElementById("cl-brain-btn")) return;
  var brainBtn = document.createElement("button");
  brainBtn.id = "cl-brain-btn";
  brainBtn.textContent = "\u{1F9E0}";
  brainBtn.title = "Cognitive Lens Notes";
  Object.assign(brainBtn.style, {
    position: "fixed", bottom: "24px", right: "24px", zIndex: "2147483647",
    width: "56px", height: "56px", borderRadius: "50%", border: "none",
    background: "linear-gradient(135deg, #f4bda8, #e8a698)", color: "#fff", fontSize: "26px", cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
  });
  brainBtn.addEventListener("click", clShowNotesPanel);
  document.documentElement.appendChild(brainBtn);
}

clInjectButtons();

var CL_STYLE_ID = "cognitive-lens-a11y-style";

function clBuildCSS(settings) {
  var sizeMap = { normal: "100%", large: "115%", xlarge: "130%" };
  var scale = sizeMap[settings.fontSize] || "100%";
  var css = "html { font-size: " + scale + " !important; }";
  if (settings.dyslexicFont) {
    css += "* { font-family: 'Comic Sans MS', 'Comic Sans', cursive, sans-serif !important; letter-spacing: 0.03em !important; line-height: 1.6 !important; }";
  }
  if (settings.highContrast) {
    css += "html { background: #000 !important; } body, body * { background-color: #000 !important; color: #ffe9a8 !important; border-color: #444 !important; } a, a * { color: #7ecbff !important; }";
  }
  return css;
}

function clApplySettings(settings) {
  var styleTag = document.getElementById(CL_STYLE_ID);
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = CL_STYLE_ID;
    document.documentElement.appendChild(styleTag);
  }
  styleTag.textContent = clBuildCSS(settings);
}

function clLoadAndApplySettings() {
  chrome.storage.sync.get({ fontSize: "normal", dyslexicFont: false, highContrast: false }, function (settings) {
    clApplySettings(settings);
  });
}

if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "sync") return;
    clLoadAndApplySettings();
  });
}
clLoadAndApplySettings();

var clSpeaking = false;
function clGetReadableText() {
  var clone = document.body.cloneNode(true);
  clone.querySelectorAll("script, style, nav, header, footer, noscript").forEach(function (el) { el.remove(); });
  return (clone.innerText || "").trim().slice(0, 6000);
}
function clSpeakWithVoices(text) {
  var utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  var voices = window.speechSynthesis.getVoices();
  var preferred = voices.find(function (v) { return /Online \(Natural\)/.test(v.name) && v.lang === "en-US"; }) || voices.find(function (v) { return v.lang === "en-US"; });
  if (preferred) utterance.voice = preferred;
  utterance.onend = function () { clSpeaking = false; };
  utterance.onerror = function () { clSpeaking = false; };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  clSpeaking = true;
}
function clToggleReadAloud() {
  if (clSpeaking) { window.speechSynthesis.cancel(); clSpeaking = false; return; }
  var text = clGetReadableText();
  if (!text) return;
  var existingVoices = window.speechSynthesis.getVoices();
  if (existingVoices.length > 0) { clSpeakWithVoices(text); }
  else { window.speechSynthesis.onvoiceschanged = function () { clSpeakWithVoices(text); }; window.speechSynthesis.getVoices(); }
}
chrome.runtime.onMessage.addListener(function (message) {
  if (message.action === "toggleReadAloud") clToggleReadAloud();
});