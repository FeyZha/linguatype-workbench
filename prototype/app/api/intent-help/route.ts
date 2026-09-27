import { adaptIntentInput } from '../../server/intent-entry.ts';
import { readMatches } from '../../server/language-matching.ts';
import { prepareIntentHelp } from '../../server/intent-scaffold.ts';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  let input, matches;
  try {
    const text = await request.text();
    if (text.length > 400000) throw new Error('INVALID_INPUT');
    const value = JSON.parse(text);
    if (!value || !Object.hasOwn(value, 'matches')) throw new Error('INVALID_INPUT');
    const { matches: fixed, ...context } = value;
    const adapted = adaptIntentInput(context); input = adapted.input;
    matches = fixed === null ? null : readMatches({ matches: fixed }, adapted.matching);
  } catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try {
    const { help, generation } = await prepareIntentHelp(input, matches);
    return Response.json({ pack: help, generationMeta: generation?.meta ?? null }, { headers });
  } catch { return Response.json({ version: 1, error: 'HELP_UNAVAILABLE' }, { status: 502, headers }); }
}
