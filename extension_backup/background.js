chrome.runtime.onInstalled.addListener(() => {
  console.log("🧠 Cognitive Lens installed.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Extension message:", message);

  sendResponse({
    success: true,
  });

  return true;
});
