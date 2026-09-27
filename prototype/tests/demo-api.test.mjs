import assert from 'node:assert/strict';
import { demoFetch } from '../app/demo-api.ts';
import { DEMO_DOCUMENTS } from '../app/prototype-cases.ts';
import { RECALL_DEMO_CASES, createRecallDemoWorkspace } from '../app/demo-recall.ts';
import { readFeedbackResult } from '../app/essay-feedback.ts';
import { readTopicAssetCandidate } from '../app/topic-assets.ts';
import { readArgumentAssetRecallResult } from '../app/argument-asset-recall.ts';
import { readScaffoldResponse } from '../app/scaffold-response.ts';
import { SCAFFOLD_API_VERSION } from '../app/scaffold-api-contract.ts';
import { findMixedSentences } from '../app/sentence-tracking.ts';

const request=(path,body)=>demoFetch(path,{method:'POST',body:JSON.stringify(body)});
const doc=DEMO_DOCUMENTS.find(d=>d.documentId==='demo-digital-services');
const scaffold=await request('/api/scaffold',{targetSentence:findMixedSentences(doc.essay)[0].text});
assert.equal((await readScaffoldResponse(scaffold,SCAFFOLD_API_VERSION)).ok,true);
const feedback=await request('/api/feedback',{essay:doc.essay});
assert.equal(feedback.status,200);
assert.ok(readFeedbackResult(await feedback.json(),doc.essay).suggestions.length);
assert.equal((await request('/api/feedback',{essay:'unrecorded text'})).status,422);
const deposit=await request('/api/deposit',{documentId:doc.documentId,taskPrompt:doc.taskPrompt,snapshot:doc.essay});
assert.equal(deposit.status,200);
assert.ok(readTopicAssetCandidate((await deposit.json()).candidate,doc.essay).thought);
const assets=createRecallDemoWorkspace().argumentAssets;
for(const c of RECALL_DEMO_CASES){
  const response=await request('/api/argument-asset-recall',{taskPrompt:c.taskPrompt,assets});
  assert.equal(response.status,200);
  assert.equal(readArgumentAssetRecallResult(await response.json(),assets).matches.length,c.expectedCount);
}
assert.equal((await request('/api/anything',{})).status,422);
console.log('Scaffold, recorded feedback, source-grounded deposit, recall hit and boundaries OK');
