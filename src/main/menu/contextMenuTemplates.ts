import { CONTEXT_MENU_COMMANDS } from '../../shared/ipc';
import type { ContextMenuCommand } from '../../shared/ipc';

export type SerializableContextMenuItem =
  | {
      kind: 'item';
      label: string;
      command: ContextMenuCommand;
      enabled?: boolean;
    }
  | {
      kind: 'separator';
    };

export function buildMiddleItemContextMenuTemplate(): SerializableContextMenuItem[] {
  return [
    {
      kind: 'item',
      label: '打开',
      command: CONTEXT_MENU_COMMANDS.open,
    },
    {
      kind: 'item',
      label: '移动到…',
      command: CONTEXT_MENU_COMMANDS.moveTo,
    },
    {
      kind: 'item',
      label: '导出…',
      command: CONTEXT_MENU_COMMANDS.export,
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: '删除',
      command: CONTEXT_MENU_COMMANDS.delete,
    },
  ];
}

export function buildFolderContextMenuTemplate(): SerializableContextMenuItem[] {
  return [
    {
      kind: 'item',
      label: '新建子项',
      command: CONTEXT_MENU_COMMANDS.newChild,
    },
    {
      kind: 'item',
      label: '重命名',
      command: CONTEXT_MENU_COMMANDS.rename,
    },
    {
      kind: 'item',
      label: '移动…',
      command: CONTEXT_MENU_COMMANDS.move,
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: '删除',
      command: CONTEXT_MENU_COMMANDS.delete,
    },
  ];
}
