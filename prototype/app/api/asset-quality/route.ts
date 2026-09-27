import { checkAssetQuality, readQualityInput } from '../../server/asset-quality.ts';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  let input;
  try {
    const body = await request.text();
    if (body.length > 100000) throw new Error('INVALID_INPUT');
    input = readQualityInput(JSON.parse(body));
  } catch {
    return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers });
  }
  try {
    const { assetId, revision, result, meta } = await checkAssetQuality(input);
    return Response.json({ version: 1, assetId, revision, quality: result.quality, checkedAt: new Date().toISOString(), promptVersion: meta.promptVersion, callCount: meta.callCount, model: meta.model ?? null }, { headers });
  } catch {
    return Response.json({ version: 1, error: 'QUALITY_UNAVAILABLE' }, { status: 502, headers });
  }
}
