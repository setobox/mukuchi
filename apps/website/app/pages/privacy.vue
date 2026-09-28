<script setup lang="ts">
definePageMeta({ section: 'about', pageKind: 'index', pageTitle: '账号隐私说明' })
useSeoMeta({ title: '账号隐私说明', description: '本站账号登录、邮箱验证与个人资料的使用说明。' })
</script>

<template>
  <div>
    <PageHeading title="账号隐私说明" />
    <SiteColumns>
      <article class="max-w-190 border-t border-line py-8 leading-8 lg:px-6">
        <p class="mb-8 text-muted">
          更新日期：2026 年 9 月 28 日。本说明适用于 blog.setobox.me 的账号与登录服务。浏览公开文章无需注册账号。
        </p>
        <h2 class="mb-3 text-section text-heading">
          收集哪些信息
        </h2>
        <p class="mb-6">
          经你授权后，本站从 GitHub 或 Google 获取平台用户标识、昵称、头像和已验证邮箱，用于创建账号、登录、关联同一邮箱下的身份和判断本站管理权限。本站不请求读取你的邮件、云端文件或代码仓库内容作为登录权限，也不接收你的 GitHub 或 Google 密码。
        </p>
        <h2 class="mb-3 text-section text-heading">
          邮箱与验证码
        </h2>
        <p class="mb-6">
          部分 Google 第三方邮箱注册需要额外验证。本站通过 Resend 将验证码发送到你授权的邮箱；Resend 会处理收件地址、邮件内容及投递状态。验证码十分钟有效，服务端保存验证码摘要，并使用邮箱和 IP 地址的摘要限制发送频率。
        </p>
        <h2 class="mb-3 text-section text-heading">
          会话和存储
        </h2>
        <p class="mb-6">
          账号资料保存在本站使用的 Cloudflare D1 数据库中。浏览器通过必要的 HttpOnly Cookie 保持登录，登录会话七天有效，退出后当前会话在服务端撤销。OAuth 请求和待验证流程使用短期 Cookie 与服务端记录。第三方访问令牌仅在登录验证期间使用，不作长期保存。头像由浏览器向相应图片服务加载，因此图片服务会收到加载请求。
        </p>
        <h2 class="mb-3 text-section text-heading">
          数据用途和第三方服务
        </h2>
        <p class="mb-6">
          Google 用户数据仅用于上述账号功能，不出售、不用于广告画像或模型训练。本站使用 Google、GitHub 提供身份认证，使用 Cloudflare 托管网站和数据库，使用 Resend 发送验证码。网站运行日志和访问统计用于维护服务与排查故障；第三方服务也会按照各自政策处理其提供服务所需的数据。
        </p>
        <h2 class="mb-3 text-section text-heading">
          你的选择与联系
        </h2>
        <p class="mb-6">
          你可以随时退出本站，并在 Google 或 GitHub 的应用授权设置中撤销授权。撤销平台授权不会自动删除已创建的本站账号。如需查询、更正或删除账号资料，请联系 <a class="text-link" href="mailto:setoboxes@gmail.com">setoboxes@gmail.com</a>。账号资料在账号存续期间保留；为避免误删，处理请求时需要确认账号归属。
        </p>
        <NuxtLink to="/posts" class="text-link">
          返回文章列表
        </NuxtLink>
      </article>
    </SiteColumns>
  </div>
</template>
