import { POST as generateScaffold } from '../scaffold/route';
import { readMatchingRequest, readMatches } from '../../server/language-matching.ts';
import { composeHelp } from '../../server/help-composition.ts';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  let input, matches;
  try {
    const body = await request.text();
    if (body.length > 400000) throw new Error('INVALID_INPUT');
    const value = JSON.parse(body);
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'matches')) throw new Error('INVALID_INPUT');
    const { matches: fixed, ...context } = value;
    input = readMatchingRequest(context);
    matches = fixed === null ? input.items.map(({ itemId }) => ({ itemId, assetId: null, coverage: 'none' as const })) : readMatches({ matches: fixed }, input);
  } catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try {
    const result = await composeHelp(input, matches, body => generateScaffold(new Request(request.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })));
    return Response.json(result, { headers });
  } catch { return Response.json({ version: 1, error: 'HELP_UNAVAILABLE' }, { status: 502, headers }); }
}
