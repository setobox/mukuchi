---
title: '今天你 Duolingo 了吗？'
description: '利用 Cloudflare Workers 部署一个 Duolingo 每日打卡统计接口。'
publish: 2026-07-14
cover: '/images/2026/duolingo/duolingo.png'
tags:
  - API
  - Cloudflare
categories:
  - 工具
---

# 用 Cloudflare Workers 做一个 Duolingo 用户信息接口

最近想把自己的 Duolingo 连续学习天数放到个人主页上。

前端直接请求 Duolingo 接口会遇到跨域问题，而且页面每次打开都请求一次 Duolingo 也没有必要。于是决定在 Cloudflare Workers 中包一层接口，负责查询、整理和缓存数据（原接口数据量非常大，不做缓存会导致接口很慢）。

最终需要实现这些功能：

- 根据环境变量中的 `USERNAME` 查询固定用户
- 返回用户昵称、头像、经验和连续学习天数
- 支持查询其他用户
- 提供更完整的详情接口
- 使用 KV 缓存固定用户的数据
- 支持定时更新
- 支持带鉴权的手动刷新
- 处理常见的请求和上游错误

这里使用的是 Duolingo 自己使用的接口：

```text
https://www.duolingo.com/2017-06-30/users
```

它并不是一个有稳定版本承诺的公开 SDK，接口杂乱且数据量非常大，因此代码里将不会直接透传所有字段，只挑需要的数据返回。

---

## Minimal Viable Product

第一步只做一件事：

> 读取 Cloudflare Workers 中配置的 `USERNAME`，查询对应的 Duolingo 用户并返回基本信息。

接口暂时只有一个：

```text
GET /me
```

### 配置环境变量

进入 Cloudflare Worker：

```text
Settings
→ Variables and Secrets
→ Add
```

添加一个普通变量：

```text
USERNAME=你的 Duolingo 用户名
```

### 最小可用代码

