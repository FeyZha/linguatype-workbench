'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ORIGINAL_PROMPTS,
  PROMPT_CATEGORIES,
  type PromptCategory,
} from './prompt-bank';
import type { PromptSource } from './workspace-state';

type CreateEssayPayload = {
  taskPrompt: string;
  promptSource: PromptSource;
};

type CreateEssayDialogProps = {
  open: boolean;
  promptUsage: Record<string, number>;
  onClose: () => void;
  onCreate: (payload: CreateEssayPayload) => void;
};

type PromptFilter = '全部' | PromptCategory;

export function CreateEssayDialog({
  open,
  promptUsage,
  onClose,
  onCreate,
}: CreateEssayDialogProps) {
  const [mode, setMode] = useState<'bank' | 'custom'>('bank');
  const [filter, setFilter] = useState<PromptFilter>('全部');
  const [selectedPromptId, setSelectedPromptId] = useState(ORIGINAL_PROMPTS[0].id);
  const [customPrompt, setCustomPrompt] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);

  const filteredPrompts = useMemo(
    () =>
      filter === '全部'
        ? ORIGINAL_PROMPTS
        : ORIGINAL_PROMPTS.filter((prompt) => prompt.category === filter),
    [filter],
  );
  const selectedPrompt =
    ORIGINAL_PROMPTS.find((prompt) => prompt.id === selectedPromptId) ??
    filteredPrompts[0] ??
    ORIGINAL_PROMPTS[0];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = true;
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMode('bank');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      if (restoreFocusRef.current) {
        window.setTimeout(() => returnFocusRef.current?.focus(), 0);
      }
    }
  }, [open]);

  function changeFilter(category: PromptFilter) {
    setFilter(category);
    const prompts =
      category === '全部'
        ? ORIGINAL_PROMPTS
        : ORIGINAL_PROMPTS.filter((prompt) => prompt.category === category);
    if (!prompts.some((prompt) => prompt.id === selectedPromptId) && prompts[0]) {
      setSelectedPromptId(prompts[0].id);
    }
  }

  function createFromBank() {
    restoreFocusRef.current = false;
    onCreate({
      taskPrompt: selectedPrompt.prompt,
      promptSource: {
        kind: 'original_bank',
        promptId: selectedPrompt.id,
        promptVersion: 1,
        category: selectedPrompt.category,
        title: selectedPrompt.title,
      },
    });
  }

  function createFromCustom() {
    const taskPrompt = customPrompt.trim();
    if (!taskPrompt) return;
    restoreFocusRef.current = false;
    onCreate({ taskPrompt, promptSource: { kind: 'custom' } });
    setCustomPrompt('');
  }

  function switchMode(nextMode: 'bank' | 'custom') {
    setMode(nextMode);
    window.setTimeout(() => document.getElementById(`${nextMode}-mode-tab`)?.focus(), 0);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="create-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (outside) onClose();
      }}
    >
      <header className="dialog-header">
        <div>
          <p className="eyebrow">新建作文</p>
          <h2 id="create-dialog-title">选择一道题，直接开始写</h2>
          <p>题目只降低准备成本，不会生成观点或作文内容。</p>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="关闭新建作文弹窗"
        >
          ×
        </button>
      </header>

      <div className="dialog-body">
        <div
          className="mode-tabs"
          role="tablist"
          aria-label="题目来源"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            switchMode(mode === 'bank' ? 'custom' : 'bank');
          }}
        >
          <button
            className="mode-tab"
            id="bank-mode-tab"
            type="button"
            role="tab"
            aria-selected={mode === 'bank'}
            aria-controls="bank-panel"
            tabIndex={mode === 'bank' ? 0 : -1}
            onClick={() => switchMode('bank')}
            autoFocus
          >
            原创练习题 · {ORIGINAL_PROMPTS.length} 道
          </button>
          <button
            className="mode-tab"
            id="custom-mode-tab"
            type="button"
            role="tab"
            aria-selected={mode === 'custom'}
            aria-controls="custom-panel"
            tabIndex={mode === 'custom' ? 0 : -1}
            onClick={() => switchMode('custom')}
          >
            自己输入题目
          </button>
        </div>

        {mode === 'bank' ? (
          <section id="bank-panel" role="tabpanel" aria-labelledby="bank-mode-tab">
            <div className="prompt-layout">
              <div>
                <div className="prompt-filters" role="group" aria-label="按主题筛选">
                  {(['全部', ...PROMPT_CATEGORIES] as PromptFilter[]).map((category) => (
                    <button
                      className="filter-button"
                      type="button"
                      key={category}
                      aria-pressed={filter === category}
                      onClick={() => changeFilter(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <div className="prompt-list">
                  {filteredPrompts.map((prompt) => {
                    const usageCount = promptUsage[prompt.id] ?? 0;
                    return (
                      <button
                        className="prompt-card"
                        type="button"
                        key={prompt.id}
                        aria-pressed={prompt.id === selectedPrompt.id}
                        onClick={() => setSelectedPromptId(prompt.id)}
                      >
                        <span>
                          {prompt.category} · {prompt.taskType} · {prompt.difficulty}
                          {usageCount ? ' · 已使用 ' + usageCount + ' 次' : ''}
                        </span>
                        <strong>{prompt.title}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>

              <article className="prompt-preview">
                <p className="eyebrow">题目预览</p>
                <h3>{selectedPrompt.title}</h3>
                <p>{selectedPrompt.prompt}</p>
                <div className="prompt-facts">
                  <span>主题 · {selectedPrompt.category}</span>
                  <span>题型 · {selectedPrompt.taskType}</span>
                  <span>难度 · {selectedPrompt.difficulty}</span>
                </div>
                <button className="btn btn-primary" type="button" onClick={createFromBank}>
                  用这道题创建作文
                </button>
              </article>
            </div>
          </section>
        ) : (
          <section
            id="custom-panel"
            className="custom-panel"
            role="tabpanel"
            aria-labelledby="custom-mode-tab"
          >
            <label htmlFor="custom-prompt">粘贴或输入 IELTS Writing Task 2 题目</label>
            <textarea
              id="custom-prompt"
              className="input"
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              rows={6}
              maxLength={4000}
              placeholder="在这里输入题目……"
            />
            <div className="custom-actions">
              <span>题目非空后才会创建作文。</span>
              <button
                className="btn btn-primary"
                type="button"
                onClick={createFromCustom}
                disabled={!customPrompt.trim()}
              >
                创建作文
              </button>
            </div>
          </section>
        )}
      </div>
    </dialog>
  );
}
