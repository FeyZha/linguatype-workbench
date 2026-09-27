import type {
  ScaffoldErrorCode,
  ScaffoldErrorResponse,
  ScaffoldSuccessResponse,
} from './scaffold-api-contract';

export const SCAFFOLD_REQUEST_FAILED = '本句暂时无法处理，原文没有被修改。';

const PROMPT_VERSIONS = new Set(['expression-scaffold-v7-full-controlled-rules', 'expression-scaffold-v7-expression-memory-v1']);
const SAFE_ERRORS: Record<ScaffoldErrorCode, string> = {
  INVALID_INPUT: '请确认题目、全文和目标句仍然完整。',
  MODEL_NOT_CONFIGURED: '内部模型尚未配置，原文没有被修改。',
  SCAFFOLD_GENERATION_FAILED: SCAFFOLD_REQUEST_FAILED,
};

type ParsedScaffoldResponse =
  | { ok: true; result: ScaffoldSuccessResponse }
  | { ok: false; error: string; code: ScaffoldErrorCode | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, keys: string[]) {
  return (
    Object.keys(record).length === keys.length &&
    keys.every((key) => Object.hasOwn(record, key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function isScaffold(value: unknown, sourceZh: string, index: number, semanticLabels: boolean) {
  if (!isRecord(value) || !hasOnlyKeys(value, ['scaffoldId', 'focusZh', 'recommendedExpression'])) {
    return false;
  }
  return (
    value.scaffoldId === `s${index + 1}` &&
    isNonEmptyString(value.focusZh) &&
    /[\u3400-\u9fff]/.test(value.focusZh) &&
    !/[A-Za-z]/.test(value.focusZh) &&
    (semanticLabels ? value.focusZh.length <= 160 && value.focusZh.replace(/[\s，。！？；：、（）]/g, '') !== sourceZh.replace(/[\s，。！？；：、（）]/g, '') : value.focusZh.length < sourceZh.length) &&
    isNonEmptyString(value.recommendedExpression)
  );
}

export function isScaffoldItem(value: unknown) {
  return hasScaffoldShape(value, false);
}

export function isIntentScaffoldItem(value: unknown) {
  return hasScaffoldShape(value, true);
}

function hasScaffoldShape(value: unknown, semanticLabels: boolean) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['sourceZh', 'action', 'recommendedExpression', 'scaffolds']) ||
    !isNonEmptyString(value.sourceZh) ||
    !/^[\u3400-\u9fff]+(?:[，、；：！？（）“”‘’·—][\u3400-\u9fff]+)*$/.test(value.sourceZh) ||
    !Array.isArray(value.scaffolds)
  ) {
    return false;
  }
  if (value.action === 'provide_expression') {
    return isNonEmptyString(value.recommendedExpression) && value.scaffolds.length === 0;
  }
  return (
    value.action === 'offer_scaffolds' &&
    value.recommendedExpression === null &&
    value.scaffolds.length >= 2 &&
    value.scaffolds.length <= (semanticLabels ? 2 : 3) &&
    value.scaffolds.every((scaffold, index) => isScaffold(scaffold, value.sourceZh as string, index, semanticLabels))
  );
}

export function isSuccessResponse(value: unknown): value is ScaffoldSuccessResponse {
  if (!isRecord(value) || !(hasOnlyKeys(value, ['items', 'meta']) || hasOnlyKeys(value, ['items', 'memoryMatchIds', 'meta']))) return false;
  if (!Array.isArray(value.items) || value.items.length === 0 || !value.items.every(isScaffoldItem)) {
    return false;
  }
  if (value.memoryMatchIds !== undefined && (!Array.isArray(value.memoryMatchIds) || value.memoryMatchIds.length > 3 || value.memoryMatchIds.some(id => !isNonEmptyString(id)) || new Set(value.memoryMatchIds).size !== value.memoryMatchIds.length)) return false;
  const meta = value.meta;
  return (
    isRecord(meta) &&
    hasOnlyKeys(meta, ['requestId', 'callCount', 'latencyMs', 'model', 'promptVersion']) &&
    isUuid(meta.requestId) &&
    meta.callCount === 1 &&
    Number.isInteger(meta.latencyMs) &&
    (meta.latencyMs as number) >= 0 &&
    isNonEmptyString(meta.model) &&
    isNonEmptyString(meta.promptVersion) && PROMPT_VERSIONS.has(meta.promptVersion)
  );
}

function isErrorResponse(
  value: unknown,
  expectedCode: ScaffoldErrorCode,
): value is ScaffoldErrorResponse {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['code', 'error', 'requestId']) &&
    value.code === expectedCode &&
    isNonEmptyString(value.error) &&
    isUuid(value.requestId)
  );
}

export async function readScaffoldResponse(
  response: Response,
  expectedVersion: string,
): Promise<ParsedScaffoldResponse> {
  const failed = (
    error = SCAFFOLD_REQUEST_FAILED,
    code: ScaffoldErrorCode | null = null,
  ): ParsedScaffoldResponse => ({
    ok: false,
    error,
    code,
  });

  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (
    response.headers.get('x-linguatype-api-version') !== expectedVersion ||
    contentType !== 'application/json'
  ) {
    return failed();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return failed();
  }

  if (response.status === 200) {
    return isSuccessResponse(payload) ? { ok: true, result: payload } : failed();
  }

  const expectedCode =
    response.status === 400
      ? 'INVALID_INPUT'
      : response.status === 502
        ? 'SCAFFOLD_GENERATION_FAILED'
        : response.status === 503
          ? 'MODEL_NOT_CONFIGURED'
          : null;
  return expectedCode && isErrorResponse(payload, expectedCode)
    ? failed(SAFE_ERRORS[expectedCode], expectedCode)
    : failed();
}
