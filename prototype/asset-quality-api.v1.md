# 素材质量准入 API v1

`POST /api/asset-quality`，独立于冻结的 `/api/scaffold`。保存/编辑已落盘后执行；旧条目也可主动核对。失败不影响保存，刷新不自动重发未完成请求。

请求：`assetId`、正整数`revision`、`meaningZh`、`expression`、`conditions`、`sourceQuote`、`sourceEssay`（字符串或null）。中文/英文/条件/引文/来源全文上限分别160/240/400/2000/20000字符；不接收附加字段。客户端从对应完成版本获取来源；原作文已删除且选择保留素材时使用必要来源摘录，不虚构完整上下文。未找到指定完成版本不降级成其他作文。

来源句不在来源全文中：本地返回unusable，0调用。有来源则使用独立Prompt `vnext-asset-quality-v1-source-meaning`，最多1次模型调用；允许自然的用户英文修订，不要求修订英文逐字存在原句。

成功：`{version:1,assetId,revision,quality,checkedAt,promptVersion,callCount}`。quality仅usable/unusable/unknown。只表示素材可否进入候选池，新句适用性另行判断。调用错误返回502 `{version:1,error:"QUALITY_UNAVAILABLE"}`；输入错误400 `INVALID_INPUT`；响应no-store。不给浏览器模型原始输出、原因诊断、请求头或凭证。

客户端核对请求ID/修订对应关系，再仅更新仍存在、仍为该修订、尚未审查的条目。编辑创建新修订并清除质量结论；删除后不复活。失败保留unreviewed，用户可主动重试。拒绝文案使用“尚不能确认可用于提醒”，不得把不可靠原因代码展示为确诊语法错误。
