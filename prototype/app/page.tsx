'use client';

import { demoFetch } from './demo-api';
import { CONFLICT_KEY, SESSION_EPOCH_KEY, profileEpoch } from './workspace-data';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CreateEssayDialog } from './create-essay-dialog';
import {
  SCAFFOLD_ERROR_CODES,
  SCAFFOLD_API_PATH,
  SCAFFOLD_API_VERSION,
} from './scaffold-api-contract';
import {
  SCAFFOLD_REQUEST_FAILED,
  readScaffoldResponse,
} from './scaffold-response';
import {
  findMixedSentences,
  findSentences,
  hasChinese,
  reconcileQuotedSentence,
  reconcileSentenceAnchor,
  selectionIsInsideSentence,
  type SentenceSpan,
} from './sentence-tracking';
import {
  LEGACY_DRAFT_KEY,
  WORKSPACE_KEY,
  createEssayDocument,
  documentTitle,
  loadWorkspace,
  type ArchivedCard,
  type EssayDocument,
  type Feedback,
  type PersistedWorkspace,
  type PromptSource,
  type SupportCard,
} from './workspace-state';
import { migrateExpressionFavorites, recordExpressionReveal, recordRememberedExpressionReveal, selectExpressionMemoryCandidates, setExpressionMemoryStatus, type ExpressionMemory } from './expression-memory';
import {
  DEMO_DOCUMENTS,
  DEMO_RECALL_DOCUMENT_ID,
  createPrototypeResult,
} from './prototype-cases';
import { createDemoTopicAssets } from './demo-topic-assets';
import { createDemoArgumentAssetState } from './demo-argument-assets';
import { createSimulatedLearnerWorkspace } from './demo-simulated-learner';
import { isDemoMode, isLearnerDemoMode, isRecallDemoMode, isLearnerThemesDemoMode } from './workspace-mode';
import { createRecallDemoWorkspace, RECALL_DEMO_CASES } from './demo-recall';
import { createLearnerThemesWorkspace, LEARNER_THEMES, LEARNER_THEME_ESSAYS, LEARNER_THEME_CASES } from './demo-learner-themes';
import { FEEDBACK_API_PATH, FEEDBACK_PROMPT_VERSION, readFeedbackResult, textHash, type FeedbackRun } from './essay-feedback';
import { DEPOSIT_API_PATH, DEPOSIT_PROMPT_VERSION, isArgumentGraphAsset, isThoughtAssetCandidate, readTopicAssetCandidate, saveTopicAssetPack, topicAssetItemCount, topicLanguageExpressions, type TopicAssetCandidate, type TopicAssetPack } from './topic-assets';
import { applyArgumentAssetDecision, argumentAssetSourceDocumentIds, attachAssetToPackExpressions, recordArgumentAssetUsage, removeArgumentAsset, type ArgumentAsset, type ArgumentAssetDecision, type ArgumentAssetUsage, type ThoughtAssetUpdate } from './argument-assets';
import { ARGUMENT_ASSET_RECALL_API_PATH, readArgumentAssetRecallResult } from './argument-asset-recall';
import { createCompletedVersion, type CompletedArticleVersion } from './article-completion';
import { CompletionConfirmDialog, DepositDialog, EssayFeedbackPanel, MaterialsDialog, RecallDialog, type CompletionPreview, type RecallSession } from './topic-workflow-dialogs';

type ActivePanel = 'library' | 'support' | 'feedback' | null;

function formatDocumentDate(value: string) {
  if (!value) return '当前';
  return value.slice(5, 10).replace('-', '/');
}

function createId(prefix: 'document' | 'card' | 'memory' | 'feedback' | 'pack' | 'completion' | 'deposit-request' | 'argument-asset' | 'argument-usage') {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function scaffoldResultId(cardId: string, itemIndex: number, scaffoldId: string) {
  return `scaffold-result-${cardId}-${itemIndex}-${scaffoldId}`;
}

function readEssaySelection(editor: HTMLTextAreaElement) {
  return { start: editor.selectionStart, end: editor.selectionEnd };
}

function DeleteEssayDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: EssayDocument | null;
  onCancel: () => void;
  onConfirm: (documentId: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (target && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!target && dialog.open) {
      dialog.close();
      window.setTimeout(() => returnFocusRef.current?.focus(), 0);
    }
  }, [target]);

  return (
    <dialog
      ref={dialogRef}
      className="delete-dialog"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="delete-copy">
        <strong id="delete-dialog-title">永久删除这篇作文？</strong>
        <p id="delete-dialog-description">
          “{target ? documentTitle(target) : ''}”及其支架记录将被删除，无法恢复。
        </p>
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" type="button" onClick={onCancel} autoFocus>
          取消
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            if (!target) return;
            returnFocusRef.current = null;
            onConfirm(target.documentId);
          }}
        >
          永久删除
        </button>
      </div>
    </dialog>
  );
}

function ExpressionMemoryDialog({ memories, onStatus, onDelete, onClose }: { memories: ExpressionMemory[]; onStatus: (id: string, status: ExpressionMemory['status']) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialogRef.current?.showModal();
    return () => trigger?.focus();
  }, []);
  return <dialog
    ref={dialogRef}
    className="favorites-dialog"
    aria-labelledby="expression-memory-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
  >
    <header className="favorites-header">
      <div><h2 id="expression-memory-title">表达记忆</h2><p>{memories.length} 条曾经翻开过的表达</p></div>
      <button className="support-close" type="button" onClick={onClose} aria-label="关闭表达记忆">×</button>
    </header>
    {memories.length ? <div className="favorites-list">{memories.map(memory => <article className="favorite-card" key={memory.id}>
      <p className="favorite-meaning">{memory.chinese}</p>
      <strong>{memory.english}</strong>
      <p className="favorite-source">已看过 {memory.revealCount} 次 · {memory.status === 'active' ? '会在相似卡点中出现' : '已停止提醒'}</p>
      <div className="dialog-actions">
        <button className="btn btn-secondary" type="button" onClick={() => onStatus(memory.id, memory.status === 'active' ? 'ignored' : 'active')}>{memory.status === 'active' ? '不再提醒' : '恢复提醒'}</button>
        <button className="btn btn-danger-ghost" type="button" onClick={() => onDelete(memory.id)}>删除</button>
      </div>
    </article>)}</div> : <p className="favorites-empty">还没有表达记忆。只有你主动翻开英文后，系统才会记住。</p>}
  </dialog>;
}

