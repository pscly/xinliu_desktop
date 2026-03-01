import path from 'node:path';
import fs from 'node:fs/promises';

import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';

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

test('Task 45：Folder 树 hover 800ms 自动展开 + 中栏联动', async () => {
  const repoRoot = process.cwd();
  const electronMainJs = path.join(repoRoot, 'dist', 'main', 'main.js');
  const evidencePng = path.join(repoRoot, '.sisyphus', 'evidence', 'task-45-hover.png');

  await fs.mkdir(path.dirname(evidencePng), { recursive: true });

  const electronApp = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [electronMainJs],
    env: buildEnv(),
  });

  let page: Awaited<ReturnType<typeof electronApp.firstWindow>> | null = null;

  try {
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-collections').click();
    await expect(page.getByTestId('folder-tree')).toBeVisible();

    const rootNode = page.getByTestId('folder-tree-node-e2e_folder_root');
    const childNode = page.getByTestId('folder-tree-node-e2e_folder_child');

    await expect(rootNode).toBeVisible();
    await expect(childNode).toHaveCount(0);

    await rootNode.hover();
    await page.waitForTimeout(900);

    await expect.poll(async () => childNode.count(), { timeout: 5_000 }).toBe(1);
    await expect(childNode).toBeVisible();

    await rootNode.click();
    await expect(page.getByTestId('middle-list')).toBeVisible();
    await expect(page.getByTestId('middle-list-item-e2e_folder_child')).toBeVisible();

    await page.screenshot({ path: evidencePng, fullPage: true });
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
