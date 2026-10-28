// Public demo cannot select a personal, research or live-model workspace.
export function isDemoMode(_search?: string) { return true; }
export function isLearnerDemoMode(_search?: string) { return false; }
export function isRecallDemoMode(_search?: string) { return false; }
export function isLearnerThemesDemoMode(_search?: string) { return false; }
export function isFulltextDemoMode(_search?: string) { return false; }
export function isResearchDemoMode(_search?: string) { return false; }
export function workspaceStorageKey(key: string, search = typeof window === 'undefined' ? '' : window.location.search) {
  return 'linguatype:public:20261028-v1:' + (new URLSearchParams(search).get('scene') === 'empty' ? 'empty:' : 'normal:') + key;
}
