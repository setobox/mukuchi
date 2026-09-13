<template>
  <div class="min-h-dvh flex flex-col">
    <a
      href="#main-content"
      class="fixed -top-20 left-5 z-100 rounded-lg bg-accent px-5 py-3 text-canvas focus:top-3"
      >跳转到正文</a
    >
    <SiteHeader />
    <main
      id="main-content"
      tabindex="-1"
      class="site-container flex-1 pb-20 pt-[calc(var(--header-height)+48px)] lg:pt-[calc(var(--header-height)+56px)]"
    >
      <slot />
    </main>
    <SiteFooter />
    <FloatingActions />
  </div>
</template>
