import assert from 'node:assert/strict';
import test from 'node:test';
import {
  embedChinese,
  isExpressionMemories,
  migrateExpressionFavorites,
  recordExpressionReveal,
  recordRememberedExpressionReveal,
  selectExpressionMemoryCandidates,
  setExpressionMemoryStatus,
} from '../app/expression-memory.ts';

const now = '2026-09-15T08:00:00.000Z';
const first = { chinese: '缓解交通拥堵', english: 'ease traffic congestion', documentId: 'doc-1' };

test('a reveal creates one memory and repeated or inflected reveals update it', () => {
  assert.deepEqual([], []); // Rendering or generation alone never calls the reveal writer.
  const created = recordExpressionReveal([], first, 'memory-1', now);
  assert.equal(created.length, 1);
  assert.equal(created[0].revealCount, 1);
  const repeated = recordExpressionReveal(created, { ...first, english: 'easing traffic congestion' }, 'memory-2', '2026-09-15T09:00:00.000Z');
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].revealCount, 2);
  assert.equal(repeated[0].lastSeenAt, '2026-09-15T09:00:00.000Z');
  assert.equal(isExpressionMemories(repeated), true);
});

test('high-precision local recall returns at most three active IDs and degrades to empty', () => {
  const memories = [
    ...recordExpressionReveal([], first, 'memory-1', now),
    ...recordExpressionReveal([], { chinese: '承担高昂成本', english: 'bear high costs', documentId: 'doc-2' }, 'memory-2', now),
  ];
  assert.deepEqual(selectExpressionMemoryCandidates(memories, '有效缓解交通拥堵').map(item => item.id), ['memory-1']);
  assert.deepEqual(selectExpressionMemoryCandidates(memories, '博物馆是否应该免费开放'), []);
  assert.deepEqual(selectExpressionMemoryCandidates(memories, '缓解交通拥堵', () => { throw new Error('service failed'); }), []);
  const ignored = setExpressionMemoryStatus(memories, 'memory-1', 'ignored');
  assert.deepEqual(selectExpressionMemoryCandidates(ignored, '缓解交通拥堵'), []);
  assert.deepEqual(selectExpressionMemoryCandidates(ignored.filter(item => item.id !== 'memory-1'), '缓解交通拥堵'), []);
});

test('showing a remembered expression is passive; revealing it increments locally', () => {
  const memories = recordExpressionReveal([], first, 'memory-1', now);
  const displayed = structuredClone(memories);
  assert.equal(displayed[0].revealCount, 1);
  const revealed = recordRememberedExpressionReveal(displayed, 'memory-1', '2026-09-15T10:00:00.000Z');
  assert.equal(revealed[0].revealCount, 2);
  assert.equal(revealed[0].lastSeenAt, '2026-09-15T10:00:00.000Z');
});

test('legacy favorites migrate once without inventing contacts and keep source document', () => {
  const favorite = { favoriteId: 'old-1', expression: 'ease traffic congestion', meaningZh: '缓解交通拥堵', sourceDocumentId: 'doc-1', createdAt: now };
  const migrated = migrateExpressionFavorites([favorite]);
  assert.deepEqual({ chinese: migrated[0].chinese, english: migrated[0].english, revealCount: migrated[0].revealCount, documentId: migrated[0].documentId, status: migrated[0].status }, {
    chinese: '缓解交通拥堵', english: 'ease traffic congestion', revealCount: 1, documentId: 'doc-1', status: 'active',
  });
  assert.equal(migrateExpressionFavorites([favorite], migrated).length, 1);
  assert.equal(migrated[0].embedding.length, embedChinese('缓解交通拥堵').length);
});
