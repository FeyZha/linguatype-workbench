import { readReasonInput } from '../../reason-chains.ts';
import { extractReasonChains } from '../../server/reason-chains.ts';
export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' }; let input;
  try { const text = await request.text(); if (text.length > 100000) throw new Error('INVALID_INPUT'); input = readReasonInput(JSON.parse(text)); }
  catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try { const { result, meta } = await extractReasonChains(input); return Response.json({ version: 1, candidates: result, meta }, { headers }); }
  catch { return Response.json({ version: 1, error: 'REASON_EXTRACTION_UNAVAILABLE' }, { status: 502, headers }); }
}
