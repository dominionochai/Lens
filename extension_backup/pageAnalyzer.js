function analyzePageStructure() {
  const title = document.title || "";

  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((el) => el.innerText.trim())
    .filter(Boolean);

  const paragraphs = Array.from(document.querySelectorAll("p"))
    .map((el) => el.innerText.trim())
    .filter((text) => text.length > 40);

  const links = document.querySelectorAll("a").length;

  let pageType = "general";

  const text = document.body.innerText.toLowerCase();

  if (
    text.includes("assignment") ||
    text.includes("submit") ||
    text.includes("deadline") ||
    text.includes("due date")
  ) {
    pageType = "assignment";
  } else if (headings.length > 5 && paragraphs.length > 10) {
    pageType = "article";
  } else if (
    text.includes("inbox") ||
    text.includes("compose") ||
    text.includes("reply")
  ) {
    pageType = "email";
  }

  return {
    title,

    pageType,

    headings: headings.slice(0, 20),

    paragraphCount: paragraphs.length,

    linkCount: links,

    complexity: calculateComplexity(headings.length, paragraphs.length, links),
  };
}

function calculateComplexity(headings, paragraphs, links) {
  const score = headings * 2 + paragraphs + links * 0.2;

  if (score > 100) return "high";

  if (score > 40) return "medium";

  return "low";
}
