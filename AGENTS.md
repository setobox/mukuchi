<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project uses Vite+ for runtime and package management, builds, tests, task execution, and Git hook dispatch. ESLint is the only linting and formatting tool; its rules are defined in `eslint.config.js`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

Use `vp run check` for ESLint and TypeScript checks, and `vp run lint:fix` for automatic fixes. Do not use `vp check`, `vp lint`, or `vp fmt`; those built-ins do not run ESLint. The pre-commit hook runs `vp staged`, whose configured command is ESLint. Keep `prepare` set to `vp config --no-agent` so dependency installation preserves these project instructions.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp run check` and `vp run -r test` to lint, type check, and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## 环境变量与密钥来源

### 改名与保密约定

- 项目环境变量不使用 `NUXT_` 前缀；公开配置保留 `PUBLIC_`，仍在使用的 `MUKUCHI_*`、`CLOUDFLARE_*` 保留原名。完整映射和发布步骤见 [ENVIRONMENT.md](apps/website/ENVIRONMENT.md)，本地配置说明见 [.env.example](apps/website/.env.example)。
- 环境变量改名必须逐字保留各环境原值，不轮换密钥；本地值不能视为生产值。缺少生产原值时，保留旧配置并暂停切换，先找回原始记录。
- 下表的域名、客户端 ID、回调和默认值是代码及[生产客户端登记文件](apps/website/config/oidc-client.production.json)中的参考信息，不代表已经读回或核实了平台当前保存的值。迁移时以原部署记录和实际客户端登记为准。
- 不把真实密钥、令牌、管理员邮箱或密钥截图写入本文件、提交、聊天、日志或公开接口。用户在平台直接填写密钥；密码管理器与安全备份由用户自行查找。
- Cloudflare 这 15 项原来均使用加密类型，因此改名后继续保存为 Secret；其中普通配置采用加密存储，并不意味着它们都需要生成密钥。

### 七项密钥与令牌

| 新名称 | 原值从哪里获取 | 用途与格式 |
| --- | --- | --- |
| `AI_ENCRYPTION_KEY` | 初次部署时生成并保存的生产加密密钥；查原密码管理器条目或安全部署备份。它不是 AI 供应商提供的 API Key。 | 32 个随机字节的 Base64 编码，解码后必须恰好 32 字节；解密已保存的 AI、助手及音频供应商凭据。Worker 与 GitHub 同名 Secret 必须使用同一生产原值。 |
| `AUTH_SESSION_KEY` | 初次启用登录时独立生成并保存的生产会话加密密钥；查原部署记录。 | 32 个随机字节的 Base64 编码，用于加密 ID token；不能拿 AI 密钥或 OIDC 客户端密钥代替。更换会影响已有加密 ID token 的解密及相关退出流程。 |
| `AUDIO_SYNC_TOKEN` | 初次配置音频同步时自行生成并保存的共享令牌；查原 Worker / GitHub 部署记录。 | 至少 32 字符；Worker 与 GitHub 同名 Secret 必须完全一致，用于同步鉴权。它不是语音供应商的 API Key。 |
| `STATS_HASH_SECRET` | 初次配置统计时自行生成并保存的生产哈希密钥；查原部署记录。 | 至少 32 字符；用于访客标识哈希。更换会改变访客标识，影响统计连续性。 |
| `STATS_ADMIN_TOKEN` | 初次配置统计查询时自行生成并保存的令牌；查原部署记录或私有监控配置。 | 统计查询的 Bearer 令牌；首次配置建议使用至少 32 字符的随机值（建议，不是当前代码的长度硬限制）。无令牌仍支持管理员会话；统计验收脚本需要此令牌。 |
| `OIDC_CLIENT_SECRET` | MU³ ID 账号中心创建生产客户端 `mukuchi` 时签发的原密钥，或当时保存的签发响应 / 安全部署记录。 | 博客向账号中心换取令牌时使用；不是 GitHub / Google OAuth 密钥。仓库中的客户端登记 JSON 不含此密钥；不能假定账号中心可再次显示原文。 |
| `GITHUB_PUBLISH_TOKEN` | 创建 GitHub fine-grained PAT 时保存的原令牌，或安全部署备份。GitHub 令牌管理页不能读回原令牌全文。 | 博客发布文章使用。首次配置或另行获准轮换时，在 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens 创建；资源所有者为 `setobox`，仅选择 `mukuchi` 仓库，Contents 读写、Actions 只读。 |

上述自行生成的密钥只在首次安装或明确授权的轮换流程中使用密码学安全随机数创建，彼此独立。当前改名任务不生成替代值；丢失原值时必须另行安排恢复或轮换及关联数据迁移。

### 八项普通配置

| 新名称 | 如何确认原值 | 项目参考值 / 约束 |
| --- | --- | --- |
| `APP_ORIGIN` | 原部署记录中的博客可信源地址。 | 生产参考 `https://blog.seto.box`。 |
| `AUTH_ADMIN_EMAILS` | 原管理员名单，并对照 MU³ ID 管理员账号的已验证主邮箱；不擅自增加或替换管理员。 | 多个邮箱用逗号分隔；不在仓库记录真实名单。 |
| `AUTH_SESSION_MAX_AGE` | 原部署记录中的会话有效期；不是需要申请的凭据。 | 默认 `28800` 秒（8 小时），允许 300–604800 的整数；默认值不能代替未知的现有值。 |
| `OIDC_CLIENT_ID` | MU³ ID 生产客户端登记信息。 | 登记文件参考 `mukuchi`；开发客户端 `mukuchi-dev` 不能混用。 |
| `OIDC_ISSUER` | MU³ ID 的 OIDC Discovery 返回的 issuer，及原部署记录。 | 项目参考 `https://id.seto.box/api/auth`，须与 Discovery issuer 一致。 |
| `OIDC_REDIRECT_URI` | MU³ ID 生产客户端登记的登录回调。 | 登记文件参考 `https://blog.seto.box/api/auth/sso/callback`，精确匹配。 |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | MU³ ID 生产客户端登记的退出回调。 | 登记文件参考 `https://blog.seto.box`，保留实际登记字符串，包括尾斜杠差异。 |
| `OIDC_SCOPES` | 原部署记录及客户端权限登记。 | 当前项目固定使用 `openid profile email`，平台输入框直接填空格分隔的文本，不加引号。 |

