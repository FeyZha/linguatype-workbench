import { readReasonQualityInput } from '../../reason-chains.ts';
import { checkReasonQuality } from '../../server/reason-chains.ts';
export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' }; let input, assetId: string, revision: number;
  try {
    const text = await request.text(); if (text.length > 100000) throw new Error('INVALID_INPUT');
    const v = JSON.parse(text);
    if (!v || Object.keys(v).length !== 5 || typeof v.assetId !== 'string' || !v.assetId || v.assetId.length > 200 || !Number.isSafeInteger(v.revision) || v.revision < 1) throw new Error('INVALID_INPUT');
    assetId = v.assetId; revision = v.revision; input = readReasonQualityInput({ taskPrompt: v.taskPrompt, candidate: v.candidate, sourceEssay: v.sourceEssay });
  } catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try { const { result, meta } = await checkReasonQuality(input); return Response.json({ version: 1, assetId, revision, quality: result, checkedAt: new Date().toISOString(), promptVersion: meta.promptVersion, callCount: meta.callCount, model: 'model' in meta ? meta.model : null }, { headers }); }
  catch { return Response.json({ version: 1, error: 'REASON_QUALITY_UNAVAILABLE' }, { status: 502, headers }); }
}
