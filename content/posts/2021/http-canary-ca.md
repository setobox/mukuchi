---
title: 解决部分安卓11HttpCanary无法安装证书及其他诸多问题
description: 记录 Android 11 上 HttpCanary 证书安装与 HTTPS 抓包中遇到的问题及当时的处理办法。
cover: /images/2021/http-canary-ca/http-canary-ca.png
publish: 2021-01-16
tags:
  - Android
  - HttpCanary
  - 抓包
  - 问题
categories:
  - 抓包
---

> 原文发布在B站 [解决部分安卓11HttpCanary无法安装证书及其他诸多问题 ](https://www.bilibili.com/opus/480358333617157012)

废话不多说，直接开始说问题，懒得排版，以后再改。

本文并不是教程奥，只是分享自己遇到的问题，和一些可行解决方法。


首先这个方法要 root，不知道如何 root 可以查，一搜一大把，不多赘述。

不用 root 也行，需要结合 vmos 等虚拟机使用，b站就能搜到。

问题1：miui 系统，点击安装根证书无反应，小黄鸟设置中又找不到导出证书（只有第一行的安装证书，但点击安装不了）


解决方案：

第一步，打开re管理器/mt管理器，找到

`/data/data/com.guoshi.httpcanary/cache/HttpCanary.pem`

文件，复制一份并改名为 `HttpCanary.jks`，退出重新进入小黄鸟，便会显示已经安装证书。

第二步，在app中点击安装证书到 system，给予小黄鸟 root 权限，能在系统安全用户凭据中系统证书中找到 HttpCanary 的证书，就算安好了，若没有再看下一步。

第三步，先小黄鸟设置中点击导出证书( 选第一个带.0的那个)，然后再进行第二步。

第四步，安装证书就到这里了，什么，其它系统？没试过awa。

问题2：有证书，开启抓包无网络，却不能抓https包，提示证书不可信，或者微信小程序无法登录。


解决方案：

安装 Xposed 框架 + JustTrustMe 插件。

JustTrustMe 可以关闭 SSL 认证，这样就不会证书不可信了，JustTrustMe 不管用可以在酷安中搜索 JustMePlush 还有 TrustMeAlready。

问题3：资源哪里下载

在酷安中搜索即可，httpcanary 可以在谷歌 play 商店中下，也可以直接浏览器搜索，免费版和付费的没太大区别，免费版不能装插件罢了。

搞机小白，仅仅是分享出自己遇到的问题的解决方法。
