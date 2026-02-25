// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  buildSecureBrowserWindowOptions,
  buildSecureWebPreferences,
  installNavigationGuards,
} from './security';

import type { NavigationGuardsWebContents } from './security';

describe('src/main/security', () => {
  it('buildSecureWebPreferences: 必须硬写死安全项且不可被覆盖', () => {
    const prefs = buildSecureWebPreferences({
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: '/tmp/preload.js',
    });

    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.webSecurity).toBe(true);
    expect(prefs.allowRunningInsecureContent).toBe(false);
    expect(prefs.preload).toBe('/tmp/preload.js');
  });

  it('buildSecureBrowserWindowOptions: 强制注入安全 webPreferences', () => {
    const options = buildSecureBrowserWindowOptions({
      width: 1,
      webPreferences: {
        nodeIntegration: true,
        preload: '/tmp/preload.js',
      },
    });

    expect(options.width).toBe(1);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
    expect(options.webPreferences?.webSecurity).toBe(true);
    expect(options.webPreferences?.allowRunningInsecureContent).toBe(false);
    expect(options.webPreferences?.preload).toBe('/tmp/preload.js');
  });

  it('installNavigationGuards: will-navigate 仅允许 file:，http(s) 外链走系统浏览器', () => {
    const openExternal = vi.fn();
    const warn = vi.fn();

    const listeners: Record<string, (event: { preventDefault: () => void }, url: string) => void> =
      {};

    let windowOpenHandler:
      | undefined
      | ((details: { url: string }) => { action: 'deny' | 'allow' });

    const webContents = {
      on: (event: string, listener: (event: { preventDefault: () => void }, url: string) => void) => {
        listeners[event] = listener;
      },
      setWindowOpenHandler: (handler: (details: { url: string }) => { action: 'deny' | 'allow' }) => {
        windowOpenHandler = handler;
      },
    } as unknown as NavigationGuardsWebContents;

    installNavigationGuards(webContents, {
      openExternal,
      logger: { warn },
    });

    const fileEvent = { preventDefault: vi.fn() };
    listeners['will-navigate']?.(fileEvent, 'file:///C:/app/index.html');
    expect(fileEvent.preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();

    const httpsEvent = { preventDefault: vi.fn() };
    listeners['will-navigate']?.(httpsEvent, 'https://example.com/');
    expect(httpsEvent.preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/');

    const jsEvent = { preventDefault: vi.fn() };
    listeners['will-navigate']?.(jsEvent, 'javascript:alert(1)');
    expect(jsEvent.preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).not.toHaveBeenCalledWith('javascript:alert(1)');
    expect(warn).toHaveBeenCalled();

    expect(windowOpenHandler).toBeTypeOf('function');
    const res = windowOpenHandler?.({ url: 'https://example.com/' });
    expect(res).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://example.com/');
  });

  it('installNavigationGuards: openExternal 抛异常也不影响返回 deny', () => {
    const openExternal = vi.fn(() => {
      throw new Error('boom');
    });

    let windowOpenHandler:
      | undefined
      | ((details: { url: string }) => { action: 'deny' | 'allow' });

    const webContents = {
      on: vi.fn(),
      setWindowOpenHandler: (handler: (details: { url: string }) => { action: 'deny' | 'allow' }) => {
        windowOpenHandler = handler;
      },
    } as unknown as NavigationGuardsWebContents;

    installNavigationGuards(webContents, { openExternal });

    const res = windowOpenHandler?.({ url: 'https://example.com/' });
    expect(res).toEqual({ action: 'deny' });
  });
});
