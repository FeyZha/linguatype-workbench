import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../app/prototype-cases.ts', import.meta.url), 'utf8');

test('demo release contains twelve full essays, one recall-ready draft and both scaffold types', () => {
  assert.ok((source.match(/completeEssay\(/g) ?? []).length >= 13);
  for (const documentId of [
    'demo-practical-skills',
    'demo-university-breadth',
    'demo-family-home',
    'demo-local-community',
  ]) {
    assert.ok(source.includes(`'${documentId}'`));
  }
  assert.match(source, /DEMO_LIBRARY_RELEASED_AT = '2026-09-03T09:35:20.000Z'/);
  assert.match(source, /DEMO_LIBRARY_RELEASE = '2026-09-14-recall-ready-v5'/);
  assert.match(source, /action: 'provide_expression'/);
  assert.match(source, /action: 'offer_scaffolds'/);
});
