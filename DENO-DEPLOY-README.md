# Deno Deploy 免费备用方案

这套方案是给你多准备一个免费公网入口，作为 Cloudflare 之外的备用版本。

## 新增文件

- Deno 入口：`deno/server.ts`
- Deno 配置：`deno.json`

## 这套方案能做什么

- 直接托管当前 `public` 里的页面文件
- 提供解析接口：`POST /api/v2/remove-watermark`
- 提供视频代理和下载：`GET /api/v2/media/...`
- 提供健康检查：`GET /api/v2/health`

## 部署到 Deno Deploy

1. 打开 Deno Deploy 控制台
2. 选择 `New Project`
3. 选择 GitHub 仓库：`maosan1984/qushuiyin`
4. 分支建议选：`codex/cloudflare-launch`
5. Entrypoint 填：
   - `deno/server.ts`
6. 环境变量里添加：
   - `API_KEY=你的真实 key`
   - `API_URL=https://api.wxshares.com/api/qsy/plus`
7. 点部署

部署成功后，它会给你一个新的 `deno.dev` 或项目域名地址。

## 本地预览

如果你电脑里装了 Deno，可以在项目目录运行：

- `deno task dev`

## 推荐用法

- Cloudflare 当主入口
- Deno Deploy 当备用入口
- 哪个在手机端更稳，就先给用户用哪个
