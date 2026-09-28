---
title: '你能看懂这些 JavaScript 表达式吗？'
description: '难蚌'
publish: 2025-07-31
update: 2025-07-31
cover: '/images/2025/magic-js/magic-js.png'
tags:
  - JavaScript
categories:
  - JavaScript
---

## 前言

在水群时看到了这张图无疑是难蚌的，那么问题来了，这些 JavaScript 表达式的结果为什么会这样？
实际上，这些结果并不是随机产生的。它们基本都可以归结为三件事：

1. JavaScript 的数字使用 IEEE 754 双精度浮点数表示
2. 运算符会触发隐式类型转换
3. 相同的符号在不同语法环境中可能有不同含义

理解了之后，图中的大部分“魔法”就只剩下机械推导，以下是关于原理的分析。

## 省流版

- `typeof NaN → "number"`：`NaN` 是数字类型里的特殊值。
- `9999999999999999 → 10000000000000000`：超过安全整数范围，被浮点数舍入。
- `0.5 + 0.1 == 0.6 → true`：两边最终保存成了同一个浮点数。
- `0.1 + 0.2 == 0.3 → false`：实际结果是 `0.30000000000000004`。
- `Math.max() → -Infinity`：没有参数时，最大值从负无穷开始。
- `Math.min() → Infinity`：没有参数时，最小值从正无穷开始。
- `[] + [] → ""`：两个空数组都转成空字符串后拼接。
- `[] + {} → "[object Object]"`：空数组变空字符串，对象变成对象字符串。
- `{} + [] → 0`：开头的 `{}` 可能被当作代码块，`+[]` 等于 `0`。
- `true + true + true === 3 → true`：参与加法时，`true` 会转成 `1`。
- `true - true → 0`：减法会把两个 `true` 都转成 `1`。
- `true == 1 → true`：`==` 会先把 `true` 转成 `1`。
- `true === 1 → false`：`===` 不转换类型，布尔值不等于数字。
- `(!+[] + [] + ![]).length → 9`：最终得到字符串 `"truefalse"`，长度为 `9`。
- `9 + "1" → "91"`：遇到字符串，`+` 执行字符串拼接。
- `91 - "1" → 90`：`-` 只做数字运算，会把 `"1"` 转成 `1`。
- `[] == 0 → true`：空数组先变成 `""`，再变成数字 `0`。

## 原理

### `typeof NaN` 为什么是 `"number"`

```js
typeof Number.NaN // "number"
```

`NaN` 是 `Not a Number` 的缩写，它不是一种独立的数据类型，而是 `Number` 类型中的一个特殊值，用来表示“本应得到数值，却无法得到有效数值”的结果：

比如：

```js
Number('hello') // NaN
Math.sqrt(-1) // NaN
0 / 0 // NaN
```

因此 `typeof NaN` 返回 `"number"` 完全符合 JavaScript 的类型系统。

判断一个值是否真的为 `NaN`，应该使用 `Number.isNaN()`：

```js
Number.isNaN(Number.NaN) // true
Number.isNaN('hello') // false
```

不要使用 `value === NaN`，因为 `NaN` 是唯一一个不等于自身的 JavaScript 值：

```js
Number.NaN === Number.NaN // false
```

### `9999999999999999` 为什么变成了 `10000000000000000`

```js
9999999999999999 // 10000000000000000
```

JavaScript 的 `Number` 以 64 位存储，但其中只有 53 位有效精度可用于表示整数。因此，它只能精确表示下面这个范围内的整数：

```js
Number.MIN_SAFE_INTEGER // -9007199254740991，即 -(2 ** 53 - 1)
Number.MAX_SAFE_INTEGER //  9007199254740991，即  (2 ** 53 - 1)
```

超过安全整数范围之后，并不是数字立即变成无穷大，而是某些相邻整数开始共用同一个浮点数表示：

