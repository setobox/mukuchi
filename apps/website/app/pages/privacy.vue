<script setup lang="ts">
definePageMeta({ section: 'about', pageKind: 'index', pageTitle: '隐私与存储说明' })
useSeoMeta({ title: '隐私与存储说明', description: '本站账号、AI 助手与本地会话记录的使用说明。' })
</script>

<template>
  <div>
    <PageHeading title="隐私与存储说明" />
    <SiteColumns>
      <article class="max-w-190 border-t border-line py-8 leading-8 lg:px-6">
        <p class="mb-8 text-muted">
          更新日期：2026 年 9 月 30 日。本说明适用于 blog.setobox.me 的账号、登录与 AI 助手服务。浏览公开文章无需注册账号。
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
          AI 助手与本地历史
        </h2>
        <p class="mb-6">
          助手启用后，聊天记录保存在当前浏览器的 IndexedDB 中，不自动过期，由你在会话列表中手动删除。匿名状态与不同账号分别显示本地记录，不自动合并、不跨设备同步。清除站点数据、浏览器存储清理或更换设备可能导致记录无法恢复；存储不可用时，界面会提示改用当前页面的内存。
        </p>
        <p class="mb-6">
          发送问题时，本站会把本次问题、当前文章标识和必要的当前会话上下文交给已配置的模型供应商及阿里云安全审核服务处理；需要更早的记录时，仅读取当前会话指定范围，不上传其他会话列表。请不要发送密码、密钥或其他私密资料。第三方对这些请求的处理和保留方式取决于实际服务及其政策。
        </p>
        <p class="mb-6">
          本站服务端不建立聊天正文库。为限制滥用和控制费用，保存请求标识、不可逆身份及 IP 摘要、时间、状态、用量和费用等运行信息；请求与操作明细在后续清理时删除超过 7 天的记录，按日用量保留 30 天。访客使用必要的 HttpOnly Cookie 识别额度，并由 Cloudflare Turnstile 进行人机验证。上述服务端保留期限不影响你手动管理的本地聊天。
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
