export default defineNuxtPlugin((nuxtApp) => {
  const calls = useState('calls', () => 0)
  const countHeader = useResponseHeader('x-catalog-queries')
  nuxtApp.hook('app:rendered', () => {
    countHeader.value = String(calls.value)
  })
})
