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

## 必要的 Token、密钥与 Giscus

- 环境变量示例只列 Token、密钥和 Giscus；不添加目录、数据库路径等可选参数。完整登录配置见 [ENVIRONMENT.md](apps/website/ENVIRONMENT.md)。
- 改名只移除 NUXT_，保留原值；公开变量保留 PUBLIC_。本地与生产分开，真实密钥不写入文档、提交或聊天。

| 配置 | 获取方式 |
| --- | --- |
| PUBLIC_GISCUS_REPO / PUBLIC_GISCUS_REPO_ID / PUBLIC_GISCUS_CATEGORY_ID | 在 [Giscus 配置页](https://giscus.app/zh-CN) 选择原评论仓库和分类，分别取生成代码的 data-repo、data-repo-id、data-category-id；这三项可公开。 |
| GITHUB_PUBLISH_TOKEN | 使用原 GitHub fine-grained PAT；管理入口为 Settings → Developer settings → Personal access tokens → Fine-grained tokens。目标仓库 setobox/mukuchi，Contents 读写、Actions 只读。 |
| MUKUCHI_GITHUB_TOKEN | 本地 GitHub 卡片构建用 Token，从原安全记录获取；CI 使用自动提供的临时 GitHub Token。 |
| OIDC_CLIENT_SECRET | MU³ ID 账号中心签发生产客户端 mukuchi 时保存的密钥；启用登录还需完整客户端配置。 |
| AI_ENCRYPTION_KEY / AUTH_SESSION_KEY | 初次部署时分别生成并保存的密钥，均为 32 字节随机数的 Base64 编码；前者加密模型凭据，后者加密 ID token。 |
| AUDIO_SYNC_TOKEN / STATS_HASH_SECRET | 初次部署时分别生成并保存的随机值，至少 32 字符；分别用于音频同步鉴权和统计访客哈希。 |
| STATS_ADMIN_TOKEN | 原统计查询 Bearer Token，从部署记录或私有监控配置获取。 |
| CLOUDFLARE_API_TOKEN | 保留 GitHub Actions 中现有部署 Token，无须重新获取。 |

- Worker 的 Token / 密钥使用 Secrets，Giscus 使用明文 Variables；GitHub 的 AI_ENCRYPTION_KEY、AUDIO_SYNC_TOKEN 必须分别与 Worker 相同。
- 本次只改名，不重新生成密钥。原值从密码管理器或安全部署备份找回；找不到时保留旧项并暂停切换。AI_ENCRYPTION_KEY 改值会导致已有模型凭据无法解密。
- 新配置齐全并完成发布验收后，再列出准确清单，确认后删除平台旧项。
