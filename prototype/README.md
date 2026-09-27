# LinguaType 写作支架原型

当前原型在原有逐句表达支架上，已接入整篇修改建议、当前版本主动沉淀、我的素材和新题目主动召回。正式素材按文章保存为 TopicAssetPack，所有内容绑定用户确认的正文快照；系统不判断用户是否掌握。

旧收藏继续保留在“旧收藏”入口。当前没有搜索、人工分类、自动推荐、自动插入、向量数据库或学习效果判断。

## 本地审查

```text
npm ci
npm run dev
```

打开 `http://localhost:3000/`。`npm run dev` 会自动读取工作树根目录中已忽略的 `.env.deepseek.local`；没有该文件时，按 `.env.example` 从外部提供环境变量。

## 积累召回体验

[25 篇考生模拟体验区](http://127.0.0.1:3002/?demo=learner25)：教育、科技、环境、工作、公共服务各 5 篇；先独立写作，再真实提炼、由角色确认，最后构建 15 条新题召回测试。可查看原文、7 条已保存思考及首轮提炼失败，存储与其他工作区隔离。说明与真实记录见 [多主题体验说明](../docs/LEARNER-THEMES-EXPERIENCE.md)。

打开 [三案例体验区](http://127.0.0.1:3002/?demo=recall)：完全命中、相似话题边界、不相关题目，共用 1 条有来源的合成旧积累。点击真实调用当前模型；存储与原工作区隔离。步骤与预期见 [业务体验说明](../docs/RECALL-EXPERIENCE.md)。

离线检查：`node scripts/check-recall-demo.mjs --validate-only`。重新真实检查：`node scripts/check-recall-demo.mjs --output ../evals/argument-asset-loop/runs/<新的运行编号>/results.json`（每例一次调用，不覆盖旧记录）。

## 契约与 Mock

- 写中接口口径是 `contracts/scaffold-api.v1.openapi.json`；共享前端类型在 `app/scaffold-api-contract.ts`。写后接口见上面的独立v1文档。
- 运行 `npm run contract:check` 可确认 TypeScript 与 OpenAPI 公共契约没有偏离冻结标签。
- 运行 `npm run mock:api` 可在 `http://127.0.0.1:4010` 启动无模型费用的契约 mock；前端开发环境应把 `/api/scaffold` 代理到该地址。
- 无模型凭证时，在另一个终端把环境变量 `SCAFFOLD_API_PROXY` 设为 `http://127.0.0.1:4010` 后运行 `npm run dev`，即可让前端同源请求走契约 mock。
- 后续前端调整不修改 `app/api/scaffold/route.ts`、`app/scaffold-api-contract.ts` 或 `contracts/`。如接口确实需要变化，先单独确认新版本。

## 环境

运行时需要以下环境变量：

```text
provider=deepseek
base_url=
api_key=
model=
thinking_type=disabled
```

本地启动时从已忽略的 `.env.deepseek.local` 或进程环境加载；不要提交真实凭证。托管时通过 Sites 的运行时环境配置提供。

本地生产验证使用 `node --env-file=<已有配置路径> node_modules/vinext/dist/cli.js start --port 4317`，直接把配置传给运行进程。不要使用 `node --env-file=… --run start`：本次环境下该启动方式未把模型配置传递给最终服务。构建不需要模型凭证，不把凭证打包进产物。

## 当前边界

- 固定使用 A 输入：题目、完整全文、目标句。
- 每次“处理本句”只调用模型一次。
- 使用 DeepSeek V4 Flash 非思考模式与 v7 完整版提示词；产品侧锁定中文片段和帮助路由，模型只填写表达内容。
- 复杂片段默认返回 2 个、最多 3 个支架；连接词、情态词、程度词和结构助词不能独立成项。
- 复杂支架的揭示只改变浏览器本地状态。
- 题目、作文和逐句支架记录按作文独立保存在当前设备；刷新或重新打开后恢复。
- 支持新建、切换、归档、恢复和删除多篇作文；旧版单篇草稿会自动迁移为第一篇作文。
- 新建作文时可从 10 道原创 Task 2 练习题中按主题筛选并预览，也可继续自行输入题目；确认题目后才创建作文，不产生无意的空白草稿。
- 题库题目会以快照写入作文，并保留原创题目 ID、分类与版本；题库后续变化不会改动已创建作文。
- 同一篇作文可连续处理多个含中文句子；每句独立保留结果、揭示状态和反馈，右侧一次只展开一张卡片。
- 用户修改目标句（包括删掉中文并换成英文）不会触发“旧版本”提示或再次处理；只有完整删除该句时，卡片才从界面移除，并继续保留在导出的内部记录中。
- 请求失败不会修改作文或其他句子卡片；只能由用户主动重试失败的句子。
- 不自动修改、替换或完成用户作文。
- 草稿只保存在当前浏览器，测试记录由用户主动下载，不在服务端持久化。

旧版观点、理由链和使用判断代码仅作兼容与历史证据保留，不代表当前页面或当前产品范围。
