export type ExpressionMemory = {
  id: string;
  chinese: string;
  english: string;
  embedding: number[];
  revealCount: number;
  documentId: string;
  createdAt: string;
  lastSeenAt: string;
  status: 'active' | 'ignored';
};

export type ExpressionReveal = Pick<ExpressionMemory, 'chinese' | 'english' | 'documentId'>;

type LegacyFavorite = {
  favoriteId: string;
  expression: string;
  meaningZh: string;
  sourceDocumentId: string;
  createdAt: string;
};

const EMBEDDING_SIZE = 96;
const RECALL_THRESHOLD = 0.72;

function normalizeChinese(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\u3400-\u9fff]/g, '');
}

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function embedChinese(value: string) {
  const normalized = normalizeChinese(value) || value.normalize('NFKC').trim().toLowerCase();
  if (!normalized) throw new Error('EMBEDDING_UNAVAILABLE');
  const vector = Array<number>(EMBEDDING_SIZE).fill(0);
  const features = [...normalized];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    features.push(normalized.slice(index, index + 2));
  }
  for (const feature of features) vector[hash(feature) % EMBEDDING_SIZE] += 1;
  const magnitude = Math.hypot(...vector);
  return vector.map(value => value / magnitude);
}

function cosine(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  return left.reduce((score, value, index) => score + value * right[index], 0);
}

function englishWordForms(word: string) {
  const forms = new Set([word]);
  if (word.endsWith('ing') && word.length > 5) {
    const stem = word.slice(0, -3);
    forms.add(stem);
    forms.add(stem + 'e');
    if (stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
  }
  if (word.endsWith('ed') && word.length > 4) {
    const stem = word.slice(0, -2);
    forms.add(stem);
    forms.add(stem + 'e');
  }
  if (word.endsWith('s') && word.length > 3) forms.add(word.slice(0, -1));
  return forms;
}

function equivalentEnglish(left: string, right: string) {
  const words = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const leftWords = words(left);
  const rightWords = words(right);
  return leftWords.length === rightWords.length && leftWords.every((word, index) => {
    const rightForms = englishWordForms(rightWords[index]);
    return [...englishWordForms(word)].some(form => rightForms.has(form));
  });
}

export function isExpressionMemories(value: unknown): value is ExpressionMemory[] {
  return Array.isArray(value) && value.every(memory => {
    if (!memory || typeof memory !== 'object') return false;
    const item = memory as Partial<ExpressionMemory>;
    return typeof item.id === 'string' && !!item.id
      && typeof item.chinese === 'string' && !!item.chinese.trim() && item.chinese.length <= 3000
      && typeof item.english === 'string' && !!item.english.trim() && item.english.length <= 5000
      && Array.isArray(item.embedding) && item.embedding.length === EMBEDDING_SIZE && item.embedding.every(Number.isFinite)
      && Number.isSafeInteger(item.revealCount) && (item.revealCount ?? 0) >= 1
      && typeof item.documentId === 'string' && !!item.documentId
      && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt))
      && typeof item.lastSeenAt === 'string' && Number.isFinite(Date.parse(item.lastSeenAt))
      && (item.status === 'active' || item.status === 'ignored');
  });
}

export function migrateExpressionFavorites(favorites: LegacyFavorite[], existing: ExpressionMemory[] = []) {
  return favorites.reduce((memories, favorite) => {
    if (!favorite.meaningZh.trim() || memories.some(memory => memory.id === favorite.favoriteId || equivalentEnglish(memory.english, favorite.expression))) return memories;
    return [...memories, {
      id: favorite.favoriteId,
      chinese: favorite.meaningZh,
      english: favorite.expression,
      embedding: embedChinese(favorite.meaningZh),
      revealCount: 1,
      documentId: favorite.sourceDocumentId,
      createdAt: favorite.createdAt,
      lastSeenAt: favorite.createdAt,
      status: 'active' as const,
    }];
  }, [...existing]);
}

export function recordExpressionReveal(
  memories: ExpressionMemory[],
  reveal: ExpressionReveal,
  id: string,
  now: string,
) {
  const existing = memories.find(memory => equivalentEnglish(memory.english, reveal.english));
  if (!existing) {
    return [{ ...reveal, id, embedding: embedChinese(reveal.chinese), revealCount: 1, createdAt: now, lastSeenAt: now, status: 'active' as const }, ...memories];
  }
  return memories.map(memory => memory.id === existing.id
    ? { ...memory, revealCount: memory.revealCount + 1, lastSeenAt: now }
    : memory);
}

export function recordRememberedExpressionReveal(memories: ExpressionMemory[], id: string, now: string) {
  return memories.map(memory => memory.id === id
    ? { ...memory, revealCount: memory.revealCount + 1, lastSeenAt: now }
    : memory);
}

export function setExpressionMemoryStatus(memories: ExpressionMemory[], id: string, status: ExpressionMemory['status']) {
  return memories.map(memory => memory.id === id ? { ...memory, status } : memory);
}

export function selectExpressionMemoryCandidates(
  memories: ExpressionMemory[],
  chinese: string,
  embed: (value: string) => number[] = embedChinese,
) {
  try {
    const queries = (chinese.match(/[\u3400-\u9fff]+/g) ?? [chinese]).map(embed);
    return memories
      .filter(memory => memory.status === 'active')
      .map(memory => ({ memory, score: Math.max(...queries.map(query => cosine(query, memory.embedding))) }))
      .filter(candidate => candidate.score >= RECALL_THRESHOLD)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map(({ memory }) => ({ id: memory.id, chinese: memory.chinese, english: memory.english }));
  } catch {
    return [];
  }
}
