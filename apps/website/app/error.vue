<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
useThemeHead(true)
const notFound = computed(() => props.error.statusCode === 404)
useHead({ title: notFound.value ? '页面不存在 - mukuchi' : '页面加载失败 - mukuchi' })
</script>

<template>
  <div class="site-container flex flex-col items-start justify-center gap-6 min-h-dvh">
    <span class="text-[100px] text-accent leading-[normal] font-display italic">{{
      error.statusCode
    }}</span>
    <h1 class="text-error-title text-heading">
      {{ notFound ? "页面不存在" : "页面加载失败" }}
    </h1>
    <p class="text-muted">
      {{ notFound ? "请检查访问地址，或返回文章列表。" : "请稍后重试，或返回文章列表。" }}
    </p>
    <BaseButton @click="clearError({ redirect: '/posts' })">
      <AppIcon name="left" />返回文章列表
    </BaseButton>
  </div>
</template>
