// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createQuickCaptureController } from './quickCaptureController';
import type { QuickCaptureWindowLike } from './quickCaptureTypes';

function createFakeWindow(): QuickCaptureWindowLike & {
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
} {
  return {
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
  };
}

describe('src/main/quickCapture', () => {
  it('open：必须 show + focus', () => {
    const win = createFakeWindow();
    const controller = createQuickCaptureController({
      ensureWindow: () => win,
      saveQuickCapture: async () => undefined,
    });

    controller.open();

    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  it('Enter 保存隐藏', async () => {
    const win = createFakeWindow();
    const save = vi.fn(async () => undefined);
    const controller = createQuickCaptureController({
      ensureWindow: () => win,
      saveQuickCapture: save,
    });

    await controller.submit('hello');

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('hello');
    expect(win.hide).toHaveBeenCalledTimes(1);
  });

  it('cancel：必须隐藏', () => {
    const win = createFakeWindow();
    const controller = createQuickCaptureController({
      ensureWindow: () => win,
      saveQuickCapture: async () => undefined,
    });

    controller.cancel();

    expect(win.hide).toHaveBeenCalledTimes(1);
  });
});
