import { readContentRelationInput } from '../../content-relevance.ts';
import { relateContentHelp } from '../../server/content-relevance.ts';
export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' }; let input;
  try { const text = await request.text(); if (text.length > 400000) throw new Error('INVALID_INPUT'); input = readContentRelationInput(JSON.parse(text)); }
  catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try { const { result, meta } = await relateContentHelp(input); return Response.json({ version: 1, result, meta }, { headers }); }
  catch { return Response.json({ version: 1, error: 'CONTENT_RELEVANCE_UNAVAILABLE' }, { status: 502, headers }); }
}
