# 写后语言提炼接口 v1

`POST /api/language-extraction` 是 vNext 独立接口；写中 `/api/scaffold` 的冻结公开契约不变。

输入：`{ taskPrompt, completedEssay, helpTargets, existingAssets }`。题目必填，最多4000字；完成稿必填，最多20000字；历史目标句最多30条、每条最多3000字；已有素材最多100条，每条仅中文含义（最多160字）与英文表达（最多240字）。拒绝未知顶层字段。凭证仅由服务端环境提供。

成功：`{ version: 1, candidates, meta }`。候选0—3条，每条含`meaningZh`、`expression`、`conditions`、`sourceQuote`、`reasonZh`。来源是完成稿的完整原句，英文逐字摘录；中文只解释该表达。`conditions`是本地原句参照提示，不作语法完整性断言。`meta`记录模型、Prompt版本、服务端耗时与实际调用数；不包含凭证或请求头。

失败：400 `{ version: 1, error: "INVALID_INPUT" }`；502 `{ version: 1, error: "EXTRACTION_UNAVAILABLE" }`。响应不缓存，不向浏览器暴露模型原始错误或诊断轨迹。

客户端先成功保存独立完成稿，再由使用者点击提炼。当前实现最多两次模型调用，无选取时仅一次；每次服务端请求限30秒，浏览器整轮限65秒，无自动重试。返回按完成版本和本次请求标识绑定，不能覆盖正文、其他版本或重试后的结果。

恢复：刷新把未完成请求标为可重试错误；保留完成稿、已保存／忽略决定。候选仅经使用者保存才进入素材库，保存也不等于已证明适用。编辑后仍保留原始候选及来源完成版本，素材库记录用户修订。
