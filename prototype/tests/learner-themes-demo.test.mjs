import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createLearnerThemesWorkspace, LEARNER_THEMES, LEARNER_THEME_ESSAYS, LEARNER_THEME_CASES } from '../app/demo-learner-themes.ts';
import { isPersistedWorkspace } from '../app/workspace-state.ts';
import { isLearnerThemesDemoMode, workspaceStorageKey } from '../app/workspace-mode.ts';
import { readArgumentAssetRecallInput } from '../app/argument-asset-recall.ts';

const run = new URL('../../evals/argument-asset-loop/runs/learner-themes-25-v1-20260926/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, run), 'utf8'));

test('25-essay experience preserves real extraction, independent decisions, frozen sources and isolated empty recall drafts', () => {
  const demo = createLearnerThemesWorkspace(), saved = read('workspace.json'), source = read('essays.json');
  const extraction = read('extraction.json'), decisions = read('decisions.json');
  assert(isPersistedWorkspace(demo));
  assert.equal(createHash('sha256').update(readFileSync(new URL('essays.json', run))).digest('hex'), read('manifest.json').sourceSha256);
  assert.equal(source.synthetic, true);
  assert.equal(decisions.synthetic, true);
  assert.equal(demo.documents.length, 40);
  assert.equal(LEARNER_THEMES.length, 5);
  assert.equal(LEARNER_THEME_ESSAYS.length, 25);
  assert.equal(LEARNER_THEME_CASES.length, 15);
  assert.deepEqual(LEARNER_THEME_CASES, JSON.parse(readFileSync(new URL('../../evals/argument-asset-loop/eval-sets/learner-themes-recall.v1/cases.json', import.meta.url), 'utf8')).cases);
  assert.deepEqual(demo.documents.slice(15), saved.documents);
  assert.deepEqual(demo.argumentAssets, saved.argumentAssets);
  assert.deepEqual(demo.topicAssetPacks, saved.topicAssetPacks);
  assert.equal(demo.argumentAssets.length, 7);
  assert.equal(demo.argumentAssetUsages.length, 0);
  assert.equal(demo.expressionMemories.length, 0);
  for (const theme of LEARNER_THEMES) {
    assert.equal(source.essays.filter(essay => essay.theme === theme.id).length, 5);
    assert.deepEqual(LEARNER_THEME_CASES.filter(item => item.theme === theme.id).map(item => item.kind).sort(), ['boundary', 'hit', 'miss']);
  }
  for (const original of source.essays) {
    const document = demo.documents.find(item => item.documentId === original.id);
    const version = document.completedVersions[0];
    const record = extraction.records.find(item => item.documentId === original.id);
    assert.equal(document.essay, original.finalEssay);
    assert.equal(version.snapshot, original.finalEssay);
    assert.equal(document.taskPrompt, original.taskPrompt);
    assert.equal(original.wordCount, original.finalEssay.trim().split(/\s+/).length);
    assert(original.wordCount >= 250 && original.wordCount <= 290);
    assert.equal(version.status === 'error', record.status === 'error');
    if (record.status === 'ready') assert.deepEqual(version.candidate, record.completion.candidate);
  }
  assert.equal(demo.documents.filter(item => item.completedVersions?.[0].status === 'error').length, 14);
  for (const asset of demo.argumentAssets) {
    assert.equal(asset.kind, 'thought');
    assert.equal(asset.usageCount, 0);
    for (const source of asset.sources) {
      const document = demo.documents.find(item => item.documentId === source.documentId);
      assert(document.essay.includes(source.quote));
      assert.equal(source.revisionId, document.completedVersions[0].id);
      assert.equal(decisions.decisions.find(item => item.documentId === source.documentId).action, 'new');
    }
  }
  for (const item of LEARNER_THEME_CASES) {
    const document = demo.documents.find(document => document.documentId === item.documentId);
    assert.equal(document.essay, '');
    assert.equal(document.taskPrompt, item.taskPrompt);
    assert(!demo.argumentAssets.some(asset => asset.sources.some(source => source.documentId === item.documentId)));
    const input = readArgumentAssetRecallInput({ taskPrompt: item.taskPrompt, currentDraft: '', assets: demo.argumentAssets });
    assert.equal(input.assets.length, 7);
    assert.deepEqual(Object.keys(input).sort(), ['assets', 'currentDraft', 'taskPrompt']);
    assert(!JSON.stringify(input).includes(item.explanation));
  }
  for (const key of ['linguatype:workspace:v2', 'linguatype:draft:v1', 'linguatype:conflict:v2', 'linguatype:profile-epoch']) {
    const isolated = workspaceStorageKey(key, '?demo=learner25');
    for (const mode of ['', '?demo=0', '?demo=learner', '?demo=recall']) assert.notEqual(isolated, workspaceStorageKey(key, mode));
  }
  assert(isLearnerThemesDemoMode('?demo=learner25'));
  assert(!isLearnerThemesDemoMode('?demo=learner'));
  demo.argumentAssets[0].thought = 'Local edit';
  assert.notEqual(createLearnerThemesWorkspace().argumentAssets[0].thought, 'Local edit');
});
