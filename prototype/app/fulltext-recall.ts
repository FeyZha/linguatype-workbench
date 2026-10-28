import type { EssayDocument } from './workspace-state.ts';

export const FULLTEXT_RECALL_API_PATH = '/api/fulltext-recall';
export const FULLTEXT_PROMPT_VERSION = 'fulltext-reuse-v4-confirmed-essays';
export const MAX_FULLTEXT_INPUT_BYTES = 120000;
export type ConfirmedEssay = { documentId: string; versionId: string; title: string; confirmedAt: string; essayHash: string; text: string };
export type FulltextInput = { version: 4; currentDocumentId: string; taskPrompt: string; essays: ConfirmedEssay[] };
export type ReusePath = { old_point: string; sources: [{ essay_id: string; quote: string }]; adaptation_direction: string };
export type FulltextResult = { version: 4; paths: ReusePath[]; meta: { promptVersion: string; callCount: number; model: string | null; latencyMs: number } };

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function keys(v: Record<string, unknown>, expected: string[]) { return Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k)); }
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;

/** Latest independently confirmed snapshot, including archived essays; never the editable draft. */
export function confirmedEssayLibrary(documents: EssayDocument[], currentDocumentId: string): ConfirmedEssay[] {
  const selected: ConfirmedEssay[] = [];
  for (const doc of [...documents].sort((a,b) => a.documentId.localeCompare(b.documentId))) {
    if (doc.documentId === currentDocumentId) continue;
    const versions = (doc.completedVersions ?? []).filter(v => v.documentId === doc.documentId);
    const latest = versions.reduce<typeof versions[number] | undefined>((a,b) => !a || Date.parse(b.confirmedAt) >= Date.parse(a.confirmedAt) ? b : a, undefined);
    if (!latest) continue;
    // Exact duplicate full texts are included only once; old revisions remain stored.
    if (selected.some(e => e.text === latest.snapshot)) continue;
    selected.push({ documentId: doc.documentId, versionId: latest.id, title: latest.sourceTitle, confirmedAt: latest.confirmedAt, essayHash: latest.essayHash, text: latest.snapshot });
  }
  return selected;
}

export function readFulltextInput(value: unknown): FulltextInput {
  if (!object(value) || !keys(value,['version','currentDocumentId','taskPrompt','essays']) || value.version !== 4 || !text(value.currentDocumentId,200) || !text(value.taskPrompt,4000) || !Array.isArray(value.essays)) throw new Error('INVALID_INPUT');
  const seen = new Set<string>();
  const bodies = new Set<string>();
  for (const e of value.essays) {
    if (!object(e) || !keys(e,['documentId','versionId','title','confirmedAt','essayHash','text']) || !text(e.documentId,200) || e.documentId === value.currentDocumentId || seen.has(e.documentId) || !text(e.versionId,200) || !text(e.title,4000) || !text(e.text,20000) || !text(e.confirmedAt,100) || !Number.isFinite(Date.parse(e.confirmedAt)) || typeof e.essayHash !== 'string' || !/^[a-f0-9]{64}$/.test(e.essayHash)) throw new Error('INVALID_INPUT');
    seen.add(e.documentId);
    if (bodies.has(e.text)) throw new Error('INVALID_INPUT');
    bodies.add(e.text);
  }
  const input = structuredClone(value) as FulltextInput;
  // Capacity is a whole-request rejection, never a candidate filter or truncation.
  if (new TextEncoder().encode(JSON.stringify(fulltextModelInput(input))).length > MAX_FULLTEXT_INPUT_BYTES) throw new Error('FULLTEXT_TOO_LARGE');
  return input;
}

export function fulltextModelInput(input: FulltextInput) {
  return { task_prompt: input.taskPrompt, essays: input.essays.map((e,i) => ({ essay_id: `E${String(i+1).padStart(3,'0')}`, text: e.text })) };
}

export function bindFulltextOutput(value: unknown, input: FulltextInput): ReusePath[] {
  if (!object(value) || !keys(value,['paths']) || !Array.isArray(value.paths) || value.paths.length > 3) throw new Error('INVALID_OUTPUT');
  const essays = fulltextModelInput(input).essays;
  return value.paths.map(p => {
    if (!object(p) || !keys(p,['old_point','sources','adaptation_direction']) || !text(p.old_point,2000) || !text(p.adaptation_direction,4000) || !Array.isArray(p.sources) || p.sources.length !== 1) throw new Error('INVALID_OUTPUT');
    const source = p.sources[0];
    if (!object(source) || !keys(source,['essay_id','quote']) || typeof source.essay_id !== 'string' || !text(source.quote,10000)) throw new Error('INVALID_OUTPUT');
    const essay = essays.find(e => e.essay_id === source.essay_id);
    if (!essay || !/内容调整\s*[:：]/.test(p.adaptation_direction) || !/句式复用\s*[:：]/.test(p.adaptation_direction) || /(可沿用|原句中的|句式复用：沿用)$/.test(p.adaptation_direction.trim())) throw new Error('INVALID_OUTPUT');
    const positions: number[]=[];
    for (let i=0;i<essay.text.length;i++) if (!/\s/.test(essay.text[i])) positions.push(i);
    const needle=source.quote.replace(/\s/g,''), hay=positions.map(i=>essay.text[i]).join(''), start=hay.indexOf(needle);
    if (!needle || start<0) throw new Error('INVALID_SOURCE_QUOTE');
    const quote=essay.text.slice(positions[start],positions[start+needle.length-1]+1);
    return {old_point:p.old_point,sources:[{essay_id:source.essay_id,quote}],adaptation_direction:p.adaptation_direction};
  });
}

export function readFulltextResult(value: unknown, input: FulltextInput): FulltextResult {
  if (!object(value) || !keys(value,['version','paths','meta']) || value.version!==4 || !object(value.meta)) throw new Error('INVALID_RESPONSE');
  const meta=value.meta;
  if (meta.promptVersion!==FULLTEXT_PROMPT_VERSION || meta.callCount!==(input.essays.length?1:0) || !(meta.model===null || typeof meta.model==='string') || typeof meta.latencyMs!=='number' || !Number.isFinite(meta.latencyMs) || meta.latencyMs<0) throw new Error('INVALID_RESPONSE');
  return {version:4,paths:bindFulltextOutput({paths:value.paths},input),meta:meta as FulltextResult['meta']};
}

export function fulltextErrorMessage(code: string) {
  if (code==='FULLTEXT_TOO_LARGE') return '已确认旧文超过本轮全文容量，未发送、未截断。正文和历史版本都已保留。';
  if (code==='CODEX_NOT_CONFIGURED') return '本机 Codex 连接尚未启动，请从正式产品的 Codex 体验入口启动。';
  if (code==='RECALL_BUSY') return '另一条旧文请求仍在处理，请稍后手动查找。';
  return '这个题目没有预置复用结果。请使用上方体验场景；正文和已确认版本都已保留。';
}
