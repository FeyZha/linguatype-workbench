import { detectLanguageReuse, readReuseInput } from '../../server/language-reuse.ts';
export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  let input;
  try { const body = await request.text(); if (body.length > 100000) throw new Error(); input = readReuseInput(JSON.parse(body)); }
  catch { return Response.json({ error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try {
    const { result, meta } = await detectLanguageReuse(input);
    return Response.json({ version: 1, assetId: input.assetId, revision: input.revision, result, callCount: meta.callCount, meta }, { headers });
  } catch { return Response.json({ error: 'REUSE_UNAVAILABLE' }, { status: 502, headers }); }
}
