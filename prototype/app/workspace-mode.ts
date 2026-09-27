// Full navigation switches modes; every persistence/lock/conflict key stays isolated.
export function isDemoMode(search = typeof window === 'undefined' ? '' : window.location.search) {
  // The prototype opens with reviewable cases; ?demo=0 is the explicit personal workspace.
  return new URLSearchParams(search).get('demo') !== '0';
}
export function isLearnerDemoMode(search = typeof window === 'undefined' ? '' : window.location.search) {
  return new URLSearchParams(search).get('demo') === 'learner';
}
export function isRecallDemoMode(search = typeof window === 'undefined' ? '' : window.location.search) {
  return new URLSearchParams(search).get('demo') === 'recall';
}
export function isLearnerThemesDemoMode(search = typeof window === 'undefined' ? '' : window.location.search) {
  return new URLSearchParams(search).get('demo') === 'learner25';
}
export function workspaceStorageKey(key: string, search?: string) {
  if (isLearnerThemesDemoMode(search)) return `linguatype:demo-learner25:v1:${key}`;
  if (isRecallDemoMode(search)) return `linguatype:demo-recall:v1:${key}`;
  return isLearnerDemoMode(search) ? `linguatype:demo-learner:v3:${key}` : isDemoMode(search) ? `linguatype:demo:v4:${key}` : key;
}
