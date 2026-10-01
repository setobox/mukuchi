---
title: 'WSL 3 正式发布~'
description: '说好的没有 3 呢？'
cover: /images/2026/wsl3/wsl3.png
publish: '2026-10-01'
update: '2026-10-01'
tags: [WSL, Linux, Windows, Docker, 容器]
categories: [工具]
---

就在昨天凌晨 1 点多，微软发布了 [WSL 3.0.1][ga]，本次更新最大的亮点就是 WSL 容器的稳定版，无需 Docker 即可原生创建、运行 Linux 容器，除此之外还有文件系统访问速度翻倍（virtiofs）、网络方面的改进（consomme）等等。

## WSL 简介

先给没用过的同学简单介绍一下，`WSL` 全称 Windows Subsystem for Linux，即“适用于 Linux 的 Windows 子系统”。

装了这个就可以在 Windows 里运行多种 Linux 发行版（如 Ubuntu、Debian 等），得到 Linux 系统开发的爽感（众所周知，Windows 原生命令行工具、文件系统和 Linux、MacOS 不一致导致了很多问题，也没法直接安装 zsh 等终端）。

### 安装

::code-group

```powershell [安装 WSL]
> wsl --install

请求的操作需要提升。
正在下载: 适用于 Linux 的 Windows 子系统 3.0.1
[==========================81.8%================           ]
```

```powershell [安装 WSL（不装发行版）]
> wsl --install --no-distribution
```

```powershell [查看和安装发行版]
> wsl --list --online

以下是可安装的有效分发的列表。
使用“wsl.exe --install <Distro>”安装。

NAME                            FRIENDLY NAME
Ubuntu                          Ubuntu
Ubuntu-26.04                    Ubuntu 26.04 LTS
Ubuntu-24.04                    Ubuntu 24.04 LTS
Ubuntu-22.04                    Ubuntu 22.04 LTS
openSUSE-Tumbleweed             openSUSE Tumbleweed
openSUSE-Leap-16.0              openSUSE Leap 16.0
SUSE-Linux-Enterprise-15-SP7    SUSE Linux Enterprise 15 SP7
SUSE-Linux-Enterprise-16.0      SUSE Linux Enterprise 16.0
kali-linux                      Kali Linux Rolling
Debian                          Debian GNU/Linux
AlmaLinux-8                     AlmaLinux OS 8
AlmaLinux-9                     AlmaLinux OS 9
AlmaLinux-Kitten-10             AlmaLinux OS Kitten 10
AlmaLinux-10                    AlmaLinux OS 10
archlinux                       Arch Linux
FedoraLinux-44                  Fedora Linux 44
FedoraLinux-43                  Fedora Linux 43
eLxr                            eLxr 12.12.0.0 GNU/Linux
OracleLinux_7_9                 Oracle Linux 7.9
OracleLinux_8_10                Oracle Linux 8.10
OracleLinux_9_5                 Oracle Linux 9.5
SUSE-Linux-Enterprise-15-SP6    SUSE Linux Enterprise 15 SP6

> wsl --install Ubuntu-26.04 # 安装
```

::

未安装 WSL 时，使用 `wsl --install` 会安装 WSL 和默认的 Ubuntu。只准备体验 `wslc`，可以用第二条，跳过普通发行版的安装。以后需要 Ubuntu，再执行 `wsl --install -d Ubuntu` 即可。[安装参数][commands]

需要重启 WSL 环境时，可以执行 `wsl --shutdown`。

### 从 WSL 2 升级

直接更新：

```powershell [更新 WSL]
wsl --update
```

商店下载卡住时，可以改用 GitHub 下载通道：

```powershell [不经过 Microsoft Store 更新]
wsl --update --web-download
```

了解更多可参考：[更新说明][commands]

## WSL 3 改进内容

### 跨操作系统文件访问性能

> 从 Linux 环境访问 Windows 文件，性能最高可达原来的 2 倍。

WSL 底层使用 **virtiofs**， 其为 Linux 内核的一个文件系统驱动，专门用于虚拟机和宿主机之间的文件共享。它比 WSL 2 之前使用的 Plan9 协议更高效，尤其在大量小文件的读写上有明显优势，这下终于不用在 Windows 和 WSL 存两处项目了。

::alert{type="important" theme="github" title="普通发行版 WSL 发行版并没有默认开启 virtiofs"}
WSLC 使用 virtiofs，但普通 WSL 发行版里还是实验性设置，想体验则需要在 `.wslconfig` 设置为 `true`。
::

