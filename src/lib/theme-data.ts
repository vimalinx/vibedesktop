import type { DesktopTheme, ShellStyleOption } from "@/lib/contracts";

export const desktopThemes: DesktopTheme[] = [
  {
    id: "mineral",
    name: "Mineral Morning",
    browserFit: "Balanced default",
    description: "Soft desktop colors for users who keep Vibe open all day.",
    backgroundCss:
      "radial-gradient(circle at 18% 18%, rgba(248,213,107,.52), transparent 28%), radial-gradient(circle at 82% 16%, rgba(124,199,255,.42), transparent 30%), linear-gradient(135deg, #edf4ee 0%, #b8d8cf 38%, #27445e 100%)",
    swatches: ["#edf4ee", "#b8d8cf", "#27445e", "#f8d56b"]
  },
  {
    id: "chrome-blue",
    name: "Chrome Blue",
    browserFit: "Chrome and Material",
    description: "Blue focus, pale cards, and clean neutral surfaces.",
    backgroundCss:
      "radial-gradient(circle at 18% 16%, rgba(232,240,254,.86), transparent 28%), radial-gradient(circle at 80% 24%, rgba(138,180,248,.46), transparent 30%), linear-gradient(135deg, #f8fbff 0%, #d2e3fc 46%, #7aa7dd 100%)",
    swatches: ["#e8f0fe", "#d2e3fc", "#1a73e8", "#202124"]
  },
  {
    id: "edge-fluent",
    name: "Edge Fluent",
    browserFit: "Edge and Windows",
    description: "Neutral Fluent surfaces with a restrained Microsoft blue anchor.",
    backgroundCss:
      "radial-gradient(circle at 18% 18%, rgba(0,120,212,.22), transparent 28%), radial-gradient(circle at 78% 20%, rgba(243,242,241,.72), transparent 26%), linear-gradient(135deg, #f7f9fb 0%, #d7e8f6 42%, #4b6b83 100%)",
    swatches: ["#f3f2f1", "#d7e8f6", "#0078d4", "#201f1e"]
  },
  {
    id: "firefox-violet",
    name: "Firefox Violet",
    browserFit: "Firefox colorful themes",
    description: "Violet chrome with warm orange energy for a lively new-tab desk.",
    backgroundCss:
      "radial-gradient(circle at 20% 20%, rgba(255,143,49,.42), transparent 25%), radial-gradient(circle at 82% 18%, rgba(120,68,240,.38), transparent 31%), linear-gradient(135deg, #f4f0ff 0%, #ddcfff 44%, #503489 100%)",
    swatches: ["#f4f0ff", "#ddcfff", "#7844f0", "#ff8f31"]
  },
  {
    id: "safari-glass",
    name: "Safari Glass",
    browserFit: "Safari and iOS PWA",
    description: "Cool blue glass, bright white surfaces, and mobile-home-screen calm.",
    backgroundCss:
      "radial-gradient(circle at 20% 18%, rgba(255,255,255,.82), transparent 24%), radial-gradient(circle at 72% 24%, rgba(0,122,255,.28), transparent 30%), linear-gradient(145deg, #f7fbff 0%, #c7e6ff 46%, #6f8fac 100%)",
    swatches: ["#f7fbff", "#c7e6ff", "#007aff", "#1d3557"]
  },
  {
    id: "arc-graphite",
    name: "Arc Graphite",
    browserFit: "Arc-style focused browsing",
    description: "Graphite panels with one crisp acidic accent.",
    backgroundCss:
      "radial-gradient(circle at 18% 16%, rgba(214,255,114,.2), transparent 23%), radial-gradient(circle at 84% 22%, rgba(255,255,255,.12), transparent 26%), linear-gradient(145deg, #0e1116 0%, #232a32 52%, #58616d 100%)",
    swatches: ["#0e1116", "#232a32", "#d6ff72", "#f5f1e8"]
  },
  {
    id: "brave-ember",
    name: "Brave Ember",
    browserFit: "Brave and privacy-first browsing",
    description: "Warm ember color for people who prefer a strong browser identity.",
    backgroundCss:
      "radial-gradient(circle at 18% 18%, rgba(251,84,43,.42), transparent 28%), radial-gradient(circle at 82% 18%, rgba(255,196,97,.32), transparent 30%), linear-gradient(145deg, #fff2e8 0%, #f2b38b 44%, #41251d 100%)",
    swatches: ["#fff2e8", "#fb542b", "#ffc461", "#41251d"]
  },
  {
    id: "paper-ink",
    name: "Paper Ink",
    browserFit: "Reading and writing",
    description: "Low-saturation paper for a start page that should stay quiet.",
    backgroundCss:
      "radial-gradient(circle at 24% 18%, rgba(255,255,255,.75), transparent 20%), linear-gradient(145deg, #f9f2df 0%, #ded4bc 48%, #7a806f 100%)",
    swatches: ["#f9f2df", "#ded4bc", "#172033", "#7a806f"]
  },
  {
    id: "forest-calm",
    name: "Forest Calm",
    browserFit: "Nature and dark green themes",
    description: "Green-blue glass for users who want the homepage to feel less digital.",
    backgroundCss:
      "radial-gradient(circle at 22% 18%, rgba(181,240,181,.38), transparent 26%), radial-gradient(circle at 78% 16%, rgba(97,220,233,.24), transparent 30%), linear-gradient(145deg, #e6f7e8 0%, #91b8a6 44%, #14362f 100%)",
    swatches: ["#e6f7e8", "#91b8a6", "#00a41c", "#14362f"]
  },
  {
    id: "terminal-lime",
    name: "Terminal Lime",
    browserFit: "Developer dark setups",
    description: "A compact dark homepage theme tuned for local tools and coding apps.",
    backgroundCss:
      "radial-gradient(circle at 16% 18%, rgba(163,255,18,.22), transparent 24%), radial-gradient(circle at 86% 20%, rgba(54,99,129,.34), transparent 26%), linear-gradient(145deg, #06110b 0%, #102235 48%, #223c4c 100%)",
    swatches: ["#06110b", "#102235", "#a3ff12", "#d6c7a2"]
  },
  {
    id: "studio-airy",
    name: "Studio Airy",
    browserFit: "Roomy and round",
    description: "Comfortable spacing, circular icons, soft chrome.",
    backgroundCss:
      "radial-gradient(circle at 20% 12%, rgba(255,255,255,.5), transparent 34%), linear-gradient(150deg, #eef1f4 0%, #d8dfe6 52%, #aebcc9 100%)",
    swatches: ["#eef1f4", "#d8dfe6", "#3c6df0", "#1d2530"]
  },
  {
    id: "noir-dense",
    name: "Noir Dense",
    browserFit: "Tight and still",
    description: "Compact grid, square icons, solid windows, no motion.",
    backgroundCss:
      "linear-gradient(165deg, #191613 0%, #100e0c 55%, #0a0908 100%)",
    swatches: ["#191613", "#26211c", "#c8ff3d", "#f2ebde"]
  }
];

export const shellStyleOptions: ShellStyleOption[] = [
  {
    id: "glass",
    name: "Soft Glass",
    description: "Rounded, translucent, and calm. Best for PWA and homepage use."
  },
  {
    id: "browser",
    name: "Browser Chrome",
    description: "Tighter radius and stronger toolbar surfaces to match desktop browsers."
  },
  {
    id: "compact",
    name: "Compact Desk",
    description: "Denser controls and smaller windows for power users."
  },
  {
    id: "focus",
    name: "Focus Board",
    description: "Higher contrast cards and heavier shadows for widget-first use."
  }
];

export function resolveTheme(id: string | null | undefined): DesktopTheme {
  return desktopThemes.find((theme) => theme.id === id) ?? desktopThemes[0];
}