```js
const DUOLINGO_API =
  'https://www.duolingo.com/2017-06-30/users'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

async function fetchUser(username) {
  const url = new URL(DUOLINGO_API)

  url.searchParams.set('username', username)

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Duolingo API returned ${response.status}`,
    )
  }

  const data = await response.json()

  const users = Array.isArray(data.users)
    ? data.users
    : []

  return users.find(
    user =>
      user.username?.toLowerCase() ===
      username.toLowerCase(),
  )
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      })
    }

    if (request.method !== 'GET') {
      return json(
        {
          error: 'method_not_allowed',
        },
        405,
      )
    }

    const url = new URL(request.url)

    if (url.pathname !== '/me') {
      return json(
        {
          error: 'not_found',
        },
        404,
      )
    }

    const username = env.USERNAME?.trim()

    if (!username) {
      return json(
        {
          error: 'missing_username_config',
        },
        500,
      )
    }

    try {
      const user = await fetchUser(username)

      if (!user) {
        return json(
          {
            error: 'user_not_found',
          },
          404,
        )
      }

      return json({
        id: user.id,
        username: user.username,
        name: user.name ?? null,
        picture: user.picture ?? null,
        streak: user.streak ?? 0,
        totalXp: user.totalXp ?? 0,
      })
    }
    catch {
      return json(
        {
          error: 'upstream_error',
        },
        502,
      )
    }
  },
}
```

部署后访问：

```text
https://你的-worker地址/me
```

应该能拿到类似的数据：

```json
{
  "id": 123456,
  "username": "example",
  "name": "Example",
  "picture": "//simg-ssl.duolingo.com/avatar/default_2/medium",
  "streak": 120,
  "totalXp": 32640
}
```

这里没有使用 `users[0]` 作为兜底。

Duolingo 的接口可能返回相似用户名。配置的用户不存在时，直接返回找不到，比误返回另一个人的信息更可靠。

---

## 整理返回数据

直接把 Duolingo 的原始用户对象返回给前端并不合适。

原始数据字段很多，结构也可能发生变化。接口应该只返回页面真正需要的内容。

先处理头像地址：

```js
function normalizePicture(picture) {
  if (!picture) {
    return null
  }

  if (picture.startsWith('//')) {
    return `https:${picture}`
  }

  return picture
}
```

Duolingo 的头像地址有时是这种格式：

```text
//simg-ssl.duolingo.com/...
```

浏览器可以识别这种协议相对地址，但 API 返回完整的 HTTPS 地址更方便使用。

再整理课程信息：

```js
function normalizeCourse(course) {
  if (!course) {
    return null
  }

  return {
    id: course.id ?? null,
    title: course.title ?? null,
    fromLanguage: course.fromLanguage ?? null,
    learningLanguage: course.learningLanguage ?? null,
    xp: course.xp ?? 0,
  }
}
```

当前课程不能只看课程数组的第一项。优先使用 `currentCourseId`，找不到时再根据正在学习的语言判断：

```js
function getCurrentCourse(user) {
  const courses = Array.isArray(user.courses)
    ? user.courses
    : []

  return (
    courses.find(
      course =>
        course.id === user.currentCourseId,
    ) ??
    courses.find(
      course =>
        course.learningLanguage ===
        user.learningLanguage,
    ) ??
    null
  )
}
```

这样可以把原始数据统一整理成相对稳定的接口格式。

---

## 增加搜索和详情接口

固定用户使用 `/me`，另外再增加两个接口：

```text
GET /search?username=用户名
GET /detail?username=用户名
```

它们的职责不同：

- `/search` 返回搜索结果列表和简略信息
- `/detail` 只返回完全匹配的用户和详细信息
- `/me` 返回环境变量中配置的固定用户

### 简略用户信息

```js
function summarizeUser(user) {
  return {
    id: user.id ?? null,
    username: user.username ?? null,
    name: user.name ?? null,
    picture: normalizePicture(user.picture),

    streak:
      user.streakData?.currentStreak?.length ??
      user.streak ??
      0,

    longestStreak:
      user.streakData?.longestStreak?.length ??
      user.longestStreak ??
      0,

    totalXp: user.totalXp ?? 0,

    currentCourse: normalizeCourse(
      getCurrentCourse(user),
    ),
  }
}
```

### 详细用户信息

```js
function detailUser(user) {
  const courses = Array.isArray(user.courses)
    ? user.courses
        .map(normalizeCourse)
        .filter(Boolean)
    : []

  return {
    id: user.id ?? null,
    username: user.username ?? null,
    name: user.name ?? null,
    picture: normalizePicture(user.picture),

    account: {
      createdAt: Number.isFinite(user.creationDate)
        ? new Date(
            user.creationDate * 1000,
          ).toISOString()
        : null,
      hasPlus: Boolean(user.hasPlus),
    },

    xp: {
      total: user.totalXp ?? 0,
      weekly: user.weeklyXp ?? 0,
      monthly: user.monthlyXp ?? 0,
    },

    streak: getStreakStatus(user),

    currentCourse: normalizeCourse(
      getCurrentCourse(user),
    ),

    courses,
  }
}
```

详情接口仍然使用精确用户名匹配：

```js
function findExactUser(users, username) {
  const normalizedUsername =
    username.toLowerCase()

  return users.find(
    user =>
      typeof user.username === 'string' &&
      user.username.toLowerCase() ===
        normalizedUsername,
  )
}
```

---

## 处理连续学习状态

只返回 `user.streak` 不一定够用。

页面通常还需要知道：

- 当前连续学习天数
- 历史最长连续天数
- 今天是否已经完成学习
- 当前连续记录的开始和结束日期

Duolingo 返回的数据里可能同时存在旧字段和新字段，因此需要做几层兜底。

```js
function getDateInTimezone(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    ).formatToParts(new Date())

    const value = type =>
      parts.find(
        part => part.type === type,
      )?.value ?? ''

    return `${value('year')}-${value('month')}-${value('day')}`
  }
  catch {
    return new Date()
      .toISOString()
      .slice(0, 10)
  }
}

