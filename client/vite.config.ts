import react from "@vitejs/plugin-react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig, Plugin } from "vite";

const CONTENT_PAGES = [
  ["about", "About Your Five | Your Five", "Learn why Your Five was built and how its basketball and football auction drafts work.", true],
  ["how-to-play", "How to Play Your Five | Draft Rules", "Learn the auction, budget, skip, placement, and lineup rules for Your Five basketball and football drafts.", true],
  ["scoring", "How Your Five Scoring Works", "See how player performance, achievements, chemistry, tactical fit, and position penalties decide a Your Five matchup.", true],
  ["data-sources", "Player Data Sources | Your Five", "See the source and verification methodology behind the basketball and football player cards in Your Five.", true],
  ["privacy", "Privacy Policy | Your Five", "Read how Your Five handles local game data, online rooms, analytics, and advertising.", false],
  ["terms", "Terms of Use | Your Five", "Read the rules and conditions for using the Your Five basketball and football draft game.", false],
  ["contact", "Contact | Your Five", "Report a bug, suggest an improvement, or contact the Your Five project maintainer.", false],
] as const;

function staticContentPages(): Plugin {
  return {
    name: "your-five-static-content-pages",
    apply: "build",
    async closeBundle() {
      const clientRoot = fileURLToPath(new URL(".", import.meta.url));
      const dist = resolve(clientRoot, "dist");
      const shell = await readFile(resolve(dist, "index.html"), "utf8");

      for (const [path, title, description, showAds] of CONTENT_PAGES) {
        const canonical = `https://your-five.com/${path}`;
        let html = shell
          .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
          .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`)
          .replace(/<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="index, follow" />')
          .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonical}" />`)
          .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`)
          .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`)
          .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonical}" />`)
          .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`)
          .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${description}" />`);

        if (showAds) {
          html = html.replace(
            "</head>",
            '    <script id="your-five-adsense" async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2828213825609013" crossorigin="anonymous"></script>\n  </head>'
          );
        }

        const directory = resolve(dist, path);
        await mkdir(directory, { recursive: true });
        await writeFile(resolve(directory, "index.html"), html);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), staticContentPages()],
  server: {
    port: 5173,
    proxy: {
      "^/(rooms|room|matchmaking|health)": {
        target: "http://localhost:8787",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
