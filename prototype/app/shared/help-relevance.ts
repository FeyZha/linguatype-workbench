export type HelpRelationInput = { taskPrompt: string; essay: string; asset: { meaningZh: string; expression: string; conditions: string }; events: { eventId: string; content: string; level: 'chinese' | 'english' | 'full_reference' }[] };
export function readHelpRelationInput(value: unknown): HelpRelationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_INPUT');
  const v = value as HelpRelationInput;
  if (Object.keys(v).length !== 4 || typeof v.taskPrompt !== 'string' || !v.taskPrompt.trim() || v.taskPrompt.length > 5000 || typeof v.essay !== 'string' || v.essay.length > 20000 || !v.asset || Object.keys(v.asset).length !== 3 || ![v.asset.meaningZh, v.asset.expression].every(s => typeof s === 'string' && s.trim() && s.length <= 240) || typeof v.asset.conditions !== 'string' || v.asset.conditions.length > 400 || !Array.isArray(v.events) || v.events.length > 20) throw new Error('INVALID_INPUT');
  readHelpEvents(v.events);
  return v;
}
export function readHelpEvents(value: unknown): HelpRelationInput['events'] {
  if (!Array.isArray(value) || value.length > 20) throw new Error('INVALID_INPUT');
  const v = { events: value };
  const ids = new Set<string>();
  for (const e of v.events) {
    if (!e || Object.keys(e).length !== 3 || typeof e.eventId !== 'string' || !e.eventId || e.eventId.length > 200 || ids.has(e.eventId) || typeof e.content !== 'string' || !e.content.trim() || e.content.length > 5000 || !['chinese', 'english', 'full_reference'].includes(e.level)) throw new Error('INVALID_INPUT');
    ids.add(e.eventId);
  }
  return v.events;
}
export function readHelpRelations<T extends Pick<HelpRelationInput, 'events'>>(value: unknown, input: T) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1) throw new Error('INVALID_OUTPUT');
  const v = value as { relations: { eventId: string; relation: 'yes' | 'no' | 'unknown' }[] };
  if (!Array.isArray(v.relations) || v.relations.length !== input.events.length) throw new Error('INVALID_OUTPUT');
  const seen = new Set<string>();
  for (const r of v.relations) {
    if (!r || Object.keys(r).length !== 2 || !input.events.some(e => e.eventId === r.eventId) || seen.has(r.eventId) || !['yes', 'no', 'unknown'].includes(r.relation)) throw new Error('INVALID_OUTPUT');
    seen.add(r.eventId);
  }
  return input.events.map(e => v.relations.find(r => r.eventId === e.eventId)!);
}
