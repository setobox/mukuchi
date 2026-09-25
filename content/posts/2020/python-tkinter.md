---
title: Python图形用户界面(Tkinter)
description: '用 Tkinter 搭建 Python 桌面界面：常用组件、三种布局管理器与事件绑定。'
tags:
  - Python
  - GUI
categories:
  - 笔记
cover: '/images/2020/python-tkinter/python-tkinter.jpg'
publish: 2020-05-25
---

# Python GUI 简介

#### Python 提供了多个图形开发界面的库，几个常用 Python GUI 库如下：

- <font color='tomato'>Tkinter</font>： Tkinter 模块(Tk 接口)是 Python 的标准 Tk GUI 工具包的接口 .Tk 和 Tkinter 可以在大多数的 Unix 平台下使用,同样可以应用在 Windows 和 Macintosh 系统里。Tk8.0 的后续版本可以实现本地窗口风格,并良好地运行在绝大多数平台中。

- <font color='tomato'>wxPython</font>：wxPython 是一款开源软件，是 Python 语言的一套优秀的 GUI 图形库，允许 Python 程序员很方便的创建完整的、功能健全的 GUI 用户界面。

- <font color='tomato'>Jython</font>：Jython 程序可以和 Java 无缝集成。除了一些标准模块，Jython 使用 Java 的模块。Jython 几乎拥有标准的 Python 中不依赖于 C 语言的全部模块。比如，Jython 的用户界面将使用 Swing，AWT 或者 SWT。Jython 可以被动态或静态地编译成 Java 字节码。

下面介绍运用 Tkinter 进行

# Python GUI 编程(Tkinter)

## 常用控件及属性

### Tkinter 控件

| 控件         | 描述                                                               |
| ------------ | ------------------------------------------------------------------ |
| Button       | 按钮控件；在程序中显示按钮。                                       |
| Canvas       | 画布控件；显示图形元素如线条或文本                                 |
| Checkbutton  | 多选框控件；用于在程序中提供多项选择框                             |
| Entry        | 输入控件；用于显示简单的文本内容                                   |
| Frame        | 框架控件；在屏幕上显示一个矩形区域，多用来作为容器                 |
| Label        | 标签控件；可以显示文本和位图                                       |
| Listbox      | 列表框控件；在 Listbox 窗口小部件是用来显示一个字符串列表给用户    |
| Menubutton   | 菜单按钮控件，用于显示菜单项。                                     |
| Menu         | 菜单控件；显示菜单栏,下拉菜单和弹出菜单                            |
| Message      | 消息控件；用来显示多行文本，与 label 比较类似                      |
| Radiobutton  | 单选按钮控件；显示一个单选的按钮状态                               |
| Scale        | 范围控件；显示一个数值刻度，为输出限定范围的数字区间               |
| Scrollbar    | 滚动条控件，当内容超过可视化区域时使用，如列表框。\.               |
| Text         | 文本控件；用于显示多行文本                                         |
| Toplevel     | 容器控件；用来提供一个单独的对话框，和 Frame 比较类似              |
| Spinbox      | 输入控件；与 Entry 类似，但是可以指定输入范围值                    |
| PanedWindow  | PanedWindow 是一个窗口布局管理的插件，可以包含一个或者多个子控件。 |
| LabelFrame   | labelframe 是一个简单的容器控件。常用与复杂的窗口布局。            |
| tkMessageBox | 用于显示你应用程序的消息框。                                       |

### 标准属性

    标准属性也就是所有控件的共同属性，如大小，字体和颜色等等。

| 属性      | 描述       |
| --------- | ---------- |
| Dimension | 控件大小； |
| Color     | 控件颜色； |
| Font      | 控件字体； |
| Anchor    | 锚点；     |
| Relief    | 控件样式； |
| Bitmap    | 位图；     |
| Cursor    | 光标；     |

## 几何布局管理器

在 GUI 编程中，放好每个组件时很繁琐的，不仅要调整自身大小，还要调整和其他组件的相对位置。Tk 提供了三个管理器来帮助我们：pack()|grid()和 place().

#### pack 几何布局

    pack()

- 简单，代码量少，系统按从上往下自动摆放
- side(停靠在父组件的某边上)
- anchor(对齐方式)
- expand(在窗口有剩余空间时扩展)
- fill(填充剩余空间)

#### grid 几何布局

    grid()

- 按行列布局，像表格一样摆放控件
- row 行 column 列
- rowspan 行跨度 columnspan 列跨度

#### place 几何布局

    place()

- 相对布局中，拉伸窗口，控件位置可能会改变。
- 绝对布局，控件位置不会改变

# 使用 Tkinter

创建一个 GUI 程序至少需要 4 步:

1. 导入 tkinter 模块
2. 创建控件
3. 添加交互控件并编写函数
4. 在主事件循环中等待刷新

### 导入 tkinter 库

```
from tkinter import *
```

### 主界面绘制

```
#将tkinter对象实例化
root = TK()
#设置标题
root.title("标题")
#设置窗口大小
root.geometry('600x400')
#进入循环等待交互事件
root.mainloop()
```

# 实例绘制简单登陆界面

代码部分：

```python
#引入库
from tkinter import *
login = Tk()
login.title("登陆界面")
login.geometry('600x400')
#添加控件
Label(login, text='欢迎登陆', font=('', 20), width=20, bg='grey', fg='yellow').place(x=150, y=0)
Label(login, text='用户名:', width=12, bg='lightgreen').place(x=100, y=100)
Label(login, text='密   码:', width=12, bg='lightgreen').place(x=100, y=140)
input1 = Entry(login, width=30)
input1.place(x=220, y=100)
input2 = Entry(login, show='*', width=30)
input2.place(x=220, y=140)
Button(login, text='确定', width=10, height=2, ).place(x=180, y=220)
Button(login, text='取消', width=10, height=2, ).place(x=320, y=220)
login.mainloop()
```

> 代码中使用了 place 布局

示例如下:
![avatar][case]

可为按钮添设回调函数:

```python
def LoginCallBack():
    t1 = input1.get()
    t2 = input2.get()
    if (t1 == ''):
        showinfo('提示', '用户名不能为空')
    elif (len(t2) < 6):
        showinfo('提示', '密码不能小于6位')
    else:
        showinfo('提示', '登入成功')
        login.quit()
```

> showinfo 需要引入 tkinter.messagebox 库

调用的话则需要

```
Button(login, text='确定', width=10, height=2, ).place(x=180, y=220)
加上command = LoginCallBack属性
即Button(login, text='确定', width=10, height=2, command = LoginCallBack).place(x=180, y=220)
```

---

[case]: /images/2020/python-tkinter/login-example.png
