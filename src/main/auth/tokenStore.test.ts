// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createTokenStore } from './tokenStore';

describe('src/main/auth/tokenStore', () => {
  it('优先走 keytar（可注入 mock）', async () => {
    const keytar = {
      getPassword: vi.fn(async () => 't1'),
      setPassword: vi.fn(async () => undefined),
      deletePassword: vi.fn(async () => true),
    };

    const store = createTokenStore({
      service: 'cc.pscly.xinliu.desktop',
      account: 'flow_token',
      keytar,
    });

    expect(await store.getToken()).toBe('t1');
    await store.setToken('t2');
    await store.clearToken();

    expect(keytar.getPassword).toHaveBeenCalled();
    expect(keytar.setPassword).toHaveBeenCalledWith(
      'cc.pscly.xinliu.desktop',
      'flow_token',
      't2'
    );
    expect(keytar.deletePassword).toHaveBeenCalledWith(
      'cc.pscly.xinliu.desktop',
      'flow_token'
    );
  });

  it('keytar 不可用时只在内存持有（不落盘）', async () => {
    const store = createTokenStore({
      service: 'cc.pscly.xinliu.desktop',
      account: 'flow_token',
      keytar: null,
    });

    expect(await store.getToken()).toBeNull();
    await store.setToken('t1');
    expect(await store.getToken()).toBe('t1');
    await store.clearToken();
    expect(await store.getToken()).toBeNull();
  });
});
