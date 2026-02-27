import path from 'node:path';
import fs from 'node:fs/promises';

import { test, expect, _electron as electron } from '@playwright/test';

test('设置页：检查更新入口可触发且状态可解释', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const electronMainJs = path.join(repoRoot, 'dist', 'main', 'main.js');
  const evidencePng = path.join(repoRoot, '.sisyphus', 'evidence', 'task-30-updater-e2e.png');

  await fs.mkdir(path.dirname(evidencePng), { recursive: true });

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') {
      env[k] = v;
    }
  }

  const electronApp = await electron.launch({
    args: [electronMainJs],
    env,
  });

  let page: Awaited<ReturnType<typeof electronApp.firstWindow>> | null = null;

  try {
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-updater')).toBeVisible();

    await page.getByTestId('check-updates').click();

    const status = page.getByTestId('update-status');
    const disabledHint = page.getByTestId('update-disabled-hint');
    const error = page.getByTestId('update-error');

    await expect
      .poll(
        async () => {
          const statusText = (await status.textContent()) ?? '';
          const hintText =
            (await disabledHint.count()) > 0 ? ((await disabledHint.textContent()) ?? '') : '';
          const errorText = (await error.count()) > 0 ? ((await error.textContent()) ?? '') : '';

          const disabledOk = /安装包|禁用/.test(statusText) && /安装包/.test(hintText);
          if (disabledOk) {
            return 'disabled';
          }
          if (/preload/i.test(errorText)) {
            return 'preload';
          }
          return '';
        },
        {
          timeout: 15000,
        }
      )
      .toMatch(/disabled|preload/);
  } finally {
    try {
      await page?.screenshot({ path: evidencePng, fullPage: true });
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
