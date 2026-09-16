# mukuchi

自用博客引擎。使用 Cloudflare Workers、D1 与 GitHub Actions 发布，支持文章后台、站主登录、评论、统计、RSS 和可配置的 AI 摘要。支持 Markdown 内容、文章列表与卡片、标签与专栏筛选、多级目录、深浅主题、文章配色、自动提醒、图片缩放预览、代码组、构建快照式 GitHub 仓库卡片、全文搜索及快捷命令。

## 开发

在仓库根目录执行：

```bash
vp install
vp run dev
```

默认地址为 <http://localhost:3000/posts>。启动前先确认是否已有该项目的服务。已有服务时直接复用。

## 验证

```bash
vp run check
vp run -r test
vp run -r build
```

也可以通过统一入口自动修复 ESLint 问题，并运行测试、类型检查和构建：

```bash
vp run ready
```

代码检查和格式修复统一使用根目录 `eslint.config.js` 中的规则：`vp run lint` 检查，`vp run lint:fix` 自动修复。`vp run typecheck` 分别运行网站的 Nuxt 类型检查和 utils 包的 TypeScript 类型检查；`vp run check` 包含 ESLint 和类型检查。

提交前通过 `.vite-hooks/pre-commit` 执行 `vp staged`，仅对暂存文件运行 ESLint 自动修复。VS Code 保存时也使用 ESLint，工作区已关闭 Oxc 检查和格式化。安装依赖时通过 `vp config --no-agent` 安装钩子并保留项目协作指令。使用 `vp run check`，不要使用 Vite+ 内置的 `vp check`、`vp lint` 或 `vp fmt`。

## 项目约定

- `apps/website` 是 Nuxt 应用；文章放在仓库根目录 `content/posts`，关于页正文位于 `content/about.md`。
- 站主资料、导航和功能开关位于应用的 `app/app.config.ts`。
- 基础变量在 `app/assets/css/main.css`，UnoCSS shortcuts 在 `uno.config.ts`。
- Header 主题按钮按跟随系统、浅色、深色循环；偏好保存到 `mukuchi:theme` Cookie。默认跟随系统，未知时回退深色。
- 文章 `theme` 使用给定的 16 色，影响整个详情页的强调色；离开文章后恢复站点紫色。浅色文字会自动适配对比度。
- 施工与过期提醒由 `site.article.notices` 配置；过期默认 365 天，`staleAfterDays: null` 可关闭。正文图片支持缩放预览，代码块支持文件名、行强调和复制，`::code-group` 支持标签切换。
- Header 搜索按钮或 Ctrl/Cmd+P 打开文章全文搜索；输入 `>` 或点击输入框左侧图标，通过下拉菜单切换命令，支持导航、主题和回到顶部。首次搜索加载索引，刷新页面更新缓存；关于页不参与搜索。
- 工具功能尚未开放。通用提醒框、图片画廊和管理面板按后续步骤接入；部署与维护见 [部署说明](DEPLOYMENT.md)。
- PC 从 1200px 起使用双栏和展开的侧栏目录；900px 至小于 1200px 为平板，与移动端共用页头下方的吸附式折叠目录。默认收起时保留紧凑标题栏和 3 行目录，不足 3 行时按实际数量显示；随正文首个高亮章节自动居中滚动，支持手动浏览，展开后停止自动跟随。减少动态效果模式使用即时定位。
- 本地 `ContentToc` 移植自 Nuxt UI 4.6.0，使用 UnoCSS 和 Reka UI，文章页启用 `highlight highlight-variant="circuit"`。同时高亮视口内的标题，章节之间保留上一组高亮；配色跟随文章主题。支持 `links`、`title`、`highlight`、`highlightVariant`（`straight` / `circuit`）、`open`、`defaultOpen`、`collapsedRows`（默认 `0`，文章小屏目录设为 `3`）、`v-model:open`、`move(id)` 及内容插槽。移植代码许可见 [第三方声明](THIRD_PARTY_NOTICES.md)。
- 文章按置顶权重、发布日期倒序排列，相同时按路径升序；列表/卡片偏好保存到 Cookie。专栏使用 `/categories/名称`，标签使用 `/tags/名称`，两者独立筛选；旧 `?category=`、`?tag=` 参数不再参与筛选。
- 专栏和标签名称保留原文及大小写，链接按路径段编码；支持中文、空格、`C++`、`C#` 和 `%`。名称不能包含路径分隔符、控制字符、无效 Unicode，或仅为 `.`、`..`。未知名称返回 404，查询失败返回 500。
- 本地内容索引使用 SQLite 的 Node 原生连接器。无效 frontmatter 会阻止启动与构建；开发中的解析错误会明确指出文件和字段。
- `vitest.config.ts` 仅供 Vite+ 测试；Nuxt 的应用配置统一放在 `nuxt.config.ts`。
- Vite+ 保持 0.2.8；pnpm 固定为 12.3.4。
- TypeScript 使用项目当前的 6.0.3 catalog，兼容 vue-tsc。