但就算最高性能可以翻 2 倍，该卡还是会卡的，项目文件只需要在 Linux 中使用的话，还是放在 WSL 文件系统里更好。

### 网络 Consomme

WSL 容器使用 **Consommé** 网络模式，它把 Linux 虚拟机的网络流量交给 Windows 侧的用户进程处理，包括 DNS、TCP / UDP 和端口映射。出站流量以会话所属用户的身份进入 Windows 网络栈，因此能更好地配合 VPN 和防火墙。详情见[网络实现][architecture]。

拿 [Nginx](#启动一个-nginx) 例子来说，最直接的用法就是 `-p 8080:80`，然后从 Windows 访问 `localhost:8080`，不用自己查容器 IP 再手工转发，也不用担心代理断开后容器就没网了。

---

## 使用 WSL container

::alert{type="note" theme="github" title="wslc 需要 2.9.3 或以上版本"}
使用 `wsl --version` 查看版本
::

## Run

### 运行 Ubuntu 容器

```powershell [运行一次性容器]
wslc run --rm -it ubuntu:latest bash -c "echo Hello world from WSL container!"
```

正常运行后，会输出：

```text
Hello world from WSL container!
```

本地没有镜像时会先下载，命令执行完之后，加的 `--rm` 会在退出后自动删除容器（下载的镜像不会删）。[运行示例][tutorial]

查看本地镜像：

```powershell
wslc image ls
```

### 运行 Nginx

先拉取镜像：

```powershell
wslc pull nginx
```

再执行：
```powershell
wslc run -d --rm -p 8080:80 --name web nginx
```


`-d` 表示后台运行，`-p 8080:80` 把 Windows 的 8080 端口映射到容器的 80 端口，`--name web` 给容器起一个方便操作的名字。[端口映射示例][tutorial]

请求一下页面试试：

```powershell
curl http://localhost:8080
```

也可以在浏览器里打开 `http://localhost:8080`，可以看到 Nginx 欢迎页。

也可以看看容器、日志和里面的系统信息：

```powershell [查看运行状态]
# 查看运行中的容器
wslc container ps

# 查看 Nginx 日志
wslc logs web

# 在容器里执行命令
wslc exec web cat /etc/os-release
```

最后用完了停止它：

```powershell
wslc container stop web
```

前面用了 `--rm`，所以停止后，这个容器也会被删除。要保留应用数据，就不要只往容器自身的可写层里存，应该另外配置卷或目录挂载。[存储说明][architecture]

### 自己构建一个镜像

`wslc` 也提供了 `build`，不只是运行现成镜像。官方教程给出了从构建到启动的完整流程。[构建教程][tutorial]

下面做个更简单的静态页面。在一个空目录中创建这两个文件：

::code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
  <meta charset="utf-8">
  <title>Hello WSLC</title>
  <h1>Hello from WSLC!</h1>
</html>
```

```dockerfile [Dockerfile]
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
```

::

在这两个文件所在的目录打开 PowerShell：

```powershell [构建并运行]
wslc build -t wslc-demo .
wslc run -d --rm -p 8081:80 --name demo wslc-demo
curl http://localhost:8081
```

用完同样停止：

```powershell
wslc container stop demo
```

## 总结

到这里就结束了，赶快上手试试吧~

## 参考资料
- [Github Release][release]
- [WSL Containers 官方公告][ga]
- [2.9.3 预发布记录][preview]
- [安装 WSL][install]
- [WSL 常用命令][commands]
- [WSL 容器上手教程][tutorial]
- [CLI 与 API 概览][overview]
- [WSLC 架构详解][architecture]
- [WSL 配置说明][config]
- [WSL 架构与版本][compare]

[release]: https://github.com/microsoft/WSL/releases/tag/3.0.1
[ga]: https://blogs.windows.com/windowsdeveloper/2026/09/29/wsl-containers-now-generally-available/
[preview]: https://github.com/microsoft/WSL/releases/tag/2.9.3
[install]: https://learn.microsoft.com/en-us/windows/wsl/install
[commands]: https://learn.microsoft.com/en-us/windows/wsl/basic-commands
[tutorial]: https://learn.microsoft.com/en-us/windows/wsl/tutorials/wsl-containers
[overview]: https://learn.microsoft.com/en-us/windows/wsl/wsl-container?tabs=csharp
[architecture]: https://devblogs.microsoft.com/commandline/wslc-architecture-deep-dive/
[config]: https://learn.microsoft.com/en-us/windows/wsl/wsl-config
[compare]: https://learn.microsoft.com/en-us/windows/wsl/compare-versions
