import { adaptIntentInput } from '../../server/intent-entry.ts';
import { matchLanguage } from '../../server/language-matching.ts';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  let input;
  try {
    const text = await request.text();
    if (text.length > 400000) throw new Error('INVALID_INPUT');
    input = adaptIntentInput(JSON.parse(text)).matching;
  } catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try {
    const { matches, meta } = await matchLanguage(input);
    return Response.json({ version: 1, matches, meta }, { headers });
  } catch { return Response.json({ version: 1, error: 'MATCH_UNAVAILABLE' }, { status: 502, headers }); }
}