### 配置位置与原值丢失时的处理

- Cloudflare：Workers & Pages → `mukuchi-blog` → Settings → Variables and Secrets。上面 15 项使用 Secret；三个 `PUBLIC_GISCUS_*` 评论配置继续使用明文变量。
- GitHub：[仓库 Actions Secrets](https://github.com/setobox/mukuchi/settings/secrets/actions) 新增 `AI_ENCRYPTION_KEY`、`AUDIO_SYNC_TOKEN`；由用户确认与 Worker 对应的生产原值一致。现有 `CLOUDFLARE_API_TOKEN` 保留，不需要重新获取。
- 本地：使用 `apps/website/.env`；仅填写本地所需配置。未配置开发 OIDC 凭据时保留本机开发入口，不把生产客户端凭据复制给开发环境。
- 平台保存的 Secret 不是原值备份下载入口。Cloudflare 明确说明保存后无法通过 Dashboard 或 Wrangler 查看值，Worker 运行时仍能读取绑定；不要为了找回密钥临时增加返回密钥的接口或日志。
- 找不到原值时，先保留全部旧名称。用户自行检查密码管理器、安全部署备份及客户端原签发记录；本地文件只能作为本地记录，不能据此判定与生产相同。仍无法恢复时，列明受影响数据和服务，另行获得轮换授权后处理。
- 新配置齐全后再发布对应代码并验收。验收通过后集中列出精确删除清单，在真正删除平台配置前向用户确认；失败则保留旧项并回退。

官方说明：[Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[GitHub PAT 管理](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)、[GitHub Actions Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)。
