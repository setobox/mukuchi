---
title: Hexo添加文章时自动打开编辑器
tags:
  - 博客优化
categories:
  - 博客优化
description: 通过JS脚本监听hexo new，并自动打开md编辑器
cover: /images/2021/hexo-auto-open-editor/hexo-auto-open-editor.webp
publish: 2021-01-26
---

之前通过Hexo新建文章，在命令行中输入：

`hexo new "title name"`

然后还需在Hexo根目录下source文件夹下的\_post目录打开编辑md文件，而在众多的文章中想找到刚创建好的，是一件较为麻烦的事。好在可以通过JS脚本实现在创建文章后自动打开编辑器。

---

Hexo的作者在GitHub项目中的issue里，给出了方法，以下为作者原文:

> You can try to listen to the `new` event. For example:

```javascript
const spawn = require('node:child_process').exec

// Hexo 2.x
hexo.on('new', (path) => {
  spawn('vi', [path])
})

// Hexo 3
hexo.on('new', (data) => {
  spawn('vi', [data.path])
})
```

子进程用法：

`child_process.exec(command[, options][, callback])`

在这里直接使用exec(command)，利用子进程执行命令行指令打开编辑器

稍加修改便可以使用了：

```javascript
const spawn = require('node:child_process').exec

// Hexo 2.x
hexo.on('new', (path) => {
  spawn(`start "编辑器绝对地址.exe"${path}`)
})

// Hexo 3
hexo.on('new', (data) => {
  spawn(`start "编辑器绝对地址.exe"${data.path}`)
})
```

mac系统下只需要将 'start' 换成 'open -a' 。

操作步骤：

1. 在Hexo目录下新建scripts目录，新建一个xxx\.js文件。
2. 选用适合版本的代码，复制粘贴进\.js文件。
3. 替换掉"编辑器绝对地址.exe"，例如换成"D:\Typora\Typora.exe"，然后保存。

下次使用 hexo new 时就能自动打开编辑器了~。

[![Website](/images/2021/hexo-auto-open-editor/hexo-auto-open-editor-1.svg)](https://blog.setobox.com/)[![Reference](/images/2021/hexo-auto-open-editor/hexo-auto-open-editor-2.svg)](https://notes.doublemine.me/2015-06-29-Hexo%E6%B7%BB%E5%8A%A0%E6%96%87%E7%AB%A0%E6%97%B6%E8%87%AA%E5%8A%A8%E6%89%93%E5%BC%80%E7%BC%96%E8%BE%91%E5%99%A8.html)![Say Thanks](/images/2021/hexo-auto-open-editor/hexo-auto-open-editor-3.svg)
