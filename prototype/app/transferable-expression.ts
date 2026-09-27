export type TransferableExpressionCandidate = {
  expression: string;
  meaningZh: string;
  pattern: string | null;
  usageScope: string | null;
  sourceForm: string;
  sourceQuote: string;
  /** Present on argument-graph deposits; absent on historical expression records. */
  attachedToNodeIds?: string[];
};

export type TransferableExpression = TransferableExpressionCandidate & {
  expressionId: string;
  sourceDocumentId: string;
  sourceRevisionId: string;
  /** Long-term links are added only after the user confirms an ArgumentAsset decision. */
  attachedToAssetIds?: string[];
  attachedToOccurrenceIds?: string[];
  provenance: { model: string; promptVersion: string };
};

export type LegacyCollocation = { expression: string; meaningZh: string; sourceQuote: string };

const chinese = (value: string) => /[\u3400-\u9fff]/.test(value);
const contentWords = (value: string) => (value.toLowerCase().match(/[a-z]+/g) ?? [])
  .filter(word => !['a', 'an', 'the', 'to', 'on', 'in', 'at', 'of', 'for', 'from', 'with', 'and', 'or', 'be', 'do', 'doing', 'sb', 'sth'].includes(word))
  .map(word => word.length > 4 ? word.replace(/ies$/, 'y').replace(/ing$/, '').replace(/ed$/, '').replace(/es$/, '').replace(/s$/, '') : word);
const clean = (value: unknown, max: number, required = true) => {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw new Error('INVALID_RESPONSE');
  return value.trim();
};

export function expressionKey(value: string) {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\b(someone|somebody)\b/g, 'sb').replace(/\b(something)\b/g, 'sth').replace(/[\[\]{}()+]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isClearlyLowValueExpression(value: string) {
  const words = value.trim().match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  return words.length <= 5 && /^(live|work|study|travel|go|stay|start|install|include|collect)\b/i.test(value.trim());
}

export function readTransferableExpressionCandidate(value: unknown, snapshot: string, allowDraft = false): TransferableExpressionCandidate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RESPONSE');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !['expression', 'meaningZh', 'pattern', 'usageScope', 'sourceForm', 'sourceQuote', 'attachedToNodeIds'].includes(key))) throw new Error('INVALID_RESPONSE');
  const expression = clean(raw.expression, 240, !allowDraft);
  const meaningZh = clean(raw.meaningZh, 300, !allowDraft);
  const sourceForm = clean(raw.sourceForm, 500);
  const sourceQuote = clean(raw.sourceQuote, 2000);
  const optional = (item: unknown, max: number) => item === null ? null : clean(item, max, false) || null;
  const pattern = optional(raw.pattern, 300), usageScope = optional(raw.usageScope, 400);
  const attachedToNodeIds = raw.attachedToNodeIds === undefined ? undefined : Array.isArray(raw.attachedToNodeIds) && raw.attachedToNodeIds.length > 0 && raw.attachedToNodeIds.length <= 4 && raw.attachedToNodeIds.every(id => typeof id === 'string' && !!id.trim() && id.length <= 240) && new Set(raw.attachedToNodeIds).size === raw.attachedToNodeIds.length ? raw.attachedToNodeIds as string[] : null;
  const words = expression.match(/[A-Za-z]+(?:'[A-Za-z]+)?|\b(?:sb|sth)\b/g) ?? [];
  const sourceWords = new Set(contentWords(sourceForm));
  const grounded = contentWords(expression).some(word => sourceWords.has(word));
  if (attachedToNodeIds === null || (!allowDraft || expression) && (words.length < 2 || words.length > 14 || chinese(expression) || /[.!?;:]$/.test(expression) || expression.toLowerCase() === sourceQuote.toLowerCase() || !grounded || isClearlyLowValueExpression(expression)) || !snapshot.includes(sourceQuote) || !sourceQuote.toLowerCase().includes(sourceForm.toLowerCase()) || sourceForm.length >= sourceQuote.trim().length || !/\p{L}/u.test(sourceForm) || !allowDraft && !chinese(meaningZh)) throw new Error('INVALID_RESPONSE');
  return { expression, meaningZh, pattern, usageScope, sourceForm, sourceQuote, ...(attachedToNodeIds ? { attachedToNodeIds } : {}) };
}

export function readTransferableExpressions(value: unknown, snapshot: string, allowDraft = false) {
  if (!Array.isArray(value) || value.length > 8) throw new Error('INVALID_RESPONSE');
  const seen = new Set<string>();
  return value.map(item => readTransferableExpressionCandidate(item, snapshot, allowDraft)).filter(item => {
    const key = expressionKey(item.expression);
    if (key && seen.has(key)) throw new Error('INVALID_RESPONSE');
    seen.add(key);
    return true;
  });
}

export function isSavedTransferableExpression(value: unknown, snapshot: string, documentId: string, revisionId: string): value is TransferableExpression {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  try {
    readTransferableExpressionCandidate(raw, snapshot);
  } catch {
    const candidate = Object.fromEntries(Object.entries(raw).filter(([key]) => ['expression', 'meaningZh', 'pattern', 'usageScope', 'sourceForm', 'sourceQuote', 'attachedToNodeIds'].includes(key)));
    try { readTransferableExpressionCandidate(candidate, snapshot); } catch { return false; }
  }
  return typeof raw.expressionId === 'string' && !!raw.expressionId.trim() && raw.expressionId.length <= 240
    && raw.sourceDocumentId === documentId && raw.sourceRevisionId === revisionId
    && (raw.attachedToAssetIds === undefined || Array.isArray(raw.attachedToAssetIds) && raw.attachedToAssetIds.length <= 100 && new Set(raw.attachedToAssetIds).size === raw.attachedToAssetIds.length && raw.attachedToAssetIds.every(id => typeof id === 'string' && !!id && id.length <= 200))
    && (raw.attachedToOccurrenceIds === undefined || Array.isArray(raw.attachedToOccurrenceIds) && raw.attachedToOccurrenceIds.length <= 100 && new Set(raw.attachedToOccurrenceIds).size === raw.attachedToOccurrenceIds.length && raw.attachedToOccurrenceIds.every(id => typeof id === 'string' && !!id && id.length <= 240))
    && !!raw.provenance && typeof raw.provenance === 'object'
    && typeof (raw.provenance as Record<string, unknown>).model === 'string' && !!(raw.provenance as Record<string, unknown>).model
    && typeof (raw.provenance as Record<string, unknown>).promptVersion === 'string' && !!(raw.provenance as Record<string, unknown>).promptVersion;
}

export function isLegacyCollocations(value: unknown, snapshot: string, allowDraft = false): value is LegacyCollocation[] {
  if (!Array.isArray(value) || value.length > 8) return false;
  const seen = new Set<string>();
  return value.every(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some(key => !['expression', 'meaningZh', 'sourceQuote'].includes(key))) return false;
    try {
      const expression = clean(item.expression, 240), meaningZh = clean(item.meaningZh, 300, !allowDraft), sourceQuote = clean(item.sourceQuote, 2000);
      const key = expressionKey(expression);
      const words = expression.split(/\s+/).length;
      if (words < 2 || words > 6 || chinese(expression) || !allowDraft && !chinese(meaningZh) || !snapshot.includes(sourceQuote) || !sourceQuote.toLowerCase().includes(expression.toLowerCase()) || expression.length >= sourceQuote.trim().length || seen.has(key)) return false;
      seen.add(key);
      return true;
    } catch { return false; }
  });
}
