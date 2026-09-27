import { randomUUID } from 'node:crypto';
import { recallArgumentAssets, type RecallTraceEvent } from '../../server/argument-asset-recall.ts';
import { ARGUMENT_ASSET_RECALL_PROMPT_VERSION } from '../../argument-asset-recall.ts';
import { modelErrorType } from '../../server/structured-model.ts';

export async function POST(request: Request) {
  const requestId = randomUUID(), startedAt = performance.now();
  const suppliedRunId = request.headers.get('x-recall-run-id');
  const runId = suppliedRunId && /^[a-zA-Z0-9_-]{1,100}$/.test(suppliedRunId) ? suppliedRunId : null;
  const headers = { 'cache-control': 'no-store', 'x-request-id': requestId };
  const events: RecallTraceEvent[] = [];
  const log = (event: Record<string, unknown>) => {
    try { console.info(JSON.stringify({ scope: 'argument-asset-recall', requestId, runId, promptVersion: ARGUMENT_ASSET_RECALL_PROMPT_VERSION, model: process.env.model ?? process.env.MODEL ?? null, timestamp: new Date().toISOString(), ...event })); } catch { /* No response changes when logging fails. */ }
  };
  const finish = (status: number, errorType?: string) => log({ event: 'request_end', httpStatus: status, errorType, elapsedMs: Math.round(performance.now() - startedAt), modelCalls: events.filter(event => event.event === 'provider_start').length, retries: events.filter(event => event.event === 'provider_start' && (event.attempt ?? 0) > 1).length, firstAttemptSuccess: status === 200 && !events.some(event => event.errorType), failedStage: status === 200 ? null : events.at(-1)?.stage ?? 'request' });
  log({ event: 'request_start' });
  try {
    const text = await request.text();
    if (text.length > 200000) throw new Error('INVALID_INPUT');
    const result = await recallArgumentAssets(JSON.parse(text), event => { events.push(event); log(event); });
    finish(200);
    return Response.json({ version: 3, ...result }, { headers });
  } catch (error) {
    const invalid = error instanceof Error && error.message === 'INVALID_INPUT';
    const failedProvider = events.findLast(event => event.event === 'provider_end');
    finish(invalid ? 400 : 502, failedProvider?.errorType ?? (events.length === 0 && error instanceof SyntaxError ? 'request_json_parse' : modelErrorType(error)));
    return Response.json({ version: 2, error: invalid ? 'INVALID_INPUT' : 'RECALL_UNAVAILABLE' }, { status: invalid ? 400 : 502, headers });
  }
}
