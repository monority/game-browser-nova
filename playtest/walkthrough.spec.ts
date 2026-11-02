import { appendFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { pause, stripToAnchor } from "../e2e/helpers.js";

/**
 * Agent playtest walkthrough (Step054): scenarios A-D from
 * docs/roadmap/Step054-human-playtest.md, executed through the REAL UI
 * (pointer clicks on the canvas, panel reads, screenshots). This is an
 * observation instrument for the agent, not a substitute for the owner's
 * human session and not a CI gate.
 *
 * Output: playtest/artifacts/PLAYTEST-REPORT.md + one PNG per observed
 * moment. Re-run any time:
 *   pnpm exec playwright test -c playtest/playtest.config.ts
 */

const REPORT = "playtest/artifacts/PLAYTEST-REPORT.md";
const SHOTS = "playtest/artifacts";

test.beforeAll(() => {
  writeFileSync(
    REPORT,
    `# Playtest agent — rapport d'exécution\n\nGénéré le ${new Date().toISOString()} (harnais playtest/, UI réelle, Chromium headless 1440×900).\n`,
  );
});

async function observe(
  page: import("@playwright/test").Page,
  shot: string,
  note: string,
): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${shot}.png`, fullPage: false });
  const data = await page.evaluate(() => {
    const s = window.__nova!.getState();
    const text = (sel: string) => document.querySelector(sel)?.textContent ?? "";
    return {
      tick: s.tick,
      population: s.population,
      money: Math.floor(s.resources.money),
      food: Math.floor(s.resources.food),
      water: Math.floor(s.resources.water),
      pollution: s.pollution,
      envQuality: Math.round(100 - s.pollution),
      status: text(".nova-status"),
      alerts: text(".nova-alerts"),
      forecast: text("#stats [data-section='forecast']"),
      stats: text("#stats"),
    };
  });
  appendFileSync(
    REPORT,
    `\n## ${shot}\n\n![${shot}](${shot}.png)\n\n**Note :** ${note}\n\n` +
      `- tick ${data.tick} · pop ${data.population} · money ${data.money} · food ${data.food} · water ${data.water} · pollution ${data.pollution} (qualité ${data.envQuality})\n` +
      `- statut : \`${data.status || "(vide)"}\`\n` +
      `- alertes : \`${data.alerts || "(aucune)"}\`\n` +
      `- forecast : \`${data.forecast}\`\n`,
  );
}

