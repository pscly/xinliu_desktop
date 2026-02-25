import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('xinliu', {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});
