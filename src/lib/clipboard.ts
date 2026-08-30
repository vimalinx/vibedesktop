export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator === "undefined" || typeof document === "undefined") {
    throw new Error("Clipboard is only available in a browser.");
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some browsers expose Clipboard API but deny it in embedded or restricted
      // contexts. Fall through to the selection-based browser copy path.
    }
  }

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  activeElement?.focus();

  if (!copied) throw new Error("Clipboard access was denied.");
}
