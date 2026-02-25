import type {
  ShortcutId,
  ShortcutStatusEntry,
  ShortcutsSetConfigPayload,
  ShortcutsStatus,
} from '../../shared/ipc';

export interface GlobalShortcutLike {
  register: (accelerator: string, callback: () => void) => boolean;
  unregister: (accelerator: string) => void;
  unregisterAll: () => void;
  isRegistered: (accelerator: string) => boolean;
}

export interface AppLike {
  on: (eventName: 'will-quit', listener: () => void) => void;
}

export type ShortcutDefinition = {
  id: ShortcutId;
  title: string;
  description: string;
  defaultAccelerator: string;
  action: () => void;
};

type ShortcutConfig = {
  accelerator: string;
  enabled: boolean;
};

type RegistrationSnapshot = {
  state: 'registered' | 'unregistered' | 'failed';
  message: string | null;
};

export interface ShortcutsManager {
  registerAll: () => void;
  unregisterAll: () => void;
  getStatus: () => ShortcutsStatus;
  setConfig: (payload: ShortcutsSetConfigPayload) => void;
  resetAll: () => void;
  resetOne: (id: ShortcutId) => void;
}

function normalizeAccelerator(input: string): string {
  return input.trim();
}

function buildDefaultConfig(defs: ShortcutDefinition[]): Map<string, ShortcutConfig> {
  const map = new Map<string, ShortcutConfig>();
  for (const def of defs) {
    map.set(def.id, {
      accelerator: def.defaultAccelerator,
      enabled: true,
    });
  }
  return map;
}

export function createShortcutsManager(options: {
  globalShortcut: GlobalShortcutLike;
  definitions: ShortcutDefinition[];
}): ShortcutsManager {
  const defs = options.definitions;
  const defById = new Map<string, ShortcutDefinition>();
  for (const def of defs) {
    defById.set(def.id, def);
  }

  const configById = buildDefaultConfig(defs);

  const registrationById = new Map<string, RegistrationSnapshot>();

  const activeAcceleratorById = new Map<string, string>();

  const ensureRegistrationSnapshot = (id: string): RegistrationSnapshot => {
    const current = registrationById.get(id);
    if (current) {
      return current;
    }
    const initial: RegistrationSnapshot = { state: 'unregistered', message: null };
    registrationById.set(id, initial);
    return initial;
  };

  const unregisterIfNeeded = (accelerator: string) => {
    const normalized = normalizeAccelerator(accelerator);
    if (!normalized) {
      return;
    }
    try {
      if (options.globalShortcut.isRegistered(normalized)) {
        options.globalShortcut.unregister(normalized);
      }
    } catch {
    }
  };

  const registerOne = (id: string) => {
    const def = defById.get(id);
    const cfg = configById.get(id);
    if (!def || !cfg) {
      return;
    }

    const snapshot = ensureRegistrationSnapshot(id);

    const prevAccelerator = activeAcceleratorById.get(id);

    if (!cfg.enabled) {
      if (prevAccelerator) {
        unregisterIfNeeded(prevAccelerator);
      }
      activeAcceleratorById.delete(id);
      snapshot.state = 'unregistered';
      snapshot.message = null;
      return;
    }

    const accelerator = normalizeAccelerator(cfg.accelerator);

    if (prevAccelerator && prevAccelerator !== accelerator) {
      unregisterIfNeeded(prevAccelerator);
      activeAcceleratorById.delete(id);
    }

    if (!accelerator) {
      if (prevAccelerator) {
        unregisterIfNeeded(prevAccelerator);
      }
      activeAcceleratorById.delete(id);
      snapshot.state = 'failed';
      snapshot.message = '快捷键不能为空';
      return;
    }

    unregisterIfNeeded(accelerator);

    let ok = false;
    try {
      ok = options.globalShortcut.register(accelerator, () => {
        try {
          def.action();
        } catch {
        }
      });
    } catch {
      ok = false;
    }

    if (!ok) {
      snapshot.state = 'failed';
      snapshot.message = '注册失败（可能被占用或格式不正确）';
      activeAcceleratorById.delete(id);
      return;
    }

    snapshot.state = 'registered';
    snapshot.message = null;
    activeAcceleratorById.set(id, accelerator);
  };

  const buildStatusEntry = (id: string): ShortcutStatusEntry | null => {
    const def = defById.get(id);
    const cfg = configById.get(id);
    const snapshot = registrationById.get(id) ?? { state: 'unregistered', message: null };
    if (!def || !cfg) {
      return null;
    }

    const accelerator = normalizeAccelerator(cfg.accelerator);

    return {
      id: def.id,
      title: def.title,
      description: def.description,
      accelerator,
      enabled: cfg.enabled,
      registrationState: snapshot.state,
      registrationMessage: snapshot.message,
    };
  };

  return {
    registerAll: () => {
      for (const def of defs) {
        registerOne(def.id);
      }
    },
    unregisterAll: () => {
      try {
        options.globalShortcut.unregisterAll();
      } catch {
      }
      activeAcceleratorById.clear();
      for (const def of defs) {
        const snapshot = ensureRegistrationSnapshot(def.id);
        snapshot.state = 'unregistered';
        snapshot.message = null;
      }
    },
    getStatus: () => {
      const entries: ShortcutStatusEntry[] = [];
      for (const def of defs) {
        const entry = buildStatusEntry(def.id);
        if (entry) {
          entries.push(entry);
        }
      }
      return { entries };
    },
    setConfig: (payload) => {
      const def = defById.get(payload.id);
      if (!def) {
        throw new Error('未知快捷键');
      }
      configById.set(payload.id, {
        accelerator: normalizeAccelerator(payload.accelerator),
        enabled: payload.enabled,
      });
      registerOne(payload.id);
    },
    resetAll: () => {
      const next = buildDefaultConfig(defs);
      configById.clear();
      for (const [k, v] of next.entries()) {
        configById.set(k, v);
      }
      for (const def of defs) {
        registerOne(def.id);
      }
    },
    resetOne: (id) => {
      const def = defById.get(id);
      if (!def) {
        throw new Error('未知快捷键');
      }
      configById.set(id, {
        accelerator: def.defaultAccelerator,
        enabled: true,
      });
      registerOne(id);
    },
  };
}

export function installShortcutsCleanupOnWillQuit(app: AppLike, mgr: ShortcutsManager): void {
  app.on('will-quit', () => {
    mgr.unregisterAll();
  });
}
