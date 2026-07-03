// playwright.config.js — E2E-Smoke-Tests. Startet einen einfachen Static-Server
// und prüft den Bestellflow im Demo-Modus. Lokal: `npm i && npm run e2e`.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:8080" },
  webServer: {
    command: "python3 -m http.server 8080",
    url: "http://127.0.0.1:8080/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