文章写法见 [第 2 步：文章](docs/steps/02-articles.md)，主题接口与验收见 [第 3 步：主题](docs/steps/03-theme.md)，正文交互见 [第 4 步：MDC](docs/steps/04-mdc.md)，搜索与命令见 [第 5 步：搜索](docs/steps/05-search.md)，总体路线见 [实施路线](docs/roadmap.md)。教程文章统一归入“文章示例”专栏，可编辑或删除；示例内容不代表站主个人经历。每步完成后停止，由用户指定下一步。

## 示例文章

- [Markdown 教程](content/posts/1.markdown/01.markdown.md)：基础语法、GFM 写法与实际排版示例。
- [MDC 教程](content/posts/1.markdown/02.mdc-tutorial.md)：属性、插槽、数据绑定、代码组、图片预览、自动提醒与 GitHub 卡片的写法和实际效果。
- [Markdown 扩展功能](content/posts/1.markdown/03.markdown-extended.md)：GitHub 仓库卡片的实际效果，以及多风格提醒框、图片画廊与作品集的后续计划。
- [文章 Meta 示例](content/posts/1.markdown/_getting-started.md)：全部 10 个字段、完整模板、默认值、校验规则与 SEO 映射。

## GitHub 仓库卡片

```md
::github{repo="nuxt/content"}
::
```

仅支持静态的公开仓库标识，必须闭合且不能包含插槽。每次 Nuxt 生产构建生成仓库快照，阅读时不请求 GitHub API；未知字段显示 `-`，实际零值为 `0`。开发启动时获取，新增引用补取，重启开发服务刷新已知仓库。代码围栏中的示例不参与获取。

可选构建环境变量 `MUKUCHI_GITHUB_TOKEN` 用于提高 GitHub API 配额；不要写入 Markdown、公开配置或客户端代码。令牌仅在构建进程中使用，私有仓库不会进入快照。请求超过 8 秒、限流或无效响应时记录仓库级警告并保留基础卡片。`prepare`、类型检查和单元测试不访问 GitHub。

详细设计与验收见 [GitHub 卡片补充](docs/steps/04-github-card.md)。

## RSS 订阅

订阅路径为 `/rss.xml`，发布后正式地址为 `https://blog.setobox.me/rss.xml`。页头提供“RSS 订阅”图标，页面包含阅读器自动发现链接；本地点击图标打开本地订阅源。

- RSS 2.0 输出全部发布文章的标题、纯文本摘要、原文链接、作者及发布日期，关于页不参与。文章按发布日期倒序、同日路径升序排列，置顶不影响顺序；`wip` 和未来日期沿用站点现有收录规则。
- 日期以北京时间零点、`+0800` 时区输出，原始 XML 保留文章中的年月日。修改文章保留永久链接标识和原发布日期；频道更新时间取最新 `update` 或 `publish`。文章路径作为永久标识，应保持稳定。
- 每次生产构建生成静态 XML，与文章 HTML 使用同一内容索引。正式发布仍须来自干净的发布工作区，只包含 Git 跟踪的文章；本地被忽略的示例可以在开发订阅源中出现。
- XML 响应使用 `text/xml; charset=utf-8`，类型与缓存策略由 Nitro 路由配置统一生成；自动发现链接保留 `application/rss+xml`。订阅内容随重新构建更新，阅读器的刷新时间由阅读器自身控制。
- 浏览器标签图标统一使用 `apps/website/public/favicon.ico`，普通页面和直接打开的 XML 均可使用。当前图标取自站点头像，需要更换时直接替换此静态文件。
- `vp run website#check:prerender` 校验静态 RSS 与内容索引，`vp run website#smoke` 检查 HTTP 响应头、内容及自动发现链接。新增的 XML 解析依赖仅用于测试和验收。

本步接口与验收见 [第 7 步：RSS](docs/steps/07-rss.md)。

## 网站统计

侧栏显示完整内容索引中的文章、去重标签和专栏数量，不受当前筛选影响。启用访问统计后，PC 侧栏增加累计浏览量与访客数，文章详情显示本篇浏览量；移动端和平板沿用现有布局。

- 每次成功打开页面计一次 PV，包括刷新和离开后返回；锚点、查询参数变化、重复上报、构建和预加载不计数。
- `mukuchi:visitor` Cookie 使用一年有效期的随机标识。UV 按匿名浏览器去重，清除 Cookie 或更换浏览器会成为新访客；Cookie 不可用时仅计 PV。服务器保存 HMAC 摘要，不保存原始 IP、User-Agent 或来源地址。
- 日期按北京时间划分。数据从启用后累计，不补造历史访问；区间 UV 跨日期去重，不累加每日 UV。数字加载失败显示 `—`，真实零值显示 `0`。
- 访问数据使用独立 SQLite／D1，文章预渲染只输出访问数字占位。统计故障不阻塞文章阅读，统计数据不会随内容重建清空。

