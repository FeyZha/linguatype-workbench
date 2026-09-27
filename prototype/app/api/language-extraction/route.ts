import { extractLanguage, readExtractionInput } from '../../server/language-extraction.ts';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  let input;
  try {
    const text = await request.text();
    if (text.length > 200000) throw new Error('INVALID_INPUT');
    input = readExtractionInput(JSON.parse(text));
  } catch {
    return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers });
  }
  try {
    const result = await extractLanguage(input);
    return Response.json({ version: 1, candidates: result.candidates, meta: result.meta }, { headers });
  } catch {
    // Model traces and provider details stay on the server, never in browser errors.
    return Response.json({ version: 1, error: 'EXTRACTION_UNAVAILABLE' }, { status: 502, headers });
  }
}
