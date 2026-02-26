import type {
  DiagnosticsNotesDegradeReason,
  DiagnosticsNotesProvider,
  DiagnosticsNotesProviderKind,
  DiagnosticsStatus,
} from '../../shared/ipc';
import { normalizeBaseUrl } from '../../shared/url';

import type { NotesDegradeReason, NotesRoutedResult } from '../notes/notesRouter';

const DEFAULT_FLOW_BASE_URL = 'https://xl.pscly.cc';

function safeNormalizeBaseUrl(input: string | null): string | null {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (raw.length === 0) {
    return null;
  }
  try {
    return normalizeBaseUrl(raw);
  } catch {
    return null;
  }
}

function asDiagnosticsReason(reason: NotesDegradeReason): DiagnosticsNotesDegradeReason {
  return reason;
}

export interface DiagnosticsController {
  getStatus: () => DiagnosticsStatus;
  setMemosBaseUrlRaw: (next: string | null) => void;
  setFlowBaseUrlRaw: (next: string | null) => void;
  recordNotesRoutedResult: (result: NotesRoutedResult<unknown>) => void;
}

export function createDiagnosticsController(options?: {
  flowBaseUrlRaw?: string | null;
  memosBaseUrlRaw?: string | null;
}): DiagnosticsController {
  const state: {
    flowBaseUrlRaw: string | null;
    memosBaseUrlRaw: string | null;
    notesProvider: DiagnosticsNotesProvider;
    notesProviderKind: DiagnosticsNotesProviderKind;
    lastDegradeReason: DiagnosticsNotesDegradeReason | null;
    lastRequestIds: {
      memos_request_id: string | null;
      flow_request_id: string | null;
    };
  } = {
    flowBaseUrlRaw: options?.flowBaseUrlRaw ?? DEFAULT_FLOW_BASE_URL,
    memosBaseUrlRaw: options?.memosBaseUrlRaw ?? null,
    notesProvider: null,
    notesProviderKind: null,
    lastDegradeReason: null,
    lastRequestIds: { memos_request_id: null, flow_request_id: null },
  };

  return {
    getStatus: () => {
      const flowBaseUrl = safeNormalizeBaseUrl(state.flowBaseUrlRaw);
      const memosBaseUrl = safeNormalizeBaseUrl(state.memosBaseUrlRaw);
      return {
        flowBaseUrl,
        memosBaseUrl,
        notesProvider: state.notesProvider,
        notesProviderKind: state.notesProviderKind,
        lastDegradeReason: state.lastDegradeReason,
        lastRequestIds: { ...state.lastRequestIds },
      };
    },
    setMemosBaseUrlRaw: (next) => {
      state.memosBaseUrlRaw = next;
    },
    setFlowBaseUrlRaw: (next) => {
      state.flowBaseUrlRaw = next;
    },
    recordNotesRoutedResult: (result) => {
      if (result.kind === 'degraded') {
        state.notesProvider = 'flow_notes';
        state.notesProviderKind = 'fallback';
        state.lastDegradeReason = asDiagnosticsReason(result.degradeReason);
        state.lastRequestIds = {
          memos_request_id: result.memos_request_id,
          flow_request_id: result.flow_request_id,
        };
        return;
      }

      state.notesProvider = result.provider;
      if (result.provider === 'memos') {
        state.notesProviderKind = 'direct';
        state.lastDegradeReason = null;
        state.lastRequestIds = { memos_request_id: result.request_id, flow_request_id: null };
        return;
      }

      state.notesProviderKind = 'fallback';
      state.lastDegradeReason = result.providerReason ? asDiagnosticsReason(result.providerReason) : null;
      state.lastRequestIds = { memos_request_id: null, flow_request_id: result.request_id };
    },
  };
}
