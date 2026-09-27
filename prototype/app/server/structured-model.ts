type StructuredTask = {
  systemPrompt: string;
  userData: unknown;
  schema: Record<string, unknown>;
  toolName: string;
  promptVersion: string;
  maxTokens?: number;
  observe?: (event: ModelAttemptEvent) => void;
};

export type ModelAttemptEvent = { event: 'provider_start' | 'provider_end'; model: string; attempt: number; httpStatus?: number; errorType?: string; elapsedMs?: number; willRetry?: boolean; finishReason?: string };

export function modelErrorType(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout';
    if (error.message === 'MODEL_NOT_CONFIGURED') return 'configuration';
    if (error.message === 'MODEL_REQUEST_FAILED') return 'provider_http';
    if (error.message === 'INVALID_INPUT') return 'input_validation';
    if (error.message === 'INVALID_RESPONSE') return 'schema_validation';
    if (error instanceof SyntaxError) return 'json_parse';
  }
  return 'network_or_runtime';
}

function environment() {
  const base = process.env.base_url ?? process.env.BASE_URL;
  const apiKey = process.env.api_key ?? process.env.API_KEY;
  const model = process.env.model ?? process.env.MODEL;
  const provider = (process.env.provider ?? process.env.PROVIDER ?? '').toLowerCase();
  if (!base || !apiKey || !model) throw new Error('MODEL_NOT_CONFIGURED');
  const normalized = base.replace(/\/$/, '');
  return { apiKey, model, endpoint: provider === 'deepseek' ? (normalized.endsWith('/beta') ? normalized : `${normalized}/beta`) : (normalized.endsWith('/v1') ? normalized : `${normalized}/v1`), deepseek: provider === 'deepseek' };
}

export async function runStructuredTask(task: StructuredTask) {
  const env = environment(), startedAt = performance.now();
  const observe = (event: ModelAttemptEvent) => { try { task.observe?.(event); } catch { /* Logging must not change model behavior. */ } };
  for (let callCount = 1; callCount <= 2; callCount += 1) {
    const attemptStart = performance.now();
    observe({ event: 'provider_start', model: env.model, attempt: callCount });
    let response: Response;
    try { response = await fetch(`${env.endpoint}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.model,
        temperature: 0,
        max_tokens: task.maxTokens ?? 3000,
        stream: false,
        ...(env.deepseek ? { thinking: { type: 'disabled' } } : {}),
        messages: [{ role: 'system', content: task.systemPrompt }, { role: 'user', content: JSON.stringify(task.userData) }],
        tools: [{ type: 'function', function: { name: task.toolName, strict: true, parameters: task.schema } }],
        tool_choice: { type: 'function', function: { name: task.toolName } },
      }),
      signal: AbortSignal.timeout(120_000),
    }); } catch (error) {
      observe({ event: 'provider_end', model: env.model, attempt: callCount, elapsedMs: Math.round(performance.now() - attemptStart), errorType: modelErrorType(error), willRetry: false });
      throw error;
    }
    if (!response.ok) {
      observe({ event: 'provider_end', model: env.model, attempt: callCount, httpStatus: response.status, elapsedMs: Math.round(performance.now() - attemptStart), errorType: 'provider_http', willRetry: false });
      throw new Error('MODEL_REQUEST_FAILED');
    }
    let parsePhase = 'response_json_parse', finishReason: string | undefined;
    try {
      const data = await response.json();
      const rawFinishReason = data?.choices?.[0]?.finish_reason;
      finishReason = rawFinishReason === undefined ? undefined : ['stop', 'tool_calls', 'length', 'content_filter', 'function_call', 'insufficient_system_resource'].includes(rawFinishReason) ? rawFinishReason : 'unknown';
      parsePhase = 'tool_envelope';
      const call = data?.choices?.[0]?.message?.tool_calls?.[0];
      if (call?.function?.name !== task.toolName || typeof call.function.arguments !== 'string') throw new Error('MODEL_RESPONSE_INVALID');
      parsePhase = 'tool_json_parse';
      const output = JSON.parse(call.function.arguments) as unknown;
      observe({ event: 'provider_end', model: env.model, attempt: callCount, httpStatus: response.status, elapsedMs: Math.round(performance.now() - attemptStart), finishReason });
      return { output, meta: { model: env.model, promptVersion: task.promptVersion, callCount, latencyMs: Math.round(performance.now() - startedAt) } };
    } catch (error) {
      const errorType = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : parsePhase;
      observe({ event: 'provider_end', model: env.model, attempt: callCount, httpStatus: response.status, elapsedMs: Math.round(performance.now() - attemptStart), errorType, willRetry: callCount < 2, finishReason });
      if (callCount === 2) throw error;
    }
  }
  throw new Error('MODEL_RESPONSE_INVALID');
}
