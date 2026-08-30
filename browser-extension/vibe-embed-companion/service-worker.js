const RULE_ID_OFFSET = 1_000_000;

function ruleIdForTab(tabId) {
  return RULE_ID_OFFSET + tabId;
}

async function enableEmbedHeadersForTab(tabId) {
  const ruleId = ruleIdForTab(tabId);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleId],
    addRules: [
      {
        id: ruleId,
        priority: 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: [
            { header: "x-frame-options", operation: "remove" },
            { header: "content-security-policy", operation: "remove" },
            { header: "content-security-policy-report-only", operation: "remove" }
          ]
        },
        condition: {
          tabIds: [tabId],
          resourceTypes: ["sub_frame"]
        }
      }
    ]
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "vibe-desktop-enable-embed") return false;
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) {
    sendResponse({ ready: false });
    return false;
  }

  enableEmbedHeadersForTab(tabId)
    .then(() => sendResponse({ ready: true }))
    .catch(() => sendResponse({ ready: false }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleIdForTab(tabId)]
  });
});
