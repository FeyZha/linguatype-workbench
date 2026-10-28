# 上传到 EdgeOne Pages / Makers

此版本是可直接托管的静态前端。不需要模型、后端、账号系统、环境变量或密钥。

## 直接上传（本轮交付方式）

1. 登录 [腾讯云 EdgeOne 控制台](https://console.cloud.tencent.com/edgeone/makers)，选择 Pages / Makers，点击“创建项目”→“直接上传”。
2. 项目名称可以填写 linguatype-demo。根据你的域名和备案情况选择加速区域。
3. 上传 release/linguatype-edgeone-20261029.zip。不要再给 ZIP 套一层文件夹；ZIP 根目录已有 index.html。
4. 点击“开始部署”，等待成功后打开控制台给出的链接。按顶部四个场景体验，再测试“体验没有旧文”和“重置样例”。

如果选择文件夹上传，直接选预置 dist 文件夹即可。不要上传源码、node_modules、整个仓库或包含个人资料的备份。不要通过双击 index.html 判断托管版本能否运行；应从 HTTPS 站点打开。

## 分享链接前必须核对

按 2026-10-29 查看的官方规则：默认项目/部署域名不保证供国内访客长期直接访问。中国大陆或包含中国大陆的区域，默认域名需要有效期为3小时的预览链接；不含中国大陆的区域，默认域名的中国大陆访问可能返回401。长期分享建议使用自定义域名；不含中国大陆的区域无需备案，包含中国大陆节点则需要备案。部署包准备完成不等于已经上线，请以控制台状态与实际访问结果为准。

官方入口：
- https://edgeone.cloud.tencent.com/pages/document/175191784523485184
- https://pages.edgeone.ai/document/direct-upload
- https://pages.edgeone.ai/document/edgeone-json

## 后续更新

直接上传项目的新版本，在“构建与部署”→“新建部署”上传新的 ZIP。默认会更新生产环境，发布前先核对预览。若今后选择 Git 自动部署，应另行建立 Git 项目并设置 Node.js 22.13+，构建命令为 cd prototype && npm ci && npm run build:demo，产物目录为 prototype/demo-dist；直接上传项目不能直接切换到 Git 集成。

仓库中的 vercel.json 用于兼容既有集成，上传 EdgeOne 时无需使用它。
