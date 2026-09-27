import { extractTopicAsset } from '../../server/topic-deposit';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  let input: unknown;
  try {
    const text = await request.text();
    if (text.length > 50000) throw new Error('INVALID_INPUT');
    input = JSON.parse(text);
  } catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try {
    const { input: parsed, candidate, meta } = await extractTopicAsset(input);
    return Response.json({ version: 1, documentId: parsed.documentId, candidate, meta }, { headers });
  } catch (error) { return Response.json({ version: 1, error: error instanceof Error && error.message === 'INVALID_INPUT' ? 'INVALID_INPUT' : 'DEPOSIT_UNAVAILABLE' }, { status: error instanceof Error && error.message === 'INVALID_INPUT' ? 400 : 502, headers }); }
}