function getStreakStatus(user) {
  const streakData =
    user.streakData &&
    typeof user.streakData === 'object'
      ? user.streakData
      : {}

  const current =
    streakData.currentStreak &&
    typeof streakData.currentStreak === 'object'
      ? streakData.currentStreak
      : {}

  const timezone =
    user.timezone ??
    streakData.updatedTimeZone ??
    'UTC'

  const statusDate =
    getDateInTimezone(timezone)

  const completedToday =
    user.streak_today_increase === true ||
    user.streak_today_increase === 1 ||
    user.streak_extended_today === true ||
    current.lastExtendedDate === statusDate ||
    current.endDate === statusDate

  const previous =
    streakData.previousStreak &&
    typeof streakData.previousStreak === 'object'
      ? streakData.previousStreak
      : null

  const longest =
    streakData.longestStreak &&
    typeof streakData.longestStreak === 'object'
      ? streakData.longestStreak
      : null

  return {
    completedToday,
    statusDate,

    current: {
      length:
        current.length ??
        streakData.length ??
        user.streak ??
        0,
      startDate: current.startDate ?? null,
      endDate: current.endDate ?? null,
    },

    previous: previous
      ? {
          length: previous.length ?? 0,
          startDate:
            previous.startDate ?? null,
          endDate:
            previous.endDate ?? null,
        }
      : null,

    longest: {
      length:
        longest?.length ??
        user.longestStreak ??
        0,
      startDate:
        longest?.startDate ?? null,
      endDate:
        longest?.endDate ?? null,
      achievedDate:
        longest?.achieveDate ?? null,
    },

    xpGoal: streakData.xpGoal ?? null,
  }
}
```

判断“今天是否完成”时需要使用用户所在时区。

如果直接使用服务器当前日期，亚洲用户在 UTC 日期切换前后可能会得到错误结果。

---

## 给固定用户增加 KV 缓存

个人主页可能每次打开都会请求 `/me`。

用户数据不需要每次都从 Duolingo 获取，因此可以使用 Cloudflare KV 保存查询结果。

先创建一个 KV Namespace，然后绑定到 Worker：

```text
Variable name: DUO_CACHE
```

缓存键包含用户名：

```js
function getMeCacheKey(env) {
  return `me:${env.USERNAME.trim().toLowerCase()}:profile`
}
```

更新缓存：

```js
const CACHE_TTL = 2 * 60 * 60

async function updateMe(env) {
  const username = env.USERNAME.trim()
  const user = await fetchExactUser(username)

  const result = {
    ...detailUser(user),
    updatedAt: new Date().toISOString(),
  }

  await env.DUO_CACHE.put(
    getMeCacheKey(env),
    JSON.stringify(result),
    {
      expirationTtl: CACHE_TTL,
    },
  )

  return result
}
```

读取缓存：

```js
let data = await env.DUO_CACHE.get(
  getMeCacheKey(env),
  'json',
)

if (!data) {
  data = await updateMe(env)
}
```

这里有两种缓存：

第一种是 KV 缓存，减少 Worker 请求 Duolingo 的次数。

第二种是响应头中的浏览器缓存：

```text
Cache-Control: public, max-age=300
```

它允许浏览器在五分钟内直接使用本地响应。

KV 缓存和浏览器缓存解决的是不同问题，不能互相替代。

---

## 增加手动刷新

有时刚完成当天学习，希望页面马上更新，而不是等待缓存过期。

可以提供：

```text
GET /me?refresh=1
```

不过刷新接口会直接请求 Duolingo 并写入 KV，不能完全公开。

在 Cloudflare 中添加一个 Secret：

```text
REFRESH_TOKEN=一段足够长的随机字符串
```

检查请求头：

```js
function assertRefreshAuthorized(request, env) {
  const token = env.REFRESH_TOKEN

  if (!token) {
    throw new HttpError(
      500,
      'server_misconfigured',
      'Missing REFRESH_TOKEN secret',
    )
  }

  const authorization =
    request.headers.get('Authorization')

  if (authorization !== `Bearer ${token}`) {
    throw new HttpError(
      401,
      'unauthorized',
      '刷新操作需要 Bearer Token',
      {
        'WWW-Authenticate': 'Bearer',
      },
    )
  }
}
```

调用方式：

```bash
curl \
  -H "Authorization: Bearer 你的刷新密钥" \
  "https://你的-worker地址/me?refresh=1"
```

普通请求仍然不需要鉴权：

```text
GET /me
```

代码中只接受：

```text
refresh=1
```

下面这些参数不会触发刷新：

```text
refresh=false
refresh=yes
refresh=123
```

强制刷新响应使用：

```text
Cache-Control: no-store
```

否则浏览器可能直接使用之前缓存的刷新响应，请求根本到不了 Worker。

---

## 使用 Cron 定时更新

手动刷新只是补充，正常情况下应该由定时任务更新缓存。

在 Worker 中添加 Cron Trigger：

```text
0 * * * *
```

表示每小时执行一次。

Worker 中增加 `scheduled` 方法：

```js
scheduled(_event, env, ctx) {
  ctx.waitUntil(updateMe(env))
}
```

这样即使长时间没有人访问 `/me`，KV 中的数据也会保持更新。

第一次访问时如果 KV 还是空的，接口会立即请求 Duolingo 初始化，不需要等待下一次 Cron。

---

## 增加超时和简单错误处理

上游请求不能无限等待。

这里给 Duolingo 请求设置八秒超时：

```js
const UPSTREAM_TIMEOUT = 8_000

