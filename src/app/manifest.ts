import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vibe Desktop",
    short_name: "Vibe",
    description: "A personal browser desktop for web apps, AI tools, and small webapp shortcuts.",
    start_url: "/start",
    scope: "/",
    display: "standalone",
    background_color: "#102235",
    theme_color: "#102235",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
