import { describe, expect, it } from 'vitest';

import { clamp } from './number';

describe('clamp', () => {
  it('将数值限制在区间内', () => {
    expect(clamp(0, 1, 10)).toBe(1);
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(999, 1, 10)).toBe(10);
  });

  it('当 min 大于 max 时抛错', () => {
    expect(() => clamp(1, 10, 1)).toThrow('min 不能大于 max');
  });
});
