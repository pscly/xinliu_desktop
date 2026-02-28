import path from 'node:path';
import fs from 'node:fs/promises';

import { test, expect, _electron as electron } from '@playwright/test';

function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') {
      env[k] = v;
    }
  }
  env.XINLIU_E2E = '1';
  return env;
}

test('Task 33：Triptych 首屏 / 设置页入口 / 关闭到托盘语义', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const electronMainJs = path.join(repoRoot, 'dist', 'main', 'main.js');
  const evidenceTriptychPng = path.join(repoRoot, '.sisyphus', 'evidence', 'task-33-triptych.png');

  await fs.mkdir(path.dirname(evidenceTriptychPng), { recursive: true });

  const electronApp = await electron.launch({
    args: [electronMainJs],
    env: buildEnv(),
  });

  let page: Awaited<ReturnType<typeof electronApp.firstWindow>> | null = null;

  try {
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('triptych-left')).toBeVisible();
    await expect(page.getByTestId('triptych-middle')).toBeVisible();
    await expect(page.getByTestId('triptych-right')).toBeVisible();

    await page.screenshot({ path: evidenceTriptychPng, fullPage: true });

    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-storage-root')).toBeVisible();
    await expect(page.getByTestId('settings-updater')).toBeVisible();

    const bw = await electronApp.browserWindow(page);

    await page.getByTestId('titlebar-close').click();

    await expect
      .poll(
        async () => {
          const isVisible = await bw.evaluate((w) => w.isVisible());
          return isVisible ? 'visible' : 'hidden';
        },
        { timeout: 15_000 }
      )
      .toBe('hidden');

    await expect
      .poll(async () => {
        const exitCode = electronApp.process().exitCode;
        return exitCode === null ? 'alive' : `exited:${exitCode}`;
      })
      .toBe('alive');
  } finally {
    try {
      await page?.screenshot({ path: evidenceTriptychPng, fullPage: true });
    } catch {}
    try {
      await electronApp.close();
    } catch {
      try {
        electronApp.process().kill('SIGKILL');
      } catch {}
    }
  }
});
