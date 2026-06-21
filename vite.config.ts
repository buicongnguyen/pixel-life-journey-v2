import { defineConfig } from "vite";

// Relative base so the build works at any GitHub Pages sub-path
// (https://buicongnguyen.github.io/pixel-life-journey-v2/) without extra config.
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        avatarPreview: "avatar-preview.html",
      },
    },
  },
});