const response = await fetch(url, {
  headers: {
    Accept: 'application/json',
  },
  signal: AbortSignal.timeout(
    UPSTREAM_TIMEOUT,
  ),
})
```

错误处理不需要做得很重，但至少应该区分：

- 参数错误：`400`
- 未授权刷新：`401`
- 用户不存在：`404`
- 请求过于频繁：`429`
- Worker 配置错误：`500`
- Duolingo 请求失败：`502`
- Duolingo 请求超时：`504`

使用一个简单的错误类即可：

```js
class HttpError extends Error {
  constructor(
    status,
    code,
    message = code,
    headers = {},
  ) {
    super(message)

    this.status = status
    this.code = code
    this.headers = headers
  }
}
```

---

## 完整代码

下面是整理后的完整版本，可以直接粘贴到 Cloudflare Workers。

```js
const DUOLINGO_API =
  'https://www.duolingo.com/2017-06-30/users'

const CACHE_TTL = 2 * 60 * 60
const UPSTREAM_TIMEOUT = 8_000
const USERNAME_MAX_LENGTH = 64

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods':
    'GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

class HttpError extends Error {
  constructor(
    status,
    code,
    message = code,
    headers = {},
  ) {
    super(message)

    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.headers = headers
  }
}

function json(
  data,
  status = 200,
  cacheControl = 'no-store',
  headers = {},
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        ...headers,
        'Content-Type':
          'application/json; charset=utf-8',
        'Cache-Control': cacheControl,
      },
    },
  )
}

function isRecord(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value),
  )
}

function getMeUsername(env) {
  const username = env.USERNAME?.trim()

  if (!username) {
    throw new HttpError(
      500,
      'server_misconfigured',
      'Missing USERNAME environment variable',
    )
  }

  return username
}

function getMeCacheKey(env) {
  return `me:${getMeUsername(env).toLowerCase()}:profile`
}

function getRequestUsername(url) {
  const username =
    url.searchParams
      .get('username')
      ?.trim()

  if (!username) {
    throw new HttpError(
      400,
      'missing_username',
      '请提供 ?username=用户名',
    )
  }

  if (
    username.length >
    USERNAME_MAX_LENGTH
  ) {
    throw new HttpError(
      400,
      'invalid_username',
      `用户名长度不能超过 ${USERNAME_MAX_LENGTH} 个字符`,
    )
  }

  return username
}

function assertRefreshAuthorized(
  request,
  env,
) {
  const token = env.REFRESH_TOKEN

  if (!token) {
    throw new HttpError(
      500,
      'server_misconfigured',
      'Missing REFRESH_TOKEN secret',
    )
  }

  const authorization =
    request.headers.get(
      'Authorization',
    )

  if (
    authorization !==
    `Bearer ${token}`
  ) {
    throw new HttpError(
      401,
      'unauthorized',
      '刷新操作需要 Bearer Token',
      {
        'WWW-Authenticate': 'Bearer',
      },
    )
  }
}

function normalizePicture(picture) {
  if (!picture) {
    return null
  }

  if (picture.startsWith('//')) {
    return `https:${picture}`
  }

  return picture
}

function normalizeCourse(course) {
  if (!isRecord(course)) {
    return null
  }

  return {
    id: course.id ?? null,
    title: course.title ?? null,
    fromLanguage:
      course.fromLanguage ?? null,
    learningLanguage:
      course.learningLanguage ?? null,
    xp: course.xp ?? 0,
  }
}

function getCurrentCourse(user) {
  const courses = Array.isArray(
    user.courses,
  )
    ? user.courses.filter(isRecord)
    : []

  return (
    courses.find(
      course =>
        course.id ===
        user.currentCourseId,
    ) ??
    courses.find(
      course =>
        course.learningLanguage ===
        user.learningLanguage,
    ) ??
    null
  )
}

function getDateInTimezone(timeZone) {
  try {
    const parts =
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        },
      ).formatToParts(new Date())

    const value = type =>
      parts.find(
        part => part.type === type,
      )?.value ?? ''

    return `${value('year')}-${value('month')}-${value('day')}`
  }
  catch {
    return new Date()
      .toISOString()
      .slice(0, 10)
  }
}

