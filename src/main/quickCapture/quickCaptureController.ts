import type { EnsureQuickCaptureWindow, SaveQuickCapture } from './quickCaptureTypes';

export interface QuickCaptureController {
  open: () => void;
  hide: () => void;
  submit: (content: string) => Promise<void>;
  cancel: () => void;
}

export function createQuickCaptureController(options: {
  ensureWindow: EnsureQuickCaptureWindow;
  saveQuickCapture: SaveQuickCapture;
}): QuickCaptureController {
  const ensureWindow = options.ensureWindow;
  const saveQuickCapture = options.saveQuickCapture;

  return {
    open: () => {
      const win = ensureWindow();
      win.show();
      win.focus();
    },
    hide: () => {
      const win = ensureWindow();
      win.hide();
    },
    submit: async (content) => {
      try {
        await saveQuickCapture(content);
      } catch {
      }

      const win = ensureWindow();
      win.hide();
    },
    cancel: () => {
      const win = ensureWindow();
      win.hide();
    },
  };
}
