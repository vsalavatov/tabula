import {defineConfig} from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "4175");

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
    navigationTimeout: 45000,
  },
  webServer: {
    command: `npm run dev:serve -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: ".",
    env: {
      VITE_MOCK_GOOGLE_DRIVE: "true",
    },
    reuseExistingServer: false,
    timeout: 120000,
  },
});
