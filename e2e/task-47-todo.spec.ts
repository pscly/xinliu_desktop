import path from 'node:path';
import fs from 'node:fs/promises';

import { test, expect, _electron as electron, type Page } from '@playwright/test';
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

async function safeScreenshot(page: Page | null, evidencePng: string): Promise<void> {
  try {
    await page?.screenshot({ path: evidencePng, fullPage: true });
  } catch {}
}

test('Task 47：Todo 列表/完成/回收站/批量操作/二次确认彻底删除', async () => {
  const repoRoot = process.cwd();
  const electronMainJs = path.join(repoRoot, 'dist', 'main', 'main.js');
  const evidencePng = path.join(repoRoot, '.sisyphus', 'evidence', 'task-47-todo.png');
  await fs.mkdir(path.dirname(evidencePng), { recursive: true });

  const ITEM_1 = 'e2e_todo_item_1';
  const ITEM_2 = 'e2e_todo_item_2';

  const electronApp = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [electronMainJs],
    env: buildEnv(),
  });

  let page: Awaited<ReturnType<typeof electronApp.firstWindow>> | null = null;
  let hasEvidence = false;

  try {
    page = await electronApp.firstWindow();
    const p = page;
    if (!p) {
      throw new Error('无法获取 Electron 首个窗口');
    }

    await p.waitForLoadState('domcontentloaded');

    await p.getByTestId('nav-todo').click();
    await expect(p.getByTestId('todo-center')).toBeVisible();

    await p.getByTestId('todo-scope-active').click();
    await expect(p.getByTestId(`todo-item-${ITEM_1}`)).toBeVisible();
    await expect(p.getByTestId(`todo-item-${ITEM_2}`)).toBeVisible();

    await p.getByTestId(`todo-select-${ITEM_1}`).check();
    await p.getByTestId(`todo-select-${ITEM_2}`).check();
    await expect(p.getByTestId('todo-bulk-bar')).toBeVisible();

    await p.getByTestId('todo-bulk-complete').click();
    await expect
      .poll(async () => p.getByTestId('todo-bulk-bar').count(), { timeout: 10_000 })
      .toBe(0);

    await p.getByTestId('todo-scope-completed').click();
    await expect(p.getByTestId(`todo-item-${ITEM_1}`)).toBeVisible();
    await expect(p.getByTestId(`todo-item-${ITEM_2}`)).toBeVisible();

    await p.getByTestId(`todo-item-toggle-${ITEM_1}`).click();
    await p.getByTestId('todo-scope-active').click();
    await expect(p.getByTestId(`todo-item-${ITEM_1}`)).toBeVisible();

    await p.getByTestId('todo-scope-completed').click();
    await p.getByTestId(`todo-item-delete-${ITEM_2}`).click();
    await expect
      .poll(async () => p.getByTestId(`todo-item-${ITEM_2}`).count(), { timeout: 10_000 })
      .toBe(0);

    await p.getByTestId('todo-scope-trash').click();
    await expect(p.getByTestId(`todo-item-${ITEM_2}`)).toBeVisible();
    await p.getByTestId(`todo-item-restore-${ITEM_2}`).click();
    await expect
      .poll(async () => p.getByTestId(`todo-item-${ITEM_2}`).count(), { timeout: 10_000 })
      .toBe(0);

    await p.getByTestId('todo-scope-completed').click();
    await expect(p.getByTestId(`todo-item-${ITEM_2}`)).toBeVisible();
    await p.getByTestId(`todo-item-delete-${ITEM_2}`).click();

    await p.getByTestId('todo-scope-trash').click();
    await expect(p.getByTestId(`todo-item-${ITEM_2}`)).toBeVisible();
    await p.getByTestId(`todo-item-hard-delete-${ITEM_2}`).click();
    await expect(p.getByTestId(`todo-item-hard-delete-panel-${ITEM_2}`)).toBeVisible();

    await p.screenshot({ path: evidencePng, fullPage: true });
    hasEvidence = true;

    await p.getByTestId(`todo-item-hard-delete-confirm-${ITEM_2}`).click();
    await expect
      .poll(async () => p.getByTestId(`todo-item-${ITEM_2}`).count(), { timeout: 10_000 })
      .toBe(0);
  } finally {
    if (!hasEvidence) {
      await safeScreenshot(page, evidencePng);
    }
    try {
      await electronApp.close();
    } catch {
      try {
        electronApp.process().kill('SIGKILL');
      } catch {}
    }
  }
});
