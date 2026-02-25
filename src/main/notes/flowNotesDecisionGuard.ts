import type { NotesRoutedResult } from './notesRouter';

function describeNotesDecision(decision: NotesRoutedResult<unknown>): string {
  const kind = decision.kind;
  const provider = (decision as { provider?: unknown }).provider;
  if (typeof provider === 'string') return `kind=${kind}, provider=${provider}`;
  return `kind=${kind}`;
}

export function requireFlowNotesFinalDecision(decision: NotesRoutedResult<unknown>): {
  providerReason: string;
} {
  if (decision.provider !== 'flow_notes') {
    throw new Error(
      `禁止访问 FlowNotes：仅允许在本次请求最终 provider 为 FlowNotes 时读写（当前 ${describeNotesDecision(
        decision
      )}）`
    );
  }

  if (decision.kind === 'degraded') {
    const reason = decision.degradeReason;
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error('FlowNotes 降级写入必须包含 degradeReason（非空字符串）');
    }
    return { providerReason: reason };
  }

  const reason = decision.providerReason;
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('FlowNotes 写入必须包含 providerReason（非空字符串）');
  }

  return { providerReason: reason };
}