function getStreakStatus(user) {
  const streakData = isRecord(
    user.streakData,
  )
    ? user.streakData
    : {}

  const current = isRecord(
    streakData.currentStreak,
  )
    ? streakData.currentStreak
    : {}

  const previous = isRecord(
    streakData.previousStreak,
  )
    ? streakData.previousStreak
    : null

  const longest = isRecord(
    streakData.longestStreak,
  )
    ? streakData.longestStreak
    : null

  const timezone =
    user.timezone ??
    streakData.updatedTimeZone ??
    'UTC'

  const statusDate =
    getDateInTimezone(timezone)

  const completedToday =
    user.streak_today_increase === true ||
    user.streak_today_increase === 1 ||
    user.streak_extended_today === true ||
    current.lastExtendedDate ===
      statusDate ||
    current.endDate === statusDate

  return {
    completedToday,
    statusDate,

    current: {
      length:
        current.length ??
        streakData.length ??
        user.streak ??
        0,
      startDate:
        current.startDate ?? null,
      endDate:
        current.endDate ?? null,
    },

    previous: previous
      ? {
          length:
            previous.length ?? 0,
          startDate:
            previous.startDate ?? null,
          endDate:
            previous.endDate ?? null,
        }
      : null,

    longest: {
      length:
        longest?.length ??
        user.longestStreak ??
        0,
      startDate:
        longest?.startDate ?? null,
      endDate:
        longest?.endDate ?? null,
      achievedDate:
        longest?.achieveDate ??
        null,
    },

    xpGoal:
      streakData.xpGoal ?? null,
  }
}

// /search 使用的简略信息
function summarizeUser(user) {
  return {
    id: user.id ?? null,
    username:
      user.username ?? null,
    name: user.name ?? null,
    picture:
      normalizePicture(user.picture),

    streak:
      user.streakData?.currentStreak
        ?.length ??
      user.streak ??
      0,

    longestStreak:
      user.streakData?.longestStreak
        ?.length ??
      user.longestStreak ??
      0,

    totalXp: user.totalXp ?? 0,

    currentCourse: normalizeCourse(
      getCurrentCourse(user),
    ),
  }
}

// /detail 和 /me 使用的详细信息
function detailUser(user) {
  const courses = Array.isArray(
    user.courses,
  )
    ? user.courses
        .map(normalizeCourse)
        .filter(Boolean)
    : []

  return {
    id: user.id ?? null,
    username:
      user.username ?? null,
    name: user.name ?? null,
    picture:
      normalizePicture(user.picture),

    account: {
      createdAt: Number.isFinite(
        user.creationDate,
      )
        ? new Date(
            user.creationDate * 1000,
          ).toISOString()
        : null,
      hasPlus:
        Boolean(user.hasPlus),
    },

    xp: {
      total:
        user.totalXp ?? 0,
      weekly:
        user.weeklyXp ?? 0,
      monthly:
        user.monthlyXp ?? 0,
    },

    streak:
      getStreakStatus(user),

    currentCourse:
      normalizeCourse(
        getCurrentCourse(user),
      ),

    courses,
  }
}

async function fetchUsers(username) {
  const url =
    new URL(DUOLINGO_API)

  url.searchParams.set(
    'username',
    username,
  )

  let response

  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(
        UPSTREAM_TIMEOUT,
      ),
    })
  }
  catch (error) {
    if (
      error?.name ===
        'AbortError' ||
      error?.name ===
        'TimeoutError'
    ) {
      throw new HttpError(
        504,
        'upstream_timeout',
        'Duolingo 请求超时',
      )
    }

    throw new HttpError(
      502,
      'upstream_error',
      '请求 Duolingo 失败',
    )
  }

  if (!response.ok) {
    throw new HttpError(
      502,
      'upstream_error',
      `Duolingo API returned ${response.status}`,
    )
  }

  let data

  try {
    data = await response.json()
  }
  catch {
    throw new HttpError(
      502,
      'invalid_upstream_response',
      'Duolingo 返回了无效 JSON',
    )
  }

  if (
    !isRecord(data) ||
    !Array.isArray(data.users)
  ) {
    throw new HttpError(
      502,
      'invalid_upstream_response',
      'Duolingo 返回结构异常',
    )
  }

  return data.users.filter(isRecord)
}

function findExactUser(
  users,
  username,
) {
  const normalizedUsername =
    username.toLowerCase()

  return users.find(
    user =>
      typeof user.username ===
        'string' &&
      user.username.toLowerCase() ===
        normalizedUsername,
  )
}

