# 环境变量

Token、密钥与 Giscus 的精简模板见 [.env.example](.env.example)；启用 OIDC 时还须配齐下表登录与管理员配置。项目业务变量使用无框架前缀的名称，公开配置保留 `PUBLIC_`。`MUKUCHI_*` 构建工具参数和 `CLOUDFLARE_*` 部署参数沿用现有名称。

## 配置读取

开发服务和 Node 脚本读取 `apps/website/.env`；Node 生产服务由启动环境注入变量，不自动读取 `.env`。Workers 优先使用当前请求的环境绑定，缺失项才读取进程环境。显式空字符串不会回退为旧值。

映射仅覆盖列出的字段，不读取整个 `PUBLIC` 对象，因此不受 Windows 自带 `PUBLIC` 环境变量影响。公开配置进入 `runtimeConfig.public`；私有配置在服务端启动校验和请求处理时读取，不写入构建默认值。预渲染只读取公开配置。修改公开配置后应重新构建，以同步已生成的 HTML、payload 和 RSS。

开发 OIDC 全部未配置时仍可使用本机回环地址后台。启用开发 OIDC 必须完整填写该组变量，使用独立登记的开发客户端。不要把生产凭据复制到本地开发配置。

## 配置位置与名称

| 功能 | 本地 / Worker 名称 | GitHub Actions |
| --- | --- | --- |
| 公开站点 | `PUBLIC_SITE_URL`（可选） | 默认由代码提供 |
| giscus | `PUBLIC_GISCUS_CATEGORY_ID`、`PUBLIC_GISCUS_REPO`、`PUBLIC_GISCUS_REPO_ID` | 保留 `MUKUCHI_GISCUS_*` Variables，由工作流映射 |
| 登录 | `APP_ORIGIN`、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`、`OIDC_ISSUER`、`OIDC_POST_LOGOUT_REDIRECT_URI`、`OIDC_REDIRECT_URI`、`OIDC_SCOPES` | 无须配置 |
| 会话 / 管理员 | `AUTH_ADMIN_EMAILS`、`AUTH_SESSION_KEY`、`AUTH_SESSION_MAX_AGE` | 无须配置 |
| 文章发布 | `GITHUB_PUBLISH_TOKEN`、`GITHUB_REPOSITORY`、`GITHUB_BRANCH` | 无须配置；`GITHUB_REPOSITORY` 在 Actions 中是平台内置名称 |
| AI 凭据 | `AI_ENCRYPTION_KEY` | 同名 Secret，生产值须与 Worker 相同 |
| 音频同步 | `AUDIO_SYNC_TOKEN` | 同名 Secret，生产值须与 Worker 相同 |
| 统计 | `STATS_ADMIN_TOKEN`、`STATS_HASH_SECRET` | 无须配置 |
| 部署 | 无须写入 Worker | `CLOUDFLARE_API_TOKEN` Secret、`CLOUDFLARE_ACCOUNT_ID` Variable |
| 构建 / 验收 | `MUKUCHI_GITHUB_TOKEN`、`MUKUCHI_SMOKE_URL` | 前者由临时 GitHub token 提供，后者为 Variable |

Worker 当前私有项保持 Secrets 类型；评论配置保持普通 Variables。D1、R2 和 Workflow 绑定不是待清理的环境变量，不删除。

## 从旧名称迁移

对仍在使用的 `NUXT_*` 项，仅移除 `NUXT_`，原值逐字保留。密钥不能从 GitHub 或 Cloudflare 编辑页读回，须从原始记录重新填写；缺失时停止切换，不能用随机新值代替。特别是 `AI_ENCRYPTION_KEY`、`AUTH_SESSION_KEY` 改值会影响已加密数据。

本次采用一次发布窗口：完成构建和测试后添加新名称，填写并核对全部生产原值，再发布对应代码和工作流；验收成功后删除旧项。失败时保留旧变量并恢复之前的 Worker 版本及工作流。不要提前删除旧名称或把配置缺失的版本发布到生产。生成的部署配置设置 `keep_vars: true`，避免发布时自动移除面板中的旧明文变量；验收通过并确认清单后再显式删除（[Cloudflare 配置说明](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)）。

废弃清单：

- 本地 / Worker：`NUXT_GITHUB_CLIENT_ID`、`NUXT_GITHUB_CLIENT_SECRET`、`NUXT_GOOGLE_CLIENT_ID`、`NUXT_GOOGLE_CLIENT_SECRET`、`NUXT_AUTH_SECRET`、`NUXT_RESEND_API_KEY`、`NUXT_AUTH_EMAIL_FROM`。
- GitHub Variables：`MUKUCHI_ADMIN_ENABLED`、`MUKUCHI_AUDIO_ENABLED`、`MUKUCHI_STATS_ENABLED`、`NUXT_ASSISTANT_ENABLED`。
- 本地遗留功能开关：`NUXT_PUBLIC_STATS_ENABLED`、`NUXT_ASSISTANT_ENABLED`，以及已停用的 admin、auth、audio 环境开关。功能开关由后台管理。

不撤销身份提供方账户或 API token；本次只删除本项目中不再使用的配置项。

## 验证

运行 `vp run check`、`vp run -r test`，分别构建 Node 和 Cloudflare 版本并执行现有预渲染、统计、后台和音频产物检查。Node 构建运行 `vp run website#auth:smoke` 验证新名称、登录会话、配置缺失及权限边界。线上补验登录、评论、统计、AI 凭据解密和音频同步鉴权；不为验收额外提交付费音频任务。

