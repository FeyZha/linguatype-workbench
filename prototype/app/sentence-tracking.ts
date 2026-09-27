export type SentenceSpan = {
  text: string;
  start: number;
  end: number;
};

type TextEdit = {
  oldStart: number;
  oldEnd: number;
  newEnd: number;
};

export function hasChinese(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

export function findSentences(value: string): SentenceSpan[] {
  const pattern = /[^.!?。！？\n]+[.!?。！？]?/g;
  const sentences: SentenceSpan[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const raw = match[0];
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = match.index + leadingWhitespace;
    sentences.push({ text: trimmed, start, end: start + trimmed.length });
  }

  return sentences;
}

export function findMixedSentences(value: string) {
  return findSentences(value).filter((sentence) => hasChinese(sentence.text));
}

export function findSentenceContaining(value: string, fragment: string) {
  // ponytail: feedback has no source range yet; use its first exact quote until the schema carries one.
  const start = value.indexOf(fragment);
  return start < 0
    ? null
    : findSentences(value).find((sentence) => sentence.start <= start && start < sentence.end) ?? null;
}

export function reconcileQuotedSentence(previousEssay: string, nextEssay: string, quote: string) {
  const sentence = findSentenceContaining(previousEssay, quote);
  return sentence ? reconcileSentenceAnchor(previousEssay, nextEssay, sentence) : null;
}

export function selectionIsInsideSentence(
  sentence: SentenceSpan,
  selection: { start: number; end: number } | null,
) {
  return Boolean(
    selection && selection.start >= sentence.start && selection.end <= sentence.end,
  );
}

function findEdit(previous: string, next: string): TextEdit {
  let prefix = 0;
  const sharedLength = Math.min(previous.length, next.length);
  while (prefix < sharedLength && previous[prefix] === next[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    oldStart: prefix,
    oldEnd: previous.length - suffix,
    newEnd: next.length - suffix,
  };
}

function mapPosition(position: number, edit: TextEdit, bias: 'start' | 'end') {
  if (position <= edit.oldStart) return position;
  if (position >= edit.oldEnd) {
    return position + edit.newEnd - edit.oldEnd;
  }
  return bias === 'start' ? edit.oldStart : edit.newEnd;
}

function overlap(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

export function reconcileSentenceAnchor(
  previousEssay: string,
  nextEssay: string,
  anchor: SentenceSpan,
): SentenceSpan | null {
  if (previousEssay === nextEssay) return anchor;

  const edit = findEdit(previousEssay, nextEssay);
  const removedWholeSentence =
    edit.oldStart <= anchor.start &&
    edit.oldEnd >= anchor.end &&
    edit.newEnd === edit.oldStart;
  if (removedWholeSentence) return null;

  const expectedStart = mapPosition(anchor.start, edit, 'start');
  const expectedEnd = mapPosition(anchor.end, edit, 'end');
  const candidates = findSentences(nextEssay);
  if (!candidates.length) return null;

  const exact = candidates.find(
    (candidate) =>
      candidate.start === expectedStart && candidate.end === expectedEnd,
  );
  if (exact) return exact;

  const ranked = candidates
    .map((candidate) => {
      const shared = overlap(
        expectedStart,
        Math.max(expectedStart + 1, expectedEnd),
        candidate.start,
        candidate.end,
      );
      const distance = Math.abs(candidate.start - expectedStart);
      return { candidate, shared, distance };
    })
    .filter((entry) => entry.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.distance - b.distance);

  if (ranked[0]) return ranked[0].candidate;

  const editTouchesSentence =
    edit.oldStart <= anchor.end && edit.oldEnd >= anchor.start;
  if (!editTouchesSentence) return null;

  const insertionPoint = Math.min(edit.oldStart, Math.max(0, nextEssay.length - 1));
  return (
    candidates.find(
      (candidate) =>
        candidate.start <= insertionPoint && candidate.end >= insertionPoint,
    ) ?? null
  );
}
// Two mixed sentences can begin on the same rendered line; keep both help buttons reachable.
export function spaceSentenceButtons(tops: number[]) {
  const placed: number[] = [];
  for (const top of tops) placed.push(Math.max(top, (placed.at(-1) ?? -44) + 44));
  return placed;
}