```js
Number.MAX_SAFE_INTEGER + 1 === Number.MAX_SAFE_INTEGER + 2
// true
```

`9999999999999999` 无法被精确表示，只能舍入到最近的可表示值 `10000000000000000`。

需要精确保存大整数时，可以使用 `BigInt`：

```js
9999999999999999n // 9999999999999999n
```

不过 `BigInt` 不能与 `Number` 直接混算，也不能直接交给 `JSON.stringify()`，使用前要先设计好序列化边界。

### 为什么 `0.5 + 0.1 === 0.6`，而 `0.1 + 0.2 !== 0.3`

```js
0.5 + 0.1 === 0.6 // true
0.1 + 0.2 === 0.3 // false
```

这两个结果并不矛盾。

十进制中的有限小数，换成二进制后不一定仍然有限。就像十进制无法用有限位数精确写出 `1 / 3` 一样，二进制也无法用有限位数精确写出 `0.1` 和 `0.2`：

```txt
0.1₁₀ ≈ 0.00011001100110011…₂
```

计算机只能保存有限位，于是会把真实值舍入到附近一个可表示的二进制浮点数。

`0.5` 可以写成 `1 / 2`，在二进制中能够精确表示。`0.5 + 0.1` 经过舍入后，恰好与字面量 `0.6` 落在同一个可表示值上，所以严格相等。

而 `0.1` 与 `0.2` 各自的近似值相加后，结果落在 `0.30000000000000004`：

```js
0.1 + 0.2 // 0.30000000000000004
0.3 // 0.3
```

两边最终对应不同的浮点数，自然不会严格相等。问题不在 `===`，而在参与比较的数值本来就不同。

#### `toFixed()` 只负责展示

如果只是向用户展示一位小数，可以使用：

```js
const displayValue = (0.1 + 0.2).toFixed(1)

displayValue // "0.3"
typeof displayValue // "string"
```

需要注意：`toFixed()` 返回的是字符串，它没有提高原始数值的精度，也不应该作为后续计算的通用修复方案。它自身同样会受到输入值已经产生的二进制误差影响：

```js
1.005.toFixed(2) // "1.00"
```

因此可以按需求选择方案：

- **只做展示**：使用 `toFixed()` 或 `Intl.NumberFormat`。
- **判断两个计算结果是否足够接近**：使用符合业务量级的容差。
- **处理金额、税率等固定小数位数据**：在系统边界把十进制字符串转换为最小单位整数，或使用十进制计算库。
- **修正常见四则运算误差**：可以使用 `number-precision` 一类的库。

近似比较可以写成：

```js
function nearlyEqual(a, b, tolerance = Number.EPSILON) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b))
  return Math.abs(a - b) <= tolerance * scale
}

nearlyEqual(0.1 + 0.2, 0.3) // true
```

`Number.EPSILON` 表示 `1` 与下一个可表示浮点数之间的距离。数据量级越大、计算步骤越多，累计误差也可能越大，因此生产代码中的容差应由业务精度决定，而不是无条件套用 `Number.EPSILON`。

使用 `number-precision` 时，则可以明确表达“我要进行十进制语义下的四则运算”：

```js
import NP from 'number-precision'

NP.plus(0.1, 0.2) // 0.3
NP.round(0.105, 2) // 0.11
```

库不是无限精度的魔法。比如 `number-precision` 在把小数放大为整数时仍会检查安全整数边界；如果系统涉及高精度金融计算，应选择任意精度十进制库，并为舍入模式、精度和序列化方式制定统一规则。

### 为什么 `Math.max()` 是 `-Infinity`

```js
Math.max() // -Infinity
Math.min() // Infinity
```

可以把它们想象成一次归约：

```js
let max = -Infinity

for (const value of values)
  max = value > max ? value : max
```

为了让传入的任何有限数都能替换初始值，求最大值从 `-Infinity` 开始；求最小值则从 `Infinity` 开始。没有参数时，循环一次也没有执行，于是直接返回各自的初始值。

