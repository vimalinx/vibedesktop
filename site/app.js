const copyButton = document.querySelector("[data-copy-target]");
const status = document.querySelector(".copy-status");

copyButton?.addEventListener("click", async () => {
  const target = document.getElementById(copyButton.dataset.copyTarget || "");
  const text = target?.textContent?.trim();
  if (!text || !status) return;

  try {
    await navigator.clipboard.writeText(text);
    status.textContent = "Install command copied.";
  } catch {
    status.textContent = "Copy unavailable. Select the command above and copy it manually.";
  }
});
