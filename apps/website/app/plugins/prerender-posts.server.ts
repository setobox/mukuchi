export default defineNuxtPlugin(async () => {
  if (import.meta.prerender) {
    // Query the complete index, including cached files and Content's normalized paths.
    const posts = await queryCollection('posts').select('path').all()
    prerenderRoutes(posts.map(post => post.path))
  }
})
