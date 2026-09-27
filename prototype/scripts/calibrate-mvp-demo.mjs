// Product-side independent AI review, simulated corrections; never a user study.
import { readFile, writeFile } from 'node:fs/promises';
import { readWorkspaceBackup } from '../app/workspace-data.ts';
const run = new URL('../../evals/expression-scaffold/runs/mvp-demo-enrichment-20260911/', import.meta.url);
const workspace = readWorkspaceBackup(await readFile(new URL('workspace.json', run), 'utf8'));
for (const doc of workspace.documents) doc.promptSource = { kind: 'custom' };
const completion = workspace.documents.find(d => d.documentId === 'mvp-finished-city').completions[0];
const corrections = {
  'mvp-language-0-0': '中文提示只谈资金投入，没有缓解拥堵的含义；原帮助归因不采纳。',
  'mvp-language-1-1': 'take advantage of new routes 表示利用路线，并非 gaining an advantage 所表达的获得优势。',
  'mvp-language-1-2': 'check whether each measure works 是检查成效，不是 check compliance 所表达的检查是否遵规。',
  'mvp-idea-0-0': '新稿没有保留大部分额外资金投入公交铁路的分配判断，不能只凭同一话题算使用。',
  'mvp-idea-0-2': '新稿没有保留仅靠便宜票价不足以及下一班车等待一小时的限定，不能反向推理补齐原意。',
};
for (const review of [...completion.usageReviews, ...completion.ideaUsageReviews]) {
  if (!corrections[review.asset.assetId]) continue;
  review.correction = 'exclude';
  if ('expression' in review.asset) review.correctionNote = '演示复核：' + corrections[review.asset.assetId];
}
const json = JSON.stringify(workspace, null, 2);
readWorkspaceBackup(json);
await writeFile(new URL('../app/mvp-demo.json', import.meta.url), json + '\n');
await writeFile(new URL('workspace-calibrated-v2.json', run), json + '\n', { flag: 'wx' });
