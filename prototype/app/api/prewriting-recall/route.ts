import { readRecallInput } from '../../prewriting-recall.ts';
import { recallLanguage } from '../../server/prewriting-recall.ts';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  let input;
  try {
    const text = await request.text();
    if (text.length > 400000) throw new Error('INVALID_INPUT');
    input = readRecallInput(JSON.parse(text));
  } catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try {
    const { selected, meta } = await recallLanguage(input);
    return Response.json({ version: 1, selected, meta }, { headers });
  } catch { return Response.json({ version: 1, error: 'RECALL_UNAVAILABLE' }, { status: 502, headers }); }
}