export default function Home() {
  const [documents, setDocuments] = useState<EssayDocument[]>(DEMO_DOCUMENTS);
  const [expressionMemories, setExpressionMemories] = useState<ExpressionMemory[]>([]);
  const [topicAssetPacks, setTopicAssetPacks] = useState<TopicAssetPack[]>([]);
  const [argumentAssets, setArgumentAssets] = useState<ArgumentAsset[]>([]);
  const [argumentAssetUsages, setArgumentAssetUsages] = useState<ArgumentAssetUsage[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState(DEMO_RECALL_DOCUMENT_ID);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'loading' | 'saved' | 'error'>('loading');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [expressionMemoryOpen, setExpressionMemoryOpen] = useState(false);
  const [completionPreview, setCompletionPreview] = useState<CompletionPreview | null>(null);
  const [completionId, setCompletionId] = useState<string | null>(null);
  const [completionBusy, setCompletionBusy] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [materialPackId, setMaterialPackId] = useState<string | undefined>();
  const [materialRevision, setMaterialRevision] = useState<number | undefined>();
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [recallSession, setRecallSession] = useState<RecallSession | null>(null);
  const recallRequestRef = useRef<AbortController | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [essayScrollTop, setEssayScrollTop] = useState(0);
  const [essaySelection, setEssaySelection] = useState<{
    documentId: string;
    start: number;
    end: number;
  } | null>(null);
  const [linkedSentenceKey, setLinkedSentenceKey] = useState<string | null>(null);
  const [feedbackTops, setFeedbackTops] = useState<Array<number | null>>([]);
  const [inlineLayout, setInlineLayout] = useState<{ height: number; tops: number[] }>({
    height: 0,
    tops: [],
  });
  const essayEditorRef = useRef<HTMLTextAreaElement>(null);
  const essayMirrorRef = useRef<HTMLDivElement>(null);
  const writingPaneRef = useRef<HTMLElement>(null);
  const supportTitleRef = useRef<HTMLHeadingElement>(null);
  const panelTriggerRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const canPersistRef = useRef(false);
  const restoredWorkspace = useRef<PersistedWorkspace | null>(null);
  const lastPersistedRef = useRef<string | null>(null);
  const profileEpochRef = useRef('');
  const conflictRef = useRef(false);
  const replacingRef = useRef(false);
  const workspaceRef = useRef<PersistedWorkspace | null>(null);
  const completionBusyRef = useRef(false);
  const essayMeasureRef = useRef({ essay: '', width: 0 });

  const activeDocuments = documents.filter((document) => document.status === 'active');
  const archivedDocuments = documents.filter((document) => document.status === 'archived');
  const activeDocument =
    activeDocuments.find((document) => document.documentId === activeDocumentId) ??
    activeDocuments[0] ??
    null;
  const learnerThemesDemo = hydrated && isLearnerThemesDemoMode();
  const learnerThemeCase = learnerThemesDemo ? LEARNER_THEME_CASES.find(item => item.documentId === activeDocumentId) : undefined;
  const learnerSourceEssay = learnerThemesDemo ? LEARNER_THEME_ESSAYS.find(item => item.documentId === activeDocumentId) : undefined;
  const learnerTheme = learnerThemeCase?.theme ?? learnerSourceEssay?.theme ?? LEARNER_THEMES[0].id;
  const recallDemo = hydrated && isRecallDemoMode();
  const recallDemoCase = recallDemo ? RECALL_DEMO_CASES.find(item => item.documentId === activeDocumentId) : undefined;
  const taskPrompt = activeDocument?.taskPrompt ?? '';
  const promptIsFixed = Boolean(activeDocument?.promptSource && taskPrompt.trim());
  const essay = activeDocument?.essay ?? '';
  useLayoutEffect(() => () => {
    recallRequestRef.current?.abort();
    recallRequestRef.current = null;
    setRecallSession(null);
  }, [activeDocumentId, taskPrompt, essay, argumentAssets]);
  const supportCards = activeDocument?.supportCards ?? [];
  const archivedCards = activeDocument?.archivedCards ?? [];
  const activeCardId = activeDocument?.activeCardId ?? null;
  const activeCard = supportCards.find((card) => card.cardId === activeCardId) ?? null;
  const latestFeedback = activeDocument?.feedbackRuns?.at(-1);
  const depositSession = documents.flatMap(document => document.completedVersions ?? []).find(version => version.id === completionId) ?? null;
  const latestCompletedVersion = activeDocument?.completedVersions?.at(-1);
  const recallableAssets = argumentAssets.filter(asset => asset.status === 'active');
  const currentEssaySelection =
    essaySelection?.documentId === activeDocumentId ? essaySelection : null;
  const deleteTarget =
    documents.find((document) => document.documentId === deleteTargetId) ?? null;
  const sentences = findSentences(essay);
  const mixedSentences = findMixedSentences(essay);
  const feedbackSentenceKeys = latestFeedback?.status === 'ready'
    ? latestFeedback.suggestions.map((suggestion) => {
        const sentence = reconcileQuotedSentence(latestFeedback.essaySnapshot, essay, suggestion.sourceQuote);
        return sentence ? `${sentence.start}:${sentence.end}` : '';
      })
    : [];
  const feedbackEditingSentence = activePanel === 'feedback' && currentEssaySelection
    ? sentences.find(sentence => selectionIsInsideSentence(sentence, currentEssaySelection)) ?? null
    : null;
  const feedbackEditingSentenceKey = feedbackEditingSentence ? `${feedbackEditingSentence.start}:${feedbackEditingSentence.end}` : null;
  const feedbackFocusSentenceKey = linkedSentenceKey ?? (
    feedbackEditingSentenceKey && feedbackSentenceKeys.includes(feedbackEditingSentenceKey)
      ? feedbackEditingSentenceKey
      : null
  );
  const activeSentence = activeCard
    ? sentences.find(
        (sentence) =>
          sentence.start === activeCard.anchor.start && sentence.end === activeCard.anchor.end,
      )
    : null;
  const focusedSentence =
    activePanel === 'support' &&
    activeSentence &&
    (hasChinese(activeSentence.text) ||
      selectionIsInsideSentence(activeSentence, currentEssaySelection))
      ? activeSentence
      : null;
  const focusedSentenceKey = focusedSentence
    ? `${focusedSentence.start}:${focusedSentence.end}`
    : null;
  const promptUsage = documents.reduce<Record<string, number>>((usage, document) => {
    const promptId =
      document.promptSource?.kind === 'original_bank'
        ? document.promptSource.promptId
        : null;
    if (promptId) usage[promptId] = (usage[promptId] ?? 0) + 1;
    return usage;
  }, {});

  const syncEssaySelection = useCallback((editor: HTMLTextAreaElement) => {
    const next = readEssaySelection(editor);
    const scopedNext = next ? { ...next, documentId: activeDocumentId } : null;
    setEssaySelection((current) =>
      current?.documentId === scopedNext?.documentId &&
      current?.start === scopedNext?.start &&
      current?.end === scopedNext?.end
        ? current
        : scopedNext,
    );
  }, [activeDocumentId]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(WORKSPACE_KEY);
        const epoch = profileEpoch(stored);
        if ((sessionStorage.getItem(SESSION_EPOCH_KEY) ?? '') !== epoch) sessionStorage.removeItem(CONFLICT_KEY);
        sessionStorage.setItem(SESSION_EPOCH_KEY, epoch);
        profileEpochRef.current = epoch;
        const conflict = sessionStorage.getItem(CONFLICT_KEY);
        const workspace = loadWorkspace(conflict ? { getItem: key => key === WORKSPACE_KEY ? conflict : null } : localStorage, createId('document'), new Date().toISOString());
        // Keep an exact pre-rollback copy before the simpler page saves anything.
        if (stored && !localStorage.getItem(`${WORKSPACE_KEY}:before-pre-rollout`)) localStorage.setItem(`${WORKSPACE_KEY}:before-pre-rollout`, stored);
        restoredWorkspace.current = workspace;
        lastPersistedRef.current = stored;
        conflictRef.current = Boolean(conflict);
        if (workspace) {
          const expressionMemories = migrateExpressionFavorites(workspace.favoriteExpressions ?? [], workspace.expressionMemories ?? []);
          const migratedWorkspace = { ...workspace };
          delete migratedWorkspace.favoriteExpressions;
          restoredWorkspace.current = { ...migratedWorkspace, expressionMemories };
          setExpressionMemories(expressionMemories);
          setTopicAssetPacks(workspace.topicAssetPacks ?? []);
          setArgumentAssets(workspace.argumentAssets ?? []);
          setArgumentAssetUsages(workspace.argumentAssetUsages ?? []);
          const available = workspace.documents.filter(d => d.status === 'active');
          if (available.length) {
            setDocuments(workspace.documents);
            setActiveDocumentId(available.some(d => d.documentId === workspace.activeDocumentId) ? workspace.activeDocumentId : available[0].documentId);
          } else {
            const blank = createEssayDocument(createId('document'), new Date().toISOString());
            setDocuments([...workspace.documents, blank]); setActiveDocumentId(blank.documentId);
          }
        } else if (isDemoMode()) {
          if (isRecallDemoMode() || isLearnerThemesDemoMode()) {
            const demo = isLearnerThemesDemoMode() ? createLearnerThemesWorkspace() : createRecallDemoWorkspace();
            setDocuments(demo.documents);
            setActiveDocumentId(demo.activeDocumentId);
            setTopicAssetPacks(demo.topicAssetPacks ?? []);
            setArgumentAssets(demo.argumentAssets ?? []);
            setArgumentAssetUsages([]);
            setExpressionMemories([]);
          } else if (isLearnerDemoMode()) {
            const simulation = createSimulatedLearnerWorkspace();
            setDocuments(simulation.documents);
            setActiveDocumentId(simulation.documents.at(-1)!.documentId);
            setExpressionMemories(simulation.expressionMemories);
            setTopicAssetPacks([]);
            setArgumentAssets(simulation.argumentAssets);
            setArgumentAssetUsages(simulation.argumentAssetUsages);
          } else {
            const packs = createDemoTopicAssets();
            const argumentState = createDemoArgumentAssetState(packs);
            setTopicAssetPacks(packs);
            setArgumentAssets(argumentState.assets);
            setArgumentAssetUsages(argumentState.usages);
          }
        } else {
          const blank = createEssayDocument(createId('document'), new Date().toISOString());
          setDocuments([blank]);
          setActiveDocumentId(blank.documentId);
        }
        canPersistRef.current = !conflict;
        setSaveStatus(conflict ? 'error' : 'saved');
      } catch { setSaveStatus('error'); }
      finally { setHydrated(true); }
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  const noticeProfileReplacement = useCallback(() => {
    try {
    if (profileEpoch(localStorage.getItem(WORKSPACE_KEY)) === profileEpochRef.current) return false;
    canPersistRef.current = false; conflictRef.current = false; replacingRef.current = true;
    sessionStorage.removeItem(CONFLICT_KEY);
    window.location.reload(); return true;
    } catch { canPersistRef.current = false; setSaveStatus('error'); return true; }
  }, []);

  useLayoutEffect(() => {
    if (!hydrated) return;
    workspaceRef.current = { ...restoredWorkspace.current, version: 2, profileEpoch: profileEpochRef.current, expressionMemories, topicAssetPacks, argumentAssets, argumentAssetUsages, documents, activeDocumentId, savedAt: new Date().toISOString() };
  }, [activeDocumentId, argumentAssets, argumentAssetUsages, documents, expressionMemories, hydrated, topicAssetPacks]);

  // Autosave and explicit confirmations share the same lock and conflict check.
  const persistWorkspace = useCallback(async (
    update?: (workspace: PersistedWorkspace) => PersistedWorkspace | Promise<PersistedWorkspace>,
    cancelled: () => boolean = () => false,
  ) => {
    try {
      return await navigator.locks.request(WORKSPACE_KEY, async () => {
        if (cancelled()) return null;
        const current = workspaceRef.current;
        if (!current || replacingRef.current || noticeProfileReplacement() || !canPersistRef.current) {
          throw new Error('本次尚未保存。请先处理页面上的保存或窗口冲突提示。');
        }
        const checkConflict = () => {
          if (localStorage.getItem(WORKSPACE_KEY) === lastPersistedRef.current) return;
          canPersistRef.current = false;
          conflictRef.current = true;
          try { sessionStorage.setItem(CONFLICT_KEY, JSON.stringify(workspaceRef.current)); } catch { /* Keep the current page available. */ }
          throw new Error('另一窗口更新了数据，本次尚未保存。请在更新的窗口继续；本窗口保留未保存内容，暂停写入以免覆盖。');
        };
        checkConflict();
        const next = update ? await update(current) : current;
        if (cancelled()) return null;
        if (workspaceRef.current !== current) throw new Error('内容刚刚发生变化，请核对后重试。');
        checkConflict();
        const saved = { ...next, savedAt: new Date().toISOString() };
        const serialized = JSON.stringify(saved);
        localStorage.setItem(WORKSPACE_KEY, serialized);
        lastPersistedRef.current = serialized;
        workspaceRef.current = saved;
        if (update) {
          setDocuments(saved.documents);
          setTopicAssetPacks(saved.topicAssetPacks ?? []);
          setArgumentAssets(saved.argumentAssets ?? []);
          setArgumentAssetUsages(saved.argumentAssetUsages ?? []);
          setExpressionMemories(migrateExpressionFavorites(saved.favoriteExpressions ?? [], saved.expressionMemories ?? []));
          setActiveDocumentId(saved.activeDocumentId);
        }
        try { localStorage.removeItem(LEGACY_DRAFT_KEY); } catch { /* A legacy cleanup failure does not undo the successful write. */ }
        setSaveStatus('saved');
        return saved;
      });
    } catch (error) {
      if (!cancelled()) setSaveStatus('error');
      throw error;
    }
  }, [noticeProfileReplacement]);

  useEffect(() => {
    if (!hydrated) return;
    if (replacingRef.current || noticeProfileReplacement()) return;
    if (!canPersistRef.current) {
      if (conflictRef.current) {
        try { sessionStorage.setItem(CONFLICT_KEY, JSON.stringify(workspaceRef.current)); } catch { /* Keep the current page available. */ }
      }
      return;
    }
    let cancelled = false;
    void persistWorkspace(undefined, () => cancelled).catch(() => { /* The shared writer displays failure. */ });
    return () => { cancelled = true; };
  }, [activeDocumentId, argumentAssets, argumentAssetUsages, documents, expressionMemories, hydrated, topicAssetPacks, noticeProfileReplacement, persistWorkspace]);

  useEffect(() => {
    if (!hydrated) return;
    const check = () => { try { noticeProfileReplacement(); } catch { canPersistRef.current = false; setSaveStatus('error'); } };
    window.addEventListener('storage', check); window.addEventListener('pageshow', check);
    return () => { window.removeEventListener('storage', check); window.removeEventListener('pageshow', check); };
  }, [hydrated, noticeProfileReplacement]);
  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const editor = essayEditorRef.current;
    if (!editor) return;
    const syncSelection = () => syncEssaySelection(editor);
    editor.addEventListener('selectionchange', syncSelection);
    return () => editor.removeEventListener('selectionchange', syncSelection);
  }, [syncEssaySelection]);

  useEffect(() => {
    if (!activePanel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      const trigger = panelTriggerRef.current;
      setLinkedSentenceKey(null);
      setActivePanel(null);
      window.setTimeout(() => trigger?.focus(), 0);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activePanel]);

  useEffect(() => {
    const narrowViewport = window.matchMedia('(max-width: 1099px)');
    const prioritizeWriting = () => {
      if (!narrowViewport.matches) return;
      setActivePanel(null);
      setSidebarCollapsed(true);
    };

    prioritizeWriting();
    narrowViewport.addEventListener('change', prioritizeWriting);
    return () => narrowViewport.removeEventListener('change', prioritizeWriting);
  }, []);

  useLayoutEffect(() => {
    const editor = essayEditorRef.current;
    const mirror = essayMirrorRef.current;
    if (!editor || !mirror) return;

    const trackedFeedbackSentenceKeys = latestFeedback?.status === 'ready'
      ? latestFeedback.suggestions.map((suggestion) => {
          const sentence = reconcileQuotedSentence(latestFeedback.essaySnapshot, essay, suggestion.sourceQuote);
          return sentence ? `${sentence.start}:${sentence.end}` : '';
        })
      : [];
    const syncFeedbackTops = () => {
      const next = trackedFeedbackSentenceKeys.map((key) => key
        ? mirror.querySelector<HTMLElement>(`[data-sentence-key="${key}"]`)?.getBoundingClientRect().top ?? null
        : null);
      setFeedbackTops(current => current.length === next.length && current.every((top, index) => top === next[index]) ? current : next);
    };

    const measure = () => {
      const nextWidth = editor.clientWidth;
      const shouldResize =
        essayMeasureRef.current.essay !== essay ||
        Math.abs(essayMeasureRef.current.width - nextWidth) > 1;
      if (shouldResize) {
        const writingPane = editor.closest<HTMLElement>('.writing-pane');
        const writingScrollTop = writingPane?.scrollTop;
        editor.style.height = 'auto';
        editor.style.height = `${Math.max(540, editor.scrollHeight)}px`;
        if (writingPane && writingScrollTop !== undefined) {
          writingPane.scrollTop = writingScrollTop;
        }
        essayMeasureRef.current = { essay, width: editor.clientWidth };
      }
      const style = window.getComputedStyle(editor);
      mirror.style.width = `${editor.clientWidth}px`;
      mirror.style.boxSizing = style.boxSizing;
      mirror.style.top = `${editor.offsetTop}px`;
      mirror.style.left = `${editor.offsetLeft}px`;
      mirror.style.padding = style.padding;
      mirror.style.font = style.font;
      mirror.style.letterSpacing = style.letterSpacing;
      mirror.style.lineHeight = style.lineHeight;
      mirror.replaceChildren();

      // ponytail: feedback has no source ranges yet; underline the first exact quote until the schema carries offsets.
      const feedbackRanges = activePanel === 'feedback' && latestFeedback?.status === 'ready'
        ? latestFeedback.suggestions.flatMap((suggestion, index) => {
            const sentence = reconcileQuotedSentence(latestFeedback.essaySnapshot, essay, suggestion.sourceQuote);
            if (!sentence) return [];
            const localStart = sentence.text.indexOf(suggestion.sourceQuote);
            const start = localStart < 0 ? sentence.start : sentence.start + localStart;
            return [{ start, end: localStart < 0 ? sentence.end : start + suggestion.sourceQuote.length, index }];
          }).sort((a, b) => a.start - b.start)
        : [];

      const appendText = (parent: Node, start: number, end: number) => {
        const selectedStart = currentEssaySelection
          ? Math.max(start, currentEssaySelection.start)
          : end;
        const selectedEnd = currentEssaySelection
          ? Math.min(end, currentEssaySelection.end)
          : start;
        if (selectedStart >= selectedEnd) {
          parent.appendChild(document.createTextNode(essay.slice(start, end)));
          return;
        }
        parent.appendChild(document.createTextNode(essay.slice(start, selectedStart)));
        const selection = document.createElement('span');
        selection.className = 'essay-selection';
        selection.textContent = essay.slice(selectedStart, selectedEnd);
        parent.appendChild(selection);
        parent.appendChild(document.createTextNode(essay.slice(selectedEnd, end)));
      };

      const appendRange = (parent: Node, start: number, end: number) => {
        let cursor = start;
        for (const range of feedbackRanges) {
          const rangeStart = Math.max(start, range.start);
          const rangeEnd = Math.min(end, range.end);
          if (rangeStart >= rangeEnd || rangeStart < cursor) continue;
          appendText(parent, cursor, rangeStart);
          const marker = document.createElement('span');
          marker.className = 'feedback-source';
          marker.dataset.feedbackIndex = String(range.index);
          appendText(marker, rangeStart, rangeEnd);
          parent.appendChild(marker);
          cursor = rangeEnd;
        }
        appendText(parent, cursor, end);
      };

      const markers = new Map<string, HTMLSpanElement>();
      const measuredSentences = findSentences(essay);
      const measuredMixedSentences = findMixedSentences(essay);
      const measuredMixedKeys = new Set(
        measuredMixedSentences.map((sentence) => `${sentence.start}:${sentence.end}`),
      );
      const feedbackSentenceKeySet = new Set(trackedFeedbackSentenceKeys);
      let cursor = 0;
      for (const sentence of measuredSentences) {
        appendRange(mirror, cursor, sentence.start);
        const sentenceKey = `${sentence.start}:${sentence.end}`;
        if (!measuredMixedKeys.has(sentenceKey) && sentenceKey !== focusedSentenceKey && sentenceKey !== feedbackFocusSentenceKey && !feedbackSentenceKeySet.has(sentenceKey)) {
          appendRange(mirror, sentence.start, sentence.end);
          cursor = sentence.end;
          continue;
        }
        const marker = document.createElement('span');
        appendRange(marker, sentence.start, sentence.end);
        marker.dataset.sentenceKey = sentenceKey;
        marker.classList.toggle(
          'is-focused',
          marker.dataset.sentenceKey === focusedSentenceKey,
        );
        marker.classList.toggle(
          'is-linked',
          marker.dataset.sentenceKey === feedbackFocusSentenceKey,
        );
        mirror.append(marker);
        markers.set(sentenceKey, marker);
        cursor = sentence.end;
      }
      appendRange(mirror, cursor, essay.length);
      syncFeedbackTops();
      setInlineLayout({
        height: editor.clientHeight,
        tops: measuredMixedSentences.map(
          (sentence) => markers.get(`${sentence.start}:${sentence.end}`)?.offsetTop ?? 0,
        ),
      });
    };

    measure();
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (Math.abs(editor.clientWidth - essayMeasureRef.current.width) > 1) measure();
      });
    });
    const writingPane = writingPaneRef.current;
    observer.observe(editor);
    writingPane?.addEventListener('scroll', syncFeedbackTops, { passive: true });
    return () => { observer.disconnect(); cancelAnimationFrame(resizeFrame); writingPane?.removeEventListener('scroll', syncFeedbackTops); };
  }, [activePanel, currentEssaySelection, essay, feedbackFocusSentenceKey, focusedSentenceKey, latestFeedback]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }

  function rememberPanelTrigger() {
    panelTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function closePanel() {
    const trigger = panelTriggerRef.current;
    setLinkedSentenceKey(null);
    setActivePanel(null);
    window.setTimeout(() => trigger?.focus(), 0);
  }

  function showSupport(focusPanel = true) {
    if (activePanel !== 'support') rememberPanelTrigger();
    setActivePanel('support');
    if (focusPanel) window.setTimeout(() => supportTitleRef.current?.focus(), 0);
  }

  function showWriting() {
    setActivePanel(null);
    window.setTimeout(
      () => (document.getElementById('task-prompt') ?? document.getElementById('essay'))?.focus(),
      0,
    );
  }

  function updateDocument(
    documentId: string,
    updater: (document: EssayDocument) => EssayDocument,
  ) {
    setDocuments((current) =>
      current.map((document) =>
        document.documentId === documentId ? updater(document) : document,
      ),
    );
  }

  function patchActiveDocument(update: Partial<EssayDocument>) {
    if (!activeDocument) return;
    const now = new Date().toISOString();
    updateDocument(activeDocument.documentId, (document) => ({
      ...document,
      ...update,
      updatedAt: now,
    }));
  }

  function patchCard(
    documentId: string,
    cardId: string,
    update: Partial<SupportCard>,
  ) {
    const now = new Date().toISOString();
    updateDocument(documentId, (document) => ({
      ...document,
      supportCards: document.supportCards.map((card) =>
        card.cardId === cardId ? { ...card, ...update } : card,
      ),
      archivedCards: document.archivedCards.map((card) =>
        card.cardId === cardId ? { ...card, ...update } : card,
      ),
      updatedAt: now,
    }));
  }

  function updateEssay(value: string) {
    if (!activeDocument) return;
    const now = new Date().toISOString();
    updateDocument(activeDocument.documentId, (document) => {
      const removedIds = new Set<string>();
      const nextCards: SupportCard[] = [];
      const newlyArchived: ArchivedCard[] = [];

      for (const card of document.supportCards) {
        const anchor = reconcileSentenceAnchor(document.essay, value, card.anchor);
        if (anchor) {
          nextCards.push({ ...card, anchor });
        } else {
          removedIds.add(card.cardId);
          newlyArchived.push({ ...card, archivedAt: now });
        }
      }

      return {
        ...document,
        essay: value,
        supportCards: nextCards,
        archivedCards: [...document.archivedCards, ...newlyArchived],
        activeCardId:
          document.activeCardId && removedIds.has(document.activeCardId)
            ? null
            : document.activeCardId,
        updatedAt: now,
      };
    });
  }

  function cardForSentence(sentence: SentenceSpan) {
    return supportCards.find(
      (card) => card.anchor.start === sentence.start && card.anchor.end === sentence.end,
    );
  }

  async function runCardRequest(
    documentId: string,
    cardId: string,
    anchor: SentenceSpan,
    requestTaskPrompt: string,
    requestEssay: string,
  ) {
    const snapshot = {
      taskPrompt: requestTaskPrompt.trim(),
      essay: requestEssay,
      targetSentence: anchor.text,
      requestedAt: new Date().toISOString(),
    };

    patchCard(documentId, cardId, {
      request: snapshot,
      result: null,
      revealedScaffolds: [],
      feedback: null,
      feedbackReason: '',
      status: 'loading',
      error: null,
    });

    try {
      const memoryCandidates = selectExpressionMemoryCandidates(expressionMemories, snapshot.targetSentence);
      const response = await demoFetch(SCAFFOLD_API_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          taskPrompt: snapshot.taskPrompt,
          fullEssay: snapshot.essay,
          targetSentence: snapshot.targetSentence,
          memoryCandidates,
        }),
      });
      const parsed = await readScaffoldResponse(response, SCAFFOLD_API_VERSION);
      if (!parsed.ok) {
        const prototypeResult =
          parsed.code === SCAFFOLD_ERROR_CODES.MODEL_NOT_CONFIGURED
            ? createPrototypeResult(snapshot.targetSentence)
            : null;
        if (prototypeResult) {
          await new Promise((resolve) => window.setTimeout(resolve, 520));
          patchCard(documentId, cardId, {
            result: { ...prototypeResult, memoryMatchIds: [] },
            status: 'ready',
            error: null,
          });
          return;
        }
        patchCard(documentId, cardId, {
          status: 'error',
          error: parsed.error,
        });
        return;
      }
      patchCard(documentId, cardId, {
        result: parsed.result,
        status: 'ready',
        error: null,
      });
    } catch {
      patchCard(documentId, cardId, {
        status: 'error',
        error: SCAFFOLD_REQUEST_FAILED,
      });
    }
  }

  function processSentence(sentence: SentenceSpan) {
    if (!activeDocument) return;
    if (!taskPrompt.trim()) {
      showToast('先填写题目，再处理本句。');
      return;
    }
    const editor = essayEditorRef.current;
    const selection = editor
      ? {
          start: editor.selectionStart,
          end: editor.selectionEnd,
          scrollTop: editor.scrollTop,
        }
      : null;
    const returnToEditor = () => {
      if (!editor || !selection || !window.matchMedia('(min-width: 1100px)').matches) return;
      window.setTimeout(() => {
        editor.focus({ preventScroll: true });
        editor.setSelectionRange(selection.start, selection.end);
        editor.scrollTop = selection.scrollTop;
      }, 0);
    };
    const existingCard = cardForSentence(sentence);
    if (existingCard) {
      patchActiveDocument({ activeCardId: existingCard.cardId });
      showSupport(false);
      returnToEditor();
      if (existingCard.request.targetSentence !== sentence.text) {
        void runCardRequest(
          activeDocument.documentId,
          existingCard.cardId,
          sentence,
          taskPrompt,
          essay,
        );
      }
      return;
    }

    const cardId = createId('card');
    const now = new Date().toISOString();
    const card: SupportCard = {
      cardId,
      anchor: sentence,
      request: {
        taskPrompt: taskPrompt.trim(),
        essay,
        targetSentence: sentence.text,
        requestedAt: now,
      },
      result: null,
      revealedScaffolds: [],
      feedback: null,
      feedbackReason: '',
      status: 'loading',
      error: null,
      createdAt: now,
    };

    updateDocument(activeDocument.documentId, (document) => ({
      ...document,
      supportCards: [...document.supportCards, card],
      activeCardId: cardId,
      updatedAt: now,
    }));
    showSupport(false);
    returnToEditor();
    void runCardRequest(activeDocument.documentId, cardId, sentence, taskPrompt, essay);
  }

  function reveal(itemIndex: number, scaffoldId: string) {
    if (!activeDocument || !activeCard?.result) return;
    const key = `${itemIndex}:${scaffoldId}`;
    if (activeCard.revealedScaffolds.includes(key)) return;
    const item = activeCard.result.items[itemIndex];
    const scaffold = item?.action === 'offer_scaffolds'
      ? item.scaffolds.find(scaffold => scaffold.scaffoldId === scaffoldId)
      : null;
    const chinese = scaffoldId === 'direct' && item?.action === 'provide_expression' ? item.sourceZh : scaffold?.focusZh;
    const english = scaffoldId === 'direct' && item?.action === 'provide_expression' ? item.recommendedExpression : scaffold?.recommendedExpression;
    if (!chinese || !english) return;
    patchCard(activeDocument.documentId, activeCard.cardId, {
      revealedScaffolds: [...activeCard.revealedScaffolds, key],
    });
    setExpressionMemories(current => recordExpressionReveal(current, {
      chinese,
      english,
      documentId: activeDocument.documentId,
    }, createId('memory'), new Date().toISOString()));
    window.setTimeout(
      () => document.getElementById(scaffoldResultId(activeCard.cardId, itemIndex, scaffoldId))?.focus(),
      0,
    );
  }

  function setCardFeedback(feedback: Feedback) {
    if (!activeDocument || !activeCard) return;
    patchCard(activeDocument.documentId, activeCard.cardId, {
      feedback,
      feedbackReason: feedback === 'not_helpful' ? activeCard.feedbackReason : '',
    });
  }

  function retryActiveCard() {
    if (
      !activeDocument ||
      !activeCard ||
      !taskPrompt.trim() ||
      !hasChinese(activeCard.anchor.text) ||
      essay.slice(activeCard.anchor.start, activeCard.anchor.end) !== activeCard.anchor.text
    ) {
      return;
    }
    void runCardRequest(
      activeDocument.documentId,
      activeCard.cardId,
      activeCard.anchor,
      taskPrompt,
      essay,
    );
  }

  function showFeedback() {
    if (activePanel !== 'feedback') rememberPanelTrigger();
    setLinkedSentenceKey(null);
    setActivePanel('feedback');
  }

  function locateFeedbackSource(sourceQuote: string) {
    const sentence = latestFeedback ? reconcileQuotedSentence(latestFeedback.essaySnapshot, essay, sourceQuote) : null;
    if (!sentence) { showToast('正文已修改，无法定位这条旧建议。'); return; }
    const key = `${sentence.start}:${sentence.end}`;
    setLinkedSentenceKey(key);
    window.setTimeout(() => essayMirrorRef.current?.querySelector<HTMLElement>(`[data-sentence-key="${key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  function revealRememberedExpression(memory: ExpressionMemory) {
    if (!activeDocument || !activeCard) return;
    const key = `memory:${memory.id}`;
    if (activeCard.revealedScaffolds.includes(key)) return;
    patchCard(activeDocument.documentId, activeCard.cardId, {
      revealedScaffolds: [...activeCard.revealedScaffolds, key],
    });
    setExpressionMemories(current => recordRememberedExpressionReveal(current, memory.id, new Date().toISOString()));
    window.setTimeout(() => document.getElementById(`memory-result-${activeCard.cardId}-${memory.id}`)?.focus(), 0);
  }

  async function runEssayFeedback() {
    if (!activeDocument || !taskPrompt.trim() || !essay.trim()) { showToast('请先填写题目和正文。'); return; }
    showFeedback();
    const documentId = activeDocument.documentId, essaySnapshot = essay, id = createId('feedback'), createdAt = new Date().toISOString();
    const essayHash = await textHash(essaySnapshot);
    const loading: FeedbackRun = { id, documentId, essayHash, essaySnapshot, createdAt, status: 'loading', summary: '', suggestions: [], model: null, promptVersion: FEEDBACK_PROMPT_VERSION, error: null };
    updateDocument(documentId, document => ({ ...document, feedbackRuns: [...document.feedbackRuns ?? [], loading], updatedAt: createdAt }));
    try {
      const response = await demoFetch(FEEDBACK_API_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documentId, taskPrompt, essay: essaySnapshot }) });
      const value: unknown = await response.json();
      if (!response.ok) throw new Error('REQUEST_FAILED');
      const result = readFeedbackResult(value, essaySnapshot);
      updateDocument(documentId, document => ({ ...document, feedbackRuns: document.feedbackRuns?.map(run => run.id === id && run.status === 'loading' ? { ...run, status: 'ready' as const, summary: result.summary, suggestions: result.suggestions, model: result.meta.model, promptVersion: result.meta.promptVersion } : run), updatedAt: new Date().toISOString() }));
    } catch {
      updateDocument(documentId, document => ({ ...document, feedbackRuns: document.feedbackRuns?.map(run => run.id === id && run.status === 'loading' ? { ...run, status: 'error' as const, error: '暂时无法生成修改建议，正文没有被修改。' } : run), updatedAt: new Date().toISOString() }));
    }
  }

  async function completionAction(action: () => Promise<void>) {
    if (completionBusyRef.current) return;
    completionBusyRef.current = true;
    setCompletionBusy(true);
    setCompletionError(null);
    try { await action(); }
    catch (error) {
      const message = error instanceof DOMException ? '本地保存失败，本次尚未保存。当前页面内容仍保留，请稍后重试。' : error instanceof Error ? error.message : '';
      setCompletionError(message && !/^[A-Z_]+$/.test(message) ? message : '尚未保存。请检查中文解释和来源，或稍后重试；当前内容仍保留在页面。');
    } finally { completionBusyRef.current = false; setCompletionBusy(false); }
  }

  function replaceCompletedVersion(workspace: PersistedWorkspace, session: CompletedArticleVersion, update: (version: CompletedArticleVersion) => CompletedArticleVersion) {
    const source = workspace.documents.find(document => document.documentId === session.documentId);
    if (source?.status !== 'active' || !source.completedVersions?.some(version => version.id === session.id)) {
      throw new Error('来源文章已不可用，本次未保存。请返回文章核对。');
    }
    return { ...workspace, documents: workspace.documents.map(document => document !== source ? document : {
      ...document, completedVersions: document.completedVersions?.map(version => version.id === session.id ? update(version) : version),
    }) };
  }

  async function requestDeposit(session: CompletedArticleVersion) {
    let started = false;
    const requestId = createId('deposit-request');
    await completionAction(async () => {
      await persistWorkspace(workspace => replaceCompletedVersion(workspace, session, current => {
        if (current.status !== 'pending' && current.status !== 'error') throw new Error('这次整理已有进度，请继续检查现有内容。');
        return { ...current, status: 'loading', requestId, candidate: null, meta: null, error: null };
      }));
      started = true;
    });
    if (!started) return;
    const applyResponse = (update: Partial<CompletedArticleVersion>) => {
      updateDocument(session.documentId, document => document.status !== 'active' ? document : {
        ...document, completedVersions: document.completedVersions?.map(version =>
          version.id === session.id && version.status === 'loading' && version.requestId === requestId ? { ...version, ...update } : version),
      });
    };
    try {
      const existingExpressions = (workspaceRef.current?.topicAssetPacks ?? []).filter(pack => pack.sourceDocumentId !== session.documentId).flatMap(pack => topicLanguageExpressions(pack).map(item => item.expression));
      const response = await demoFetch(DEPOSIT_API_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documentId: session.documentId, taskPrompt: session.taskPrompt, snapshot: session.snapshot, existingExpressions }) });
      const value: unknown = await response.json();
      if (!response.ok || !value || typeof value !== 'object') throw new Error('REQUEST_FAILED');
      const data = value as Record<string, unknown>;
      if (data.version !== 1 || data.documentId !== session.documentId || !data.meta || typeof data.meta !== 'object') throw new Error('INVALID_RESPONSE');
      const meta = data.meta as Record<string, unknown>;
      if (typeof meta.model !== 'string' || meta.promptVersion !== DEPOSIT_PROMPT_VERSION) throw new Error('INVALID_RESPONSE');
      const candidate = readTopicAssetCandidate(data.candidate, session.snapshot);
      applyResponse({ status: 'ready', candidate, meta: { model: meta.model, promptVersion: DEPOSIT_PROMPT_VERSION }, error: null });
    } catch {
      applyResponse({ status: 'error', error: '暂时无法整理这个完成版本。原文已保留，可以稍后重试。' });
    }
  }

  function previewOf(document: EssayDocument): CompletionPreview {
    return { documentId: document.documentId, sourceTitle: documentTitle(document), taskPrompt: document.taskPrompt, snapshot: document.essay, updatedAt: document.updatedAt };
  }

  function startDeposit() {
    if (!activeDocument || !taskPrompt.trim() || !essay.trim()) { showToast('请先填写题目和正文。'); return; }
    setCompletionError(null);
    const existingPack = topicAssetPacks.find(pack => pack.sourceDocumentId === activeDocument.documentId && pack.sourceEssaySnapshot === essay);
    if (existingPack) { setMaterialPackId(existingPack.id); setMaterialRevision(undefined); setMaterialsOpen(true); return; }
    const existingVersion = activeDocument.completedVersions?.findLast(version => version.snapshot === essay && version.taskPrompt === taskPrompt && (version.status !== 'saved' || topicAssetPacks.some(pack => pack.id === version.assetPackId)));
    if (existingVersion) {
      setCompletionId(existingVersion.id);
      return;
    }
    setCompletionPreview(previewOf(activeDocument));
  }

  async function confirmCompletedVersion(saveReason: string) {
    if (!completionPreview) return;
    let completed: CompletedArticleVersion | null = null;
    await completionAction(async () => {
      const version = await createCompletedVersion(completionPreview, createId('completion'), new Date().toISOString(), saveReason);
      await persistWorkspace(workspace => {
        const current = workspace.documents.find(document => document.documentId === version.documentId);
        if (current?.status !== 'active') throw new Error('来源文章已不可用，请返回文章核对。');
        if (current.essay !== version.snapshot || current.taskPrompt !== version.taskPrompt) {
          setCompletionPreview(previewOf(current));
          throw new Error('正文或题目已变化，请回看最新全文后重新勾选确认。');
        }
        if ((current.completedVersions?.length ?? 0) >= 1000) throw new Error('这篇文章保留的版本已达上限，已有文章和素材仍保留。');
        return { ...workspace, documents: workspace.documents.map(document => document !== current ? document : { ...document, completedVersions: [...document.completedVersions ?? [], version] }) };
      });
      completed = version;
      setCompletionPreview(null);
      setCompletionId(version.id);
    });
    if (completed) void requestDeposit(completed);
  }

  function editDeposit(candidate: TopicAssetCandidate) {
    if (!depositSession || completionBusy) return;
    setCompletionError(null);
    setSaveStatus('loading');
    updateDocument(depositSession.documentId, document => ({ ...document, completedVersions: document.completedVersions?.map(version => version.id === depositSession.id && version.status === 'ready' ? { ...version, candidate } : version) }));
  }

  function decideDeposit(decision: ArgumentAssetDecision) {
    if (!depositSession || completionBusy) return;
    setCompletionError(null);
    setSaveStatus('loading');
    updateDocument(depositSession.documentId, document => ({ ...document, completedVersions: document.completedVersions?.map(version => version.id === depositSession.id && version.status === 'ready' ? { ...version, argumentDecision: decision } : version) }));
  }

  async function closeDeposit(useCurrent = false) {
    await completionAction(async () => {
      if (conflictRef.current) sessionStorage.setItem(CONFLICT_KEY, JSON.stringify(workspaceRef.current));
      else await persistWorkspace();
      setCompletionId(null);
      if (useCurrent && activeDocument && !conflictRef.current) setCompletionPreview(previewOf(activeDocument));
    });
  }

  async function confirmDeposit() {
    if (!depositSession?.candidate || !depositSession.meta) return;
    await completionAction(async () => {
      await persistWorkspace(async workspace => {
        const current = workspace.documents.find(document => document.documentId === depositSession.documentId)?.completedVersions?.find(version => version.id === depositSession.id);
        if (current?.status !== 'ready' || !current.candidate || !current.meta) throw new Error('整理状态已变化，请重新打开检查。');
        if (!topicAssetItemCount(current.candidate)) return replaceCompletedVersion(workspace, current, version => ({ ...version, status: 'empty' }));
        const newer = workspace.topicAssetPacks?.find(pack => pack.sourceDocumentId === current.documentId && pack.updatedAt > current.confirmedAt && pack.sourceEssayHash !== current.essayHash);
        if (newer) throw new Error('这篇文章已有后来保存的素材。本次旧版本仍保留，请返回文章确认当前版本。');
        const claim = isArgumentGraphAsset(current.candidate) ? current.candidate.argumentNodes.find(node => node.type === 'claim') : null;
        const thought = isThoughtAssetCandidate(current.candidate) ? current.candidate.thought : null;
        if ((claim || thought) && !current.argumentDecision) throw new Error('请选择保存、关联或不保存这条思考。');
        const saved = await saveTopicAssetPack(workspace.topicAssetPacks ?? [], {
          documentId: current.documentId, sourceTitle: current.sourceTitle, taskPrompt: current.taskPrompt, essay: current.snapshot,
          completion: { versionId: current.id, confirmedAt: current.confirmedAt, saveReason: current.saveReason },
        }, current.candidate, current.meta, createId('pack'), new Date().toISOString());
        if (saved.outcome === 'unchanged') throw new Error('这份正文已有保存的素材。请返回文章，从同一入口查看已保存的实际内容。');
        const now = new Date().toISOString();
        const decision = current.argumentDecision ?? { action: 'skip' as const };
        const existing = decision.assetId ? (workspace.argumentAssets ?? []).find(asset => asset.assetId === decision.assetId) : undefined;
        const priorSourceDocuments = new Set(existing ? argumentAssetSourceDocumentIds(existing, workspace.topicAssetPacks ?? []) : []);
        const applied = applyArgumentAssetDecision(workspace.argumentAssets ?? [], saved.pack, decision, createId('argument-asset'), now);
        const linkedPack = attachAssetToPackExpressions(saved.pack, applied.asset);
        let argumentAssetUsages = workspace.argumentAssetUsages ?? [];
        let argumentAssets = applied.assets;
        if (applied.asset && ['link', 'replace'].includes(decision.action) && [...priorSourceDocuments].some(documentId => documentId !== current.documentId)) {
          const recorded = recordArgumentAssetUsage(argumentAssets, argumentAssetUsages, { assetId: applied.asset.assetId, documentId: current.documentId, revisionId: current.id, ...(linkedPack.argumentNodes?.find(node => node.type === 'claim') ? { usedOccurrenceId: linkedPack.argumentNodes.find(node => node.type === 'claim')!.nodeId } : {}), usageType: decision.action === 'replace' ? 'adapted' : 'reused', usedAt: now }, createId('argument-usage'));
          argumentAssets = recorded.assets; argumentAssetUsages = recorded.usages;
        }
        const topicAssetPacks = saved.packs.map(pack => pack.id === linkedPack.id ? linkedPack : pack);
        return replaceCompletedVersion({ ...workspace, topicAssetPacks, argumentAssets, argumentAssetUsages }, current, version => ({ ...version, status: 'saved', assetPackId: linkedPack.id, assetRevision: linkedPack.revision }));
      });
    });
  }

  function viewSavedMaterials() {
    if (!depositSession?.assetPackId || !topicAssetPacks.some(pack => pack.id === depositSession.assetPackId)) {
      setCompletionError('本次素材包已删除，完成版本仍保留。'); return;
    }
    setMaterialPackId(depositSession.assetPackId);
    setMaterialRevision(depositSession.assetRevision);
    setCompletionId(null);
    setMaterialsOpen(true);
  }

  async function findRelatedMaterials() {
    if (recallRequestRef.current) return;
    if (!taskPrompt.trim()) { showToast('请先填写当前题目。'); return; }
    const eligible = recallableAssets.filter(asset => asset.kind === 'thought' && !asset.sources.some(source => source.documentId === activeDocumentId));
    setRecallSession({ status: 'loading', matches: [], error: null });
    if (!eligible.length) { setRecallSession({ status: 'ready', matches: [], error: null }); return; }
    const request = new AbortController();
    recallRequestRef.current = request;
    try {
      const response = await demoFetch(ARGUMENT_ASSET_RECALL_API_PATH, { method: 'POST', signal: request.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskPrompt, currentDraft: essay, assets: eligible }) });
      const value: unknown = await response.json();
      if (recallRequestRef.current !== request) return;
      if (!response.ok) throw new Error('REQUEST_FAILED');
      const result = readArgumentAssetRecallResult(value, eligible);
      setRecallSession({ status: 'ready', matches: result.matches, error: null });
    } catch (error) {
      if (recallRequestRef.current !== request) return;
      console.error('argument-asset-recall failed', error instanceof Error ? error.stack : 'UNKNOWN');
      setRecallSession({ status: 'error', matches: [], error: '这次没有成功完成召回，可以稍后再试。正文和素材库没有变化。' });
    } finally {
      if (recallRequestRef.current === request) recallRequestRef.current = null;
    }
  }

  function closeRecall() {
    recallRequestRef.current?.abort();
    recallRequestRef.current = null;
    setRecallSession(null);
  }

  function updateArgumentAsset(assetId: string, update: ThoughtAssetUpdate) {
    const now = new Date().toISOString();
    setArgumentAssets(current => current.map(asset => asset.assetId === assetId && asset.kind === 'thought' ? { ...asset, thought: update.thought.trim(), useWhen: update.useWhen?.trim() || undefined, rationale: update.rationale?.trim() || undefined, limits: update.limits?.map(item => item.trim()).filter(Boolean), updatedAt: now } : asset));
  }

  function deleteArgumentAsset(assetId: string) {
    const removed = removeArgumentAsset(argumentAssets, argumentAssetUsages, assetId);
    setArgumentAssets(removed.assets);
    setArgumentAssetUsages(removed.usages);
    setDocuments(current => current.map(document => ({ ...document, ...(document.argumentReuseDrafts ? { argumentReuseDrafts: document.argumentReuseDrafts.filter(draft => draft.assetId !== assetId) } : {}) })));
  }

  function openSourceDocument(documentId: string) {
    const source = documents.find(document => document.documentId === documentId);
    if (!source) { showToast('来源作文已删除，可在素材包中查看保存的文章快照。'); return; }
    if (source.status === 'archived') restoreDocument(documentId); else setActiveDocumentId(documentId);
    setMaterialsOpen(false);
    showWriting();
  }

  function createDocument(content: { taskPrompt: string; promptSource: PromptSource }) {
    const now = new Date().toISOString();
    const newDocument = createEssayDocument(createId('document'), now, content);
    setDocuments((current) => [newDocument, ...current]);
    setActiveDocumentId(newDocument.documentId);
    setCreateDialogOpen(false);
    showWriting();
    showToast('新作文已创建。');
  }

  function archiveActiveDocument() {
    if (!activeDocument) return;
    const now = new Date().toISOString();
    const remaining = activeDocuments.filter(
      (document) => document.documentId !== activeDocument.documentId,
    );
    const blank = remaining.length ? null : createEssayDocument(createId('document'), now);
    setActiveDocumentId(remaining[0]?.documentId ?? blank?.documentId ?? activeDocumentId);
    setDocuments((current) => {
      const archived = current.map((document) =>
        document.documentId === activeDocument.documentId
          ? { ...document, status: 'archived' as const, archivedAt: now, updatedAt: now }
          : document,
      );
      return blank ? [blank, ...archived] : archived;
    });
    showWriting();
    showToast('作文已归档。');
  }

  function restoreDocument(documentId: string) {
    const now = new Date().toISOString();
    updateDocument(documentId, (document) => ({
      ...document,
      status: 'active',
      archivedAt: null,
      updatedAt: now,
    }));
    setActiveDocumentId(documentId);
    showWriting();
    showToast('作文已恢复。');
  }

  function deleteDocument(documentId: string) {
    const target = documents.find((document) => document.documentId === documentId);
    if (!target) return;
    const remaining = documents.filter((document) => document.documentId !== documentId);
    const remainingActive = remaining.filter((document) => document.status === 'active');
    if (!remainingActive.length) {
      const now = new Date().toISOString();
      const blank = createEssayDocument(createId('document'), now);
      setDocuments([blank, ...remaining]);
      setActiveDocumentId(blank.documentId);
    } else {
      setDocuments(remaining);
      if (documentId === activeDocumentId) setActiveDocumentId(remainingActive[0].documentId);
    }
    setDeleteTargetId(null);
    showWriting();
    showToast('作文及其支架已永久删除，无法恢复。');
  }

  function downloadRecord() {
    if (!activeDocument || (!supportCards.length && !archivedCards.length)) return;
    const record = {
      recordVersion: 3,
      document: {
        documentId: activeDocument.documentId,
        title: documentTitle(activeDocument),
        taskPrompt,
        essay,
        createdAt: activeDocument.createdAt,
        updatedAt: activeDocument.updatedAt,
        promptSource: activeDocument.promptSource ?? null,
      },
      cards: [
        ...supportCards.map((card) => ({ visibility: 'visible', ...card })),
        ...archivedCards.map((card) => ({ visibility: 'removed', ...card })),
      ],
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `linguatype-session-${activeDocument.documentId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('本篇记录已导出。');
  }

  const activeTargetExists = Boolean(
    activeCard &&
    essay.slice(activeCard.anchor.start, activeCard.anchor.end) === activeCard.anchor.text,
  );
  const retryDisabled =
    !taskPrompt.trim() || !activeTargetExists || !activeCard || !hasChinese(activeCard.anchor.text);
  const retryLabel = !taskPrompt.trim()
    ? '先填写题目后重试'
    : !activeTargetExists
      ? '目标句已无法定位'
      : activeCard && !hasChinese(activeCard.anchor.text)
        ? '目标句已无中文，无法重试'
        : '重新处理本句';

  return (
    <>
      <div
        className="app-shell"
        data-active-panel={activePanel ?? 'none'}
        data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}
      >
        {activePanel ? (
          <button
            className="panel-backdrop"
            type="button"
            onClick={closePanel}
            aria-label="关闭侧栏"
            tabIndex={-1}
          />
        ) : null}

        <main
          id="content"
          className="workspace-grid"
        >
          <section
            className="pane library-pane"
            id="essay-library"
            aria-label="写作存档"
          >
            <div className="sidebar-brand">
              <div className="sidebar-brand-lockup" role="img" aria-label="LinguaType">
                <img
                  className="sidebar-wordmark"
                  src="/brand/linguatype-wordmark-light.png"
                  alt=""
                  width={624}
                  height={136}
                  unoptimized
                />
              </div>
              <button
                className="sidebar-toggle desktop-sidebar-toggle"
                type="button"
                onClick={() => setSidebarCollapsed((current) => !current)}
                aria-controls="essay-library"
                aria-label={sidebarCollapsed ? '展开写作存档' : '收起写作存档'}
                title={sidebarCollapsed ? '展开写作存档' : '收起写作存档'}
              >
                <img
                  className="sidebar-toggle-mark"
                  src="/brand/linguatype-mark-light.png"
                  alt=""
                  width={132}
                  height={113}
                  unoptimized
                />
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="m14.5 6-6 6 6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                className="sidebar-toggle mobile-sidebar-close"
                type="button"
                onClick={closePanel}
                aria-label="关闭作文库"
                title="关闭作文库"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="m14.5 6-6 6 6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div className="pane-heading">
              <div>
                <h2>作文库</h2>
                <p className="pane-caption">{learnerThemesDemo ? '合成考生 · 25 篇原文 / 15 道测试' : recallDemo ? '召回体验 · 合成样例' : hydrated && isLearnerDemoMode() ? '合成模拟用户 · 10 篇练习' : '继续哪一篇？'}</p>
              </div>
            </div>

            <div className="document-list" aria-label="进行中的作文">
              {activeDocuments.map((document, index) => (
                <button
                  type="button"
                  className="document-item"
                  key={document.documentId}
                  onClick={() => {
                    setActiveDocumentId(document.documentId);
                    showWriting();
                  }}
                  aria-current={document.documentId === activeDocumentId ? 'true' : undefined}
                >
                  <span>{learnerThemesDemo ? LEARNER_THEME_CASES.find(item => item.documentId === document.documentId)?.label ?? LEARNER_THEME_ESSAYS.find(item => item.documentId === document.documentId)?.titleZh ?? '新作文' : recallDemo ? RECALL_DEMO_CASES.find(item => item.documentId === document.documentId)?.label ?? '旧积累来源' : `作文 ${index + 1}`}</span>
                  <strong>{documentTitle(document)}</strong>
                  <small>
                    {formatDocumentDate(document.updatedAt)} · 已处理 {document.supportCards.length} 句
                  </small>
                </button>
              ))}
            </div>

            <div className="library-actions">
              <button
                className="btn new-essay"
                type="button"
                onClick={() => setCreateDialogOpen(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 5v14M5 12h14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                <span>新建作文</span>
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setMaterialsOpen(true)}>
                我的素材{argumentAssets.length ? `（${argumentAssets.length}）` : ''}
              </button>
              <button className="btn btn-secondary quiet-action" type="button" onClick={() => setExpressionMemoryOpen(true)}>
                表达记忆{expressionMemories.length ? `（${expressionMemories.length}）` : ''}
              </button>
              <button className="btn btn-secondary" type="button" onClick={archiveActiveDocument}>
                归档当前
              </button>
              <button
                className="btn btn-danger-ghost"
                type="button"
                onClick={() => activeDocument && setDeleteTargetId(activeDocument.documentId)}
              >
                永久删除
              </button>
            </div>

            <details className="archive-drawer">
              <summary>已归档（{archivedDocuments.length}）</summary>
              <div className="archive-list">
                {archivedDocuments.length ? (
                  archivedDocuments.map((document) => (
                    <article className="archive-row" key={document.documentId}>
                      <strong>{documentTitle(document)}</strong>
                      <div>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => restoreDocument(document.documentId)}
                          aria-label={`恢复“${documentTitle(document)}”`}
                        >
                          恢复
                        </button>
                        <button
                          className="btn btn-danger-ghost"
                          type="button"
                          onClick={() => setDeleteTargetId(document.documentId)}
                          aria-label={`永久删除“${documentTitle(document)}”`}
                        >
                          永久删除
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="archive-empty">暂无归档作文。</p>
                )}
              </div>
            </details>
          </section>

          <section
            ref={writingPaneRef}
            className="pane writing-pane"
            aria-label="写作工作区"
          >
            <div className="writing-form">
              <div className="mobile-workspace-actions">
                <button className="btn btn-secondary" type="button" onClick={() => setActivePanel('library')}>作文库</button>
                <button className="btn btn-secondary" type="button" onClick={() => setMaterialsOpen(true)}>我的素材{argumentAssets.length ? `（${argumentAssets.length}）` : ''}</button>
                <button className="btn btn-secondary quiet-action" type="button" onClick={() => setExpressionMemoryOpen(true)}>表达记忆{expressionMemories.length ? `（${expressionMemories.length}）` : ''}</button>
              </div>
              {learnerThemesDemo ? <aside className="recall-demo-guide" aria-label="多主题召回体验说明">
                <strong>25 篇作文之后，哪些积累会被想起？</strong>
                <p>独立模拟体验 · 5.5–6.5 为考生角色设定，未经实际评分。五个主题各 5 篇；文章与保存决定由角色模拟，素材由当前模型真实提炼。</p>
                <button className="text-button" type="button" onClick={() => setMaterialsOpen(true)}>看已保存的 {argumentAssets.filter(asset => asset.kind === 'thought' && asset.status === 'active').length} 条积累与出处</button>
                <nav aria-label="模拟作文主题">{LEARNER_THEMES.map(theme => <button className="btn btn-ghost" key={theme.id} type="button" aria-current={learnerTheme === theme.id ? 'true' : undefined} onClick={() => { setActiveDocumentId(LEARNER_THEME_CASES.find(item => item.theme === theme.id)!.documentId); showWriting(); }}>{theme.titleZh}</button>)}</nav>
                <nav aria-label="多主题召回案例">{LEARNER_THEME_CASES.filter(item => item.theme === learnerTheme).map(item => <button className="btn btn-ghost" key={item.documentId} type="button" aria-current={activeDocumentId === item.documentId ? 'true' : undefined} onClick={() => { setActiveDocumentId(item.documentId); showWriting(); }}>{item.label}</button>)}</nav>
                {learnerThemeCase ? <>
                  <p><b>{learnerThemeCase.title}</b> · 点击积累召回，观察想起了什么。每次使用整份已保存素材库，真实调用当前模型；边界情况也可能值得提醒。</p>
                  <details key={learnerThemeCase.documentId}><summary>体验后再看预期与判断标准</summary><p>{learnerThemeCase.explanation}</p><p>预期基于初始的 7 条积累与空正文；自行修改后结果可能改变。查看提醒不计为使用。</p></details>
                </> : learnerSourceEssay ? <p><b>{learnerSourceEssay.titleZh}</b> · {learnerSourceEssay.wordCount} 词的模拟完成稿。角色决定：{learnerSourceEssay.decisionReasonZh} {latestCompletedVersion?.status === 'error' ? '本篇提炼失败，可点击定稿沉淀查看并手动重试。' : ''}</p> : <p>这是你在独立体验区新建的文章，上方可切回测试题。</p>}
                <details key={learnerTheme}><summary>阅读本主题的 5 篇模拟原文</summary><nav aria-label="本主题模拟原文">{LEARNER_THEME_ESSAYS.filter(item => item.theme === learnerTheme).map(item => <button className="btn btn-ghost" key={item.documentId} type="button" aria-current={activeDocumentId === item.documentId ? 'true' : undefined} onClick={() => { setActiveDocumentId(item.documentId); showWriting(); }}>{item.titleZh}</button>)}</nav></details>
                <details><summary>这份积累是怎样留下来的？</summary><p>25 篇逐一真实提炼：11 篇成功、14 篇首轮失败。角色从成功候选中保存 7 条思考，主动跳过 4 条；没有为失败文章补造素材。失败记录与全部原文都保留在此体验区。</p><p>所有内容均为合成模拟，不写入个人素材；这些结果不能说明真实学习效果。</p></details>
                <button className="text-button" type="button" onClick={() => window.location.assign('/')}>返回原来的写作区</button>
              </aside> : null}
              {recallDemo ? <aside className="recall-demo-guide" aria-label="召回体验说明">
                <strong>同一份旧积累，试三种新题目</strong>
                <p>独立体验区 · 使用合成样例，不写入个人素材。这三条预置测试真实调用当前模型，结果可能与预期不同。</p>
                <button className="text-button" type="button" onClick={() => setMaterialsOpen(true)}>先看这 1 条旧积累与来源</button>
                <nav aria-label="召回测试案例">{RECALL_DEMO_CASES.map(item => <button className="btn btn-ghost" key={item.documentId} type="button" aria-current={activeDocumentId === item.documentId ? 'true' : undefined} onClick={() => { setActiveDocumentId(item.documentId); showWriting(); }}>{item.label}</button>)}</nav>
                {recallDemoCase ? <>
                  <p><b>{recallDemoCase.title}</b> · 点击右侧的积累召回，观察出现旧内容还是空结果。窄屏入口在正文下方。</p>
                  <details key={recallDemoCase.documentId}><summary>看本例的预期与判断标准</summary><p>{recallDemoCase.explanation}</p><p>这份预期基于预置题目、空正文和原始的 1 条积累。编辑正文或素材后，结果可能改变；查看提醒不计为使用。</p></details>
                </> : <p>这里是旧积累的来源文章。上方三个按钮可以切回测试题。</p>}
                <button className="text-button" type="button" onClick={() => window.location.assign('/')}>返回原来的写作区</button>
              </aside> : null}
              <div className="field prompt-field">
                <div className="field-row">
                  {promptIsFixed ? (
                    <p className="field-label">雅思题目</p>
                  ) : (
                    <label htmlFor="task-prompt">雅思题目</label>
                  )}
                </div>
                {promptIsFixed ? (
                  <h1 className="prompt-title">{taskPrompt}</h1>
                ) : (
                  <textarea
                    id="task-prompt"
                    className="input task-prompt-input"
                    value={taskPrompt}
                    onChange={(event) => patchActiveDocument({ taskPrompt: event.target.value })}
                    onBlur={() => {
                      if (taskPrompt.trim()) {
                        patchActiveDocument({
                          taskPrompt: taskPrompt.trim(),
                          promptSource: { kind: 'custom' },
                        });
                      }
                    }}
                    disabled={!hydrated}
                    rows={3}
                    maxLength={4000}
                    placeholder="输入或从原创题库选择 IELTS Writing Task 2 题目"
                  />
                )}
              </div>

              {activePanel === 'feedback' && latestFeedback?.status === 'ready' ? <section className="essay-overall-feedback" aria-label="AI 总体评语">
                <div><strong>总体评语</strong>{latestFeedback.essaySnapshot !== essay ? <small>对应上一版正文</small> : null}</div>
                <p>{latestFeedback.summary}</p>
              </section> : null}

              <div className="field essay-field">
                <div className="field-row">
                  <label htmlFor="essay">作文正文</label>
                  <div className="field-meta">
                    <span className={'save-indicator ' + saveStatus} role="status">
                      {saveStatus === 'saved'
                        ? '已保存'
                        : saveStatus === 'error'
                          ? '未保存 · 请复制内容备份'
                          : hydrated
                            ? '保存中…'
                            : '正在恢复作文库'}
                    </span>
                    <span>{essay.trim().split(/\s+/).filter(Boolean).length} 词</span>
                  </div>
                </div>
                <div className="essay-editor-shell">
                  <textarea
                    ref={essayEditorRef}
                    id="essay"
                    className="textarea"
                    value={essay}
                    onChange={(event) => {
                      setLinkedSentenceKey(null);
                      syncEssaySelection(event.currentTarget);
                      updateEssay(event.target.value);
                    }}
                    onSelect={(event) => {
                      setLinkedSentenceKey(null);
                      syncEssaySelection(event.currentTarget);
                    }}
                    onPointerMove={(event) => {
                      if (event.buttons === 1) {
                        syncEssaySelection(event.currentTarget);
                      }
                    }}
                    onKeyUp={(event) => syncEssaySelection(event.currentTarget)}
                    onScroll={(event) => setEssayScrollTop(event.currentTarget.scrollTop)}
                    disabled={!hydrated}
                    maxLength={20000}
                    placeholder="先继续写；不会表达时可以保留中文占位。"
                    spellCheck={false}
                  />
                  <div ref={essayMirrorRef} className="essay-mirror" aria-hidden="true" />
                  <div
                    className="inline-detections"
                    role="group"
                    aria-label="表达卡点入口"
                    style={{ height: inlineLayout.height }}
                  >
                    {mixedSentences.map((sentence, index) => {
                      const card = cardForSentence(sentence);
                      const sentenceKey = `${sentence.start}:${sentence.end}`;
                      const currentCard =
                        card?.cardId === activeCardId &&
                        card.request.targetSentence === sentence.text;
                      const label = !taskPrompt.trim()
                        ? '填写题目后可生成本句支架'
                        : !card
                          ? '为本句生成支架'
                          : card.status === 'loading'
                            ? '本句支架生成中'
                            : card.status === 'error'
                              ? '查看本句失败信息'
                              : '查看本句支架';
                      const markerTop = (inlineLayout.tops[index] ?? 0) - essayScrollTop;
                      return (
                        <button
                          className="inline-detection-button"
                          type="button"
                          key={sentence.start}
                          onClick={() => processSentence(sentence)}
                          onPointerEnter={() => setLinkedSentenceKey(sentenceKey)}
                          onPointerLeave={() =>
                            setLinkedSentenceKey(
                              document.activeElement?.getAttribute('data-sentence-key') ?? null,
                            )
                          }
                          onFocus={() => setLinkedSentenceKey(sentenceKey)}
                          onBlur={() => setLinkedSentenceKey(null)}
                          disabled={card?.status === 'loading' || !taskPrompt.trim()}
                          hidden={markerTop < -44 || markerTop > inlineLayout.height - 4}
                          style={{
                            transform: 'translateY(' + Math.round(markerTop) + 'px)',
                            animationDelay: `${Math.min(index, 6) * 40}ms`,
                          }}
                          aria-label={`${label}：${sentence.text}`}
                          title={label}
                          aria-current={currentCard ? 'true' : undefined}
                          data-sentence-key={sentenceKey}
                          data-linked={linkedSentenceKey === sentenceKey ? 'true' : undefined}
                          data-state={card?.status ?? 'idle'}
                        >
                          <svg className="detection-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 3.5c.65 4.15 2.85 6.35 7 7-4.15.65-6.35 2.85-7 7-.65-4.15-2.85-6.35-7-7 4.15-.65 6.35-2.85 7-7Z" />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <span className="sr-only" aria-live="polite">
                  {mixedSentences.length
                    ? '检测到 ' + mixedSentences.length + ' 个含中文句子。'
                    : '当前没有中文占位。'}
                </span>
              </div>

              <footer className="essay-workflow-actions" aria-label="文章级操作">
                <button className="btn btn-ghost" type="button" disabled={!hydrated || !taskPrompt.trim() || recallSession?.status === 'loading'} onClick={() => void findRelatedMaterials()}>积累召回</button>
                <button className="btn btn-ghost" type="button" disabled={!hydrated || !taskPrompt.trim() || !essay.trim()} onClick={() => latestFeedback?.essaySnapshot === essay ? showFeedback() : void runEssayFeedback()}>全文审阅</button>
                <button className="btn btn-ghost" type="button" disabled={!hydrated || !taskPrompt.trim() || !essay.trim()} onClick={startDeposit}>定稿沉淀</button>
              </footer>
            </div>
          </section>

          <aside
            className="pane support-pane"
            id="expression-panel"
            aria-labelledby="support-title"
            aria-hidden={activePanel !== 'support'}
          >
            <header className="support-header">
              <div className="support-header-row">
                <h2 id="support-title" ref={supportTitleRef} tabIndex={-1}>表达支架</h2>
                <button className="support-close" type="button" onClick={closePanel} aria-label="关闭表达支架">×</button>
              </div>
              <p className="target-sentence">
                <span>原句</span>
                {activeCard ? activeCard.request.targetSentence : '尚未选择句子'}
              </p>
            </header>

            <div className="support-content">
              {!activeCard ? (
                <div className="empty-state">
                  <strong>选择一个含中文的句子</strong>
                  <p>系统会参考题目和全文，只帮助你处理当前一句。</p>
                </div>
              ) : null}

              {activeCard?.status === 'loading' ? (
                <div className="loading-card" role="status">
                  <span className="spinner" aria-hidden="true" />
                  <div>
                    <h3>正在准备表达支架</h3>
                    <p>你可以先回到正文继续写。</p>
                  </div>
                </div>
              ) : null}

              {activeCard?.status === 'error' ? (
                <div className="error-card" role="alert">
                  <span className="state-mark" aria-hidden="true">!</span>
                  <div>
                    <h3>没有修改你的原文</h3>
                    <p>{activeCard.error}</p>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={retryActiveCard}
                      disabled={retryDisabled}
                    >
                      {retryLabel}
                    </button>
                  </div>
                </div>
              ) : null}

              {activeCard?.status === 'ready' && activeCard.result ? (
                <>
                  <p className="sr-only" role="status">本句支架已生成。</p>
                  <div className="result-stack">
                    {(activeCard.result.memoryMatchIds ?? []).flatMap(memoryId => {
                      const memory = expressionMemories.find(item => item.id === memoryId && item.status === 'active');
                      if (!memory) return [];
                      const key = `memory:${memory.id}`;
                      const visible = activeCard.revealedScaffolds.includes(key);
                      const resultId = `memory-result-${activeCard.cardId}-${memory.id}`;
                      return [<div className="result-group" key={key}>
                        <div className="source-row memory-source-row">
                          <span>表达记忆</span>
                          <p>你以前遇到过类似表达 · 已看过 {memory.revealCount} 次</p>
                        </div>
                        <section className="result-card" aria-label="历史表达">
                          <div className={'scaffold-item' + (visible ? ' revealed' : '')}>
                            <button className="scaffold-row" type="button" onClick={() => revealRememberedExpression(memory)} aria-expanded={visible} aria-controls={resultId}>
                              <span className="focus-zh">{memory.chinese}</span>
                              <span className="reveal-action">{visible ? '已揭示' : '查看英文 →'}</span>
                            </button>
                            {visible ? <div className="revealed-expression" id={resultId} role="status" tabIndex={-1}><span className="sr-only">英文表达：</span><span>{memory.english}</span></div> : null}
                          </div>
                          <button className="memory-ignore" type="button" onClick={() => setExpressionMemories(current => setExpressionMemoryStatus(current, memory.id, 'ignored'))}>不再提醒这个表达</button>
                        </section>
                      </div>];
                    })}
                    {activeCard.result.items.map((item, itemIndex) => (
                      <div className="result-group" key={item.sourceZh + '-' + itemIndex}>
                        <div className="source-row">
                          <span>原中文</span>
                          <p>{item.sourceZh}</p>
                        </div>

                        <section className="result-card" aria-label="表达支架">
                          {item.action === 'provide_expression' ? (
                            <div className="direct-expression">
                              <span>按需揭示英文</span>
                              <button className="scaffold-row" type="button" onClick={() => reveal(itemIndex, 'direct')} aria-expanded={activeCard.revealedScaffolds.includes(`${itemIndex}:direct`)} aria-controls={scaffoldResultId(activeCard.cardId, itemIndex, 'direct')}>
                                <span className="focus-zh">{item.sourceZh}</span>
                                <span className="reveal-action">{activeCard.revealedScaffolds.includes(`${itemIndex}:direct`) ? '已揭示' : '查看英文 →'}</span>
                              </button>
                              {activeCard.revealedScaffolds.includes(`${itemIndex}:direct`) ? <div className="revealed-expression" id={scaffoldResultId(activeCard.cardId, itemIndex, 'direct')} role="status" tabIndex={-1}><span className="sr-only">英文表达：</span><span>{item.recommendedExpression}</span></div> : null}
                            </div>
                          ) : (
                            <>
                              <div className="scaffold-intro">
                                <span>按需揭示英文</span>
                                <span>
                                  已揭示{' '}
                                  {item.scaffolds.filter((scaffold) =>
                                    activeCard.revealedScaffolds.includes(
                                      itemIndex + ':' + scaffold.scaffoldId,
                                    ),
                                  ).length}
                                  /{item.scaffolds.length}
                                </span>
                              </div>
                              <div className="scaffold-list">
                                {item.scaffolds.map((scaffold) => {
                                  const key = itemIndex + ':' + scaffold.scaffoldId;
                                  const visible = activeCard.revealedScaffolds.includes(key);
                                  const resultId = scaffoldResultId(
                                    activeCard.cardId,
                                    itemIndex,
                                    scaffold.scaffoldId,
                                  );
                                  return (
                                    <div
                                      className={'scaffold-item' + (visible ? ' revealed' : '')}
                                      key={scaffold.scaffoldId}
                                    >
                                      <button
                                        className="scaffold-row"
                                        type="button"
                                        onClick={() => reveal(itemIndex, scaffold.scaffoldId)}
                                        aria-expanded={visible}
                                        aria-controls={resultId}
                                      >
                                        <span className="focus-zh">{scaffold.focusZh}</span>
                                        <span className="reveal-action">
                                          {visible ? '已揭示' : '揭示英文 →'}
                                        </span>
                                      </button>
                                      {visible ? (
                                        <div
                                          className="revealed-expression"
                                          id={resultId}
                                          role="status"
                                          tabIndex={-1}
                                        >
                                          <span className="sr-only">英文表达：</span>
                                          <span>{scaffold.recommendedExpression}</span>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </section>
                      </div>
                    ))}
                  </div>

                  <section className="feedback-card">
                    <div className="feedback-head">
                      <span>使用反馈</span>
                      <strong>这次支架有帮助吗？</strong>
                      <p>你的反馈只用于改进支架质量。</p>
                    </div>
                    <div className="feedback-actions">
                      <button
                        className={'btn btn-secondary' + (activeCard.feedback === 'helpful' ? ' selected' : '')}
                        type="button"
                        onClick={() => setCardFeedback('helpful')}
                        aria-pressed={activeCard.feedback === 'helpful'}
                      >
                        有帮助
                      </button>
                      <button
                        className={'btn btn-secondary' + (activeCard.feedback === 'not_helpful' ? ' selected' : '')}
                        type="button"
                        onClick={() => setCardFeedback('not_helpful')}
                        aria-pressed={activeCard.feedback === 'not_helpful'}
                      >
                        没帮助
                      </button>
                    </div>
                    {activeCard.feedback === 'not_helpful' ? (
                      <div className="reason-field">
                        <label htmlFor="feedback-reason">具体是哪一处没有帮助？</label>
                        <select
                          id="feedback-reason"
                          value={activeCard.feedbackReason}
                          onChange={(event) =>
                            activeDocument &&
                            patchCard(activeDocument.documentId, activeCard.cardId, {
                              feedbackReason: event.target.value,
                            })
                          }
                        >
                          <option value="">请选择</option>
                          <option value="inaccurate">意思不准确</option>
                          <option value="unnatural">英文不自然</option>
                          <option value="too_much">帮助过多</option>
                          <option value="too_little">帮助太少</option>
                          <option value="other">其他</option>
                        </select>
                      </div>
                    ) : null}
                    {activeCard.feedback === 'helpful' ? (
                      <p className="feedback-thanks" role="status">已记录，感谢反馈。</p>
                    ) : null}
                    {activeCard.feedback === 'not_helpful' && activeCard.feedbackReason ? (
                      <p className="feedback-thanks" role="status">已记录，感谢反馈。</p>
                    ) : null}
                  </section>
                </>
              ) : null}

              <footer className="support-footer">
                {supportCards.length || archivedCards.length ? (
                  <button
                    className="btn btn-secondary export-button"
                    type="button"
                    onClick={downloadRecord}
                  >
                    导出本篇记录
                  </button>
                ) : null}
                <p className="support-reminder">表达只供参考，不会写回你的作文。</p>
              </footer>
            </div>
          </aside>
          {activePanel === 'feedback' ? <aside className="pane support-pane feedback-pane" id="feedback-panel" aria-label="文中批注">
            <EssayFeedbackPanel run={latestFeedback} stale={latestFeedback?.essaySnapshot !== essay} activeSentenceKey={feedbackFocusSentenceKey} sentenceKeys={feedbackSentenceKeys} tops={feedbackTops} onRun={() => void runEssayFeedback()} onClose={closePanel} onActivate={setLinkedSentenceKey} onLocate={locateFeedbackSource} />
          </aside> : null}
        </main>
      </div>

      <CreateEssayDialog
        open={createDialogOpen}
        promptUsage={promptUsage}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={createDocument}
      />
      <DeleteEssayDialog
        target={deleteTarget}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={deleteDocument}
      />
      {expressionMemoryOpen ? <ExpressionMemoryDialog
        memories={expressionMemories}
        onStatus={(id, status) => setExpressionMemories(current => setExpressionMemoryStatus(current, id, status))}
        onDelete={id => setExpressionMemories(current => current.filter(memory => memory.id !== id))}
        onClose={() => setExpressionMemoryOpen(false)}
      /> : null}
      {completionPreview ? <CompletionConfirmDialog preview={completionPreview} onConfirm={reason => void confirmCompletedVersion(reason)} onClose={() => { setCompletionPreview(null); setCompletionError(null); }} busy={completionBusy} error={completionError} existingVersion={latestCompletedVersion} onResume={() => { if (!latestCompletedVersion) return; setCompletionPreview(null); setCompletionId(latestCompletedVersion.id); setCompletionError(null); }} /> : null}
      {depositSession ? <DepositDialog session={depositSession} assets={argumentAssets} suggestedAssetIds={documents.find(document => document.documentId === depositSession.documentId)?.argumentReuseDrafts?.map(draft => draft.assetId)} onDecision={decideDeposit} onChange={editDeposit} onSave={() => void confirmDeposit()} onRetry={() => void requestDeposit(depositSession)} onClose={() => void closeDeposit()} onUseCurrent={() => void closeDeposit(true)} onViewSaved={viewSavedMaterials} busy={completionBusy} error={completionError} changed={depositSession.snapshot !== essay || depositSession.taskPrompt !== taskPrompt} unsaved={saveStatus === 'error'} /> : null}
      {materialsOpen ? <MaterialsDialog assets={argumentAssets} usages={argumentAssetUsages} packs={topicAssetPacks} initialPackId={materialPackId} initialRevision={materialRevision} onEdit={updateArgumentAsset} onDeleteAsset={id => { if (!window.confirm('删除这条思维资产？来源作文和历史提炼记录仍会保留。')) return; deleteArgumentAsset(id); }} onDeleteLegacy={id => { if (!window.confirm('删除这篇历史素材？来源作文不会被删除。')) return; setTopicAssetPacks(current => current.filter(pack => pack.id !== id)); }} onOpenSource={openSourceDocument} onClose={() => { setMaterialsOpen(false); setMaterialPackId(undefined); setMaterialRevision(undefined); }} /> : null}
      {recallSession ? <RecallDialog session={recallSession} assets={argumentAssets} onOpenSource={id => { closeRecall(); openSourceDocument(id); }} onRetry={() => void findRelatedMaterials()} onClose={closeRecall} /> : null}
      {toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}
    </>
  );
}
