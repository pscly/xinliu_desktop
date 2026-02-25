function redactAuthorizationBearer(input: string): string {
  return input.replace(
    /(Authorization\s*:\s*Bearer\s+)([^\s]+)/gi,
    (_m, p1) => `${String(p1)}<redacted>`
  );
}

function redactLikelyTokens(input: string): string {
  return input
    .replace(/(token\s*[:=]\s*)([^\s"']+)/gi, (_m, p1) => `${String(p1)}<redacted>`)
    .replace(
      /(access_token\s*[:=]\s*)([^\s"']+)/gi,
      (_m, p1) => `${String(p1)}<redacted>`
    );
}

function redactWindowsAbsPaths(input: string): string {
  return input.replace(/[A-Za-z]:\\[^\s"']+/g, '<path>');
}

function redactPosixAbsPaths(input: string): string {
  return input.replace(/\/(?:[^\s"']+\/)+[^\s"']+/g, '<path>');
}

export function redactForLogs(input: string): string {
  return redactPosixAbsPaths(
    redactWindowsAbsPaths(redactLikelyTokens(redactAuthorizationBearer(input)))
  );
}
