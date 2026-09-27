import {
  SCAFFOLD_ERROR_CODES,
  SCAFFOLD_RESPONSE_HEADERS,
  type RequiredAction,
  type Scaffold,
  type ScaffoldRequest,
  type ScaffoldSuccessResponse,
} from '../../scaffold-api-contract.ts';

type ScaffoldOutput = Pick<ScaffoldSuccessResponse, 'items' | 'memoryMatchIds'>;

type ControlledItem = {
  itemId: string;
  sourceZh: string;
  requiredAction: RequiredAction;
};

const PROMPT_VERSION = 'expression-scaffold-v7-expression-memory-v1';

const SYSTEM_PROMPT = `你是雅思写作中的英文表达支架，不是翻译器、改写器或代写者。

系统已经确定处理对象和帮助方式。输入 items_json 中每个对象包含不可修改的 itemId、sourceZh 和 requiredAction。你不负责识别中文片段，也不负责决定直给还是拆分；你只填写指定类型的英文帮助内容。

输出分为三个数组：

1. directExpressions
- 只放 requiredAction=provide_expression 的 item。
- itemId 必须逐字复制。
- recommendedExpression 给一个最低但完整可用的英文短语或可接续表达框架。
- 保留固定搭配所需的介词、不定式或其他必要结构，避免制造新的表达卡点。
- 可以用 ... 留出必须由用户自己填入的主语、宾语或补语位置。

2. scaffoldSets
- 只放 requiredAction=offer_scaffolds 的 item。
- itemId 必须逐字复制。
- 每个 item 默认返回 2 个支架；只有原中文确实包含 3 个相互独立的实义单位时才返回 3 个，绝不返回 4 个。
- scaffoldId 从 s1 连续编号。
- 每个 focusZh 必须是能独立帮助用户继续表达的实义单位，不能细碎到接近逐词翻译。
- 连接词、情态词、程度词、结构助词或其他附属成分不得单独成为支架；必须吸收到相邻的实义支架中。例如“同时”“可能”“更多”“的”不能独立出现。
- focusZh 可追溯到对应 sourceZh 的真实含义，但不必是连续原文；必须严格短于 sourceZh。
- 当 focusZh 表达一种关系或句式时，优先返回带 ... 的可复用英文框架，不要擅自填入 focusZh 之外的上下文名词。

3. memoryMatchIds
- 只从 memory_candidates_json 中逐字复制真正适合当前中文卡点的 id，最多 3 个。
- 候选只有主题相似但表达功能、主体客体、程度或语境不一致时不得返回；宁可返回空数组。
- 不改写候选表达，不在其他字段复述历史内容。

共同规则：
- 每个输入 item 必须且只能出现在与 requiredAction 对应的输出数组中一次，顺序保持一致。
- 不返回 sourceZh、requiredAction、完整目标句、解释、Markdown 或 schema 之外字段。
- 每个具体帮助目标只给一个英文表达，不给候选。
- 保持原意、主体客体、指代、否定、可能性、关系、程度和范围。
- 不补观点，不批改目标句中的其他英文。

严格按结构化输出 schema 返回，不展示分析过程。`;

const CONTROLLED_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['directExpressions', 'scaffoldSets', 'memoryMatchIds'],
  properties: {
    directExpressions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemId', 'recommendedExpression'],
        properties: {
          itemId: { type: 'string', pattern: '^i[1-9][0-9]*$' },
          recommendedExpression: { type: 'string', minLength: 1 },
        },
      },
    },
    scaffoldSets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemId', 'scaffolds'],
        properties: {
          itemId: { type: 'string', pattern: '^i[1-9][0-9]*$' },
          scaffolds: {
            type: 'array',
            minItems: 2,
            maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['scaffoldId', 'focusZh', 'recommendedExpression'],
              properties: {
                scaffoldId: { type: 'string', pattern: '^s[1-3]$' },
                focusZh: { type: 'string', minLength: 1 },
                recommendedExpression: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      },
    },
    memoryMatchIds: {
      type: 'array',
      maxItems: 3,
      uniqueItems: true,
      items: { type: 'string', minLength: 1 },
    },
  },
};

