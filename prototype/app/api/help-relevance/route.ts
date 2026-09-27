import { relateHelp, readHelpRelationInput } from '../../server/help-relevance.ts';
export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  let input;
  try { const body = await request.text(); if (body.length > 150000) throw new Error(); input = readHelpRelationInput(JSON.parse(body)); }
  catch { return Response.json({ error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try { const { relations, meta } = await relateHelp(input); return Response.json({ version: 1, relations, callCount: meta.callCount, meta }, { headers }); }
  catch { return Response.json({ error: 'RELATION_UNAVAILABLE' }, { status: 502, headers }); }
}
