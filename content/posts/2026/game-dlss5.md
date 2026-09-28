---
title: '哦，我的上帝！这是真实的！ —— DLSS 5 渲染实测'
description: '多图预警，演示几个游戏的 DLSS 5 效果，附教程和资源下载'
publish: 2026-09-08
tags:
  - 'DLSS5'
  - 'mod'
  - 'xxmi'
categories:
  - '游戏'
---

## 前言

视频教程：[稚qr柠](https://space.bilibili.com/3546380970756625)，[#如何安装](#教程)，[#资源下载](#相关资源)

## 效果演示

### 崩坏3rd

<!-- 不做双列 -->
DLSS OFF:

![DLSS OFF](/images/2026/game-dlss5/bh3-dlss-off.webp)

DLSS ON:

![DLSS ON](/images/2026/game-dlss5/bh3-dlss-on.webp)

好吧这只是整个活，下面才是实机

### 崩坏：星穹铁道

#### 雅利洛-VI - 上城区

DLSS ON:

![DLSS ON](/images/2026/game-dlss5/jarilo-6-dlss-on.webp)

DLSS OFF:

![DLSS OFF](/images/2026/game-dlss5/jarilo-6-dlss-off.webp)

#### 皮诺康尼 - 黄金的时刻

DLSS ON:

![DLSS ON](/images/2026/game-dlss5/penacony-dlss-on.webp)

DLSS OFF:

![DLSS OFF](/images/2026/game-dlss5/penacony-dlss-off.webp)

#### 翁法洛斯 - 哀丽秘榭

DLSS ON:

![DLSS ON](/images/2026/game-dlss5/amphoreus-dlss-on.webp)

DLSS OFF:

![DLSS OFF](/images/2026/game-dlss5/amphoreus-dlss-off.webp)

## 教程

> 警告：下线前需要手动关闭 DLSS 5，否则会很卡（切换分辨率也需要手动关闭）。截图分享时记得去掉 UID

1. 安装 [XXMI-Launcher](#相关资源)，安装目录随意。

2. 解压缩 reshade 系列包到任意目录，之后复制 `d3d12.dll` 的路径

![复制 d3d12.dll 文件路径](/images/2026/game-dlss5/copy-path.webp)

3. 在 XXMI-Launcher 中选择游戏，打开右上角设置 -> 高级 -> 注入库勾选上并粘贴 `d3d12.dll` 的路径。

![XXMI-Launcher 注入库设置](/images/2026/game-dlss5/setting-step.webp)

4. 启动游戏（首次按钮显示的是安装，不必在意），在游戏中按下 F10 隐藏 mod 加载信息。

![游戏启动时显示的 mod 加载信息](/images/2026/game-dlss5/load-mod.webp)

![游戏启动时显示的 ReShade 加载提示](/images/2026/game-dlss5/load-reshade.webp)

5. 按下 Home 键打开 reshade 菜单，选择 RenoDX DLSS 标签，然后按图依次调整即可。

![RenoDX DLSS 的 ReShade 配置界面](/images/2026/game-dlss5/reshade-config.webp)

## 相关资源

- [XXMI-Launcher](https://github.com/SpectrumQT/XXMI-Launcher)：https://github.com/SpectrumQT/XXMI-Launcher
- [reshade](https://github.com/crosire/reshade)：https://github.com/crosire/reshade
- [NVIDIA-RTX Streamline](https://github.com/NVIDIA-RTX/Streamline)：https://github.com/NVIDIA-RTX/Streamline
- [renodx](https://discord.gg/renodx)：https://discord.gg/renodx

「reshade系列包」—— 稚qr柠

夸克：「reshade系列包」，点击链接或复制整段内容，打开「夸克APP」即可获取。

/~fe113Zr8sX~:/

链接：https://pan.quark.cn/s/e2213ad352de?pwd=hb2e

提取码：hb2e

百度：通过网盘分享的文件：ReShade系列包

链接: https://pan.baidu.com/s/1_ymPN9uZ1lXr4o4Rb7-A-w?pwd=587k 提取码: 587k 

迅雷：链接：https://pan.xunlei.com/s/VP-EQf9zHowTmMFdQS4EJ1TjA1# 提取码：xeur 复制这段内容后打开「手机迅雷 App」即可获取
