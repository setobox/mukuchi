---
title: 'Milanote API'
description: '本文将介绍如何使用 Milanote API。'
publish: 2026-07-22
update: 2026-07-23
tags:
 - 'Milanote'
 - 'API'
categories:
 - '工具'
---

## 引言

我使用 Milanote 已经有一段时间了，它的自由画布和卡片式布局让我能够轻松地整理我的创意项目和收藏。此时我想在别处使用 Milanote 的内容，又不想手动维护，于是乎便有了这个项目。

[github/milanote-api](https://github.com/setobox/milanote-api)

## RoadMap

- [x] 根据分享的 Board 得到完整 API 数据
- [x] 解析 Board 数据，得到卡片内容和布局信息
- [x] 做一个简单的示例项目 Playground，提供一个在线的可视化界面，展示 Board 的内容
- [x] 部署到 Cloudflare Workers
- [x] 提供字段筛选功能

TODO：

- [ ] 改成无需在 Cloudflare 中添加密钥，根据 url 中 param 参数在线解析 Board 内容。

## 一、获取分享链接

比如在 Milanote 中创建一个测试用的 Board。

![milanote-api-1](/images/2026/milanote-api/milanote-api-1.png)

然后点击右上角的分享按钮，打开 `enable read-only link`，然后点击 `Copy Link`，得到 `https://app.milanote.com/1WMuoxxxQy3ge5?p=tsV60xxxJqR`。

![milanote-api-2](/images/2026/milanote-api/milanote-api-2.png)

## 二、Playground

效果图：

![milanote-api-3](/images/2026/milanote-api/milanote-api-3.png)

![milanote-api-4](/images/2026/milanote-api/milanote-api-4.png)
