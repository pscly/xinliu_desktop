import path from 'node:path';
import fs from 'node:fs/promises';

import { test, expect, _electron as electron, type Locator, type Page } from '@playwright/test';
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

async function dragItemToFolder(
  page: Page,
  source: Locator,
  target: Locator,
  movedItem: Locator
): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();

    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) {
      throw new Error('拖拽失败：无法读取源或目标元素坐标');
    }

    const sourceX = sourceBox.x + sourceBox.width * 0.6;
    const sourceY = sourceBox.y + sourceBox.height * 0.5;
    const targetX = targetBox.x + Math.max(16, targetBox.width * 0.75);
    const targetY = targetBox.y + targetBox.height * 0.5;
    const midX = sourceX + (targetX - sourceX) * 0.55;
    const midY = sourceY + (targetY - sourceY) * 0.55;

    await page.mouse.move(sourceX, sourceY, { steps: 8 });
    await page.waitForTimeout(40);
    await page.mouse.down();
    await page.mouse.move(sourceX + 20, sourceY + 10, { steps: 12 });
    await page.waitForTimeout(120);
    await page.mouse.move(midX, midY, { steps: 16 });
    await page.mouse.move(targetX, targetY, { steps: 24 });
    await page.waitForTimeout(140);
    await page.mouse.move(targetX + 2, targetY + 2, { steps: 4 });
    await page.mouse.move(targetX - 2, targetY - 1, { steps: 4 });
    await page.waitForTimeout(80);
    await page.mouse.up();

    await page.waitForTimeout(220);
    if ((await movedItem.count()) === 0) {
      return;
    }
  }

  throw new Error('拖拽失败：已多次尝试 pointer 拖拽，但条目未从中栏消失');
}

test('Task 46：中栏拖拽到左栏 folder（乐观更新 + 撤销）', async () => {
  const repoRoot = process.cwd();
  const electronMainJs = path.join(repoRoot, 'dist', 'main', 'main.js');
  const evidencePng = path.join(repoRoot, '.sisyphus', 'evidence', 'task-46-dnd.png');

  await fs.mkdir(path.dirname(evidencePng), { recursive: true });

  const electronApp = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [electronMainJs],
    env: buildEnv(),
  });

  let page: Awaited<ReturnType<typeof electronApp.firstWindow>> | null = null;
  let hasUndoVisibleScreenshot = false;

  try {
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-collections').click();
    await expect(page.getByTestId('folder-tree')).toBeVisible();

    const rootNode = page.getByTestId('folder-tree-node-e2e_folder_root');
    const targetFolderNode = page.getByTestId('folder-tree-node-e2e_folder_target');
    const childNode = page.getByTestId('folder-tree-node-e2e_folder_child');
    await expect(rootNode).toBeVisible();
    await expect(targetFolderNode).toBeVisible();

    await rootNode.hover();
    await page.waitForTimeout(900);
    await expect.poll(async () => childNode.count(), { timeout: 5_000 }).toBe(1);

    await rootNode.click();
    const childMiddleItem = page.getByTestId('middle-list-item-e2e_folder_child');
    await expect(childMiddleItem).toBeVisible();

    await dragItemToFolder(page, childMiddleItem, targetFolderNode, childMiddleItem);

    await expect.poll(async () => childMiddleItem.count(), { timeout: 10_000 }).toBe(0);
    const undoButton = page.getByTestId('collections-undo-btn');
    await expect(undoButton).toBeVisible();

    await page.screenshot({ path: evidencePng, fullPage: true });
    hasUndoVisibleScreenshot = true;

    await undoButton.click();

    await expect(page.getByTestId('middle-list-item-e2e_folder_child')).toBeVisible();
  } finally {
    try {
      if (!hasUndoVisibleScreenshot) {
        await page?.screenshot({ path: evidencePng, fullPage: true });
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
