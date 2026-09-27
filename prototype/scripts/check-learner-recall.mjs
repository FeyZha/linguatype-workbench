// Synthetic learner cases; real endpoint calls, one attempt per case, no provider credentials.
// node scripts/check-learner-recall.mjs <workspace.json> <cases.json> <new-output.json> [--validate-only] [baseUrl]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isPersistedWorkspace } from '../app/workspace-state.ts';
import { ARGUMENT_ASSET_RECALL_API_PATH, ARGUMENT_ASSET_RECALL_PROMPT_VERSION, readArgumentAssetRecallInput, readArgumentAssetRecallResult } from '../app/argument-asset-recall.ts';
import { ARGUMENT_ASSET_RECALL_PROMPT, ARGUMENT_ASSET_RECALL_VERIFICATION_PROMPT, ARGUMENT_ASSET_RECALL_VERIFICATION_SCHEMA } from '../app/server/argument-asset-recall.ts';

const themes = ['education', 'technology', 'environment', 'work', 'public-services'];
const kinds = ['hit', 'boundary', 'miss'];
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const normalized = value => value.trim().replace(/\s+/g, ' ').toLowerCase();

async function main() {
  const [workspacePath, casesPath, outputPath, ...options] = process.argv.slice(2);
  assert([workspacePath, casesPath, outputPath].every(value => nonempty(value) && !value.startsWith('--')),
    '用法：node scripts/check-learner-recall.mjs <workspace.json> <cases.json> <new-output.json> [--validate-only] [baseUrl]');
  let validateOnly = false, baseUrl = 'http://127.0.0.1:3002', hasUrl = false;
  for (const option of options) {
    if (option === '--validate-only') {
      assert(!validateOnly, '--validate-only 不能重复');
      validateOnly = true;
    } else {
      assert(!option.startsWith('--') && !hasUrl, '存在多余参数');
      baseUrl = option;
      hasUrl = true;
    }
  }
  const endpoint = new URL(ARGUMENT_ASSET_RECALL_API_PATH, baseUrl);
  assert(['http:', 'https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password,
    '服务地址必须是无凭证的 HTTP 或 HTTPS URL');
  assert(![resolve(workspacePath), resolve(casesPath)].includes(resolve(outputPath)), '结果路径不能与输入文件相同');

  const [workspaceBytes, casesBytes] = await Promise.all([readFile(workspacePath), readFile(casesPath)]);
  const workspace = JSON.parse(workspaceBytes.toString('utf8'));
  const suite = JSON.parse(casesBytes.toString('utf8'));
  assert(isPersistedWorkspace(workspace), 'workspace 未通过现有工作区校验');
  assert(workspace.documents.every(document => nonempty(document.documentId) && nonempty(document.taskPrompt) && typeof document.essay === 'string'),
    'workspace 文档必须包含有效 ID、题目与正文');
  assert(new Set(workspace.documents.map(document => document.documentId)).size === workspace.documents.length,
    'workspace 存在重复文档 ID');
  assert(suite && nonempty(suite.evalSetId) && suite.synthetic === true && nonempty(suite.notice),
    'cases 必须声明 evalSetId、synthetic:true 和合成数据 notice');
  assert(Array.isArray(suite.cases) && suite.cases.length > 0, '必须提供至少 1 条召回案例');

  const allAssets = workspace.argumentAssets ?? [];
  const assets = allAssets.filter(asset => asset.kind === 'thought' && asset.status === 'active');
  const assetIds = assets.map(asset => asset.assetId);
  const activeIds = new Set(assetIds);
  const sourceIds = new Set(workspace.documents.map(document => document.documentId));
  const sourcePrompts = new Set(workspace.documents.map(document => normalized(document.taskPrompt)));
  for (const asset of allAssets.filter(asset => asset.kind === 'thought')) {
    for (const source of asset.sources) {
      sourceIds.add(source.documentId);
      sourcePrompts.add(normalized(source.taskPrompt));
    }
  }

  const seenIds = new Set(), seenPrompts = new Set(), seenTitles = new Set(), coverage = new Set();
  for (const item of suite.cases) {
    assert(item && ['documentId', 'theme', 'kind', 'label', 'title', 'taskPrompt', 'explanation'].every(key => nonempty(item[key])),
      '每条案例必须包含非空 ID、主题、类型、标签、标题、题目和说明');
    assert(Object.keys(item).every(key => ['documentId', 'theme', 'kind', 'label', 'title', 'taskPrompt', 'explanation', 'expected'].includes(key)),
      '案例包含契约以外字段；测试正文固定为空');
    assert(themes.includes(item.theme) && kinds.includes(item.kind), '案例主题或类型不在约定范围');
    const key = item.theme + ':' + item.kind, prompt = normalized(item.taskPrompt), title = normalized(item.title);
    assert(!coverage.has(key), '每个主题只能有一条 hit、boundary 和 miss');
    assert(!seenIds.has(item.documentId) && !seenPrompts.has(prompt) && !seenTitles.has(title), '案例 ID、题目和标题必须唯一');
    assert(!sourceIds.has(item.documentId) && !sourcePrompts.has(prompt), '召回测试必须使用新文档 ID 和新题目，不能使用资产来源题');
    coverage.add(key); seenIds.add(item.documentId); seenPrompts.add(prompt); seenTitles.add(title);

    const expected = item.expected;
    assert(expected && Object.keys(expected).every(key => ['requiredAssetIds', 'allowedAssetIds', 'minCount', 'maxCount'].includes(key)),
      'expected 字段无效');
    const { requiredAssetIds, allowedAssetIds, minCount, maxCount } = expected;
    for (const ids of [requiredAssetIds, allowedAssetIds]) {
      assert(Array.isArray(ids) && ids.every(id => nonempty(id) && activeIds.has(id)) && new Set(ids).size === ids.length,
        '预期 ID 必须唯一，并且全部指向当前 active ThoughtAsset');
    }
    assert(requiredAssetIds.every(id => allowedAssetIds.includes(id)), 'requiredAssetIds 必须包含于 allowedAssetIds');
    assert(Number.isInteger(minCount) && Number.isInteger(maxCount) && minCount >= 0 && minCount <= maxCount && maxCount <= 3,
      'minCount/maxCount 必须是 0 到 3 的整数，且最小值不大于最大值');
    assert(requiredAssetIds.length <= minCount && maxCount <= allowedAssetIds.length,
      '预期数量与必需/允许 ID 数量不一致');
    readArgumentAssetRecallInput({ taskPrompt: item.taskPrompt, currentDraft: '', assets });
  }
  if (validateOnly) {
    console.log('校验通过：' + suite.cases.length + ' 条合成新题；每次使用全部 ' + assets.length + ' 条 active ThoughtAsset，正文为空。未调用模型、未写入文件。');
    return;
  }

  const freeze = (path, bytes) => ({ path: resolve(path), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  const run = {
    evalSetId: suite.evalSetId, synthetic: true, notice: suite.notice,
    evidence: '合成考生与测试题；真实召回接口响应；每例只请求一次 HTTP，评测脚本不重试。接口内模型调用数见 metadata，不能作为真实用户效果证据。',
    startedAt: new Date().toISOString(), endpoint: endpoint.href, status: 'running',
    inputs: { workspace: freeze(workspacePath, workspaceBytes), cases: freeze(casesPath, casesBytes) },
    selector: { promptVersion: ARGUMENT_ASSET_RECALL_PROMPT_VERSION, systemPrompt: ARGUMENT_ASSET_RECALL_PROMPT, verificationPrompt: ARGUMENT_ASSET_RECALL_VERIFICATION_PROMPT, verificationSchema: ARGUMENT_ASSET_RECALL_VERIFICATION_SCHEMA },
    modelAssets: readArgumentAssetRecallInput({ taskPrompt: suite.cases[0].taskPrompt, currentDraft: '', assets }).assets,
    activeAssetCount: assets.length, cases: [],
  };
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, JSON.stringify(run, null, 2) + '\n', { flag: 'wx' });
  for (const item of suite.cases) {
    const result = {
      ...item, input: { taskPrompt: item.taskPrompt, currentDraft: '', assetIds },
      startedAt: new Date().toISOString(), response: null,
      missing: [...item.expected.requiredAssetIds], unexpected: [], actualCount: null, passed: false,
    };
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskPrompt: item.taskPrompt, currentDraft: '', assets }),
        signal: AbortSignal.timeout(60000), redirect: 'error',
      });
      if (!response.ok) result.error = 'HTTP_' + response.status;
      else {
        const parsed = readArgumentAssetRecallResult(await response.json(), assets);
        const { model, promptVersion, callCount, latencyMs } = parsed.meta;
        result.response = { version: 3, matches: parsed.matches, meta: { model, promptVersion, callCount, latencyMs } };
        const actualIds = parsed.matches.map(match => match.assetId);
        result.missing = item.expected.requiredAssetIds.filter(id => !actualIds.includes(id));
        result.unexpected = actualIds.filter(id => !item.expected.allowedAssetIds.includes(id));
        result.actualCount = actualIds.length;
        result.passed = result.missing.length === 0 && result.unexpected.length === 0
          && result.actualCount >= item.expected.minCount && result.actualCount <= item.expected.maxCount && Number.isInteger(callCount) && callCount >= 1 && callCount <= 4;
      }
    } catch (error) {
      result.error = error?.name === 'TimeoutError' ? 'TIMEOUT'
        : error instanceof SyntaxError || error?.message === 'INVALID_RESPONSE' ? 'INVALID_RESPONSE' : 'REQUEST_FAILED';
    }
    result.finishedAt = new Date().toISOString();
    run.cases.push(result);
    await writeFile(outputPath, JSON.stringify(run, null, 2) + '\n');
    console.log((result.passed ? '通过' : '失败') + ' ' + item.theme + '/' + item.kind + ' ' + item.label
      + '：预期 ' + item.expected.minCount + '–' + item.expected.maxCount + ' 条，实际 '
      + (result.actualCount ?? result.error) + '；漏回 ' + result.missing.length + '，多回 ' + result.unexpected.length);
  }
  run.finishedAt = new Date().toISOString();
  run.status = 'completed';
  run.summary = { passed: run.cases.filter(item => item.passed).length, failed: run.cases.filter(item => !item.passed).length, total: run.cases.length };
  await writeFile(outputPath, JSON.stringify(run, null, 2) + '\n');
  console.log('完成：通过 ' + run.summary.passed + '/' + run.summary.total + '；失败 ' + run.summary.failed + '。结果已保存至 ' + resolve(outputPath));
  if (run.summary.failed > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  const message = error?.code === 'EEXIST' ? '结果文件已存在，拒绝覆盖；请使用新路径。'
    : error?.code === 'ERR_ASSERTION' ? error.message
      : error instanceof SyntaxError ? '输入 JSON 无法解析。'
        : error?.code === 'ERR_INVALID_URL' ? '服务地址无效。' : '读取、校验或保存失败（' + (error?.code ?? 'UNKNOWN_ERROR') + '）。';
  console.error('未完成：' + message);
  process.exitCode = 1;
}
