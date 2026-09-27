# LinguaType

[在线体验](https://feyzha-linguatype.vercel.app) · [GitHub](https://github.com/FeyZha/linguatype-workbench)

面向中文母语 IELTS 写作者的写作工作台：先完成表达，再整理和复用自己的思考。

## 功能

- 中英混合句的表达支架，英文按需揭示。
- 全文反馈与自主修改，建议不自动替换正文。
- 明确确认完成版本，再决定是否保存素材。
- 主动召回已有思考，并追溯原文来源；支持空结果。

## 在线演示

公开版复用写作工作台界面，使用隔离演示素材及已保存的测试响应。无需账号或 API 密钥，不调用大模型。支持的输入见 Demo 中的“测试场景说明”；未收录的内容不会伪装成实时生成。

## 快速开始

需要 Node.js 22.13 或更高版本。

```sh
cd prototype
npm ci
npm run dev:demo
```

## 构建与测试

```sh
cd prototype
npm run test:demo
npm run build:demo
```

Vercel 使用根目录配置部署静态 Demo。源码中的原模型接口作为实现参考保留，不包含在静态部署产物中。

## 项目结构

- `prototype/app/`：写作、反馈、素材与浏览器存储。
- `prototype/app/demo-api.ts`：预制响应入口。
- `prototype/app/server/`：原本地模型编排实现。
- `prototype/contracts/`：接口约束。
- `prototype/tests/`：回归检查。

## 数据与限制

预置作文与素材是合成演示数据；全文反馈与完成稿候选复用已有测试记录。演示操作仅保存在浏览器，不能据此推断学习效果。自由改写后的内容没有预制响应时会保留原文并提示失败。源码尚未授予额外开源许可。
