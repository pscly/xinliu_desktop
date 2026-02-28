import path from 'node:path';
import fs from 'node:fs/promises';

import { test, expect, _electron as electron, type Page } from '@playwright/test';

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForQuickCapturePage(
  electronApp: Awaited<ReturnType<typeof electron.launch>>,
  options?: { timeoutMs?: number }
): Promise<Page> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const pages = electronApp.windows();
    for (const p of pages) {
      if (p.isClosed()) {
        continue;
      }
      const url = p.url();
      if (url.includes('#quick-capture')) {
        return p;
      }
    }
    await delay(120);
  }

  const urls = electronApp
    .windows()
    .filter((p) => !p.isClosed())
    .map((p) => p.url())
    .join(', ');
  throw new Error(`等待快捕窗口超时（当前窗口：${urls || '无'}）`);
}

test('Task 33：快捕窗口（打开 / 输入 / Enter 提交后隐藏或关闭）', async () => {
  const repoRoot = path.resolve(__dirname, '..');
  const electronMainJs = path.join(repoRoot, 'dist', 'main', 'main.js');
  const evidenceQuickCapturePng = path.join(
    repoRoot,
    '.sisyphus',
    'evidence',
    'task-33-quick-capture.png'
  );

  await fs.mkdir(path.dirname(evidenceQuickCapturePng), { recursive: true });

  const electronApp = await electron.launch({
    args: [electronMainJs],
    env: buildEnv(),
  });

  let mainPage: Page | null = null;
  let quickCapturePage: Page | null = null;

  try {
    mainPage = await electronApp.firstWindow();
    await mainPage.waitForLoadState('domcontentloaded');

    await mainPage.getByTestId('titlebar-quick-capture').click();
    quickCapturePage = await waitForQuickCapturePage(electronApp);

    await quickCapturePage.waitForLoadState('domcontentloaded');

    const input = quickCapturePage.getByTestId('quick-capture-input');
    await expect(input).toBeVisible();

    await input.fill('hello');

    try {
      await quickCapturePage.screenshot({ path: evidenceQuickCapturePng, fullPage: true });
    } catch {}

    const bw = await electronApp.browserWindow(quickCapturePage);
    await input.press('Enter');

    await expect
      .poll(
        async () => {
          if (quickCapturePage?.isClosed()) {
            return 'closed';
          }
          const isVisible = await bw.evaluate((w) => w.isVisible());
          return isVisible ? 'visible' : 'hidden';
        },
        { timeout: 15_000 }
      )
      .toMatch(/hidden|closed/);
  } finally {
    try {
      if (quickCapturePage && !quickCapturePage.isClosed()) {
        await quickCapturePage.screenshot({ path: evidenceQuickCapturePng, fullPage: true });
      } else {
        await mainPage?.screenshot({ path: evidenceQuickCapturePng, fullPage: true });
      }
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