这也使它们满足实用的组合规则：

```js
Math.max(-Infinity, 3) // 3
Math.min(Infinity, 3) // 3
```

### `+` 为什么一会儿加法，一会儿拼接

`+` 是图中最忙的运算符。它既负责数值加法，也负责字符串拼接。

简化后的判断流程是：

1. 先把对象转换为原始值；
2. 只要有一边是字符串，就执行字符串拼接；
3. 否则把两边转换为数值并相加。

数组转原始值时，通常会走到 `toString()`：

```js
[].toString() // ""
  [1, 2].toString() // "1,2"
```

普通对象默认会得到：

```js
({}).toString() // "[object Object]"
```

所以：

```js
[] + []
// "" + ""
// ""

[] + {}
// "" + "[object Object]"
// "[object Object]"
```

同样的规则也解释了：

```js
`${9}1` // "91"
```

数字 `9` 被转换成字符串 `"9"`，随后发生拼接。

而 `-` 没有“字符串相减”这一分支，只会尝试数值运算：

```js
91 - '1'
// 91 - 1
// 90
```

### `{} + []` 等于 `0`，其实是控制台制造的错觉

图中这一行尤其值得单独说明：

```js
{} +[] // 0
```

当它作为一整条语句出现在某些浏览器控制台中时，开头的 `{}` 会被解析成一个空代码块，剩下的是：

```js
+[]
```

一元加号会把空数组转换成数值：

```js
Number([]) // 0
+ [] // 0
```

但只要明确告诉解析器“这是一个表达式”，结果就不同：

```js
({} + []) // "[object Object]"

const result = {} + []
result // "[object Object]"
```

所以 `{} + [] === 0` 不是一条可以脱离上下文记忆的 JavaScript 规则，而是“语句解析 + 类型转换”共同产生的结果。不同控制台也可能先对输入做额外包装，实验时最好把表达式放进括号或赋值语句。

### 布尔值为什么能参与计算

在数值转换中：

```js
Number(true) // 1
Number(false) // 0
```

因此：

```js
true + true + true === 3 // true
true - true // 0
```

`true == 1` 和 `true === 1` 的区别，则来自两种相等判断：

```js
true == 1 // true
true === 1 // false
```

宽松相等 `==` 会先进行类型转换，`true` 被转换成 `1`；严格相等 `===` 不进行这种跨类型转换，布尔值与数字的类型不同，所以结果为 `false`。

工程代码中应默认使用 `===`。只有在确实需要并完全理解宽松相等规则时，才使用 `==`。

### 为什么 `[] == 0`

```js
[] == 0 // true
```

这次是宽松相等规则在工作，推导过程如下：

```txt
[] == 0
"" == 0
0 == 0
true
```

空数组先转换为原始值 `""`，当字符串与数字进行宽松比较时，空字符串又被转换为数字 `0`。

严格相等不会进行这串转换：

```js
[] === 0 // false
```

### `(!+[] + [] + ![]).length` 为什么是 `9`

把这道“JavaScript 黑魔法”逐步展开：

```js
+[] // 0
!+[] // !0，也就是 true
![] // false，因为数组是对象，而所有对象都是真值
```

再根据 `+` 从左到右计算：

```js
!+[] + [] + ![]
true + [] + false`true${false}`
'truefalse'
```

`"truefalse"` 正好有 9 个字符：

```js
(!+[] + [] + ![]).length // 9
```

它不是语言能力的炫技，而是多个隐式转换叠在一起后的产物。生产代码如果需要读者这样推导，应该主动写出明确转换：

```js
String(true) + String(false) // "truefalse"
```

JavaScript 的这些行为确实容易踩坑，但并非没有规律。

> Thanks for inventing Javascript

## Reference

- [MDN：Number](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Number)

* [MDN：Number.EPSILON](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON)

- [MDN：Symbol.toPrimitive](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Symbol/toPrimitive)
