export function normalizeBaseUrl(input: string): string {
  const raw = input.trim();
  if (raw.length === 0) {
    throw new Error('Base URL 不能为空');
  }

  const withScheme = raw.includes('://') ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error('Base URL 非法');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Base URL 只允许 http/https');
  }

  url.hash = '';
  url.search = '';

  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname.length === 0) {
    url.pathname = '/';
  } else {
    url.pathname = pathname;
  }

  const normalized = url.pathname === '/' ? url.origin : `${url.origin}${url.pathname}`;
  return normalized;
}

export function joinUrl(baseUrl: string, pathname: string): string {
  if (!pathname.startsWith('/')) {
    throw new Error('pathname 必须以 / 开头');
  }

  const base = normalizeBaseUrl(baseUrl);
  return new URL(pathname, `${base}/`).toString().replace(/\/+$/, '');
}