const STANDALONE_FUNCTION_FOCUSES = new Set([
  '同时', '可能', '更多', '仍', '仍然', '仅', '只', '也', '而', '并且',
  '但是', '所以', '因此', '会', '的',
]);

function getEnvironment() {
  const baseUrl = process.env.base_url ?? process.env.BASE_URL;
  const apiKey = process.env.api_key ?? process.env.API_KEY;
  const model = process.env.model ?? process.env.MODEL;
  const provider = (process.env.provider ?? process.env.PROVIDER ?? 'openai_compatible').toLowerCase();
  const thinkingType = process.env.thinking_type ?? process.env.THINKING_TYPE;

  if (!baseUrl || !apiKey || !model) throw new Error('MODEL_NOT_CONFIGURED');
  if (thinkingType && !['enabled', 'disabled'].includes(thinkingType)) {
    throw new Error('MODEL_NOT_CONFIGURED');
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('MODEL_NOT_CONFIGURED');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('MODEL_NOT_CONFIGURED');
  }

  const normalized = baseUrl.replace(/\/$/, '');
  const apiBase = provider === 'deepseek'
    ? normalized.endsWith('/beta') ? normalized : `${normalized}/beta`
    : normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
  return {
    apiKey,
    model,
    baseUrl: apiBase,
    thinkingType: thinkingType ?? (provider === 'deepseek' ? 'disabled' : undefined),
  };
}

const REQUEST_FIELDS = new Set(['taskPrompt', 'fullEssay', 'targetSentence', 'memoryCandidates']);

function parseBody(value: unknown): ScaffoldRequest {
  if (!value || typeof value !== 'object') throw new Error('INVALID_INPUT');
  const body = value as Record<string, unknown>;
  const taskPrompt = typeof body.taskPrompt === 'string' ? body.taskPrompt.trim() : '';
  const fullEssay = typeof body.fullEssay === 'string' ? body.fullEssay.trim() : '';
  const targetSentence = typeof body.targetSentence === 'string' ? body.targetSentence.trim() : '';
  const memoryCandidates = body.memoryCandidates === undefined ? [] : body.memoryCandidates;

  if (
    Object.keys(body).some((key) => !REQUEST_FIELDS.has(key)) ||
    !taskPrompt || !fullEssay || !targetSentence ||
    taskPrompt.length > 4000 || fullEssay.length > 20000 || targetSentence.length > 3000 ||
    !fullEssay.includes(targetSentence) || !/[\u3400-\u9fff]/.test(targetSentence) ||
    !Array.isArray(memoryCandidates) || memoryCandidates.length > 3 ||
    memoryCandidates.some(candidate => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return true;
      const item = candidate as Record<string, unknown>;
      return Object.keys(item).length !== 3 || !['id', 'chinese', 'english'].every(key => Object.hasOwn(item, key))
        || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 200
        || typeof item.chinese !== 'string' || !item.chinese.trim() || item.chinese.length > 3000
        || typeof item.english !== 'string' || !item.english.trim() || item.english.length > 5000;
    }) || new Set(memoryCandidates.map(candidate => (candidate as { id: string }).id)).size !== memoryCandidates.length
  ) {
    throw new Error('INVALID_INPUT');
  }
  return { taskPrompt, fullEssay, targetSentence, memoryCandidates };
}

async function parseRequestJson(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new Error('INVALID_INPUT');
  }
  return parseBody(value);
}

function extractChineseSegments(targetSentence: string) {
  return targetSentence.match(/[\u3400-\u9fff]+(?:[，、；：！？（）“”‘’·—][\u3400-\u9fff]+)*/g) ?? [];
}

function routePolicy(sourceZh: string): RequiredAction {
  return (sourceZh.match(/[\u3400-\u9fff]/g) ?? []).length <= 10
    ? 'provide_expression'
    : 'offer_scaffolds';
}

function buildControlledItems(targetSentence: string): ControlledItem[] {
  return extractChineseSegments(targetSentence).map((sourceZh, index) => ({
    itemId: `i${index + 1}`,
    sourceZh,
    requiredAction: routePolicy(sourceZh),
  }));
}

