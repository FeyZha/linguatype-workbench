export const SCAFFOLD_API_PATH = '/api/scaffold' as const;
export const SCAFFOLD_API_VERSION = '1.0.0' as const;

export const SCAFFOLD_RESPONSE_HEADERS = {
  'x-linguatype-api-version': SCAFFOLD_API_VERSION,
} satisfies Record<string, string>;

export const SCAFFOLD_ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  MODEL_NOT_CONFIGURED: 'MODEL_NOT_CONFIGURED',
  SCAFFOLD_GENERATION_FAILED: 'SCAFFOLD_GENERATION_FAILED',
} as const;

export type ScaffoldErrorCode =
  (typeof SCAFFOLD_ERROR_CODES)[keyof typeof SCAFFOLD_ERROR_CODES];

export type RequiredAction = 'provide_expression' | 'offer_scaffolds';

export type ScaffoldRequest = {
  taskPrompt: string;
  fullEssay: string;
  targetSentence: string;
  memoryCandidates?: ExpressionMemoryCandidate[];
};

export type ExpressionMemoryCandidate = {
  id: string;
  chinese: string;
  english: string;
};

export type Scaffold = {
  scaffoldId: 's1' | 's2' | 's3';
  focusZh: string;
  recommendedExpression: string;
};

export type DirectScaffoldItem = {
  sourceZh: string;
  action: 'provide_expression';
  recommendedExpression: string;
  scaffolds: [];
};

export type ProgressiveScaffoldItem = {
  sourceZh: string;
  action: 'offer_scaffolds';
  recommendedExpression: null;
  scaffolds: Scaffold[];
};

export type ScaffoldItem = DirectScaffoldItem | ProgressiveScaffoldItem;

export type ScaffoldSuccessResponse = {
  items: ScaffoldItem[];
  memoryMatchIds?: string[];
  meta: {
    requestId: string;
    callCount: 1;
    latencyMs: number;
    model: string;
    promptVersion: string;
  };
};

export type ScaffoldErrorResponse = {
  code: ScaffoldErrorCode;
  error: string;
  requestId: string;
};
