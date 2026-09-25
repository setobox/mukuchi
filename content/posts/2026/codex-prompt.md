---
title: Codex 的 GPT-6 Sol 提示词泄露了？
description: ''
publish: "2026-09-25"
cover: '/images/2026/codex-prompt/codex-prompt.png'
tags: [AI, Codex, 提示词, Agent]
categories: [AI]
---

随着 GPT-6 Sol 的发布，网传其提示词发生了泄露，但官方没有背书，可以从这里看到：[elder-plinius/CL4R1T4S](https://github.com/elder-plinius/CL4R1T4S/blob/main/OPENAI/Codex_Desktop/GPT-6-Sol_Prompts.txt)，这边呢就挑几个感兴趣的部分先聊一下，学习一下。

> 完整译文单独放在[《Codex GPT-6 Sol 提示词完整中文译文》](/posts/2026/codex-prompt-translation)，包含全部 54 个模板。

## 摘要

| 方面    | 核心内容                            |
| ----- | ------------------------------- |
| 沟通    | 平等合作、清楚表达，说明结果、依据和限制。           |
| 执行    | 主动推进已授权任务，保留目标，减少重复确认。          |
| 权限    | 区分授权、风险和审批，不绕过安全拒绝。             |
| 长期任务  | 保存进度、跨上下文续作，管理监控、预算和停止条件。       |
| 工具与界面 | 规定技能、插件、多代理、桌面与语音等协作方式。         |
| 质量与证据 | 用实际状态验证完成度；审查关注可证实问题；交代记忆和网络来源。 |

## 像同事一样交流，降低理解负担

> When discussing technical concepts, converse like how you would to a colleague or collaborator in conversation. You strive to minimize cognitive load for the user: write so the user understands your response on first read.
> 
> 讨论技术概念时，像与同事或协作者交谈一样交流。尽量降低用户的认知负担，让对方读一遍就能理解。
>
> Prefer familiar words and concrete descriptions over abstract or technical language when they convey the same meaning. Don’t assume that the reader will decode or fill in missing steps before they can understand the idea.
>
> 能表达同样意思时，优先使用熟悉的词语和具体描述，少用抽象或技术性语言。不要假定读者会自行解读或补齐缺失步骤后才理解你的意思。
>
> Give each paragraph one main point and arrange the ideas in an order the reader can easily follow. When reporting changes, explain what changed, why, how it was tested, and any material risks or limitations. Include the evidence needed to understand the conclusion and its practical limits.
>
> 每段只讲一个主要观点，按读者容易理解的顺序组织内容。报告修改时，说明改了什么、为什么改、如何测试，以及重要风险或限制。提供足以帮助读者理解结论及其适用边界的证据。

这段很有意思，这段提示词可以让 AI 输出结果时用更直白更不绕弯子更容易理解的话，举例来说就是这样：

从第一种说法：

> 已优化异常处理，增强了系统的健壮性。

到第二种说法：

> 之前返回空列表时，页面会报错。现在会显示“暂无结果”。我检查了空列表和正常列表两种输入；尚未验证手机端布局。

第二种说法更长，但用户不需要继续猜测：出了什么问题、改动解决了什么、验证到了哪里。

“像同事”，让对话营造出技术讨论的氛围，直接讨论问题，允许有依据的不同意见，不奉承，也不把对方当成需要训导的人。“优先使用熟悉的词语和具体描述，少用抽象或技术性语言”，用户阅读时负担更轻，更容易吸收。最后一句，更是让用户能够清晰的掌握现状。


## 官方版降“AI”

> Avoid using AI slop words or phrases like "Bottom Line:"/"Significance:"/"Perspective:" in conclusions, "delve," "foster," "leverage," "it's worth noting," "importantly," "Question? Answer.", "This isn't about X. It's about Y.", "genuinely". Avoid hyphenated compound descriptions and adjectives.
> 避免 AI 套话，例如在结论中使用“Bottom Line:（结论：）”“Significance:（意义：）”“Perspective:（视角：）”，以及“delve（深入探讨）”“foster（促进）”“leverage（利用）”“it's worth noting（值得注意的是）”“importantly（重要的是）”“Question? Answer.（自问自答式表达）”“This isn't about X. It's about Y.（这不是关于 X，而是关于 Y。）”“genuinely（真正地）”。避免用连字符拼成复合描述和形容词。

看到眼熟的了 AI 味了，总之提示词规则最好明确禁止输出一些 AI 常见的套话。

## 高质量和低质量示例

可以看到提示词中明确给出了一些示例，这对质量把控很有帮助，在 Vibe Coding 时若想得到高质量的输出最好整理些标准示例在文档中，不管好坏。拿 AI 生图举例，想让 AI 画好手之类的细节不是光靠正面提示词，要添加大量负面提示词去约束。