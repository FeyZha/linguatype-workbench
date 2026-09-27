export const ARGUMENT_ASSET_RECALL_VERIFICATION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['checks'],
  properties: { checks: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['assetId', 'relevant'],
    properties: { assetId: { type: 'string' }, relevant: { type: 'boolean' } },
  } } },
};

export function verificationSchema(candidateIds: string[]) {
  const schema = ARGUMENT_ASSET_RECALL_VERIFICATION_SCHEMA;
  return { ...schema, properties: { checks: { ...schema.properties.checks, items: {
    ...schema.properties.checks.items,
    properties: { ...schema.properties.checks.items.properties, assetId: { type: 'string', enum: candidateIds } },
  } } } };
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const category = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const summary = (value: unknown) => ({ type: category(value), ...(typeof value === 'string' ? { length: value.length } : Array.isArray(value) ? { count: value.length } : {}) });

export type VerificationDiagnostic = {
  normalization: 'none' | 'parameters_wrapper' | 'tool_id' | 'tool_envelope' | 'arguments_json' | 'arguments_wrapper' | 'call_json' | 'method_wrapper' | 'detail_metadata';
  schemaParsePassed: boolean; domainPassed: boolean;
  rawSummary: { rootType: string; rootFieldCount: number; parametersWrapper: boolean; checksType: string; checkCount: number | null };
  error?: { code: string; path: string; expected: string; received: ReturnType<typeof summary> };
};

export class VerifierContractError extends Error {
  diagnostic: VerificationDiagnostic;
  constructor(diagnostic: VerificationDiagnostic) {
    super('INVALID_RESPONSE');
    this.diagnostic = diagnostic;
  }
}

export function readVerification(value: unknown, candidateIds: string[]) {
  const wrapped = object(value) && Object.keys(value).length === 1 && Object.hasOwn(value, 'parameters');
  const tagged = object(value) && Object.keys(value).length === 2 && value.toolId === 'verify_thought_relevance' && Object.hasOwn(value, 'checks');
  const envelope = object(value) && Object.keys(value).length === 3 && value.signal === 'tool_call' && value.toolName === 'verify_thought_relevance' && Object.hasOwn(value, 'parameters');
  const argumentsWrapper = object(value) && Object.keys(value).length === 1 && object(value.arguments);
  const methodWrapper = object(value) && Object.keys(value).length === 2 && value.method === 'verify_thought_relevance' && Object.hasOwn(value, 'parameters');
  const detailMetadata = object(value) && Object.keys(value).length === 2 && ['low', 'medium', 'high'].includes(value.detail as string) && Object.hasOwn(value, 'checks');
  const callJson = object(value) && Object.keys(value).length === 1 && typeof value.call === 'string';
  const argumentsJson = object(value) && Object.keys(value).length === 1 && typeof value.arguments === 'string';
  let raw = wrapped || envelope || methodWrapper ? value.parameters : argumentsWrapper ? value.arguments : tagged || detailMetadata ? { checks: value.checks } : value;
  let malformedArguments = false;
  if (argumentsJson || callJson) { try { raw = JSON.parse((callJson ? value.call : value.arguments) as string); } catch { malformedArguments = true; } }
  const diagnostic: VerificationDiagnostic = {
    normalization: wrapped ? 'parameters_wrapper' : tagged ? 'tool_id' : envelope ? 'tool_envelope' : argumentsJson ? 'arguments_json' : callJson ? 'call_json' : argumentsWrapper ? 'arguments_wrapper' : methodWrapper ? 'method_wrapper' : detailMetadata ? 'detail_metadata' : 'none', schemaParsePassed: false, domainPassed: false,
    rawSummary: { rootType: category(value), rootFieldCount: object(value) ? Object.keys(value).length : 0, parametersWrapper: wrapped, checksType: category(object(raw) ? raw.checks : undefined), checkCount: object(raw) && Array.isArray(raw.checks) ? raw.checks.length : null },
  };
  const fail = (code: string, path: string, expected: string, received: unknown): never => {
    throw new VerifierContractError({ ...diagnostic, error: { code, path, expected, received: summary(received) } });
  };
  if (malformedArguments) fail('VERIFIER_ARGUMENTS_PARSE', callJson ? '$.call' : '$.arguments', 'one valid JSON object with checks', object(value) ? value[callJson ? 'call' : 'arguments'] : undefined);
  if (!object(raw)) fail('VERIFIER_ROOT_TYPE', '$', 'object with checks', raw);
  const root = raw as Record<string, unknown>;
  if (Object.keys(root).some(key => key !== 'checks')) fail('VERIFIER_EXTRA_FIELD', '$.<extra>', 'only checks; sole parameters wrapper permitted', root);
  if (!Object.hasOwn(root, 'checks')) fail('VERIFIER_MISSING_FIELD', '$.checks', 'array', undefined);
  if (!Array.isArray(root.checks)) fail('VERIFIER_CHECKS_TYPE', '$.checks', 'array', root.checks);
  const checks = (root.checks as unknown[]).map((rawCheck, index) => {
    const path = `$.checks[${index}]`;
    if (!object(rawCheck)) fail('VERIFIER_CHECK_TYPE', path, 'object', rawCheck);
    const check = rawCheck as Record<string, unknown>;
    if (Object.keys(check).some(key => !['assetId', 'reason', 'relevant'].includes(key))) fail('VERIFIER_EXTRA_FIELD', `${path}.<extra>`, 'assetId, optional bounded reason, and relevant', check);
    if (Object.hasOwn(check, 'reason') && (typeof check.reason !== 'string' || check.reason.length > 240)) fail('VERIFIER_REASON_TYPE', `${path}.reason`, 'optional string at most 240 characters; never controls relevance', check.reason);
    for (const key of ['assetId', 'relevant']) if (!Object.hasOwn(check, key)) fail('VERIFIER_MISSING_FIELD', `${path}.${key}`, key === 'assetId' ? 'string' : 'boolean', undefined);
    if (typeof check.assetId !== 'string') fail('VERIFIER_ID_TYPE', `${path}.assetId`, 'string', check.assetId);
    if (typeof check.relevant !== 'boolean') fail('VERIFIER_BOOLEAN_TYPE', `${path}.relevant`, 'boolean, without coercion', check.relevant);
    return check as { assetId: string; relevant: boolean };
  });
  diagnostic.schemaParsePassed = true;
  const seen = new Set<string>();
  for (const [index, check] of checks.entries()) {
    if (!candidateIds.includes(check.assetId)) fail('VERIFIER_NON_CANDIDATE_ID', `$.checks[${index}].assetId`, 'ID in current candidate set', check.assetId);
    if (seen.has(check.assetId)) fail('VERIFIER_DUPLICATE_ID', `$.checks[${index}].assetId`, 'one judgment per candidate', check.assetId);
    seen.add(check.assetId);
  }
  if (checks.length !== candidateIds.length) fail('VERIFIER_COVERAGE', '$.checks', `exactly ${candidateIds.length} candidate judgments`, checks);
  diagnostic.domainPassed = true;
  return { matches: checks.filter(check => check.relevant).map(({ assetId }) => ({ assetId })), diagnostic };
}
