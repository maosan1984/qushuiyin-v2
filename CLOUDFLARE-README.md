# Cloudflare 免费上线说明

这套文件是在你现在的本地 v2 基础上，额外增加了一套免费上线方案。

本地版继续能用，云端版是新增的，不会覆盖你现在的启动方式。

## 我已经帮你加好的文件

- Cloudflare Worker 主文件：`cloudflare/worker.js`
- Cloudflare 配置：`wrangler.toml`
- 本地预览用环境变量模板：`.dev.vars.example`

## 这套云端版能做什么

- 直接托管 `public/v2.html`
- 提供 `public/v2.js` 和 `public/v2-url.js`
- 提供解析接口：`POST /api/v2/remove-watermark`
- 提供视频代理和下载：`GET /api/v2/media/...`

## 你以后真正上线时要做的事

1. 先注册并登录 Cloudflare
2. 在项目目录打开命令行
3. 执行登录
   - `npx wrangler login`
4. 把你的 API_KEY 存进 Cloudflare
   - `npm run cf:secret`
5. 正式部署
   - `npm run cf:deploy`

部署成功后，Cloudflare 会给你一个免费的 `*.workers.dev` 网站地址。

## 如果你想先本地预览“云端版”

1. 复制一份 `.dev.vars.example`
2. 改名为 `.dev.vars`
3. 把里面的 `API_KEY` 换成你自己的
4. 运行：
   - `npm run cf:dev`

这样你就能先在本地看 Cloudflare 版本。

## 注意

- `API_KEY` 不要写进代码里，只放在 Cloudflare secret 里
- 你现在的本地启动脚本不用删
- 等 `workers.dev` 跑稳定后，再考虑绑你自己的域名
