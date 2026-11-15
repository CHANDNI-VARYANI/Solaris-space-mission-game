import { test, expect, type Page } from '@playwright/test';

async function move(page: Page, keys: string[], milliseconds: number) {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  for (const key of keys) await page.keyboard.up(key);
  await page.waitForTimeout(100);
}

async function collect(page: Page, name: string, approach: string[]) {
  const choiceHeading = page.getByRole('heading', { name: /Choose one part/ });
  for (let attempt = 0; attempt < 36; attempt += 1) {
    await page.keyboard.press('e');
    if (await choiceHeading.isVisible().catch(() => false)) break;
    await move(page, approach, 100);
  }
  await expect(choiceHeading).toBeVisible({ timeout: 1000 });
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click();
  await page.waitForTimeout(100);
}

test('mobile briefing keeps mission cards and launch action inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page).toHaveTitle('SOLARIS: Mission Design');
  await page.getByRole('button', { name: /START/i }).click();
  await page.getByRole('button', { name: /PLAY TESSERACT/i }).click();
  await expect(page.getByRole('heading', { name: /Build for the unknown/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Magnetic Field Probe/ })).toBeVisible();

  const action = await page.getByRole('button', { name: /DROP IN/ }).boundingBox();
  expect(action).not.toBeNull();
  expect(action!.x).toBeGreaterThanOrEqual(0);
  expect(action!.y + action!.height).toBeLessThanOrEqual(844);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: /START/i }).click();
  await page.getByRole('button', { name: /PLAY TESSERACT/ }).click();
  await expect(page.getByRole('heading', { name: /Build for the unknown/ })).toBeVisible();
  await expect.poll(async () => (await page.locator('.briefing-panel').boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(72);
  await expect.poll(async () => {
    const box = await page.getByRole('button', { name: /DROP IN/ }).boundingBox();
    return box ? box.y + box.height : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(800);
  const desktopPanel = await page.locator('.briefing-panel').boundingBox();
  const desktopAction = await page.getByRole('button', { name: /DROP IN/ }).boundingBox();
  expect(desktopPanel).not.toBeNull();
  expect(desktopPanel!.y).toBeGreaterThanOrEqual(72);
  expect(desktopAction).not.toBeNull();
  expect(desktopAction!.y + desktopAction!.height).toBeLessThanOrEqual(800);
});

test('daily challenge is seeded by date and selects Mission Director rules', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /START/i }).click();
  await page.getByRole('button', { name: /PLAY TESSERACT/i }).click();
  await page.getByRole('button', { name: /DAILY CHALLENGE/ }).click();
  const firstMission = await page.locator('.mission-card.selected').innerText();
  await expect(page.locator('.difficulty-pick > span small')).toHaveText('MISSION DIRECTOR');
  await page.getByRole('button', { name: /City Heat Mapper/ }).click();
  await page.getByRole('button', { name: /DAILY CHALLENGE/ }).click();
  await expect(page.locator('.mission-card.selected')).toContainText(new RegExp(firstMission.trim().split('\n')[0], 'i'));
  await expect(page.locator('.daily-challenge')).toHaveClass(/active/);
});

test('daily quiz is playable, scored, and returns home', async ({ page }) => {
  await page.goto('/');
  const howItWorks = page.getByRole('button', { name: /How this works/ });
  await expect(howItWorks).toHaveAttribute('aria-expanded', 'false');
  await howItWorks.click();
  await expect(page.getByText(/Pick a mission and test the tradeoffs/)).toBeVisible();
  await howItWorks.click();
  await expect(page.getByText(/Pick a mission and test the tradeoffs/)).toBeHidden();
  await page.getByRole('button', { name: /START/i }).click();
  await page.getByRole('button', { name: 'Go to home' }).click();
  await expect(page.getByRole('heading', { name: 'SOLARIS' })).toBeVisible();

  await page.getByRole('button', { name: /START/i }).click();
  await page.getByRole('button', { name: /Daily Learning Quiz/ }).click();
  await expect(page.getByRole('heading', { name: 'Mission quiz' })).toBeVisible();

  const playRound = async () => {
    const questions: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      questions.push((await page.locator('.quiz-question h2').innerText()).trim());
      await page.locator('.quiz-option').first().click();
      await expect(page.locator('.quiz-feedback')).toBeVisible();
      await page.getByRole('button', { name: index === 2 ? /SEE RESULTS/ : /NEXT QUESTION/ }).click();
    }
    return questions;
  };

  const firstRound = await playRound();
  await expect(page.locator('.quiz-result')).toContainText(/out of 3/);
  await page.getByRole('button', { name: /PLAY AGAIN/ }).click();
  const secondRound = await playRound();
  expect(secondRound).not.toEqual(firstRound);
  await expect(page.locator('.quiz-result')).toContainText(/out of 3/);
  await page.getByRole('button', { name: /BACK TO HUB/ }).click();
  await page.getByRole('button', { name: 'Go to home' }).click();
  await expect(page.getByRole('heading', { name: 'SOLARIS' })).toBeVisible();
});

