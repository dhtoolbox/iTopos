import { defineConfig } from "vite";
import htmlPurge from "vite-plugin-purgecss";

export default defineConfig({
  plugins: [
    htmlPurge({
      // Paths to all templates, scripts, and HTML files to scan for used classes
      content: [
        "./index.html",
        "./src/**/*.html",
        "./src/**/*.js",
        "./src/**/*.jsx",
        "./src/**/*.vue",
        "./src/**/*.ts",
        "./src/**/*.tsx",
      ],
      // Safelist classes injected dynamically via JavaScript (e.g., active, open)
      safelist: ["is-active", "modal-open", "show"],
    }),
  ],
});
