<script setup lang="ts">
import { ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastViewport } from 'reka-ui'

const { toasts, dismiss } = useAdminFeedback()
</script>

<template>
  <ToastProvider :duration="4000" label="操作通知">
    <ToastRoot v-for="toast in toasts" :key="toast.id" class="flex items-start gap-3 border border-line-strong rounded-panel bg-surface p-4 text-sm shadow-dialog" @update:open="!$event && dismiss(toast.id)">
      <span class="i-lucide-circle-check mt-1 shrink-0 text-success" aria-hidden="true" />
      <ToastDescription class="min-w-0 flex-1 break-words text-heading">
        {{ toast.message }}
      </ToastDescription>
      <ToastClose class="icon-button -my-2 -mr-2" aria-label="关闭通知">
        <span class="i-lucide-x" />
      </ToastClose>
    </ToastRoot>
    <ToastViewport class="fixed bottom-5 right-5 z-50 m-0 w-[min(400px,calc(100vw-40px))] flex flex-col list-none gap-3 p-0 outline-none" />
  </ToastProvider>
</template>
