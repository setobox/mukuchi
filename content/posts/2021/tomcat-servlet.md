---
title: Tomcat和Servlet应用配置及部分问题
description: 记录 Tomcat 与 Servlet 的环境配置、项目部署流程，以及过程中遇到的报错和解决办法。
cover: /images/2021/tomcat-servlet/tomcat-servlet.jpg
tags:
  - JavaWEb
  - Tomcat
  - Servlet
categories:
  - 笔记
publish: 2021-03-22
---

持续更新中……

# Tomcat

### 维基百科复制来的长篇大论：

> Tomcat是由Apache软件基金会属下Jakarta项目开发的Servlet容器，按照Sun Microsystems提供的技术规范，实现了对Servlet和JavaServer Page（JSP）的支持，并提供了作为Web服务器的一些特有功能，如Tomcat管理和控制平台、安全局管理和Tomcat阀等。由于Tomcat本身也内含了HTTP服务器，因此也可以视作单独的Web服务器。但是，不能将Tomcat和Apache HTTP服务器混淆，Apache HTTP服务器是用C语言实现的HTTPWeb服务器；这两个HTTP web server不是捆绑在一起的。Apache Tomcat包含了配置管理工具，也可以通过编辑XML格式的配置文件来进行配置。

## 使用

> Idea的下载安装及配置不再赘述。

