import { normalizeBaseUrl } from '../../shared/url';

import type { HttpError, HttpResult } from '../net/httpClient';

export type NotesProvider = 'memos' | 'flow_notes';

export type NotesProviderLabel = '[Memos]' | '[FlowNotes]';

export type NotesDegradeReason =
  | 'memos_base_url_invalid'
  | 'memos_unauthorized'
  | 'memos_network_or_timeout';

export type NotesAttempt<T> = {
  provider: NotesProvider;
  providerLabel: NotesProviderLabel;
  request_id: string;
  result: HttpResult<T>;
};

export type NotesRoutedResult<T> =
  | {
      kind: 'single';
      provider: NotesProvider;
      providerLabel: NotesProviderLabel;
      request_id: string;
      providerReason?: NotesDegradeReason;
      result: HttpResult<T>;
    }
  | {
      kind: 'degraded';
      provider: 'flow_notes';
      providerLabel: '[FlowNotes]';
      degradeReason: Exclude<NotesDegradeReason, 'memos_base_url_invalid'>;
      memos_request_id: string;
      flow_request_id: string;
      memos: NotesAttempt<T>;
      flow: NotesAttempt<T>;
      result: HttpResult<T>;
    };

export interface NotesRouterOptions<T> {
  memosBaseUrl?: string | null;
  memosRequest: () => Promise<HttpResult<T>>;
  flowNotesRequest: () => Promise<HttpResult<T>>;
}

function providerLabelOf(provider: NotesProvider): NotesProviderLabel {
  return provider === 'memos' ? '[Memos]' : '[FlowNotes]';
}

function pickRequestIdFromResult<T>(res: HttpResult<T>): string {
  if (res.ok) {
    const header = res.responseRequestIdHeader;
    if (typeof header === 'string' && header.trim().length > 0) return header;
    return res.requestId;
  }

  const header = res.error.responseRequestIdHeader;
  if (typeof header === 'string' && header.trim().length > 0) return header;
  return res.error.requestId;
}

function isMemosBaseUrlValid(input: string | null | undefined): boolean {
  if (typeof input !== 'string') return false;
  if (input.trim().length === 0) return false;
  try {
    normalizeBaseUrl(input);
    return true;
  } catch {
    return false;
  }
}

function shouldDegradeFromMemosError(error: HttpError): {
  shouldDegrade: boolean;
  reason: Exclude<NotesDegradeReason, 'memos_base_url_invalid'> | null;
} {
  if (error.code === 'HTTP_ERROR') {
    const status = error.status;
    if (status === 401 || status === 403) {
      return { shouldDegrade: true, reason: 'memos_unauthorized' };
    }
    return { shouldDegrade: false, reason: null };
  }

  if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
    return { shouldDegrade: true, reason: 'memos_network_or_timeout' };
  }

  return { shouldDegrade: false, reason: null };
}

export async function routeNotesRequest<T>(options: NotesRouterOptions<T>): Promise<NotesRoutedResult<T>> {
  if (!isMemosBaseUrlValid(options.memosBaseUrl)) {
    const flowRes = await options.flowNotesRequest();
    const request_id = pickRequestIdFromResult(flowRes);
    return {
      kind: 'single',
      provider: 'flow_notes',
      providerLabel: providerLabelOf('flow_notes'),
      request_id,
      providerReason: 'memos_base_url_invalid',
      result: flowRes,
    };
  }

  const memosRes = await options.memosRequest();
  const memosRequestId = pickRequestIdFromResult(memosRes);
  if (memosRes.ok) {
    return {
      kind: 'single',
      provider: 'memos',
      providerLabel: providerLabelOf('memos'),
      request_id: memosRequestId,
      result: memosRes,
    };
  }

  const degrade = shouldDegradeFromMemosError(memosRes.error);
  if (!degrade.shouldDegrade || !degrade.reason) {
    return {
      kind: 'single',
      provider: 'memos',
      providerLabel: providerLabelOf('memos'),
      request_id: memosRequestId,
      result: memosRes,
    };
  }

  const flowRes = await options.flowNotesRequest();
  const flowRequestId = pickRequestIdFromResult(flowRes);

  const memosAttempt: NotesAttempt<T> = {
    provider: 'memos',
    providerLabel: providerLabelOf('memos'),
    request_id: memosRequestId,
    result: memosRes,
  };

  const flowAttempt: NotesAttempt<T> = {
    provider: 'flow_notes',
    providerLabel: providerLabelOf('flow_notes'),
    request_id: flowRequestId,
    result: flowRes,
  };

  return {
    kind: 'degraded',
    provider: 'flow_notes',
    providerLabel: '[FlowNotes]',
    degradeReason: degrade.reason,
    memos_request_id: memosAttempt.request_id,
    flow_request_id: flowAttempt.request_id,
    memos: memosAttempt,
    flow: flowAttempt,
    result: flowRes,
  };
}
