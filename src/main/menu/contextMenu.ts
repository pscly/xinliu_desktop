import { Menu } from 'electron';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';

import { IPC_EVENTS } from '../../shared/ipc';
import type { ContextMenuCommand, ContextMenuDidSelectPayload } from '../../shared/ipc';

import {
  buildFolderContextMenuTemplate,
  buildMiddleItemContextMenuTemplate,
} from './contextMenuTemplates';
import type { SerializableContextMenuItem } from './contextMenuTemplates';

function toElectronMenuItem(options: {
  item: SerializableContextMenuItem;
  onCommand: (command: ContextMenuCommand) => void;
}): MenuItemConstructorOptions {
  const { item } = options;
  if (item.kind === 'separator') {
    return { type: 'separator' };
  }
  return {
    label: item.label,
    enabled: item.enabled ?? true,
    click: () => {
      options.onCommand(item.command);
    },
  };
}

export function popupMiddleItemContextMenu(options: {
  win: BrowserWindow;
  itemId: string;
}): void {
  const template = buildMiddleItemContextMenuTemplate();
  const menu = Menu.buildFromTemplate(
    template.map((item) =>
      toElectronMenuItem({
        item,
        onCommand: (command) => {
          options.win.webContents.send(IPC_EVENTS.contextMenu.didSelect, {
            target: { kind: 'middleItem', itemId: options.itemId },
            command,
          } satisfies ContextMenuDidSelectPayload);
        },
      })
    )
  );

  menu.popup({ window: options.win });
}

export function popupFolderContextMenu(options: {
  win: BrowserWindow;
  folderId: string;
}): void {
  const template = buildFolderContextMenuTemplate();
  const menu = Menu.buildFromTemplate(
    template.map((item) =>
      toElectronMenuItem({
        item,
        onCommand: (command) => {
          options.win.webContents.send(IPC_EVENTS.contextMenu.didSelect, {
            target: { kind: 'folder', folderId: options.folderId },
            command,
          } satisfies ContextMenuDidSelectPayload);
        },
      })
    )
  );

  menu.popup({ window: options.win });
}
