---
title: HexoEditor(适用于Hexo的专用编辑器)
description: 介绍 HexoEditor 这款专为 Hexo 设计的 Markdown 编辑器，以及它在写作流程中的配置与使用。
cover: /images/2021/hexo-editor/hexo-editor.jpg
tags:
  - 工具
  - Hexo
categories:
  - 工具
publish: 2021-03-22
---

# 写在前面

### 无关紧要的前言

> 距离之前的更新已经过了好久，说实话，个人组织语言的能力很有限（社恐），总止步于反复修饰文章内容，畏惧发布没有营养的内容。仔细想想，逃避不是办法，**去做**才是正解，要敢于承认自己是菜比，从菜比做起。

```javascript
while (!death) {
  time--
  exp++
}
```

> 今天开始，打算重构一下博客，重新搭建一下，将博客优化、美化做完，开始新生活~。并且之后多多记录各种错误，别的不说，发现错误这点我在行2333

# Hexo-Editor简介

> 这是一款为Hexo做了优化的Markdown编辑器。从功能上并不比其他同类软件好，许多地方不太方便，但在写hexo博文方面，这款编辑器具有同类软件比不上的许多功能，如预览页面和Hexo生成界面高度相似，快速执行Hexo命令，等功能绝对是我等懒癌患者的福音~。

# 安装

该软件在github上开源，不仅可以在[这里](https://github.com/zhuzhuyule/HexoEditor/releases/tag/v1.5.30)下载到打包好的安装程序，还可以在[这里](https://github.com/zhuzhuyule/HexoEditor/tree/v1.5.30)找到官方的指导手册，并具有[中文版本](https://github.com/zhuzhuyule/HexoEditor/blob/v1.5.30/doc/cn/README.md)。

安装内容略，安装好后是这个样子：

![image-20210321215031647](/images/2021/hexo-editor/hexo-editor-1.png)

简直白茫茫一片阿，风格与Typora有些相似。

## 详细配置

### 通用

没什么好说的，缩放比例范围0.7~1.6

![image-20210321220959726](/images/2021/hexo-editor/hexo-editor-2.png)


### 编辑

同样没什么好说的。

![image-20210321221231794](/images/2021/hexo-editor/hexo-editor-3.png)


### Hexo

点击自动设置，选择博客根目录下\_config.yml文件即可：

![image-20210321221316680](/images/2021/hexo-editor/hexo-editor-4.png)


### 渲染

全部勾选即可，渲染主题目前貌似只支持github和next主题，若为next主题，点加号选择主题文件夹即可自动识别。

![image-20210321222458516](/images/2021/hexo-editor/hexo-editor-5.png)


### 图片

挨个配置即可：

![image-20210321223517616](/images/2021/hexo-editor/hexo-editor-6.png)

- 默认资源库

  存放本地图片的位置，一般不放置于博客内，推荐另置一个仓库，利用jsdelivr实现图床的作用；或者使用腾讯云等图床。

- 云图类型
  - SM.MS图床

    免费，速度一般

  - 七牛云

    没用过

  - 腾讯云

    好用，快的很，但免费额度一定时间后到期，不过小博客收费不多。

  - 阿里云

- Key，存储空间，域名，自定义域名

  按需配置。


### 快捷操作

右键选择hexo，即可快捷操作，记得先结束占用进程~。
