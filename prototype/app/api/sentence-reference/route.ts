import { readReferenceInput, REFERENCE_VERSION } from '../../sentence-reference.ts';
import { generateSentenceReference } from '../../server/sentence-reference.ts';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  let input;
  try {
    const text = await request.text();
    if (text.length > 100000) throw new Error('INVALID_INPUT');
    input = readReferenceInput(JSON.parse(text));
  } catch { return Response.json({ error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try {
    const { result, meta } = await generateSentenceReference(input);
    return Response.json({ version: REFERENCE_VERSION, result, meta }, { headers });
  } catch { return Response.json({ error: 'REFERENCE_UNAVAILABLE' }, { status: 502, headers }); }
}