> Tomcat10.0.4下载地址：[64位win.zip](https://mirror-hk.koddos.net/apache/Tomcat/Tomcat-10/v10.0.4/bin/apache-Tomcat-10.0.4-windows-x64.zip)、[32位win.zip](https://mirror-hk.koddos.net/apache/Tomcat/Tomcat-10/v10.0.4/bin/apache-Tomcat-10.0.4-windows-x86.zip)、[其他(官网)](https://Tomcat.apache.org/download-10.cgi)

### 安装

下载的压缩包需要解压到纯英文目录，安装包同理安装在纯英文目录下。


### 环境变量

> 如果没有配置过jdk和jre的目录，需要首先下载和配置jdk！！

双击Tomcat/bin目录下setclasspath.bat，会有cmd窗口一闪而过。


### 启动

双击Tomcat/bin目录下startup.bat，cmd窗口中出现以下文字则服务器开启成功：

![image-20210322183754160](/images/2021/tomcat-servlet/tomcat-servlet-1.png)

此时在浏览器中输入localhost:8000即可开启Tomcat的demo页面：

![image-20210322183711196](/images/2021/tomcat-servlet/tomcat-servlet-2.png)


### 关闭

- 强行关闭，直接点x
- 双击打开bin目录下shutdown.bat


## 问题分析

1. 控制台都是乱码看不懂
   - 首先说明这是编码问题，在Tomcat\conf目录下找到logging.properties

     ![image-20210322183413959](/images/2021/tomcat-servlet/tomcat-servlet-3.png)

   - 更改UTF-8为GBK

     ![image-20210322183357065](/images/2021/tomcat-servlet/tomcat-servlet-4.png)

2. 打开Tomcat闪退

   有两种情况：
   1. 环境变量没设置好，打开cmd输入java \-version即可查看有无设置好jdk的环境变量，其次可能Tomcat的环境变量没设置好，试试以管理员身份打开setclasspath.bat。
   2. 端口占用
      - 打开cmd输入netstat \-aon|findstr "端口号" ，检测端口占用情况（可跳过
      - 找到Tomcat\conf\server.xml，用文本编辑器打开，ctrl+f找到8080，改成其他端口，1\~1023为系统端口不要设，改为1024\~65535即可。

## 部署项目

### 部署项目的方式：

1. 直接将项目放到webapps目录下即可。
   - /hello：项目的访问路径–>虚拟目录
   - 简化部署：将项目打城一个war包，再将war包放置到webapps目录下。
     - > war包会自动解压缩

2. 配置conf/server.xml文件

   在\<Host\>标签体中配置

   ```xml
   <Context docBase="D:\hello" path="/hehe" />d
   ```

   - docBase:项目存放的路径
   - path:虚拟目录

3. 在conf\Catalina\localhost创建任意名称的xml文件.在文件中编写

   ```xml
   <Context docBase="D:\hello" />
   ```

   - 虚拟目录:xml文件的名称

### 动态项目和静态项目:

- 目录结构:
  - 静态项目:
    - 使用静态资源
  - java动态项目的目录结构:
    - 项目根目录
      - WEB-INF
        - web.xml:该项目的核心配置文件
        - classes目录: 放置字节码文件
        - lib目录: 防止项目依赖的jar包

### Tomcat集成到IDEA中

1. 点击Run->Edit Configurations或Add Configurations

   ![image-20210322191002812](/images/2021/tomcat-servlet/tomcat-servlet-5.png)

2. 点击Configure…

   ![image-20210322191129266](/images/2021/tomcat-servlet/tomcat-servlet-6.png)

3. 选择Tomcat根目录

4. 上面有

   ![image-20210322191422916](/images/2021/tomcat-servlet/tomcat-servlet-7.png)

5. 你可能需要点击

   ![image-20210322191526306](/images/2021/tomcat-servlet/tomcat-servlet-8.png)

   没有就不点

6. 新建一个Module

   ![image-20210322192109197](/images/2021/tomcat-servlet/tomcat-servlet-9.png)
   ctrl+shift+alt+\/打开Maintenance，打开Registry，找到**javaee.legacy.project.wizard**
   ![image-20210322193149809](/images/2021/tomcat-servlet/tomcat-servlet-10.png)

   勾选后即可在新建Module中找到JavaEE的Web Application选项

7. 在index.jsp中编写html代码(也可跳过),运行就可以了

   ![image-20210322194041872](/images/2021/tomcat-servlet/tomcat-servlet-11.png)

   打开浏览器，成功运行项目：

   ![image-20210322194128864](/images/2021/tomcat-servlet/tomcat-servlet-12.png)

# Servlet

## 简介：

### 维基百科复制来的长篇大论：

> Servlet（Server Applet），全称Java Servlet。是用Java编写的服务器端程序。其主要功能在于交互式地浏览和修改数据，生成动态Web内容。狭义的Servlet是指Java语言实现的一个接口，广义的Servlet是指任何实现了这个Servlet接口的类，一般情况下，人们将Servlet理解为后者。
>
> Servlet运行于支持Java的应用服务器中。从实现上讲，Servlet可以响应任何类型的请求，但绝大多数情况下Servlet只用来扩展基于HTTP协议的Web服务器。
>
> 最早支持Servlet标准的是JavaSoft的Java Web Server。此后，一些其它的基于Java的Web服务器开始支持标准的Servlet。

### 概述：

Servlet(server applet)为运行在服务器端的小程序。

- Servlet本质上也是Java类，但要遵循Servlet规范进行编写，没有main()方法，它的创建、使用、销毁都由Servlet容器管理（如Tomcat）。
- Servlet是和HTTP协议紧密联系的，其可以处理HTTP协议相关的所有内容。这也是Servlet应用广泛的原因之一。
- Servlet容器有很多，如Tomcat，Jetty，WebLogic Server，web Sphere，JBoss等等。

#### 继承HttpServlet

### Servlet的工作流程

1. 通过请求头获知浏览器访问的是哪个主机
2. 再通过请求行获取访问的是哪个一个web应用
3. 再通过请求行中的请求路径获知访问的是哪个资源
4. 通过获取的资源路径在配置中匹配到真实的路径，
5. 服务器会创建servlet对象，（如果是第一次访问时，创建servlet实例，并调用init方法进行初始化操作）
6. 调用service（request， response）方法来处理请求和响应的操作 7. 调用service完毕后返回服务器 由服务器讲response缓冲区的数据取出，以http响应的格式发送给浏览器

## Servlet的实现

### 创建web项目

1. new project
   ![image-20210324165256255](/images/2021/tomcat-servlet/tomcat-servlet-13.png)

2. 继续next

   ![image-20210324165447210](/images/2021/tomcat-servlet/tomcat-servlet-14.png)

3. 改个项目名字

   ![image-20210324165529088](/images/2021/tomcat-servlet/tomcat-servlet-15.png)

最终得到的项目结构如下：

![image-20210324165642311](/images/2021/tomcat-servlet/tomcat-servlet-16.png)

### 实现Servlet

实现Servlet规范，即继承HttpServlet类，该类中已经完成了通信的规则，我们只需要进行业务的实现即可。

> 警告：请下载对应版本的tomcat，不然会导致404错误无法启动servlet项目。点击直达—>[官方版本说明](https://tomcat.apache.org/whichversion.html)

### 版本表格

| Servlet Spec                | JSP Spec   | EL Spec    | WebSocket Spec | JASPIC Spec | Apache Tomcat version | Actual release revision | Supported Java Versions |
| --------------------------- | ---------- | ---------- | -------------- | ----------- | --------------------- | ----------------------- | ----------------------- |
| 4.0                         | TBD (2.4?) | TBD (3.1?) | TBD (1.2?)     | 1.1         | 9.0.x                 | 9.0.0.M9 (alpha)        | 8 and later             |
| 3.1                         | 2.3        | 3.0        | 1.1            | 1.1         | 8.5.x                 | 8.5.4                   | 7 and later             |
| 3.1                         | 2.3        | 3.0        | 1.1            | N/A         | 8.0.x (superseded)    | 8.0.35 (superseded)     | 7 and later             |
| 3.0                         | 2.2        | 2.2        | 1.1            | N/A         | 7.0.x                 | 7.0.70                  | 6 and later             |
| (7 and later for WebSocket) |            |            |                |             |                       |                         |                         |
| 2.5                         | 2.1        | 2.1        | N/A            | N/A         | 6.0.x                 | 6.0.45                  | 5 and later             |
| 2.4                         | 2.0        | N/A        | N/A            | N/A         | 5.5.x (archived)      | 5.5.36 (archived)       | 1.4 and later           |
| 2.3                         | 1.2        | N/A        | N/A            | N/A         | 4.1.x (archived)      | 4.1.40 (archived)       | 1.3 and later           |
| 2.2                         | 1.1        | N/A        | N/A            | N/A         | 3.3.x (archived)      | 3.3.2 (archived)        | 1.1 and later           |

### 重写Servlet方法

满足Servlet规范只是让我们的类能够满足接受请求的要求，接收到请求后需要对请求进行分析，以及进行业务逻辑处理，计算出结果，则需要添加代码，在规范中有一个叫做service的方法，专门用来做请求处理的操作，业务代码则可以卸载该方法中。

1. 新建一个类

   ![image-20210324172642919](/images/2021/tomcat-servlet/tomcat-servlet-17.png)

2. 继承HttpServlet

   ```java
   import javax.servlet.http.HttpServlet;

   public class ServletDemo1 extends HttpServlet {
   }

   ```

3. 重写service方法

   ```
   import javax.servlet.ServletException;
   import javax.servlet.http.HttpServlet;
   import javax.servlet.http.HttpServletRequest;
   import javax.servlet.http.HttpServletResponse;
   import java.io.IOException;

   public class HelloServlet extends HttpServlet {
       @Override
       protected void service(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
           System.out.println("hello servlet");// 打印内容到控制台
           resp.getWriter().write("Hello world!");// 通过流输出数据到浏览器
       }
   ```

### 设置注解

在完成好了一切代码的编写后，还需要向服务器说明，特定请求对应特定资源。

开发servlet项目，使用@WebServlet将一个继承于javax.servlet.http.HttpServlet的类顶i为Servlet组件。

在Servlet3.0中，可以使用@WebServlet注解将一个继承于javax.servlet.http.HttpServlet的类标注为可以处理用户请求的Servlet。

- 通过设置注解，指定访问路径

  ![image-20210324173507993](/images/2021/tomcat-servlet/tomcat-servlet-18.png)

- 启动服务器

![image-20210324180345268](/images/2021/tomcat-servlet/tomcat-servlet-19.png)


#### 继承GenericServlet

继承GenericServlet类，其他不变


#### 实现接口Servlet

实现接口Servlet

1. 创建一个JavaEE项目

2. 定义一个类，实现Servlet接口

   ![image-20210324083857086](/images/2021/tomcat-servlet/tomcat-servlet-20.png)

3. 实现接口中的抽象方法

   ![image-20210324083917998](/images/2021/tomcat-servlet/tomcat-servlet-21.png)

4. 配置Servlet
   - 在service方法中加上：

     ```java
     System.out.println("hello servlet");
     ```

     ![image-20210324131053590](/images/2021/tomcat-servlet/tomcat-servlet-22.png)

   - 在WEB-INF下的web.xml中加入：

     ```xml
     <!-- 配置Servlet -->
     <servlet>
       <servlet-name>demo</servlet-name>
       <servlet-class>setobox.me.servlet.ServletDemo1</servlet-class>
     </servlet>
     <servlet-mapping>
       <servlet-name>demo</servlet-name>
       <url-pattern>/demo</url-pattern>
     </servlet-mapping>
     ```

     ps: 一定要写在web-app标签中

     ![image-20210324130846832](/images/2021/tomcat-servlet/tomcat-servlet-23.png)

5. 运行项目
   - 点击运行，浏览器地址栏中加/demo
   - ![image-20210324180512244](/images/2021/tomcat-servlet/tomcat-servlet-24.png)


### 其他配置

- 这个地方只保留斜杠可以缩短地址栏![image-20210324181850981](/images/2021/tomcat-servlet/tomcat-servlet-25.png)

## Servlet的生命周期

> Servlet没有main()方法，不能独立运行，它的运行完全由Servlet引擎来控制和调度。所谓生命周期，指的是servlet容器何时创建servlet实例、何时调用其方法进行请求的处理、何时销毁其实例的整个过程。

Servlet的生命周期，servlet类加载–>实例化–>服务–>销毁

- 实例和初始化时机

  当请求到达容器时，容器查找该servlet对象是否存在，如果不存在，则会创建实例并进行初始化。

- 就绪/调用/服务阶段

  有请求到达容器，容器调用servlet对象的service()方法，处理请求的方法在整个生命周期中可以被多次调用；HttpServlet的service()方法，会依据请求方式来调用doGet()或者doPost()方法。但是，这两个do方法默认情况下，会抛出异常，需要子类去override。

- 销毁时机

  当容器关闭时(应用程序停止时)，会将程序中的Servlet实例进行销毁。

  上述的生命周期可以通过Servlet中的生命周期方法来观察。在Servlet中有三个生命周期方法，不由用户手动调用，而是在特定的时机有容器自动调用，观察这三个生命周期方法，即可观察到Servlet的生命周期。

三个方法：

### init方法

在Servlet实例创建之后执行(证明该Servlet有实例创建了)

```java
public void init(ServletConfig config) throws ServletException {
  System.out.println("创建了实例，只会执行一次");
}
```


### service方法

每次有请求到达某个Servlet方法时执行，用来处理请求(证明该Servlet进行服务了)

```java
protected void service(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
    System.out.println("调用了服务，可多次调用");
}
```


### init方法

Servlet实例销毁时执行(证明该Servlet的实例被销毁了)

```java
public void destroy() {
    System.out.println("服务器或应用关闭");
}
```


## HttpServletRequest对象

### 简介：

作用：用来接收客户端发送过来的请求信息

HttpServletRequest是ServletRequest的子接口，ServletRequest只有一个子接口，就是HttpServletRequest。提问：既然只有一个子接口，为什么不将两个接口合并为一个？

答：从长远来说，现在主要用的是HTTP协议，以后会出现更多新的协议，如果之后想要支持这种新的协议，只需要继承ServletRequest接口就可以了。

### 接受请求

#### 常用方法

##### 常用方法

| getRequestURL()  | 获取客户端发出请求时的完整URL            |
| ---------------- | ---------------------------------------- |
| getRequestURI(   | 获取请求行中的资源名称部分(项目名称开始) |
| getQueryString() | 获取请求行中的参数部分                   |
| getMethod()      | 获取客户端请求方式                       |
| getProtocol()    | 获取HTTP版本号                           |
| getContextPath() | 获取webapp名字                           |


##### 示例

```java
// 获取客户端请求的完整URL （从http开始，到?前面结束）
String url = request.getRequestURL().toString();
System.out.println("获取客户端请求的完整URL：" + url);
// 获取客户端请求的部分URL （从站点名开始，到?前面结束）
String uri = request.getRequestURI();
System.out.println("获取客户端请求的部分URL：" + uri);
// 获取请求行中的参数部分
String queryString = request.getQueryString();
System.out.println("获取请求行中的参数部分：" + queryString);
// 获取客户端的请求方式
String method = request.getMethod();
System.out.println("获取客户端的请求方式：" + method);
// 获取HTTP版本号
String protocol = request.getProtocol();
System.out.println("获取HTTP版本号：" + protocol);
// 获取webapp名字 （站点名）
String webapp = request.getContextPath();
System.out.println("获取webapp名字：" + webapp);
```


#### 获取请求参数

##### 方法

| \*\*                            | getParameter(name)       | 获取指定名称的参数 |
| ------------------------------- | ------------------------ | ------------------ |
| getParameterValues(String name) | 获取指定名称参数的所有值 | \*\*               |


##### 示例

```java
// 获取指定名称的参数，返回字符串
String uname = request.getParameter("uname");
System.out.println("uname的参数值：" + uname);
// 获取指定名称参数的所有参数值，返回数组
String[] hobbys = request.getParameterValues("hobby");
System.out.println("获取指定名称参数的所有参数值：" + Arrays.toString(hobbys));
```


### 请求乱码问题

Requests的编码方式为ISO-8859-1(此编码不支持中文)，所以解码时会出现乱码。可以设置Requests中的编码方式，告诉服务器以何种方式来解码，也可以在接收到乱码数据后，通过相应的编码还原数据。

#### 方法1

```java
request.setCharacterEncoding("UTF-8");
```

> 仅对post请求有效


#### 方法2

```java
new String(request.getParameter(name).getBytes("ISO-8859-1"),"UTF-8");
```

> Tomcat7及以下版本的GET请求会乱码，借助String方法，对任意请求都有效。但如果数据原本不乱吗，使用此方法会导致乱码。


### 请求转发

请求转发，是一种服务器的行为，当用户请求到达后，服务器进行转发，此时会将请求对象进行保存，地址栏中的URL地址不会改变，得到响应后，服务器端再将响应发送给客户端，从始至终只有一个请求发出。

实现方法如下：

```java
request.getRequestDispatcher(url).forward(request,response);
```

特点：

- 服务端行为
- 地址栏不发生改变

### request作用域

通过该对象可以在一个请求中传递数据，作用范围：在一次请求中有效(请求转发时有效)。

```java
// 设置域对象内容
request.setAttribute(String name, String value);
// 获取域对象内容
request.getAttribute(String name);
// 删除域对象内容
request.removeAttribute(String name);
```

## HttpServletResponse对象

接收用request对象，输出用response对象。

### 响应数据

接收到客户端请求后，可以通过 HttpServletResponse 对象直接进行响应，响应时需要获取输出流。
有两种形式：

```java
// getWriter() 字符输出流 （输出字符串）
// 获取字符输出流
PrintWriter writer = response.getWriter();
// 输出数据
writer.write("Hello");
```

```java
// getOutputStream() 字节输出流 （输出一切数据）
// 获取字节输出流
ServletOutputStream out = response.getOutputStream();
// 输出数据
out.write("Hello2".getBytes());
```

响应回的数据到客户端被浏览器解析。

> 注意：两者不能同时使用

### 响应乱码问题

在响应中，如果我们响应的内容中含有中文，则有可能出现乱码。这是因为服务器响应的数据也会经过网络传输，服务器端有一种编码方式，在客户端也存在一种编码方式，当量古达使用的编码方式不同时则出现乱码。

解决方法：

```java
// 设置服务端的编码格式
response.setCharacterEncoding("UTF-8");
// 设置客户端的编码格式
response.setHeader("content-type","text/html;charset=UTF-8");

// 同时设置客户端和服务端的编码格式
response.setContentType("text/html;charset=UTF-8");
```

### 重定向

重定向是由服务器指导的客户端的行为。客户端发出第一个请求，被服务器接收处理后，服务器会进行响应，在响应的同时，服务器会给客户端一个新的地址。

```java
// 重定向跳转到index.jsp
response.sendRedirect("index.jsp");
```

### 请求转发与重定向的区别

| 请求转发                        | 重定向                            |
| ------------------------------- | --------------------------------- |
| 一次请求，数据在request域中共享 | 两次请求，数据在request域中不共享 |
| 服务端行为                      | 客户端行为                        |
| 地址栏不发生变化                | 地址栏发生变化                    |
| 绝对地址定位到站点后            | 绝对地址可写到http://             |

## Cookie对象

Cookie可以将一些只需要保存在客户端，或只需要在客户端进行处理的出局，存储在本地，减少网络传输，提高网页处理的效率。如：记住密码等。

### Cookie的创建和发送

```java
// 创建Cookie对象
Cookie cookie = new Cookie("uname","zhangsan");
// 发送Cookie对象
response.addCookie(cookie);
```

### Cookie的获取

getCookies()方法不能指定获取某个cookie，只能获取由全部cookie组成的一个数组。如果向获取某个cookie，则需要遍历数组，并用Cookie的方法获取。

```java
// 获取Cookie数组
Cookie[] cookies = request.getCookies();
// 判断数组是否为空
if(cookies != null && cookies.length > 0){
  // 遍历Cookie数组
  for(Cookie cookie : cookies){
    System.out.println(cookie.getName());
    System.out.println(cookie.getValue());
  }
}
```

### Cookie的生存时间

通过设定Cookie的有效时间，可以减少一些隐私泄露的问题，默认情况下，Cookie在当前浏览器关闭时便失效。

生存时间取值有三种：

- 负整数(默认)

  表示不存储该cookie，当前浏览器关闭时该cookie就会从内存中消失。

- 正整数

  表示存储的秒数，cookie会保存到硬盘上。

- 零

  可以删除已经存储的cookie。

```java
// 设置方法
cookie.setMaxAge(1);// 在硬盘中存储1秒
```

### Cookie注意事项

1. Cookie仅保存在当前浏览器中

2. Cookie不能存储中文

   如果需要中文，则需要通过URLEncoder.encode编码和URLEncoder.decode解码

3. Cookie同名便会覆盖原有Cookie

4. 浏览器中存储Cookie有限制，一般只存少量数据

### Cookie存储路径

通过setPath()设置存储路径。

## HttpSession对象

HttpSession是一个接口，servlet容器使用此接口创建HTTP客户端的HTTP服务器之间的会话，服务器会为每一个用户创建一个独立的会话。

常用方法：

```java
// 获取session对象
HttpSession session = req.getSession();
// 获取session的会话标识符
String id = session.getId();
System.out.println(id);
// 获取session的创建时间
System.out.println(session.getCreationTime());
// 获取最后一次访问时间
System.out.println(session.getLastAccessedTime());
// 判断是否是新的session对象
System.out.println(session.isNew());
```

### Session标识符

Session用sessionid标识每个会话。每当一次请求到达服务器，如果开启了会话，服务器第一步会查看客户端是否回传了一个名叫JSESSIONID的cookie，如果有，则认为是之前标识过的一次会话，返回该session对象，达成数据共享；如果没有，则认为这是一次新的会话，重新创建一个新的session对象，并标志此次会话。

### Session域对象

Session用来表示一次会话，在一次会话中数据是可以共享的，这时session作为域对象存在，可以通过setAttribute(name,value)方法向域对象中添加数据，通过getAttribute(name)从域对象中获取数据，通过removeAttribute(name)从域对象中移除数据。

常用方法：

```java
// 获取session对象
HttpSession session = req.getSession();
// 设置session域对象
session.setAttribute("uname","zhangsan");
// 获取指定名称的session域对象
String uname = (String)req.getAttribute("uname");
// 移除指定名称session域对象
session.removeAttribute("uname");
```

- Session域 > request域

#### Session域对象的生命周期

Tomcat中session默认的存活时间为30min，当无操作时长达到session生存时间，会话便会结束。

自定义生命周期(单位：秒)：

```java
// 获取session对象
HttpSession session = request.getSession();
// 查看session的最大不活动时间
session.getMaxInactiveInterval();
// 设置session的最大不活动时间
session.setMaxInactiveInterval(10);// 无操作10秒关闭会话
```

## ServletContext对象

### ServletContext对象的获取

每一个 web 应用都有且仅有一个ServletContext 对象，又称 Application 对象，从名称中可知，该对象是与应用程 序相关的。在 WEB 容器启动的时候，会为每一个 WEB 应用程序创建一个对应的 ServletContext 对象。

作用：

- 第一、作为域对象用来共享数据，此时数据在整个应用程序中共享
- 第二、该对象中保存了当前应用程序相关信息。

```java
// 通过request对象获取
ServletContext servletContext = request.getServletContext();
// 通过session对象获取
ServletContext servletContext1 = request.getSession().getServletContext();
// 通过ServletConfig获取
ServletContext servletContext2 = getServletConfig().getServletContext();
// 直接获取
ServletContext servletContext3 = getServletContext();
```

常用方法：

```java
// 1.获取当前服务器的版本信息
String serverInfo = request.getServletContext().getServerInfo();
System.out.println(serverInfo);
// 2.获取真实路径
String realPath = request.getServletContext().getRealPath("/");
System.out.println(realPath);
```

### ServletContext域对象

ServletContext也可以当作域对象使用给，通过向ServletContext中存取数据，可以使整个应用程序共享某些数据。ServletContext中数据在服务器关闭后失效。

```java
// 获取ServletContext对象
ServletContext servletContext = req.getServletContext();
// 设置域对象
servletContext.setAttribute("name","zhangsan");
// 获取域对象
String name = (String)servletContext.getAttribute("name");
// 移除域对象
servletContext.removeAttribute("name");
```

## Servlet的三大域对象

1. request域对象

   在一次请求中有效。请求转发有效，重定向失效。

2. session域对象

   在一次会话中有效。请求转发有效，重定向失效。

3. context域对象

   在整个应用程序中有效。关闭服务器后失效。

# 待更新。。。

参考资料：

- [维基百科](https://zh.wikipedia.org/zh-hans/Java_Servlet)
- [b站Servlet教学视频](https://www.bilibili.com/video/BV1MX4y1G7ap)
