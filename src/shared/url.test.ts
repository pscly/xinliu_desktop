import { describe, expect, it } from 'vitest';

import { joinUrl, normalizeBaseUrl } from './url';

describe('src/shared/url', () => {
  it('normalizeBaseUrl: 自动补全 https 与去尾部 /', () => {
    expect(normalizeBaseUrl('xl.pscly.cc/')).toBe('https://xl.pscly.cc');
    expect(normalizeBaseUrl('https://xl.pscly.cc/')).toBe('https://xl.pscly.cc');
    expect(normalizeBaseUrl('http://localhost:31031/')).toBe(
      'http://localhost:31031'
    );
  });

  it('normalizeBaseUrl: 保留 path（但仍去尾部 /）', () => {
    expect(normalizeBaseUrl('https://example.com/api/')).toBe(
      'https://example.com/api'
    );
  });

  it('joinUrl: 拼接 pathname', () => {
    expect(joinUrl('https://xl.pscly.cc/', '/api/v1/sync/pull')).toBe(
      'https://xl.pscly.cc/api/v1/sync/pull'
    );
  });
});
