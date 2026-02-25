import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { IpcResult, IpcVoid } from '../shared/ipc';

async function safeInvokeIpcVoid(
  fn: (() => Promise<IpcResult<IpcVoid>>) | undefined
): Promise<void> {
  if (typeof fn !== 'function') {
    return;
  }
  try {
    await fn();
  } catch {
  }
}

export function QuickCaptureWindow() {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const api = window.xinliu?.quickCapture;
  const windowApi = window.xinliu?.window;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onFocus = () => {
      textareaRef.current?.focus();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const submit = async () => {
    setContent('');
    await safeInvokeIpcVoid(api ? () => api.submit(content) : undefined);
  };

  const cancel = async () => {
    setContent('');
    await safeInvokeIpcVoid(api?.cancel);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void cancel();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="quickCaptureApp" data-testid="quick-capture-app">
      <header className="titlebar">
        <div className="titlebarLeft">
          <div className="titlebarBrand">心流</div>
          <div className="titlebarSubtitle">快速捕获</div>
        </div>

        <div className="titlebarCenter" aria-hidden="true">
          <div className="titlebarPills">
            <span className="pill">Enter 保存</span>
            <span className="pill">Esc 取消</span>
          </div>
        </div>

        <div className="titlebarRight titlebarNoDrag">
          <button
            type="button"
            className="titlebarBtn titlebarBtnClose"
            data-testid="quick-capture-close"
            aria-label="关闭"
            onClick={() => void safeInvokeIpcVoid(windowApi?.close)}
          >
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path
                d="M3 3l6 6M9 3L3 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <main className="quickCaptureMain">
        <textarea
          ref={textareaRef}
          className="quickCaptureInput"
          data-testid="quick-capture-input"
          placeholder={api ? '写点什么，按 Enter 保存并隐藏…' : '快捕不可用（缺少 preload 注入）'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="quickCaptureFooter">
          <button
            type="button"
            className="btn btnGhost"
            data-testid="quick-capture-cancel"
            onClick={() => void cancel()}
          >
            取消
          </button>
          <button
            type="button"
            className="btn"
            data-testid="quick-capture-submit"
            onClick={() => void submit()}
          >
            保存
          </button>
        </div>
      </main>
    </div>
  );
}
