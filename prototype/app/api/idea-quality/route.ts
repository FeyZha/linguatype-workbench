import { readIdeaQualityInput, checkIdeaQuality } from '../../server/idea-quality.ts';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' }; let input;
  try { const text = await request.text(); if (text.length > 100000) throw new Error('INVALID_INPUT'); input = readIdeaQualityInput(JSON.parse(text)); }
  catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try { const { assetId, revision, result, meta } = await checkIdeaQuality(input); return Response.json({ version: 1, assetId, revision, quality: result.quality, checkedAt: new Date().toISOString(), promptVersion: meta.promptVersion, callCount: meta.callCount, model: meta.model ?? null }, { headers }); }
  catch { return Response.json({ version: 1, error: 'IDEA_QUALITY_UNAVAILABLE' }, { status: 502, headers }); }
}
