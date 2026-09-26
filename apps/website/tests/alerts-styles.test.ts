import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { expect, test } from 'vite-plus/test'
import { compileStyle, parse } from 'vue/compiler-sfc'

const source = readFileSync(new URL('../app/components/content/Alert.vue', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../app/features/alerts/palette.css', import.meta.url), 'utf8')
const base = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')
const compiled = compileStyle({ source: parse(source).descriptor.styles[0]!.content, filename: 'Alert.vue', id: 'data-v-alert-test', scoped: true })

test.each(['light', 'dark'])('%s 中实际编译样式限定到提醒框，嵌套主题分别计算标题颜色', async (mode) => {
  const window = new Window()
  try {
    const { document } = window
    const style = document.createElement('style')
    style.textContent = `${base}\n${palette}\n${compiled.code}`
    document.head.append(style)
    document.documentElement.className = mode
    document.body.innerHTML = `
      <div class="mdc-alert" data-alert-theme="github" data-alert-type="warning" data-v-alert-test>
        <div class="mdc-alert-title" data-v-alert-test>Warning</div>
        <div class="mdc-alert" data-alert-theme="obsidian" data-alert-type="check" data-v-alert-test>
          <div class="mdc-alert-title" data-v-alert-test>Check</div>
        </div>
        <div class="mdc-alert" data-alert-theme="docusaurus" data-alert-type="danger" data-v-alert-test>
          <div class="mdc-alert-title" data-v-alert-test>DANGER</div>
        </div>
      </div>`
    const colors = [...document.querySelectorAll('.mdc-alert-title')].map(element => window.getComputedStyle(element).color)
    expect(colors).toEqual(mode === 'dark'
      ? ['#d29922', 'rgb(68, 207, 110)', 'rgb(255, 235, 236)']
      : ['#9a6700', 'rgb(8, 185, 78)', 'rgb(75, 17, 19)'])
    // A scoped :global(.dark) selector can accidentally compile to just .dark.
    // Loading alert styles must never set callout colors/background on the page.
    expect(window.getComputedStyle(document.documentElement).getPropertyValue('--alert-tone')).toBe('')
    expect(compiled.errors).toEqual([])
  }
  finally {
    await window.happyDOM.abort()
  }
})
