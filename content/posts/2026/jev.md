---
title: JEV 是好模型吗？
description: 无幻觉、百倍提升，实际上呢？
cover: /images/2026/jev/jev.webp
publish: "2026-09-21"
tags: [AI, JEV, LLM]
categories: [AI]
update: "2026-09-23"
---

2026 年 9 月 15 日，TypeSafe AI 发布了 Jev，称它是首个面向软件自动化的 System One 模型。

[发布公告：introducing-system-one-models-and-jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

创始人在[发布帖](https://x.com/CompleteSkeptic/status/2099925682726002904)里写道：

> 20-200x faster  
> 40-400x cheaper (w/ output tokens free)  
> Frontier composable intelligence optimized for decisions

快 20～200 倍，便宜 40～400 倍，输出免费。再加上[官网](https://typesafe.ai/)的「Zero Hallucinations」，看着确实挺唬人。

无幻觉、百倍提升，Really？

![JEV 发布帖中的速度与价格宣传](/images/2026/jev/jev-1.png){width="981" height="1091" caption="来源：Diogo Almeida 的 JEV 发布帖。"}

## 先说我的看法

JEV 不能拿来当普通大模型用。它不写文章、不生成代码，也没打算陪你聊天，而是专门做判断：给它一份材料，让它在规定好的答案里选。

所以我不觉得它颠覆了大模型。但把判断单独拿出来做，确实是个好思路。

平时让大模型包办一件事，计算、判断、解释经常混在一起。算错一个数、漏掉一个条件，后面的结论就跟着错。能准确计算的部分本来就该交给代码，剩下那些需要理解语义的判断，再交给模型。JEV 做的就是后面这一块，它自己也[不擅长算术和日期比较](https://docs.typesafe.ai/model-jaggedness/jev-1.13)。

不过刚出来就被 [Laya 的作者](https://dev.to/nandakishor_m_6cc0adfde9f/i-built-non-autoregressive-decision-models-a-year-ago-then-a-frontier-lab-called-it-a-18me)质疑原创性了：作者认为自己更早就做过同类的非自回归决策模型，TypeSafe 却把它包装成了新突破。是否构成抄袭还没有定论，[Laya 的权重和实现](https://huggingface.co/convaiinnovations/laya)倒是可以直接拿来看。

## 怎么用：拿需求排期举个例子

JEV 的用法很直接：开发者预先定义问题、候选答案和判断标准，把待处理的材料放进 `state`，它返回判断结果和概率。

比如手上来了几个需求，要先分一下优先级。这里暂且按下面这套规则，具体项目当然可以自己改：

| 优先级 | 条件 | 怎么处理 |
| --- | --- | --- |
| P0 | 重要且紧急 | 立即处理 |
| P1 | 重要但不紧急 | 优先安排 |
| P2 | 不重要但紧急 | 尽快协调 |
| P3 | 不重要且不紧急 | 放入待办 |

「重要」也得说清楚。在这个例子里，影响支付、登录等核心流程算重要；「紧急」指问题正在造成损失，或者必须在 24 小时内处理。否则只给模型一个 P0，它也不知道你们团队的 P0 是什么意思。

JEV 提供三种问法：

| 类型 | 这个例子里怎么用 | 返回什么 |
| --- | --- | --- |
| [Choice](https://docs.typesafe.ai/primitives/choice) | 从 P0、P1、P2、P3 中选一个 | 选项、各选项的概率、confidence |
| [Score](https://docs.typesafe.ai/primitives/score) | 按影响程度给需求打分 | 分数、各等级的概率、confidence |
| [Noul](https://docs.typesafe.ai/primitives/noul) | 这个需求是否紧急？ | 「是」的概率，范围 0～1 |

Score 要先定义等级。下面定义了三个等级，因此分数在 0～2 之间，可以是小数；它表示各等级按概率加权后的结果。Noul 则是概率形式的是非题，`0.9` 表示模型给「是」分配了 90% 的概率，并非直接返回 `true`。

按照[官方 API](https://docs.typesafe.ai/api)，这三个问题可以放进同一次请求。代码组里是同一份请求的 JSON 和 curl 写法。curl 可在 Bash、WSL 或 Git Bash 中运行，先把第一行换成自己的 **TypeSafe API Key**。

::code-group

```json [请求 JSON]
{
  "model": "jev-1.13.0",
  "state": "线上支付成功后订单仍显示未付款，约三成订单受影响，用户正在重复付款。需要今天修复。",
  "questions": {
    "priority": {
      "type": "choice",
      "instructions": "判断需求优先级。影响核心业务流程或造成资金损失算重要；正在造成损失或必须在24小时内处理算紧急。",
      "criteria": {
        "p0": "重要且紧急",
        "p1": "重要但不紧急",
        "p2": "不重要但紧急",
        "p3": "不重要且不紧急"
      }
    },
    "impact": {
      "type": "score",
      "instructions": "判断这个需求对业务的影响程度。",
      "criteria": [
        "只影响外观或使用习惯，不影响功能",
        "部分功能受影响，但用户有可行的替代办法",
        "核心业务无法正常完成，或已经造成资金损失"
      ]
    },
    "is_urgent": {
      "type": "noul",
      "instructions": "问题是否正在造成损失，或有明确要求必须在24小时内处理？"
    }
  }
}
```

```bash [curl（Bash）]
export TYPESAFE_API_KEY='替换为你的 TypeSafe API Key'

curl --fail-with-body --silent --show-error \
  'https://api.typesafe.ai/v1/systemone' \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "model": "jev-1.13.0",
  "state": "线上支付成功后订单仍显示未付款，约三成订单受影响，用户正在重复付款。需要今天修复。",
  "questions": {
    "priority": {
      "type": "choice",
      "instructions": "判断需求优先级。影响核心业务流程或造成资金损失算重要；正在造成损失或必须在24小时内处理算紧急。",
      "criteria": {
        "p0": "重要且紧急",
        "p1": "重要但不紧急",
        "p2": "不重要但紧急",
        "p3": "不重要且不紧急"
      }
    },
    "impact": {
      "type": "score",
      "instructions": "判断这个需求对业务的影响程度。",
      "criteria": [
        "只影响外观或使用习惯，不影响功能",
        "部分功能受影响，但用户有可行的替代办法",
        "核心业务无法正常完成，或已经造成资金损失"
      ]
    },
    "is_urgent": {
      "type": "noul",
      "instructions": "问题是否正在造成损失，或有明确要求必须在24小时内处理？"
    }
  }
}
JSON
```

::

下面是响应中 `answers` 的示意，数字是为了说明格式写的，不是一次实测：

```json
{
  "priority": {
    "type": "choice",
    "choice": "p0",
    "probabilities": { "p0": 0.94, "p1": 0.03, "p2": 0.02, "p3": 0.01 },
    "confidence": 0.8
  },
  "impact": {
    "type": "score",
    "score": 1.9,
    "legend": {
      "0": "只影响外观或使用习惯，不影响功能",
      "1": "部分功能受影响，但用户有可行的替代办法",
      "2": "核心业务无法正常完成，或已经造成资金损失"
    },
    "probabilities": { "0": 0.02, "1": 0.06, "2": 0.92 },
    "confidence": 0.75
  },
  "is_urgent": {
    "type": "noul",
    "noul": 0.97
  }
}
```

程序直接拿 `priority.choice` 分组就行。如果 P0 和 P1 的概率很接近，可以先让人确认。这里的 `confidence` 是对概率分布集中程度的概括，不能直接当成答对的概率，具体说明见[官方文档](https://docs.typesafe.ai/confidence)。

还有一种拆法：分别判断重要、紧急，再在代码里组合成 P0～P3。这样优先级规则改了，只需要改代码，不必把整段提示词再写一遍。

## 为什么又快又便宜，连输出都免费？

传统 GPT、Claude 这类模型，常见的生成过程大致是：

```text
读输入 → 推理（若启用）→ 生成 token 1 → token 2 → token 3 → ……
```

输出是自回归的，后一个 token 依赖前面已经生成的内容。输出 200 个 token，就有很长一段串行生成过程，输出 token 的单价通常也比输入更高。

而 JEV 把任务限制成了：

```text
读 state → 对预定义问题做判断 → 返回 typed value + probability
```

比如客服分流，我们实际需要的可能就三个判断：

```text
department = choice(["refund", "sales", "support"])
is_angry = noul("用户是否生气？")
churn_risk = score(["不太可能流失", "很可能流失"])
```

没必要让模型先写「根据用户的描述，我认为应该把工单分配给退款部门，因为……」，再从这段话里提取部门。只需要部门选项、情绪判断和流失风险的数值，跟前面的排期例子一样。

按[官方介绍](https://typesafe.ai/blog/introducing-system-one-models-and-jev)，JEV 并行输出这些判断和概率，省掉了逐 token 生成答案的过程。接口最后依然用 JSON 传输，只是不用让模型把这份 JSON 一字一字写出来。

这也解释了它为什么敢把输出免费。创始人在[发布帖的后续说明](https://x.com/CompleteSkeptic/status/2099925685720760404)里说，输出已经便宜到不值得单独计费。省掉逐 token 生成后，输出部分的额外成本很低，输入部分仍然收费。目前[官方定价](https://docs.typesafe.ai/models)是每百万输入 token 0.042 美元。

至于快了多少倍，还是得看任务。官方也说，宣传中的倍数处于实际收益较高的一端，而且对照模型要生成完整的概率结果。如果原本只让一个小模型输出一个标签，差距就不能直接照搬。

![四类工作流中各模型的评测得分与成本对比](/images/2026/jev/jev-2.png){width="1672" height="918" caption="来源：TypeSafe 官方评测，横轴为每次工作流的成本，采用对数刻度。"}

这张图也不是拿人工标注的标准答案算正确率。官方用 GPT-6 Astra 和 Fable 5.1 的平均预测作为参考，看各模型与它们有多接近，读图时得把这个前提算进去。

## 真能避免幻觉吗？

不能把它理解成「不会答错」。

它保证的是输出结构符合约定，枚举值不会超出你给的范围。你定义了 `refund`、`sales`、`support`，它就不会凭空再造一个部门，也不会在该返回选项的地方给你一段小作文。

但退款工单被分给销售，仍然完全可能发生。格式没错，判断错了。

所以如果把幻觉理解成模型给出了不符合事实的答案，JEV 并没有消灭它。官方那张 0% 的图，依据也是 schema 保证，并非测出来的零错误率。这一点在[发布文章](https://typesafe.ai/blog/introducing-system-one-models-and-jev)里有写。

它解决了一类很烦的接入问题，业务判断还是要验证。

![TypeSafe 关于幻觉、类型安全和 0% 数据口径的说明](/images/2026/jev/jev-3.png){width="1633" height="1066" caption="来源：TypeSafe 发布文章的 Hallucination and Type-safety 部分。"}

翻译：

> 幻觉和类型安全本质上是相关的，我们认为类型安全是自动化的基本要求。在 Agent 中出现幻觉工具调用虽然不方便，但如果它是具有延迟保证的系统的一部分，或者它深埋在依赖链中，那就绝对是致命的缺陷。现有的模型，无论多么智能，仍然会出现幻觉和类型错误。
>
> 补充说明：
>
> LLM 的数据来自 OpenRouter，也就是说，这里几乎肯定存在偏差：更复杂的查询可能会被路由到更好的模型。
>
> 我们的数字并非来自实测。输出符合预设 schema（结构约束）是有保证的，因此我们可以自信地在图表中标出 0%。

## 那它有用吗？

有用。很多时候我们根本不需要模型写东西，只想知道下一步往哪走。

比如有人已经用 JEV 打过了《泰拉瑞亚》大师模式肉前全 Boss：

::bilibili{bvid="BV1Boe26JEh4" title="JEV 击败《泰拉瑞亚》大师模式肉前全 Boss｜Reisenberg"}
::

作者公开的 [TerraBlind](https://github.com/Reisenbug/TerraBlind#jev-打-boss)把战斗分成两层：JEV 判断该靠近还是远离、该上升还是下降，代码负责每帧的移动、瞄准和动作时序。项目说明里报告的模型回答中位耗时约 300ms，执行操作的代码则以 60Hz 运行。

这里的快就很有用了。Boss 冲过来时，你需要马上决定往哪躲，等一段完整的分析写完，角色可能已经没了。模型只给走位意图，代码持续执行，下一次判断回来再调整。

类似的用法也可以放到工单分流、评论筛选、搜索结果排序，或者 Agent 的工具选择里。只要答案范围明确、需要经常调用，这种专门做判断的模型就值得试。

## 这套思路也不一定非得用 JEV

我更想拿走的是它拆问题的方法。

比如做一个处理需求的 Agent，可以先让普通大模型把口语化描述整理清楚，再让 JEV 判断优先级。工期计算、资源冲突和排序放在代码里，最后需要向人解释排期时，再交给大模型写。

```text
用户描述 → 大模型整理需求 → JEV 判断重要性和紧急程度
                              ↓
                     代码计算工期、检查资源
                              ↓
                       大模型解释排期
```

如果不想接 JEV，也可以先在现有 Agent 里加一段提示词：

```text
先对需求做分类，不展开解释。

重要：影响核心业务流程、数据安全或造成资金损失。
紧急：正在造成损失，或明确要求在24小时内处理。

根据这两个条件选择：
p0：重要且紧急
p1：重要但不紧急
p2：不重要但紧急
p3：不重要且不紧急
unknown：材料不足以判断

只返回 JSON，字段为 priority。
不要猜测描述中没有提供的影响范围和截止时间。
```

需要复用，就封装成 Agent 的工具或插件，让后面的流程读取结果；平台支持结构化输出的话，把这些选项直接写进 schema。TypeSafe 自己也有一个[用普通 LLM 适配同类接口的项目](https://github.com/typesafe-ai/system-one-adapter-python)，可以拿来做对照。

这样能得到近似的使用方式，速度和成本还是由背后的模型决定。让大模型在 JSON 里自报一个概率，也不意味着这个数字经过了校准。

想看看「直接读取选项概率」和「生成一份 JSON」差在哪，可以玩一下 [OpenJev / SemIf](https://openjev.com/)。它用本地模型在浏览器里对比这两条路径，是独立实验，能帮助理解这个思路。

对我来说，JEV 最值得借鉴的地方就是：只需要一个判断时，就把问题收窄到这个判断。没必要每次都让大模型从头想一遍，再写一段话给程序看。
