import { readIdeaInput } from '../../idea-assets.ts';
import { extractIdeas } from '../../server/idea-extraction.ts';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' }; let input;
  try { const text = await request.text(); if (text.length > 100000) throw new Error('INVALID_INPUT'); input = readIdeaInput(JSON.parse(text)); }
  catch { return Response.json({ version: 1, error: 'INVALID_INPUT' }, { status: 400, headers }); }
  try { const { candidates, meta } = await extractIdeas(input); return Response.json({ version: 1, candidates, meta }, { headers }); }
  catch { return Response.json({ version: 1, error: 'IDEA_EXTRACTION_UNAVAILABLE' }, { status: 502, headers }); }
}
