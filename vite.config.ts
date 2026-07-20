import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    // Local dev only: proxies API calls to the server/ project so the
    // browser sees same-origin requests (sidesteps cross-site cookie
    // rules for auth cookies during development). Prod builds call the
    // real API origin directly via VITE_API_URL — see src/api.ts.
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
