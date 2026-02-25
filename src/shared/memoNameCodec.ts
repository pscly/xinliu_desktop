export function encodeMemoNameForRoute(memoName: string): string {
  return encodeURIComponent(memoName);
}

export function decodeMemoNameFromRoute(encoded: string): string {
  return decodeURIComponent(encoded);
}

export function encodeMemoNameForKey(memoName: string): string {
  return base64UrlEncodeUtf8(memoName);
}

export function decodeMemoNameFromKey(key: string): string {
  return base64UrlDecodeUtf8(key);
}

export function base64UrlEncodeUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const base64 = bytesToBase64(bytes);
  return toBase64Url(base64);
}

export function base64UrlDecodeUtf8(input: string): string {
  const base64 = fromBase64Url(input);
  const bytes = base64ToBytes(base64);
  return new TextDecoder().decode(bytes);
}

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(base64url: string): string {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');

  const mod = base64.length % 4;
  if (mod === 1) {
    throw new Error('base64url 非法：长度不合法');
  }
  if (mod === 2) {
    return `${base64}==`;
  }
  if (mod === 3) {
    return `${base64}=`;
  }
  return base64;
}

function bytesToBase64(bytes: Uint8Array): string {
  const maybeBuffer = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (typeof maybeBuffer !== 'undefined') {
    return maybeBuffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const maybeBuffer = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (typeof maybeBuffer !== 'undefined') {
    return Uint8Array.from(maybeBuffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
