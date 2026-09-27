import { readReasonReuseInput } from '../../reason-reuse.ts';
import { checkReasonReuse } from '../../server/reason-reuse.ts';
export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' }; let input;
  try { const text = await request.text(); if (text.length > 400000) throw new Error('INVALID_INPUT'); input = readReasonReuseInput(JSON.parse(text)); }
  catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try { const { result, meta } = await checkReasonReuse(input); return Response.json({ version: 1, result, meta }, { headers }); }
  catch { return Response.json({ version: 1, error: 'REASON_TASK_UNAVAILABLE' }, { status: 502, headers }); }
}
