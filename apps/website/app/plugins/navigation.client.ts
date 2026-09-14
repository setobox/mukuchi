export default defineNuxtPlugin((nuxtApp) => {
  const previousPath = useState<string | null>('navigation:previous', () => null)
  nuxtApp.$router.afterEach((to, from, failure) => {
    if (!failure && from.matched.length > 0 && to.path !== from.path)
      previousPath.value = from.fullPath
  })
})