test('local hot-seat mode routes a part change through Engineer approval', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: /START/i }).click();
  await page.getByRole('button', { name: /PLAY TESSERACT/i }).click();
  await page.getByRole('button', { name: /2 players/i }).click();
  await page.getByRole('button', { name: /DROP IN/ }).click();
  await collect(page, '1U frame', ['w']);
  await expect(page.getByRole('heading', { name: 'Engineer review' })).toBeVisible();
  await expect(page.locator('.approval-delta')).toContainText('0.20 kg');
  await page.getByRole('button', { name: /APPROVE CHANGE/ }).click();
  await expect(page.locator('.left-hud')).toContainText('0.2kg');
  await expect(page.locator('.crew-turn')).toContainText(/Mission Planner/i);
});

test('player builds, launches, downlinks data, survives eclipse, and gets a mission debrief', async ({ page }) => {
  test.setTimeout(120000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: /START/i }).click();
  await page.getByRole('button', { name: /PLAY TESSERACT/i }).click();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate((element) => element.width > 0 && element.height > 0)).toBe(true);
  await page.getByRole('button', { name: /DROP IN/ }).click();

  await collect(page, '1U frame', ['w']);
  await move(page, ['d', 's'], 1800);
  await move(page, ['w'], 600);
  await collect(page, 'Body solar cells', ['w']);
  await move(page, ['d', 's'], 1000);
  await move(page, ['s'], 1200);
  await collect(page, '10 Wh battery', ['s']);
  await move(page, ['a', 's'], 1200);
  await move(page, ['s'], 1000);
  await collect(page, 'Basic flight computer', ['d', 's']);
  await move(page, ['a'], 2200);
  await move(page, ['s'], 200);
  await collect(page, 'UHF radio', ['s']);
  await move(page, ['a', 'w'], 1000);
  await move(page, ['a'], 1000);
  await move(page, ['w'], 200);
  await collect(page, 'Magnetorquers', ['a']);
  await move(page, ['a', 'w'], 1000);
  await move(page, ['w'], 1200);
  await move(page, ['d'], 800);
  await collect(page, 'Fluxgate magnetometer', ['w']);
  await move(page, ['d', 's'], 600);
  await move(page, ['d'], 2000);
  await page.getByRole('button', { name: /ASSEMBLE SATELLITE/ }).click();
  await expect(page.getByRole('button', { name: /BEGIN ASCENT/ })).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: /BEGIN ASCENT/ }).click();
  for (let index = 0; index < 32; index += 1) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(240);
  }
  await expect(page.getByRole('heading', { name: /We have orbit/ })).toBeVisible({ timeout: 12000 });
  await expect(page.getByText(/km\/s of ideal propellant margin remains/)).toBeVisible();

  await page.getByRole('button', { name: /START DATA RUN/ }).click();
  await expect(page.getByRole('heading', { name: 'Downlink Rush' })).toBeVisible();
  await page.getByRole('button', { name: /DRAG ANTENNA/ }).click();
  await page.locator('.data-packet.available').filter({ hasText: 'Magnetic / image strip A' }).click();
  await expect(page.locator('.ops-metrics')).toContainText('1.5 / 6.0 MB');
  await page.getByRole('button', { name: /END RUN/ }).click();
  await expect(page.locator('.ops-result')).toContainText('1.5 MB downlinked');
  await page.getByRole('button', { name: /NEXT.*ECLIPSE ENERGY/ }).click();
  await expect(page.getByRole('heading', { name: 'Eclipse Energy' })).toBeVisible();
  await expect(page.locator('.energy-bars')).toContainText('86%');
  await page.getByRole('button', { name: /RUN ONE ORBIT/ }).click();
  await expect(page.locator('.eclipse-result')).toContainText('ORBIT SURVIVED');
  await page.getByRole('button', { name: /NEXT.*MISSION SEQUENCER/ }).click();
  await expect(page.getByRole('heading', { name: 'Mission Sequencer' })).toBeVisible();
  await page.getByRole('button', { name: /RUN SEQUENCE/ }).click();
  await expect(page.locator('.sequence-result')).toContainText('CONOPS EXECUTED');
  await page.getByRole('button', { name: /NEXT.*ORBIT BURN/ }).click();
  await expect(page.getByRole('heading', { name: 'Orbit Burn' })).toBeVisible();
  await page.getByRole('button', { name: /EXECUTE BURN/ }).click();
  await expect(page.locator('.burn-result')).toContainText('ORBIT MATCHED');
  await page.getByRole('button', { name: /NEXT.*MISSION CONTROL/ }).click();
  await expect(page.getByRole('heading', { name: /Alert 1/ })).toBeVisible();
  for (let index = 0; index < 4; index += 1) {
    await page.locator('.decision-card').first().click();
    await page.waitForTimeout(400);
    if (index < 3) await expect(page.getByRole('heading', { name: new RegExp(`Alert ${index + 2}`) })).toBeVisible();
  }
  await expect(page.locator('.mc-result')).toContainText('4 flight decisions');
  await page.getByRole('button', { name: /FINAL MISSION DEBRIEF/ }).click();
  await expect(page.getByRole('heading', { name: 'A world, watched.' })).toBeVisible();
  await expect(page.locator('.result-panel')).toContainText('MAVEN');
  await expect(page.locator('.leaderboard-strip')).toContainText('LOCAL LEADERBOARD');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EXPORT JSON', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^tesseract-magnetic-probe-.*\.json$/);
  await page.getByRole('button', { name: /HOW GAMES MAP/ }).click();
  await expect(page.locator('.mapping-note')).toContainText('delta-v');
  await page.getByRole('button', { name: 'SOURCES', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mission sources' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
