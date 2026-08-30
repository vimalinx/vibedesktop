const bridgeEvent = "vibe-desktop-embed-bridge-ready";

chrome.runtime.sendMessage({ type: "vibe-desktop-enable-embed" }, (response) => {
  const ready = Boolean(response?.ready) && !chrome.runtime.lastError;
  document.documentElement.dataset.vibeEmbedBridge = ready ? "ready" : "unavailable";
  window.dispatchEvent(new CustomEvent(bridgeEvent, { detail: { ready } }));
});
