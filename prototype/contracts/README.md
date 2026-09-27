# Scaffold API v1

`scaffold-api.v1.openapi.json` 是 OpenDesign 前端开发期间唯一有效的后端接口口径，版本为 `1.0.0`。

## 已冻结的表面

- 方法与路径：`POST /api/scaffold`
- 请求字段与长度：题目、完整作文、目标句
- 成功结果的两种 item：直接表达，或 2—3 个渐进揭示支架
- `400 / 502 / 503` 的状态、稳定错误码和错误体
- 响应头：`x-linguatype-api-version: 1.0.0`
- 一次请求只生成一次；复杂支架的英文随本次响应返回，后续揭示只发生在本地

Prompt、模型服务商和服务端校验实现可以在不改变上述表面的前提下调整。前端布局、样式与组件可以重做，但不能复制服务端的中文片段提取或帮助路由逻辑。

## 本地检查

```powershell
npm run contract:check
```

该检查不需要模型凭证，也不访问外网。
它直接将 TypeScript 与 OpenAPI 公共契约同 `scaffold-api-v1.0.0` 冻结标签比较。

## 启动 mock

```powershell
npm run mock:api
```

首次运行会临时下载固定版本的 Prism，不会写入项目依赖。mock 监听 `http://127.0.0.1:4010`。建议让前端开发服务器保持请求 `/api/scaffold`，再用同源代理转到 mock；不要把真实、带模型费用的接口开放为通配跨域服务。

OpenAPI 内含 `direct`、`complex`、`multiple` 三个成功示例。Prism 默认返回第一个示例；手动检查其他状态时可临时发送请求头：

```text
Prefer: example=complex
```

错误状态可用同一机制强制返回，例如：

```text
Prefer: code=502
```

可选状态为 `400`、`502`、`503`。

这个选择示例的请求头只用于 mock 测试，不进入生产交互。

## 变更规则

前端验收前，v1 的字段、含义、状态码和路径保持不变。若出现必须破坏现有契约的需求，新建 `/api/v2/scaffold` 和新的 OpenAPI 文件；不要直接改写 v1。
