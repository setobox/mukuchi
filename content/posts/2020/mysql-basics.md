---
title: MySQL 基础
description: '从数据库系统概念到建库建表、约束与增删改查，整理 MySQL 入门阶段需要掌握的基础。'
tags:
  - mysql
  - 数据库
categories:
  - 笔记
cover: '/images/2020/mysql-basics/mysql-basics.png'
publish: 2020-06-05
---

# MySQL 介绍

## 简介

百度百科：

> MySQL 是一个关系型数据库管理系统，由瑞典 MySQL AB 公司开发，属于 Oracle 旗下产品。MySQL 是最流行的关系型数据库管理系统之一，在 WEB 应用方面，MySQL 是最好的 RDBMS (Relational Database Management System，关系数据库管理系统) 应用软件之一。
> MySQL 是一种关系型数据库管理系统，关系数据库将数据保存在不同的表中，而不是将所有数据放在一个大仓库内，这样就增加了速度并提高了灵活性。

## 数据库系统概述

### 数据库

数据库（DataBase，DB）是以一定的组织方式将相关的数据组织在一起存放在计算机外存储器上，并能为多个用户共享的与应用程序彼此独立的一组相关数据的集合。它不仅包括描述事物的数据本身，而且包括相关事物之间的联系。对数据库中数据的增加、删除、修改和检索等操作，由数据库管理系统进行统一控制。

### 数据库管理系统

数据库管理系统（DataBase Management System，DBMS）是为数据库的建立、使用和维护而配置的软件，它提供了安全性和完整性等统一控制机制，方便用户管理和存取大量的数据资源。例如，MySQL 就是计算机上使用的一种数据库管理系统。

数据库管理系统的主要功能包括以下几个方面：

- 数据定义功能
- 数据操纵功能
- 数据库的运行管理
- 数据库的建立和维护功能

### 数据库系统

数据库系统（DataBase System，DBS）是指引进数据库技术后的计算机系统，能实现有组织地、动态地存储大量相关数据，提供数据处理和信息资源共享的便利手段。由 5 部分组成：硬件系统、数据库集合、数据库管理系统及相关软件、数据库管理员（DataBase Administrator，DBA）和用户。其中，数据库管理系统是数据库系统的核心。

### 数据库应用系统

数据库应用系统（DataBase Application System，DBAS）是指系统开发人员利用数据库系统资源开发出来的，面向某一类信息处理问题而建立的软件系统，例如，以数据库为基础的学籍管理系统等。

## 数据库系统的特点

数据库系统的主要特点如下：

1. **数据结构化**：数据结构化是数据库系统与文件系统的根本区别。
2. **数据的共享性高，冗余度低，易于扩充**：数据共享减少了数据冗余，而且解决了重复存储时经常发生的因不同应用修改数据的不同副本而造成的数据不一致问题。
3. **数据独立性强**：包括物理独立性和逻辑独立性。
4. **数据统一管理和控制**：为保证数据库数据的正确性和有效性，数据库系统提供了安全性控制、完整性控制、并发性控制、数据库恢复。

# MySQL 安装与配置

下面的链接介绍的非常详细了，避免篇幅过长具体不再重复赘述。

<a href="https://www.runoob.com/w3cnote/windows10-mysql-installer.html" target="_blank">点击查看安装教程</a>

记住改好的密码，每次打开都需要登陆。

```
命令格式: mysql -u 用户名 -p 密码
例如:     mysql -u root -p password
```

# 数据库的创建与管理

## MySQL 数据库简介

### 数据库的构成

MySQL 数据库主要分为系统数据库、示例数据库和用户数据库。 1.系统数据库

sys 数据库:

- information_schema 数据库
- performance_schema 数据库
- mysql 数据库

示例数据库:

- sakila 和 world 示例数据库是完整的示例。

用户数据库:

- 自己创建的

### 数据库文件

数据库管理的核心任务包括创建、操作和支持数据库。在 MySQL 中，每个数据库都对应存放在一个与数据库同名的文件夹中。MySQL 数据库文件有“.FRM”、“.MYD”和“.MYI”3 种文件，其中“.FRM”是描述表结构的文件，“.MYD”是表的数据文件，“.MYI”是表数据文件中的索引文件。

### 数据库对象

MySQL 数据库中的数据在逻辑上被组织成一系列数据库对象，这些数据库对象包括：表、视图、约束、索引、存储过程、触发器、用户定义函数、用户和角色。

## 管理数据库

### 创建

SQL 语句创建用户数据库其语法格式如下：
`CREATE {DATABASE|SCHEMA}[IF NOT EXISTS] <数据库文件名>`
例如:

```
#创建名为D_sample的数据库
create datebase D_sample;

#为避免因重复创建时系统显示的错误信息,可使用:
create database if not exists D_sample;
```

### 查看已有的数据库

其语法格式如下：
SHOW DATABASES;
例如:

```
show databases;
```

### 打开数据库

