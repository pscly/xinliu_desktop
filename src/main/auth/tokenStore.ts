import { createRequire } from 'node:module';

export interface KeytarLike {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
}

export interface TokenStore {
  getToken: () => Promise<string | null>;
  setToken: (token: string) => Promise<void>;
  clearToken: () => Promise<void>;
}

export interface CreateTokenStoreOptions {
  service: string;
  account: string;
  keytar?: KeytarLike | null;
}

function tryLoadKeytar(): KeytarLike | null {
  const require = createRequire(__filename);
  try {
    return require('keytar') as KeytarLike;
  } catch {
    return null;
  }
}

export function createTokenStore(options: CreateTokenStoreOptions): TokenStore {
  const keytar = options.keytar ?? tryLoadKeytar();
  let memoryToken: string | null = null;

  if (keytar) {
    return {
      getToken: async () => keytar.getPassword(options.service, options.account),
      setToken: async (token) => {
        await keytar.setPassword(options.service, options.account, token);
      },
      clearToken: async () => {
        await keytar.deletePassword(options.service, options.account);
      },
    };
  }

  return {
    getToken: async () => memoryToken,
    setToken: async (token) => {
      memoryToken = token;
    },
    clearToken: async () => {
      memoryToken = null;
    },
  };
}