test.describe.serial("NOVA playtest agent — scénarios Step054", () => {
  test("A — début de partie : guidage, confirmation, désélection, forecasts", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    await observe(page, "A0-start", "Premier écran : colonie D2 en marche, panels initiaux.");

    const farm = page.locator("button[data-build-type='farm']");
    await farm.click();
    await expect(page.locator(".nova-status")).toHaveText("Placing Farm — click a free cell");
    await observe(page, "A1-guidance", "F6 : le guidage de placement est affiché à la sélection.");

    await page.locator("#app canvas").click({ position: { x: 700, y: 300 } });
    await expect(page.locator(".nova-status")).toHaveText("Farm placed.");
    await expect(farm).not.toHaveAttribute("data-selected", "true");
    await observe(page, "A2-placed", "F7/F8 : confirmation « Farm placed. », palette désélectionnée.");

    await farm.click();
    await page.locator("#app canvas").click({ position: { x: 700, y: 300 } });
    await expect(page.locator(".nova-status")).toContainText("Cannot place: occupied");
    await expect(farm).toHaveAttribute("data-selected", "true");
    await observe(page, "A3-refused", "F8 : refus explicite, sélection conservée.");
  });

  test("B — gestion économique : anticiper un déficit via les forecasts", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    // grow the D2 colony: +2 farms, +2 residences (commands, real rules)
    await page.evaluate(() => {
      const h = window.__nova!;
      h.getState().resources.money = 1000;
      // road corridor: farms and wells need road adjacency to be staffed
      h.command({ kind: "placeRoads", cells: Array.from({ length: 9 }, (_, i) => `${7 + i},13`) });
      h.command({ kind: "placeBuilding", type: "farm", x: 8, y: 14 });
      h.command({ kind: "placeBuilding", type: "farm", x: 9, y: 14 });
      h.command({ kind: "placeBuilding", type: "residence", x: 10, y: 14 });
      h.command({ kind: "placeBuilding", type: "residence", x: 11, y: 14 });
      for (const x of [12, 13, 14, 15]) h.command({ kind: "placeBuilding", type: "well", x, y: 14 });
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__nova!.getState().population), { timeout: 30_000 })
      .toBe(12);
    await pause(page);
    await observe(page, "B1-growth", "Colony grown to pop 14 (housing 14). Forecasts: production vs consumption readable?");

    // create a food deficit: mothball both new farms, keep 14 mouths
    await page.evaluate(() => {
      const h = window.__nova!;
      for (const b of Object.values(h.getState().buildings)) {
        if (b.type === "farm" && (b.x === 8 || b.x === 9)) h.command({ kind: "setBuildingActive", id: b.id, active: false });
      }
      h.getState().resources.food = 30;
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => document.querySelector("#stats")?.textContent ?? ""), { timeout: 30_000 })
      .toContain("ticks");
    await pause(page);
    await observe(page, "B2-deficit", "Déficit alimentaire : le compte à rebours est-il anticipable depuis les forecasts ?");
  });

  test("C — pollution : tendance, sources, absorption, blocage de croissance", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    // D2 already runs 2 workshops (emissions 2/tick). Climb FIRST, on the
    // stable pop-10 colony (no housing headroom = no famine risk), THEN
    // expand housing: admission would grow the pop but the degraded air
    // blocks it — the representative growth-blocked situation.
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__nova!.getState().pollution), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(80);
    await page.evaluate(() => {
      const h = window.__nova!;
      h.getState().resources.money = 1000;
      h.command({ kind: "placeRoads", cells: Array.from({ length: 9 }, (_, i) => `${7 + i},13`) });
      for (const x of [8, 9]) h.command({ kind: "placeBuilding", type: "farm", x, y: 14 });
      for (const x of [12, 13, 14, 15]) h.command({ kind: "placeBuilding", type: "well", x, y: 14 });
      for (const x of [10, 11, 16, 17]) h.command({ kind: "placeBuilding", type: "residence", x, y: 14 });
    });
    // keep RUNNING: alerts only refresh on ticks
    await expect
      .poll(() => page.evaluate(() => document.querySelector(".nova-alerts")?.textContent ?? ""), { timeout: 30_000 })
      .toContain("Growth blocked");
    await pause(page);
    await observe(page, "C1-pollution", "Pollution montante : net/tick, émissions, absorption — la cause est-elle lisible ?");
    await observe(page, "C2-blocked", "Blocage de croissance : l'alerte nomme qualité, seuil 25 et pollution.");

    // player answer: parks absorb 2/tick each — enough to flip the balance
    await page.evaluate(() => {
      const h = window.__nova!;
      h.command({ kind: "placeBuilding", type: "park", x: 4, y: 14 });
      h.command({ kind: "placeBuilding", type: "park", x: 5, y: 14 });
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__nova!.getState().pollution), { timeout: 30_000 })
      .toBeLessThanOrEqual(70);
    await pause(page);
    await observe(page, "C3-recovery", "Parcs → net négatif : la tendance affichée permet-elle de décider ?");
  });

  test("D — expérience générale : capture libre de fin de session", async ({ page }) => {
    await page.goto("/");
    await pause(page);
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await page.waitForTimeout(10_000);
    await pause(page);
    await page.evaluate(() => {
      const h = window.__nova!;
      h.getState().pollution = 90;
      h.command({ kind: "placeBuilding", type: "residence", x: 6, y: 14 });
    });
    await page.getByRole("button", { name: "8x", exact: true }).click();
    await page.waitForTimeout(3_000);
    await pause(page);
    await observe(page, "D1-general", "Vue libre de fin de session : hiérarchie, alertes, sentiment de contrôle (à juger humainement).");
  });
});
