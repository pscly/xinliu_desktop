export interface QuickCaptureWindowLike {
  show: () => void;
  focus: () => void;
  hide: () => void;
}

export type EnsureQuickCaptureWindow = () => QuickCaptureWindowLike;

export type SaveQuickCapture = (content: string) => void | Promise<void>;
