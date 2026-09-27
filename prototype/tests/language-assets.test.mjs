import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_ASSET_LIBRARY, saveLanguageAsset, recordAssetExposure, deleteLanguageAsset, deleteAssetSource, isAssetLibrary } from '../app/language-assets.ts';

test('preserves source and revision evidence across save, reveal, edits, and deletion', () => {
  const quote = 'Cities can ease traffic congestion.';
  const value = { assetId: 'a1', meaningZh: '缓解交通拥堵', expression: 'ease traffic congestion', conditions: '用于交通', sourceDocumentId: 'source', sourceQuote: quote };
  const saved = saveLanguageAsset(EMPTY_ASSET_LIBRARY, value, quote, '2026-09-10');
  assert.equal(saved.assets[0].quality, 'unreviewed');
  assert.throws(() => saveLanguageAsset(saved, { ...value, assetId: 'duplicate' }, quote, 'later'), /已有/);
  assert.throws(() => saveLanguageAsset(saved, value, 'Unrelated text.', 'later'), /来源/);
  const exposed = recordAssetExposure(saved, 'a1', 'english', 'next', 'Before help.', 'later');
  const edited = saveLanguageAsset(exposed, { ...value, conditions: '修改用法说明' }, quote, 'later');
  assert.equal(edited.assets[0].revision, 2);
  assert.ok(isAssetLibrary(JSON.parse(JSON.stringify(edited))));
  assert.equal(isAssetLibrary({ ...edited, assets: [null] }), false);
  assert.equal(isAssetLibrary({ ...edited, exposures: [{ ...edited.exposures[0], essayBefore: null }] }), false);
  assert.equal(edited.exposures[0].assetRevision, 1);
  assert.equal(edited.exposures[0].essayBefore, 'Before help.');
  assert.equal(JSON.parse(JSON.stringify(edited)).exposures[0].content, `${value.expression}\n${value.conditions}`);
  assert.equal(deleteAssetSource(edited, 'source', true).assets.length, 1);
  assert.equal(deleteAssetSource(edited, 'source', false).exposures.length, 0);
  assert.equal(deleteAssetSource(edited, 'next', true).exposures.length, 0);
  assert.deepEqual(deleteLanguageAsset(edited, 'a1'), { assets: [], exposures: [], sequence: 1 });
  assert.deepEqual(EMPTY_ASSET_LIBRARY, { assets: [], exposures: [], sequence: 0 });
});