在对某数据库操作前需要先选中
例如: 打开 D_sample 数据库:

```
use D_sample;
```

### 修改数据库

修改数据库 D_sample 的默认字符集和校对规则。

```
alter database D_sample
  default character set=gbk
  default collate=gbk_chinese_ci;
```

### 删除数据库

删除 D_sample 数据库:

```
drop database D_sample1;
```

## MySQL 图形化管理工具

使用图形化管理工具，可让操作变得更简单直接。
常用的有 Workbench、Navicat、SQLyog 等等很多。

# 表的创建与管理

数据表是数据库中最重要的对象，用于存储数据库中的所有数据。因此，数据表的设计与实现将直接影响数据库能否合理高效地使用。

## 简介

在 MySQL 中，表用于存储实体集和实体间联系的数据。一个表就是一个关系，表实质上就是行列的集合，每一行代表一条记录，每一列代表记录的一个字段。在 MySQL 数据库中，表通常具有以下几个特点：

1. 表通常代表一个实体
2. 表由行和列组成
3. 行值在同一个表中具有唯一性
4. 字段名在同一个表中具有唯一性
5. 行和列的无序性

## 数据类型

| 数据类型       | 系统数据类型                          |
| -------------- | ------------------------------------- |
| 整数型         | TINYINT,SMALLINT,MEDIUMINT,INT,BIGINT |
| 精确数值型     | DECIMAL\(M,D\),NUMERIC\(M,D\)         |
| 浮点型         | FLOAT, REAL,DOUBLE                    |
| 位型           | BIT                                   |
| 二进制型       | BINARY,VARBINARY                      |
| 字符型         | CHAR,VARCHAR,BLOB,TEXT,ENUM,SET       |
| Unicode 字符型 | NCHAR,NVARCHAR                        |
| 文本型         | TINYTEXT,TEXT,MEDIUMTEXT,LONGTEXT     |
| BLOB 类型      | TINYBLOB,BLOB,MEDIUMBLOB,LONGBLOB     |
| 日期时间型     | DATETIME,DATE,TIMESTAMP,TIME,YEAR     |

## 数据表操作

### 创建数据表

创建数据表的语法格式如下：

`CREATE [TEMPORARY] TABLE [IF NOT EXISTS] <表名>`
`[(<字段名> <数据类型> [完整性约束条件][,…])][表的选项];`
例如:

```
use D_sample;
create table student
( #设置主键约束
学号 char(9) primary key,
姓名 varchar(10),
性别 char(2),
出生日期 date,
民族 varchar(10),
政治面貌 varchar(8)
);
```

### 查看表的信息

查看信息:SHOW TABLES;
例如:

```
show tables;
```

查看表:`{DESCRIBE |DESC}<表名> [字段名];`
例如查看 D_sample 数据库中 student 表的信息:

```
desc student;
```

修改表:`ALTER TABLE <表名>`

```
alter table student #添加字段
add 专业 char(30);
#course 表中的学分字段的数据类型改为 smallint
modify 学分 smallint; #删除字段
drop column 专业; #重命名表
rename as stu;
```

### 删除表

删除表语法格式如下:
`DROP [TEMPORARY] TABLE [IF EXISTS] <表名> [,<表名>...];`

```
drop table student;
```

## 表数据操作

### 添加数据

`INSERT INTO <表名> [<字段名>[,…]]VALUES (<常量>[,…]);`

向数据库 D_sample 的 student 表中添加数据:

```
insert into student
values('201839001','刘一','女','1998-07-07','汉族','共青团员');
insert into student
values('201839002','陈二','男','2000-06-12','汉族','共青团员');
insert into student
values('201839003','张三','男','1899-03-29','汉族','中共党员');
values('201839003','李四','男','2000-01-25','汉族','共青团员');
values('201839003','王五','男','1999-08-24','汉族','共青团员');
values('201839003','赵六','男','1999-07-14','汉族','共青团员');
values('201839003','孙七','男','1999-02-14','汉族','共青团员');
values('201839003','周八','男','1999-01-06','汉族','共青团员');
```

向数据库 D_sample 的 course 表中添加数据:

```
insert into course
values('07001','计算机应用基础','掌握计算机基本操作',4,4,'1');
insert into course
values('07002','计算机网络技术基础','掌握计算机网络应用',4,4,'1');
insert into course
values('07003','数据库技术基础','掌握数据库系统设计',4,4,'2');
```

### 更新数据

修改表中数据语法格式如下:
`UPDATE <表名>`
`SET <字段名>=<表达式>[,…][where <条件>];`
例如:
将 student 表中姓名值为“周八”的出生日期改为“1999-02-01”

```
update student
set 出生日期='1999-02-01'
where 姓名='周八';
```

### 删除数据

删除表中数据语法格式如下:
`DELETE FROM <表名>`
`[WHERE<条件>];`

# 总结

参考：
菜鸟教程、MySQL 数据库应用与实践教程