function parseProviderOutput(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') throw new Error('MODEL_RESPONSE_INVALID');
  const response = payload as Record<string, unknown>;
  const choices = response.choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') {
    throw new Error('MODEL_RESPONSE_INVALID');
  }
  const message = (choices[0] as Record<string, unknown>).message;
  if (!message || typeof message !== 'object') throw new Error('MODEL_RESPONSE_INVALID');
  const messageRecord = message as Record<string, unknown>;
  const toolCalls = messageRecord.tool_calls;

  if (Array.isArray(toolCalls) && toolCalls[0] && typeof toolCalls[0] === 'object') {
    const fn = (toolCalls[0] as Record<string, unknown>).function;
    if (fn && typeof fn === 'object') {
      const args = (fn as Record<string, unknown>).arguments;
      if (typeof args === 'string') return JSON.parse(args);
    }
  }
  if (typeof messageRecord.content === 'string') {
    const content = messageRecord.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(content);
  }
  throw new Error('MODEL_RESPONSE_INVALID');
}

function normalizeFocus(value: string) {
  return value.replace(/[\s，。！？；：、,.!?;:…—-]+/g, '');
}

function validateControlledOutput(value: unknown, items: ControlledItem[], memoryCandidateIds: Set<string>): ScaffoldOutput {
  if (!value || typeof value !== 'object') throw new Error('MODEL_RESPONSE_INVALID');
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.directExpressions) || !Array.isArray(record.scaffoldSets)) {
    throw new Error('MODEL_RESPONSE_INVALID');
  }
  const memoryMatchIds = Array.isArray(record.memoryMatchIds)
    ? [...new Set(record.memoryMatchIds.filter((id): id is string => typeof id === 'string' && memoryCandidateIds.has(id)))].slice(0, 3)
    : [];

  const expectedDirect = items.filter((item) => item.requiredAction === 'provide_expression');
  const expectedScaffolds = items.filter((item) => item.requiredAction === 'offer_scaffolds');
  const directById = new Map<string, string>();
  for (const rawDirect of record.directExpressions) {
    if (!rawDirect || typeof rawDirect !== 'object') throw new Error('MODEL_RESPONSE_INVALID');
    const direct = rawDirect as Record<string, unknown>;
    if (
      typeof direct.itemId !== 'string' ||
      typeof direct.recommendedExpression !== 'string' ||
      !direct.recommendedExpression.trim() ||
      directById.has(direct.itemId)
    ) {
      throw new Error('MODEL_RESPONSE_INVALID');
    }
    directById.set(direct.itemId, direct.recommendedExpression.trim());
  }

  const scaffoldsById = new Map<string, Scaffold[]>();
  for (const rawSet of record.scaffoldSets) {
    if (!rawSet || typeof rawSet !== 'object') throw new Error('MODEL_RESPONSE_INVALID');
    const scaffoldSet = rawSet as Record<string, unknown>;
    if (
      typeof scaffoldSet.itemId !== 'string' ||
      !Array.isArray(scaffoldSet.scaffolds) ||
      scaffoldSet.scaffolds.length < 2 || scaffoldSet.scaffolds.length > 3 ||
      scaffoldsById.has(scaffoldSet.itemId)
    ) {
      throw new Error('MODEL_RESPONSE_INVALID');
    }
    const source = expectedScaffolds.find((item) => item.itemId === scaffoldSet.itemId);
    if (!source) throw new Error('MODEL_RESPONSE_INVALID');

    const parsedScaffolds = scaffoldSet.scaffolds.map((rawScaffold, index) => {
      if (!rawScaffold || typeof rawScaffold !== 'object') throw new Error('MODEL_RESPONSE_INVALID');
      const scaffold = rawScaffold as Record<string, unknown>;
      const scaffoldId = scaffold.scaffoldId;
      const expectedScaffoldId = `s${index + 1}` as Scaffold['scaffoldId'];
      const focusZh = typeof scaffold.focusZh === 'string' ? scaffold.focusZh.trim() : '';
      const expression = typeof scaffold.recommendedExpression === 'string'
        ? scaffold.recommendedExpression.trim()
        : '';
      if (
        scaffoldId !== expectedScaffoldId || !focusZh || !expression ||
        focusZh.length >= source.sourceZh.length ||
        !/[\u3400-\u9fff]/.test(focusZh) || /[A-Za-z]/.test(focusZh) ||
        STANDALONE_FUNCTION_FOCUSES.has(normalizeFocus(focusZh))
      ) {
        throw new Error('MODEL_RESPONSE_INVALID');
      }
      return {
        scaffoldId: expectedScaffoldId,
        focusZh,
        recommendedExpression: expression,
      } satisfies Scaffold;
    });
    if (new Set(parsedScaffolds.map((entry) => entry.focusZh)).size !== parsedScaffolds.length) {
      throw new Error('MODEL_RESPONSE_INVALID');
    }
    scaffoldsById.set(scaffoldSet.itemId, parsedScaffolds);
  }

  if (
    directById.size !== expectedDirect.length || scaffoldsById.size !== expectedScaffolds.length ||
    expectedDirect.some((item) => !directById.has(item.itemId)) ||
    expectedScaffolds.some((item) => !scaffoldsById.has(item.itemId))
  ) {
    throw new Error('MODEL_RESPONSE_INVALID');
  }

  return {
    memoryMatchIds,
    items: items.map((item) => item.requiredAction === 'provide_expression'
      ? {
          sourceZh: item.sourceZh,
          action: item.requiredAction,
          recommendedExpression: directById.get(item.itemId)!,
          scaffolds: [],
        }
      : {
          sourceZh: item.sourceZh,
          action: item.requiredAction,
          recommendedExpression: null,
          scaffolds: scaffoldsById.get(item.itemId)!,
        }),
  };
}

