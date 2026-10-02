import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import tailwind from "tailwindcss";
import autoprefixer from "autoprefixer";

export default defineConfig({
  output: "server",
  adapter: vercel(),
  // Preserve the HTML whitespace behavior from Astro 4.
  compressHTML: true,
  // Keep Tailwind 3 and the existing CSS; the legacy integration stops at Astro 5.
  vite: {
    css: {
      postcss: { plugins: [tailwind(), autoprefixer()] },
    },
  },
});