复制 `apps/website/.env.example` 中的统计配置到被忽略的 `.env`，设置 `NUXT_PUBLIC_STATS_ENABLED=true`、至少 32 字符的随机 `NUXT_STATS_HASH_SECRET`，以及随机 `NUXT_STATS_ADMIN_TOKEN`。保持摘要密钥稳定，更换会改变访客身份。默认关闭访问统计；内容数量始终可用。

```sh
vp run website#stats:migrate
vp run dev
```

SQLite 默认位于 `apps/website/.data/stats.sqlite`，可通过 `NUXT_STATS_DATABASE_PATH` 指定绝对路径。Workers 本地验收先执行 `vp run website#stats:migrate:local`，再按部署说明构建、启动预览。`vp run website#stats:smoke` 仅允许本地地址，会写入测试访问；默认目标为 `http://127.0.0.1:8787`，通过 `MUKUCHI_SMOKE_URL` 更改。

公开接口为 `POST /api/stats/pageview`、`GET /api/stats/summary` 和 `GET /api/stats/page?path=…`；`GET /api/admin/stats` 使用服务端 Bearer Token，支持日期范围、每日趋势及分页排行。接口说明与验收记录见 [第 8 步：统计](docs/steps/08-statistics.md)。第 9 步管理界面支持站主会话，同时保留 Bearer Token 调用。

## 文章后台

访问 `/admin` 管理文章、数据库草稿、私有图片、统计与发布记录。首次本地使用执行 `vp run website#admin:migrate`。Tiptap 锁定为 3.31.3，支持富文本、完整源码、站点样式预览；MDC 和扩展代码属性使用原始源码节点保留，未修改时切换模式不会重写源码。

保存草稿不公开文章；本地“发布到本地”写文件，线上“发布到网站”提交文章和引用图片到 `main` 并等待现有部署流程。编辑已发布文章先创建独立草稿，路径固定；并发保存、外部文件修改均返回冲突并保留当前内容。`wip` 是公开文章的施工标记，不是私密草稿。

生产登录与发布配置见 [第 9 步部署说明](DEPLOYMENT.md#第-9-步后台登录和评论)。OAuth、发布 PAT、giscus 的创建步骤均在该文档中。封面制作器不在本步实现，后续可复用当前独立图片上传模块。

## AI 摘要

站主在 `/admin/ai` 配置 Chat Completions 兼容服务的 HTTPS API 基址、模型、密钥和提示词；地址填至 `/v1` 等 API 基址，服务会追加 `/chat/completions`。不预设供应商，默认关闭。设置保存只影响后台生成及下一次网站构建，不会触发部署。生产配置与密钥步骤见 [部署说明](DEPLOYMENT.md#第-10-步ai-摘要)。

- 默认生成约 80–140 字的中文纯文本，文章列表、搜索简介、SEO、RSS 及详情卡片共用同一内容。详情卡片在封面之后、正文之前，标题下不重复简介。
- `description` 始终必填，缺失或过期摘要、生成失败及配置不可用时均使用原简介。`aiSummary: false` 关闭单篇生成与卡片；默认开启单篇开关。
- 编辑器支持提前生成、重新生成及手动保存摘要。结果以 `summary: { text, inputHash, configHash }` 随草稿保存，发布时提交 Git。保存普通草稿不会调用 AI。
- 标题或正文、API 地址、模型、提示词及算法版本变化会使摘要过期；日期、标签、配色、原简介及密钥轮换不影响有效性。手动摘要遵守同一规则。
- 构建优先复用有效文章元数据，其次复用持久缓存，再生成缺少的摘要。自动结果只写后台缓存，不由 CI 修改 Markdown；后台下次保存文章时可将缓存结果纳入元数据。私有草稿不写共享缓存。
- 默认并发 2、单次超时 30 秒，临时错误最多重试一次，总预算 180 秒。输入超过 32,000 字符时明确回退，可手动填写；正文仅作为文本，不执行 MDC 或访问其中的链接。
- `vp run website#ai:prepare` 准备固定快照；两次构建设置 `MUKUCHI_AI_SNAPSHOT_FROZEN=true` 复用同一快照。开发服务、检查、测试和 PR 不自动调用 AI。构建命令在本地启用服务时可自动补齐摘要。

`vp run website#ai:smoke` 对已启动的本地服务验收权限、加密、版本冲突、摘要预览和回退，临时使用私有草稿并恢复本地设置，不请求 AI 或发布文章。AI 翻译和 DeepL 翻译已移出实施路线。

## 版权与许可

- 本项目的程序代码及配套开发文档采用 [MIT License](LICENSE)。
- `content/posts/` 中的原创文章采用 [CC BY-NC-SA 4.0](LICENSE-CONTENT)，即署名、非商业性使用、相同方式共享。转载或改编时须注明作者、原文链接和许可协议，并标明修改；改编内容以相同协议发布。完整条款见 [Creative Commons 官方法律文本](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.zh-hans)。
- 第三方代码、引用内容及素材遵循各自的许可或授权说明。

文章详情页在正文后自动显示版权卡片，包含文章标题、永久链接、站主资料中的作者名、发布日期及许可协议。链接使用当前站点域名和文章路径，保留部署子路径，不包含查询参数或锚点。
