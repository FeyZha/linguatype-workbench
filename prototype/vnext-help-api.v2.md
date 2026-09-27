# 写中新旧帮助接口

冻结 `/api/scaffold` v1 不变；以下为 vNext 独立准备步骤，响应均 no-store，错误不返回原始模型输出或凭证。

- `POST /api/language-match`：题目 `taskPrompt`、全文 `fullEssay`、目标句 `targetSentence`、已保存的带正整数 revision 的 `assets`。服务端锁定中文片段与顺序，只允许语言类型、已确认、未删除、quality=usable 的候选。返回 `version:1`、逐项 `matches`（itemId/assetId/coverage）与调用数。请求上限400000字符。
- `POST /api/vnext-help`：同一上下文与素材快照，加 `matches`；null 表示退出匹配、全部走新帮助。服务端验证匹配ID和资格，复用 v7，按位置组合唯一结果。返回 `vnext-help-v2-asset-revision`：saved项保存素材版本、中文、英文及来源；new项沿用既有支架结构。全部saved时 generationCalls=0，其余=1。
- 浏览器匹配等待最多1500ms，立即允许跳过；匹配失败、跳过或超时均继续新帮助。失去响应时实际匹配调用数记未知。迟到匹配不覆盖当前包；同卡请求token和素材revision阻止旧响应回写。
- 旧英文和复杂项英文只在主动揭示后显示，揭示不请求接口。实际展示记录包含内容、请求token、素材版本和展示前正文；弹窗遮挡、后台页、视口外不记曝光。

当前候选上限为最近100条合格素材，不声称全库完整检索。质量准入见[独立接口](asset-quality-api.v1.md)；恢复及真实调用证据见[验收](../evals/expression-scaffold/runs/vnext-s4c-integration-20260910/summary.md)。