async function fetchExactUser(
  username,
) {
  const users =
    await fetchUsers(username)

  const user =
    findExactUser(
      users,
      username,
    )

  if (!user) {
    throw new HttpError(
      404,
      'user_not_found',
      `User "${username}" not found`,
    )
  }

  return user
}

async function updateMe(env) {
  const username =
    getMeUsername(env)

  const user =
    await fetchExactUser(username)

  const result = {
    ...detailUser(user),
    updatedAt:
      new Date().toISOString(),
  }

  await env.DUO_CACHE.put(
    getMeCacheKey(env),
    JSON.stringify(result),
    {
      expirationTtl:
        CACHE_TTL,
    },
  )

  return result
}

export default {
  async fetch(request, env) {
    if (
      request.method ===
      'OPTIONS'
    ) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      })
    }

    if (
      request.method !== 'GET'
    ) {
      return json(
        {
          error:
            'method_not_allowed',
        },
        405,
        'no-store',
        {
          Allow: 'GET, OPTIONS',
        },
      )
    }

    const url =
      new URL(request.url)

    try {
      // 固定用户，每小时更新
      if (
        url.pathname === '/me'
      ) {
        // 是否强制刷新
        const refresh =
          url.searchParams.get(
            'refresh',
          )

        if (
          refresh !== null &&
          refresh !== '1'
        ) {
          throw new HttpError(
            400,
            'invalid_refresh',
            'refresh 参数仅支持 1',
          )
        }

        const shouldRefresh =
          refresh === '1'

        if (shouldRefresh) {
          assertRefreshAuthorized(
            request,
            env,
          )
        }

        let data = null

        if (!shouldRefresh) {
          data =
            await env.DUO_CACHE.get(
              getMeCacheKey(env),
              'json',
            )
        }

        // 第一次访问时立即初始化，不用等待 Cron
        if (!data) {
          data =
            await updateMe(env)
        }

        return json(
          data,
          200,
          shouldRefresh
            ? 'no-store'
            : 'public, max-age=300',
        )
      }

      // 简略搜索
      if (
        url.pathname ===
        '/search'
      ) {
        const username =
          getRequestUsername(url)

        const users =
          await fetchUsers(username)

        return json(
          {
            query: username,
            count:
              users.length,
            users:
              users.map(
                summarizeUser,
              ),
            updatedAt:
              new Date()
                .toISOString(),
          },
          200,
          'public, max-age=300',
        )
      }

      // 详细搜索
      if (
        url.pathname ===
        '/detail'
      ) {
        const username =
          getRequestUsername(url)

        const user =
          await fetchExactUser(
            username,
          )

        return json(
          {
            query: username,
            user:
              detailUser(user),
            updatedAt:
              new Date()
                .toISOString(),
          },
          200,
          'public, max-age=300',
        )
      }

      return json(
        {
          error: 'not_found',
        },
        404,
      )
    }
    catch (error) {
      console.error(error)

      if (
        error instanceof
        HttpError
      ) {
        return json(
          {
            error: error.code,
            message:
              error.message,
          },
          error.status,
          'no-store',
          error.headers,
        )
      }

      return json(
        {
          error:
            'internal_error',
          message:
            '服务暂时不可用',
        },
        500,
      )
    }
  },

  // cron 定时方法
  scheduled(_event, env, ctx) {
    ctx.waitUntil(
      updateMe(env),
    )
  },
}
```

---

## Cloudflare 中需要配置的内容

### 普通环境变量

```text
USERNAME
```

值为固定查询的 Duolingo 用户名。

### Secret

```text
REFRESH_TOKEN
```

用于保护强制刷新接口，不要直接写在代码中。

### KV Binding

```text
DUO_CACHE
```

用于缓存 `/me` 的用户数据。

### Cron Trigger

```text
0 * * * *
```

每小时更新一次固定用户的数据。

---

## 接口列表

查询固定用户：

```text
GET /me
```

强制刷新固定用户：

```text
GET /me?refresh=1
Authorization: Bearer REFRESH_TOKEN
```

搜索用户：

```text
GET /search?username=用户名
```

查询精确用户详情：

```text
GET /detail?username=用户名
```

这个版本已经能满足个人主页、状态卡片或者博客组件的使用需求。

继续往下扩展时，可以考虑限制允许访问的域名、给公开搜索接口增加限流，或者把响应格式抽成固定版本，避免上游字段变化直接影响前端。

## Reference

- [getDuolingoStreak() — Lean Rada](https://leanrada.com/notes/get-duolingo-streak/)。
