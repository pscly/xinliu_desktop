// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { CONTEXT_MENU_COMMANDS } from '../../shared/ipc';

import {
  buildFolderContextMenuTemplate,
  buildMiddleItemContextMenuTemplate,
} from './contextMenuTemplates';

function onlyItemCommands(template: ReturnType<typeof buildMiddleItemContextMenuTemplate>) {
  return template.filter((x) => x.kind === 'item').map((x) => x.command);
}

describe('src/main/menu/contextMenuTemplates', () => {
  it('中栏条目右键菜单：必须包含 打开/移动到/删除/导出（且命令来自枚举）', () => {
    const template = buildMiddleItemContextMenuTemplate();
    const commands = onlyItemCommands(template);

    expect(commands).toContain(CONTEXT_MENU_COMMANDS.open);
    expect(commands).toContain(CONTEXT_MENU_COMMANDS.moveTo);
    expect(commands).toContain(CONTEXT_MENU_COMMANDS.delete);
    expect(commands).toContain(CONTEXT_MENU_COMMANDS.export);

    const enumValues = new Set(Object.values(CONTEXT_MENU_COMMANDS));
    for (const c of commands) {
      expect(enumValues.has(c)).toBe(true);
    }

    const hasSeparator = template.some((x) => x.kind === 'separator');
    expect(hasSeparator).toBe(true);
  });

  it('左栏 Folder 右键菜单：必须包含 新建子项/重命名/移动/删除（且命令来自枚举）', () => {
    const template = buildFolderContextMenuTemplate();
    const commands = onlyItemCommands(template);

    expect(commands).toContain(CONTEXT_MENU_COMMANDS.newChild);
    expect(commands).toContain(CONTEXT_MENU_COMMANDS.rename);
    expect(commands).toContain(CONTEXT_MENU_COMMANDS.move);
    expect(commands).toContain(CONTEXT_MENU_COMMANDS.delete);

    const enumValues = new Set(Object.values(CONTEXT_MENU_COMMANDS));
    for (const c of commands) {
      expect(enumValues.has(c)).toBe(true);
    }

    const hasSeparator = template.some((x) => x.kind === 'separator');
    expect(hasSeparator).toBe(true);
  });
});
