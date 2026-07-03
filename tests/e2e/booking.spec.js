// booking.spec.js — E2E-Smoke-Test des Bestellflows (Demo-Modus).
const { test, expect } = require("@playwright/test");

test("commander: le widget se monte et propose les étapes", async ({ page }) => {
  await page.goto("/commander.html");
  await expect(page.locator(".bce")).toBeVisible();
  // Schritt 1: mindestens ein Standort wird angeboten.
  await expect(page.locator(".bce__opt").first()).toBeVisible();
});

test("carte: la carte se remplit", async ({ page }) => {
  await page.goto("/carte.html");
  await expect(page.locator(".menu-cat").first()).toBeVisible();
});

test("accueil: la tournée s'affiche", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#tour-grid .tour__stop").first()).toBeVisible();
});
