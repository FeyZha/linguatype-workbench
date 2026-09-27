import { readReasonRecallInput } from '../../reason-reuse.ts';
import { recallReasons } from '../../server/reason-reuse.ts';
export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' }; let input;
  try { const text = await request.text(); if (text.length > 400000) throw new Error('INVALID_INPUT'); input = readReasonRecallInput(JSON.parse(text)); }
  catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try { const { result, meta } = await recallReasons(input); return Response.json({ version: 1, result, meta }, { headers }); }
  catch { return Response.json({ version: 1, error: 'REASON_TASK_UNAVAILABLE' }, { status: 502, headers }); }
}
