import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works on GitHub Pages project sites
  // (https://<user>.github.io/<repo>/) as well as any other static host
  base: './',
});
