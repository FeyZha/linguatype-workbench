// Prepared fiction, processed through the same API and validators as the app.
// Run against a configured local production server; no credentials are read here.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEssayDocument } from '../app/workspace-state.ts';
import { completeWriting, readCompletionCandidates } from '../app/writing-completion.ts';
import { newWritingTrace, recordWritingEvent } from '../app/writing-trace.ts';
import { saveLanguageAsset, applyAssetQuality, assetQualityInput } from '../app/language-assets.ts';
import { saveIdeaAsset, applyIdeaQuality } from '../app/idea-assets.ts';
import { saveReasonAsset, applyReasonQuality, reasonText } from '../app/reason-chains.ts';
import { analyzeWritingUsage } from '../app/writing-usage.ts';
import { analyzeIdeaUsage } from '../app/idea-usage.ts';
import { readWorkspaceBackup } from '../app/workspace-data.ts';

const run = new URL('../../evals/expression-scaffold/runs/mvp-demo-20260911/', import.meta.url);
await mkdir(run, { recursive: true });
const now = () => '2026-09-11T08:00:00.000Z'; // Fictional session date, not an observed user session.
let requestNumber = 0;
async function demoFetch(path, options) {
  const name = `${String(++requestNumber).padStart(2, '0')}-${path.split('/').at(-1)}.json`;
  const input = JSON.parse(options.body);
  let receipt;
  try {
    receipt = JSON.parse(await readFile(new URL(name, run), 'utf8'));
    if (JSON.stringify(receipt.input) !== JSON.stringify(input)) throw new Error('Cached request differs; create a new demo run.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(new URL(path, 'http://127.0.0.1:4173'), options);
    const output = await response.json();
    if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(output)}`);
    receipt = { input, output };
    await writeFile(new URL(name, run), JSON.stringify(receipt, null, 2), { flag: 'wx' });
  }
  console.log(name);
  return Response.json(receipt.output);
}
const post = async (path, input) => (await demoFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(90000) })).json();
const topics = {
  transport: 'Some people think governments should invest more in public transport than in building new roads. To what extent do you agree or disagree?',
  regulation: 'Some people believe that governments should introduce stricter environmental rules for businesses. Others think businesses should decide how to reduce pollution. Discuss both views and give your own opinion.',
  city: 'Many cities suffer from traffic congestion and air pollution. What are the causes of these problems, and what measures could governments take to solve them?',
  next: 'Some people think public transport should be free for everyone. Others believe passengers should pay for it. Discuss both views and give your own opinion.',
};
const transportEssay = `Governments have limited budgets, so they must decide whether new roads or better public transport will bring greater benefits. Although some roads need repair, I believe that most additional funding in crowded cities should go towards reliable bus and rail services.

Frequent and affordable buses make public transport a practical alternative to driving. When more commuters choose buses instead of private cars, fewer vehicles enter busy city centres, reducing traffic congestion. This can also shorten delivery times for local businesses. However, services must reach residential areas and operate early enough for people who start work before the usual rush hour. A cheap ticket alone is unlikely to persuade someone to leave a car at home if the next bus arrives an hour later.

Public investment also matters for people who cannot afford a car. Affordable public transport gives low-income residents better access to jobs. For example, a worker may be able to accept a position across the city when a direct bus route makes the journey manageable. Roads still have an essential role, particularly in rural areas where a frequent bus service may be difficult to sustain. Maintaining dangerous roads should therefore remain a priority, even if large urban road expansions receive less money.

In conclusion, governments should place greater emphasis on dependable public transport in congested cities while continuing necessary road maintenance. The aim should be to provide a useful alternative to driving, rather than simply to increase the number of buses on the road.`;
const regulationEssay = `Environmental damage from business activity affects people who may have little influence over the companies responsible. While voluntary action can be useful, I believe that governments should set minimum environmental standards and allow businesses flexibility in how they meet them.

Supporters of voluntary action argue that companies understand their production methods better than officials do. A factory may discover a cheaper way to reduce waste, and this approach could be more effective than a detailed rule requiring every firm to buy the same equipment. Businesses also have a reason to protect their reputation, particularly when customers can easily compare competing products. These incentives can encourage useful improvements without lengthy administrative procedures.

Nevertheless, voluntary commitments are not enough when reducing pollution raises costs and customers cannot observe a firm's behaviour. Because governments have legislative powers, they can impose restrictions on industrial emissions. Clear minimum standards prevent firms from gaining an advantage simply by ignoring environmental costs. Enforcement is essential: a rule that is rarely checked may change little in practice. Small businesses may also need a reasonable transition period to purchase equipment and train employees, rather than facing an immediate requirement they cannot meet.

In my view, regulation and business initiative should work together. Governments should define the outcomes that firms must achieve and check compliance, while companies choose suitable methods. This combination can protect the public without assuming that officials know the best technical solution for every factory.`;

let library = { assets: [], ideas: [], reasons: [], exposures: [], sequence: 0 };
const sources = [createEssayDocument('mvp-source-transport', now(), { taskPrompt: topics.transport, essay: transportEssay }), createEssayDocument('mvp-source-regulation', now(), { taskPrompt: topics.regulation, essay: regulationEssay })];
for (let i = 0; i < sources.length; i++) {
  let doc = sources[i];
  doc.writingTrace = newWritingTrace([]);
  doc = completeWriting(doc, `${doc.documentId}-completed`, now());
  const completion = doc.completions[0];
  const base = { taskPrompt: doc.taskPrompt, completedEssay: doc.essay };
  const language = await post('/api/language-extraction', { ...base, helpTargets: i ? ['impose restrictions on industrial emissions'] : ['reducing traffic congestion', 'access to jobs'], existingAssets: library.assets.map(({ meaningZh, expression }) => ({ meaningZh, expression })) });
  completion.candidates = readCompletionCandidates(language, completion);
  completion.status = 'ready'; completion.attemptId = `demo-language-${i}`; completion.analysisMeta = language.meta;
  for (const [j, candidate] of completion.candidates.entries()) {
    const assetId = `mvp-language-${i}-${j}`;
    library = saveLanguageAsset(library, { ...candidate, assetId, sourceDocumentId: doc.documentId, sourceCompletionId: completion.completionId }, doc.essay, now());
    const asset = library.assets.at(-1);
    library = applyAssetQuality(library, await post('/api/asset-quality', assetQualityInput(asset, [doc])));
    candidate.decision = 'saved'; candidate.assetId = assetId;
  }
  for (const type of ['idea', 'reason']) {
    if (type === 'reason') {
      // Curated demonstration assets: simulated editorial saves, not invented model extractions.
      // The failed raw extraction is retained separately in reason-diagnostic.json.
      const sourceQuote = i ? 'Because governments have legislative powers, they can impose restrictions on industrial emissions.' : 'When more commuters choose buses instead of private cars, fewer vehicles enter busy city centres, reducing traffic congestion.';
      const candidate = i
        ? { nodes: [{ textZh: '政府拥有立法权', sourceQuote }, { textZh: '政府能够限制工业排放', sourceQuote }], links: [{ relation: 'cause', sourceQuote }] }
        : { nodes: [{ textZh: '更多通勤者选择公交而非私家车', sourceQuote }, { textZh: '进入繁忙市中心的车辆更少', sourceQuote }, { textZh: '交通拥堵减轻', sourceQuote }], links: [{ relation: 'condition', sourceQuote }, { relation: 'cause', sourceQuote }] };
      const assetId = `mvp-reason-${i}-curated`;
      library.reasons = saveReasonAsset(library.reasons, { ...candidate, assetId, sourceDocumentId: doc.documentId, sourceCompletionId: completion.completionId, sourceTaskPrompt: doc.taskPrompt }, doc.essay, now());
      library.reasons = applyReasonQuality(library.reasons, await post('/api/reason-quality', { assetId, revision: 1, taskPrompt: doc.taskPrompt, candidate, sourceEssay: doc.essay }));
      continue;
    }
    const output = await post(`/api/${type}-extraction`, { ...base, ...(type === 'idea' ? { existingIdeas: library.ideas.map(a => a.textZh) } : { existingChains: library.reasons.map(reasonText) }) });
    completion[type === 'idea' ? 'ideas' : 'reasons'] = { status: 'ready', attemptId: `demo-${type}-${i}`, meta: output.meta, candidates: output.candidates.map((c, j) => ({ ...c, decision: 'saved', assetId: `mvp-${type}-${i}-${j}` })) };
    for (const [j, c] of output.candidates.entries()) {
      const assetId = `mvp-${type}-${i}-${j}`, value = { ...c, assetId, sourceDocumentId: doc.documentId, sourceCompletionId: completion.completionId };
      if (type === 'idea') {
        library.ideas = saveIdeaAsset(library.ideas, value, doc.essay, now());
        library.ideas = applyIdeaQuality(library.ideas, await post('/api/idea-quality', { assetId, revision: 1, textZh: c.textZh, sourceQuote: c.sourceQuote, sourceEssay: doc.essay }));
      } else {
        library.reasons = saveReasonAsset(library.reasons, { ...value, sourceTaskPrompt: doc.taskPrompt }, doc.essay, now());
        library.reasons = applyReasonQuality(library.reasons, await post('/api/reason-quality', { assetId, revision: 1, taskPrompt: doc.taskPrompt, candidate: c, sourceEssay: doc.essay }));
      }
    }
  }
  sources[i] = doc;
}

let finished = createEssayDocument('mvp-finished-city', now(), { taskPrompt: topics.city, essay: '' });
finished.writingTrace = newWritingTrace(library.assets, library.ideas, library.reasons);
const language = library.assets.find(a => a.quality === 'usable' && a.sourceDocumentId === sources[0].documentId);
const idea = library.ideas.find(a => a.quality === 'usable' && a.sourceDocumentId === sources[0].documentId);
const reason = library.reasons.find(a => a.quality === 'usable' && a.sourceDocumentId === sources[0].documentId);
if (!language || !idea || !reason) throw new Error('Demo needs a reviewed asset of each type.');
// A simulated Chinese-only reminder before writing: preserved as such, never a real user claim.
finished = recordWritingEvent(finished, { eventId: 'mvp-simulated-reminder', kind: 'exposure', level: 'chinese', content: idea.textZh, assetId: idea.assetId, revision: idea.revision, shownAt: now() });
finished.essay = `Traffic congestion and air pollution often occur together in large cities. Heavy reliance on private cars is one cause, while emissions from industry can make local air quality worse. Governments should address both transport choices and the sources of pollution.

One difficulty is that driving remains more convenient than taking a bus in many neighbourhoods. Frequent and affordable buses make public transport a practical alternative to driving. When more commuters choose buses instead of private cars, fewer vehicles enter busy city centres, reducing traffic congestion. This can also shorten delivery times for local businesses. However, services must reach residential areas and operate early enough for people who start work before the usual rush hour.

Access is another important consideration. Affordable public transport gives low-income residents better access to jobs. If fares rise sharply, some workers may be unable to take advantage of new routes. Funding should therefore support both service quality and fares that residents can reasonably pay. Industrial pollution needs a different response. Because governments have legislative powers, they can impose restrictions on industrial emissions. These standards need regular inspections, since a rule on paper does not guarantee cleaner air.

In conclusion, cities need a combination of reliable public transport and enforceable environmental rules. Improving transport gives residents a practical reason to use fewer cars, while regulating industrial emissions addresses pollution that transport policies alone cannot solve. Local authorities should check whether each measure works before spending more on the same approach.`;
finished = completeWriting(finished, 'mvp-finished-city-completed', now());
const completed = finished.completions[0], signal = new AbortController().signal;
const traceAsset = completed.writingTrace.initialAssets.find(a => a.assetId === language.assetId);
completed.usageReviews = [{ asset: traceAsset, attemptId: 'mvp-language-use', status: 'ready', correction: 'none', ...await analyzeWritingUsage(finished.documentId, completed, traceAsset, signal, demoFetch) }];
for (const [field, asset] of [['ideaUsageReviews', idea], ['reasonUsageReviews', reason]]) {
  completed[field] = [{ asset, attemptId: `mvp-${field}`, status: 'ready', correction: 'none', ...await analyzeIdeaUsage(completed, asset, signal, demoFetch) }];
}

const draft = createEssayDocument('mvp-current', now(), { taskPrompt: topics.next, essay: `Public transport is important for people who travel to work or school every day. Although free services could help some passengers, I believe that low fares and reliable services are more useful than removing fares for everyone.

Affordable buses can 缓解交通拥堵. However, making every journey free could 给地方政府带来长期的财政负担. A city still needs money to maintain vehicles and pay drivers.

In my view, local authorities should offer discounted fares to people on low incomes while 改善班次频率，让公交成为开车的可靠替代选择.` });
draft.writingTrace = newWritingTrace(library.assets, library.ideas, library.reasons);
const fresh = createEssayDocument('mvp-new-topic', now(), { taskPrompt: 'Some people believe that governments should impose stricter rules on private car use in city centres. To what extent do you agree or disagree?' });
fresh.writingTrace = newWritingTrace(library.assets, library.ideas, library.reasons);
const workspace = { version: 2, assetLibrary: library, documents: [draft, fresh, finished, ...sources], activeDocumentId: draft.documentId, savedAt: now() };
const json = JSON.stringify(workspace, null, 2);
readWorkspaceBackup(json);
await writeFile(new URL('../app/mvp-demo.json', import.meta.url), json + '\n');
await writeFile(new URL('workspace.json', run), json + '\n', { flag: 'wx' });
console.log(JSON.stringify({ documents: workspace.documents.length, language: library.assets.length, ideas: library.ideas.length, reasons: library.reasons.length, requests: requestNumber }));