Cloudflare 构建后运行 `vp run website#environment:smoke:worker`，使用本地临时绑定验证缺失配置、认证顺序、公开配置和音频同步鉴权，不访问生产资源。

平台面板不支持自定义注释或分组顺序；本模板和配置表是维护说明，平台保留其默认名称排序。

## 批量同步配置

只需在一份本地 JSON 中填写生产原值，脚本自动将 Giscus 映射到 GitHub 与 Worker，并将 AI / 音频共享密钥写入两处。默认只离线预览名称，不访问平台、不显示值。

在仓库根目录运行：

```powershell
vp run website#environment:sync --init
vp run website#environment:sync
vp run website#environment:sync --apply
```

- `--init` 创建 `.data/environment.production.json`，已有文件不会覆盖；默认位置已被 Git 忽略。模板只列 Token、密钥与 Giscus；不从本地开发 `.env` 复制值，也不自动生成密钥。
- 编辑模板后先运行预览。空字符串跳过，Giscus 三项须同时填写；AI / 音频共享值只填一次。此命令可分批添加，写入成功不代表全部发布配置已齐全。
- 执行前用 `gh auth login` 登录有仓库 Secrets / Variables 管理权限的账号，并在当前终端环境中提供 `CLOUDFLARE_API_TOKEN`（目标账户 Workers Scripts 编辑权限）。此 Token 仅用于调用 API，不写入 JSON，不自动修改 GitHub 中现有部署 Token。
- `--apply` 会写入 GitHub `setobox/mukuchi` 和 Cloudflare `mukuchi-blog`。Worker 设置更新会产生配置版本，沿用线上代码；运行时避免其他发布或面板编辑。检测到未发布版本或流量分流时会停止。
- 已存在的新名称 Secret 默认拒绝覆盖；确认仍是原值后，才使用 `--apply --replace-secrets`。旧名称和所有未修改绑定会继承保留；本脚本没有删除功能。
- 如需迁移登录地址等普通配置，可在同一 JSON 添加上表中的八项登录与管理员配置；按现有加密类型写入。也支持 `CLOUDFLARE_ACCOUNT_ID`、`MUKUCHI_SMOKE_URL`，只写 GitHub Variables。其他字段一律拒绝。
- 可用 `--file 文件.json` 指定另一文件；自行确保它不会提交到 Git。平台写入不是跨平台事务，失败会停止后续操作；查看已完成的名称，核对状态后重试，不自动删除或回退。
- 输出不包含密钥；GitHub 值通过标准输入传递，Cloudflare 使用 HTTPS 请求正文。平台不能读回原密钥，因此只能确认提交的是同一输入值，不能与平台原密钥做明文比较。Secret 原值仍需从安全记录获取。

实现依据：[GitHub CLI Secrets](https://cli.github.com/manual/gh_secret_set)、[GitHub CLI Variables](https://cli.github.com/manual/gh_variable_set)、[Cloudflare 设置接口与绑定继承](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/edit/)。
