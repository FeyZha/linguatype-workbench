import { createEssayDocument, type PersistedWorkspace } from '../app/workspace-state.ts';
import { DEMO_DOCUMENTS } from '../app/prototype-cases.ts';
import { textHash } from '../app/essay-feedback.ts';

export const PUBLIC_RELEASE = '20261028-v1';
export const PUBLIC_STORAGE_PREFIX = `linguatype:public:${PUBLIC_RELEASE}:`;
export const UNIVERSITY_PROMPT = DEMO_DOCUMENTS.find(d => d.documentId === 'demo-university-digital-access')!.taskPrompt;
export const DIGITAL_PROMPT = DEMO_DOCUMENTS.find(d => d.documentId === 'demo-digital-services')!.taskPrompt;
export const SPACE_PROMPT = 'Some people think governments should spend more money on space exploration. Others believe this money should be used to solve problems on Earth. Discuss both views and give your own opinion.';
export const SOURCE_QUOTE = 'Even when online systems work well, agencies should retain face-to-face and telephone services for citizens who need personal assistance.';

// Authored synthetic passages only. No personal essays or research corpus are read.
export const SOURCE_ESSAY = [
  'Digital public services can save time and reduce routine administration. People can submit forms without travelling to an office, and staff can spend less time handling repeated enquiries. However, making websites and applications the main route to healthcare, housing or financial support can deepen the digital divide. In my view, governments should improve online services while keeping practical alternatives available.',
  'The central problem is unequal access. An online form may be convenient for an experienced computer user but difficult for a resident who has limited digital skills or an unreliable internet connection. A person with a visual impairment may also struggle with a website that has not been designed for assistive software. When an application is available only online, these difficulties can prevent someone from receiving essential support.',
  `${SOURCE_QUOTE} Local offices can help residents complete unfamiliar forms and explain complicated requirements. Telephone support is especially useful for people who live far from a service centre but cannot use a website independently. These alternatives need clear opening hours and enough staff to provide meaningful help.`,
  'Digital access should also be improved through simpler forms, accessible interfaces and practical training. Public libraries could provide reliable equipment and assistance, while agencies should test their services with people who have different access needs. In conclusion, digitalisation can improve public administration, but convenience for most users should not become a barrier for everyone else. A combination of online access and dependable personal support is more inclusive than an online-only approach.',
].join('\n\n');

export const REVIEW_ESSAY = SOURCE_ESSAY.replace('These alternatives need clear opening hours and enough staff to provide meaningful help.', 'These alternatives are good for everyone.').replace('Public libraries could provide reliable equipment and assistance, while agencies should test their services with people who have different access needs.', 'Public libraries could provide reliable equipment and assistance. This will solve all access problems.');

export const DEMO_STEPS = [
  { id: 'public-university', label: '01 旧文复用', title: '大学服务线上化', hint: '点击「从旧文找线索」，看看以前写过的判断、来源原句和改动方向。' },
  { id: 'public-expression', label: '02 表达帮助', title: '公共服务 · 表达卡点', hint: '点击正文右侧的闪光按钮，为含中文的句子获取帮助；英文按需翻开。' },
  { id: 'public-review', label: '03 审阅与保存', title: '公共服务 · 待审阅稿', hint: '点击「全文审阅」查看原句和修改方向，再点击「确认完成版本」保留这版全文。' },
  { id: 'public-space', label: '04 无关题目', title: '太空探索', hint: '点击「从旧文找线索」体验空结果。没有合适的旧内容时，把思考留给你。' },
] as const;

export async function createPublicWorkspace(empty = false): Promise<PersistedWorkspace> {
  const now = '2026-10-28T00:00:00.000Z';
  const mixed = DEMO_DOCUMENTS.find(d => d.documentId === 'demo-digital-services')!;
  const make = (id: string, taskPrompt: string, essay: string) => createEssayDocument(id, now, { taskPrompt, essay, promptSource: { kind: 'custom' } });
  const source = make('public-source', DIGITAL_PROMPT, SOURCE_ESSAY);
  source.completedVersions = [{ id: 'public-source-confirmed', documentId: source.documentId, sourceTitle: '预置旧文 · 公共服务数字化', taskPrompt: source.taskPrompt, snapshot: source.essay, essayHash: await textHash(source.essay), confirmedAt: now, saveReason: '合成体验素材，不是体验者的个人作文。', status: 'confirmed', requestId: null, candidate: null, meta: null, error: null }];
  const documents = [make('public-university', UNIVERSITY_PROMPT, ''), make('public-expression', DIGITAL_PROMPT, mixed.essay), make('public-review', DIGITAL_PROMPT, REVIEW_ESSAY), make('public-space', SPACE_PROMPT, '')];
  if (!empty) documents.push(source);
  return { version: 2, documents, activeDocumentId: 'public-university', savedAt: now, topicAssetPacks: [], argumentAssets: [], argumentAssetUsages: [], expressionMemories: [] };
}