function publicError(error: unknown) {
  if (error instanceof Error && error.message === 'INVALID_INPUT') {
    return {
      status: 400,
      code: SCAFFOLD_ERROR_CODES.INVALID_INPUT,
      message: '请确认题目、全文和目标句仍然完整。',
    };
  }
  if (error instanceof Error && error.message === 'MODEL_NOT_CONFIGURED') {
    return {
      status: 503,
      code: SCAFFOLD_ERROR_CODES.MODEL_NOT_CONFIGURED,
      message: '内部模型尚未配置，原文没有被修改。',
    };
  }
  return {
    status: 502,
    code: SCAFFOLD_ERROR_CODES.SCAFFOLD_GENERATION_FAILED,
    message: '本句暂时无法处理，原文没有被修改。',
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const input = await parseRequestJson(request);
    const controlledItems = buildControlledItems(input.targetSentence);
    const env = getEnvironment();
    const userPrompt = `task_prompt:\n${input.taskPrompt}\n\nfull_essay:\n${input.fullEssay}\n\ntarget_sentence:\n${input.targetSentence}\n\nitems_json:\n${JSON.stringify(controlledItems)}\n\nmemory_candidates_json:\n${JSON.stringify(input.memoryCandidates ?? [])}`;

    const providerResponse = await fetch(`${env.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.model,
        temperature: 0,
        max_tokens: 4096,
        stream: false,
        ...(env.thinkingType ? { thinking: { type: env.thinkingType } } : {}),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'return_expression_scaffold',
              description: 'Return only the model-owned LinguaType v7 scaffold content.',
              strict: true,
              parameters: CONTROLLED_OUTPUT_SCHEMA,
            },
          },
        ],
        tool_choice: {
          type: 'function',
          function: { name: 'return_expression_scaffold' },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!providerResponse.ok) throw new Error('MODEL_REQUEST_FAILED');
    const providerPayload = await providerResponse.json();
    const output = validateControlledOutput(parseProviderOutput(providerPayload), controlledItems, new Set((input.memoryCandidates ?? []).map(candidate => candidate.id)));

    return Response.json(
      {
        ...output,
        meta: {
          requestId,
          callCount: 1,
          latencyMs: Date.now() - startedAt,
          model: env.model,
          promptVersion: PROMPT_VERSION,
        },
      },
      { headers: SCAFFOLD_RESPONSE_HEADERS },
    );
  } catch (error) {
    const safe = publicError(error);
    return Response.json(
      { code: safe.code, error: safe.message, requestId },
      { status: safe.status, headers: SCAFFOLD_RESPONSE_HEADERS },
    );
  }
}
