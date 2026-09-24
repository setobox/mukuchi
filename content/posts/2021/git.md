---
title: Git 笔记
description: 从配置、仓库初始化到提交、分支、差异、暂存与忽略文件，整理 Git 日常使用所需的基础知识。
cover: 'https://git-scm.com/images/logo@2x.png'
publish: 2021-09-07
update: 2026-05-17
tags:
  - Git
categories:
  - 工具
---

## Git 安装

前往 [Git 官网](https://git-scm.com/downloads) 下载对应系统的安装包。安装完成后，可以在终端确认版本：

```bash
git --version
```

## Git 基础配置

### 配置用户名和邮箱

Git 会把用户名和邮箱写入提交记录。通常只需要配置一次全局信息：

```bash
git config --global user.name "你的用户名"
git config --global user.email "you@example.com"
```

Windows 的全局配置通常保存在 `%USERPROFILE%\.gitconfig`。也可以用命令查看配置及其来源：

```bash
git config --global --list
git config --show-origin --list
```

如果某个仓库需要使用不同的身份，在仓库目录中省略 `--global` 即可写入本地配置：

```bash
git config user.name "项目专用用户名"
git config user.email "project@example.com"
git config --local --list
```

常用配置作用域如下：

| 作用域 | 参数       | 位置                     | 用途               |
| ------ | ---------- | ------------------------ | ------------------ |
| 系统   | `--system` | Git 的系统配置文件       | 当前机器的所有用户 |
| 全局   | `--global` | 用户目录下的`.gitconfig` | 当前用户的所有仓库 |
| 本地   | `--local`  | 仓库的`.git/config`      | 仅当前仓库         |

同一个配置项重复出现时，优先级为：`local > global > system`。

### 新建 Git 仓库

让 Git 管理一个已有项目：

```bash
cd 项目目录
git init
```

创建一个新目录并初始化仓库：

```bash
git init 项目名
cd 项目名
```

## 理解工作区、暂存区和提交

Git 的基础工作流可以理解为：

```text
工作区 --git add--> 暂存区 --git commit--> 本地仓库
```

- **工作区**：正在编辑的文件。
- **暂存区**：下一次提交准备包含的内容。
- **提交**：保存到仓库历史中的一次快照。

提交前先用 `git status` 确认哪些改动将被记录，能避免把临时文件或无关修改带入提交。

## Git 操作

### 基础命令

```bash
git status                         # 查看工作区与暂存区状态
git add .                          # 暂存当前目录下的所有改动
git add 文件名                     # 暂存指定文件
git add 文件夹名/                  # 暂存指定目录中的改动
git commit -m "提交说明"           # 提交暂存区内容

git rm 文件名                      # 删除文件并暂存删除操作
git rm -r 文件夹名/                # 递归删除目录并暂存删除操作
git mv 原文件名 新文件名           # 重命名文件并暂存改动

git branch                         # 查看本地分支
git switch 分支名                  # 切换分支
git switch -c 新分支名             # 创建并切换到新分支
```

Git 2.23 之前通常使用 `git checkout <分支>` 和 `git checkout -b <分支>`；较新的 Git 更推荐用职责明确的 `switch` 和 `restore`。

### 查看日志

```bash
git log                            # 查看完整提交日志
git log --oneline                  # 每个提交显示为一行
git log -n 5                       # 查看最近 5 个提交
git log --all                      # 查看所有引用可达的提交
git log --graph --oneline --all    # 用文本图展示分支关系

git help --web log                 # 在浏览器中打开 git log 帮助
```

### 比较差异

```bash
git diff                           # 工作区与暂存区
git diff --cached                  # 暂存区与 HEAD
git diff HEAD                      # 工作区和暂存区相对 HEAD 的全部改动
git diff commit1 commit2           # 两个提交之间的差异
git diff branch1 branch2           # 两个分支指向的提交之间的差异
git diff HEAD^ HEAD                # 最近一次提交引入的差异
git diff commit1 commit2 -- 文件名 # 只比较指定文件
```

`HEAD` 表示当前分支指向的提交，`HEAD^` 或 `HEAD~1` 通常表示它的第一个父提交。

### Git 对象关系

一次提交会关联目录树对象，目录树再关联子目录和文件内容对应的对象。对象之间通过哈希相互引用，使 Git 能够保存并校验每次快照。

详见 [Git 内部原理：Git 对象](https://git-scm.com/book/zh/v2/Git-内部原理-Git-对象)。

![Git 对象关系](/images/2021/git/git-1.png)

### 搁置当前状态

需要临时切换任务、但当前修改还不适合提交时，可以使用 stash：

```bash
git stash                          # 搁置已跟踪文件的当前改动
git stash push -u -m "临时说明"    # 连同未跟踪文件一起搁置并添加说明
git stash list                     # 查看搁置列表
git stash pop                      # 恢复最近一条并删除该 stash
git stash apply                    # 恢复最近一条但保留该 stash
git stash apply "stash@{2}"        # 恢复指定 stash；PowerShell 中建议加引号
git stash drop "stash@{2}"         # 删除指定 stash
```

### 忽略不需要 Git 管理的文件

在仓库的 `.gitignore` 中写入匹配规则。例如：

```gitignore
# 依赖目录
node_modules/

# 构建产物
dist/
.output/

# 环境变量；保留可提交的示例文件
.env*
!.env.example

# 任意目录下的日志
*.log
```

以 `/` 结尾的规则匹配目录，`*` 是通配符，`!` 可以重新包含之前被忽略的路径。`.gitignore` 只影响尚未被跟踪的文件；如果文件已经提交过，需要先把它从暂存区索引中移除：

```bash
git rm --cached 文件名
```

## 常见问题

### 怎么删除不需要的分支？

```bash
git branch -d 分支名   # 删除已经合并的分支
git branch -D 分支名   # 强制删除，请先确认其中的提交不再需要
```

### 怎么修改 commit message？

修改最近一次提交：

```bash
git commit --amend
```

修改更早的提交，可以启动交互式 rebase，并把对应行的 `pick` 改为 `reword`：

```bash
git rebase -i HEAD~3
```

这会改写相关提交的哈希。不要随意修改其他人已经基于其开发的共享历史。

### 怎么合并多个 commit？

先选择需要整理的提交范围：

```bash
git rebase -i HEAD~4
```

在编辑器中保留第一个提交的 `pick`，将后续要并入它的提交改为 `squash` 或 `fixup`。如果范围包含根提交，使用：

```bash
git rebase -i --root
```

### 如何取消暂存？

让暂存区中的指定文件恢复为 `HEAD` 中的状态，但保留工作区改动：

```bash
git restore --staged 文件名
```

旧版本 Git 也可以使用 `git reset HEAD -- 文件名`。

### 如何丢弃工作区改动？

让工作区文件恢复为暂存区中的版本：

```bash
git restore -- 文件名
```

这个操作会覆盖尚未提交的修改，执行前应确认这些内容不再需要。旧版本 Git 的对应写法是 `git checkout -- 文件名`。

### 如何删除文件？

```bash
git rm 文件名
git commit -m "chore: remove unused file"
```
