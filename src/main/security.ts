import type {
  BrowserWindowConstructorOptions,
  WebContents,
  WebPreferences,
} from 'electron';

const MUST_WEB_PREFERENCES: Pick<
  WebPreferences,
  'contextIsolation' | 'nodeIntegration' | 'webSecurity' | 'allowRunningInsecureContent'
> = {
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
};

export function buildSecureWebPreferences(
  extra: Partial<WebPreferences> = {}
): WebPreferences {
  return {
    ...extra,
    ...MUST_WEB_PREFERENCES,
  };
}

export function buildSecureBrowserWindowOptions(
  extra: Partial<BrowserWindowConstructorOptions> = {}
): BrowserWindowConstructorOptions {
  const extraWebPreferences = (extra.webPreferences ?? {}) as Partial<WebPreferences>;

  return {
    ...extra,
    webPreferences: buildSecureWebPreferences(extraWebPreferences),
  };
}

export type OpenExternal = (url: string) => void | Promise<void>;

export interface NavigationGuardsDependencies {
  openExternal: OpenExternal;
  logger?: {
    warn?: (message: string, meta?: Record<string, unknown>) => void;
  };
}

export type NavigationGuardsWebContents = Pick<
  WebContents,
  'on' | 'setWindowOpenHandler'
>;

function isAllowedNavigationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

function shouldOpenInExternalBrowser(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function installNavigationGuards(
  webContents: NavigationGuardsWebContents,
  deps: NavigationGuardsDependencies
): void {
  const openExternalSafely = (url: string) => {
    try {
      const result = deps.openExternal(url);
      void Promise.resolve(result).catch((error) => {
        deps.logger?.warn?.('打开外链失败', { url, error: String(error) });
      });
    } catch (error) {
      deps.logger?.warn?.('打开外链失败', { url, error: String(error) });
    }
  };

  webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigationUrl(url)) {
      return;
    }

    event.preventDefault();

    if (shouldOpenInExternalBrowser(url)) {
      openExternalSafely(url);
    } else {
      deps.logger?.warn?.('拦截非白名单导航', { url });
    }
  });

  webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenInExternalBrowser(url)) {
      openExternalSafely(url);
    }

    return { action: 'deny' };
  });
}
