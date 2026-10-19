import catalogIconSources from "../../catalog/icon-sources.json";

interface CatalogIconStyle {
  label: string;
  background: string;
  foreground: string;
  accent: string;
}

const iconFileNames = new Map(catalogIconSources.map((source) => [source.id, source.fileName]));

/** Returns a vendored, offline URL for reviewed catalog entries. */
export function catalogIconUrl(id: string, title: string): string {
  const fileName = catalogIconFileName(id);
  return fileName ? `/catalog-icons/${fileName}` : catalogIconDataUrl(id, title);
}

export function catalogIconFileName(id: string): string | undefined {
  return iconFileNames.get(id);
}

/**
 * Produces a tiny fallback plate only for unknown/custom catalog entries.
 *
 * Catalog icons intentionally never depend on a third-party favicon service.
 * Reviewed apps always use their vendored genuine icon through catalogIconUrl.
 */
export function catalogIconDataUrl(id: string, title: string): string {
  const style = fallbackStyle(id, title);
  const label = escapeXml(style.label.slice(0, 3));
  const accessibleTitle = escapeXml(title.slice(0, 80));
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">',
    `<title>${accessibleTitle}</title>`,
    `<rect width="64" height="64" rx="15" fill="${style.background}"/>`,
    `<circle cx="49" cy="15" r="6" fill="${style.accent}" opacity=".95"/>`,
    `<path d="M14 47.5h36" stroke="${style.accent}" stroke-width="3" stroke-linecap="round" opacity=".72"/>`,
    `<text x="13" y="38" fill="${style.foreground}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${label.length > 2 ? 15 : 20}" font-weight="750" letter-spacing="-.8">${label}</text>`,
    '</svg>'
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function fallbackStyle(id: string, title: string): CatalogIconStyle {
  const hue = stableHue(id);
  return {
    label: initials(title),
    background: `hsl(${hue} 34% 15%)`,
    foreground: "#ffffff",
    accent: `hsl(${(hue + 34) % 360} 78% 64%)`
  };
}

function stableHue(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  return (words[0] ?? "APP").slice(0, 2).toUpperCase();
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[character]!);
}
