# mukuchi

mukuchi（無口）取自萌属性「三无」——无心、无口、无表情中的「无口」。

## 功能与技术栈

| 功能 | 技术栈 |
| --- | --- |
| 页面与样式 | Nuxt、Vue、TypeScript、UnoCSS、Reka UI |
| 文章内容 | Nuxt Content、Markdown、MDC |
| 文章编辑 | Tiptap |
| AI 摘要 | Chat Completions 兼容 API，模型可配置 |
| AI 朗读 | 豆包语音合成大模型 2.0 |
| 双人播客 | 豆包语音播客 API（websocket-v3） |
| 数据存储 | SQLite、Cloudflare D1、Cloudflare R2 |
| 账号登录 | GitHub / Google OAuth、邮箱统一账号、Resend 邮箱验证 |
| 部署与发布 | Cloudflare Workers、GitHub Actions |

账号配置、管理员邮箱白名单和迁移方法见 [账号系统说明](apps/website/AUTH.md)。

## 功能设置与升级

账号和管理后台固定可用，仍需登录并通过管理员权限和 CSRF 校验。访问统计在后台“访问统计”页控制，默认开启，关闭仅停止采集，历史报表仍可查询。摘要、朗读、播客和对话助手在“AI 设置”中分别管理。旧部署启用变量不再生效，数据库、存储桶、音频 Workflow 和定时任务绑定固定保留；资源与部署凭据检查仍会执行。

助手只按提问次数和并发限制执行，能力测试、失败请求也计一次，工具调用及历史续传不重复计次。旧预算字段不再参与执行，原有效能力验证继续兼容。

助手任务记录保留 30 天，不保存聊天正文，管理员接口支持类型、状态筛选和分页。执行中断由查询和现有定时任务收敛，旧任务不补造阶段记录。

升级时运行 `vp run website#admin:migrate` 应用新增 `0008_runtime_settings_tasks.sql`；Cloudflare 发布前置流程会应用远程迁移。后台开关保存后生效，摘要内容仍在下次构建更新。验证命令为 `vp run check`、`vp run -r test`、`vp run -r build` 和 `vp run website#build:cloudflare`，并分别运行现有预渲染、后台、统计及音频产物检查。

## 版权

Copyright © 2026–present Setobox.

- 程序代码及开发文档采用 [MIT License](LICENSE)。
- `content/posts/` 中的原创文章采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)，署名、非商业性使用、相同方式共享。
- 第三方代码、引用内容及素材遵循各自的许可或授权说明。
