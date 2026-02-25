/// <reference types="vite/client" />

declare global {
  interface Window {
    xinliu?: {
      versions: {
        electron: string;
        chrome: string;
        node: string;
      };
    };
  }
}

export {};
