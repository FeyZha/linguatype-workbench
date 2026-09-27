import { readVerification, VerifierContractError, type VerificationDiagnostic } from './argument-asset-verification.ts';

export const RELATION_VALUES = {
  relationMatch: ['same', 'partial', 'different'],
  prerequisite: ['satisfied', 'not_required', 'missing', 'contradicted'],
  contribution: ['direct', 'limit', 'exception', 'counterpoint', 'partial', 'none'],
  contributionBasis: ['main_relation', 'supported_boundary', 'supported_independent_relation', 'none'],
} as const;

export type RelationCheck = { assetId: string } & { [K in keyof typeof RELATION_VALUES]: (typeof RELATION_VALUES)[K][number] };

export function decideRelation(check: RelationCheck): boolean {
  if (check.relationMatch === 'different' || check.contribution === 'none' || check.contributionBasis === 'none') return false;
  const available = check.prerequisite === 'satisfied' || check.prerequisite === 'not_required';
  if (check.contribution === 'direct') return available && check.contributionBasis === 'main_relation';
  if (check.contributionBasis === 'main_relation') return available;
  if (check.contributionBasis === 'supported_boundary') return ['limit', 'exception', 'counterpoint'].includes(check.contribution);
  return check.contributionBasis === 'supported_independent_relation';
}

export const RELATION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['checks'],
  properties: { checks: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['assetId', ...Object.keys(RELATION_VALUES)],
    properties: { assetId: { type: 'string' }, ...Object.fromEntries(Object.entries(RELATION_VALUES).map(([key, values]) => [key, { type: 'string', enum: values }])) },
  } } },
};

export function relationSchema(candidateIds: string[]) {
  return { ...RELATION_SCHEMA, properties: { checks: { ...RELATION_SCHEMA.properties.checks, items: {
    ...RELATION_SCHEMA.properties.checks.items,
    properties: { ...RELATION_SCHEMA.properties.checks.items.properties, assetId: { type: 'string', enum: candidateIds } },
  } } } };
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const category = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

export function readRelationVerification(value: unknown, candidateIds: string[]) {
  const wrapped = object(value) && Object.keys(value).length === 1 && Object.hasOwn(value, 'parameters');
  const raw = wrapped ? value.parameters : value;
  const diagnostic: VerificationDiagnostic = {
    normalization: wrapped ? 'parameters_wrapper' : 'none', schemaParsePassed: false, domainPassed: false,
    rawSummary: { rootType: category(value), rootFieldCount: object(value) ? Object.keys(value).length : 0, parametersWrapper: wrapped,
      checksType: category(object(raw) ? raw.checks : undefined), checkCount: object(raw) && Array.isArray(raw.checks) ? raw.checks.length : null },
  };
  const fail = (code: string, path: string, expected: string, received: unknown): never => {
    throw new VerifierContractError({ ...diagnostic, error: { code: `VERIFIER_${code}`, path, expected, received: { type: category(received) } } });
  };
  if (!object(raw)) fail('ROOT_TYPE', '$', 'object with checks', raw);
  const root = raw as Record<string, unknown>;
  if (Object.keys(root).some(key => key !== 'checks')) fail('EXTRA_FIELD', '$.<extra>', 'only checks or sole parameters wrapper', root);
  if (!Array.isArray(root.checks)) fail('CHECKS_TYPE', '$.checks', 'array', root.checks);
  const checks = (root.checks as unknown[]).map((item, index) => {
    const path = `$.checks[${index}]`;
    if (!object(item)) fail('CHECK_TYPE', path, 'fixed enum judgment', item);
    const check = item as Record<string, unknown>;
    if (Object.keys(check).some(key => !['assetId', ...Object.keys(RELATION_VALUES)].includes(key))) fail('EXTRA_FIELD', `${path}.<extra>`, 'only fixed judgment fields', check);
    if (typeof check.assetId !== 'string') fail('ID_TYPE', `${path}.assetId`, 'string', check.assetId);
    for (const [key, values] of Object.entries(RELATION_VALUES)) {
      if (!(values as readonly unknown[]).includes(check[key])) fail('ENUM_VALUE', `${path}.${key}`, values.join('|'), check[key]);
    }
    return check as RelationCheck;
  });
  // Reuse existing exact candidate-ID and coverage validation; no model boolean crosses this boundary.
  const result = readVerification({ checks: checks.map(check => ({ assetId: check.assetId, relevant: decideRelation(check) })) }, candidateIds);
  return { matches: result.matches, diagnostic: { ...diagnostic, schemaParsePassed: true, domainPassed: true }, decisions: checks.map(check => ({ ...check, relevant: decideRelation(check) })) };
}
