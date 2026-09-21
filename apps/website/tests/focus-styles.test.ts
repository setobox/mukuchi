import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { createGenerator } from 'unocss'
import { describe, expect, test } from 'vite-plus/test'
import unoConfig from '../uno.config'

const baseCss = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')
const paletteSource = readFileSync(new URL('../app/components/commands/CommandPalette.vue', import.meta.url), 'utf8')
const paletteMarkup = paletteSource.slice(paletteSource.indexOf('<template>') + '<template>'.length, paletteSource.lastIndexOf('</template>'))
const selectSource = readFileSync(new URL('../app/components/base/BaseSelect.vue', import.meta.url), 'utf8')
const selectItemClass = selectSource.match(/<SelectItem\s[^>]*\bclass="([^"]+)"/)![1]

async function fixture(markup: string, theme: string) {
  const window = new Window()
  const { document } = window
  const uno = await createGenerator(unoConfig)
  const { css } = await uno.generate(markup)
  const style = document.createElement('style')
  // Happy DOM treats :focus-visible as :focus and lacks :focus-within. Expand
  // only that pseudo-class to its equivalent for light-DOM fixtures. Real
  // pointer/keyboard modality and unmodified CSS are checked in the browser.
  style.textContent = `${baseCss}\n${css.replace(/(?<!\\):focus-within\b/g, ':is(:focus, :has(:focus))')}`
  document.head.append(style)
  document.documentElement.className = theme
  // Happy DOM cannot compute color-mix(); these equivalent default-accent
  // alpha colors keep the test focused on which state wins in the cascade.
  document.documentElement.style.setProperty('--color-accent-surface', '#a369ff1a')
  document.documentElement.style.setProperty('--color-accent-pressed', '#a369ff2e')
  document.body.innerHTML = markup
  return { window, document, style: (element: Parameters<Window['getComputedStyle']>[0]) => {
    // Happy DOM does not invalidate computed styles when activeElement changes.
    document.body.toggleAttribute('data-style-refresh')
    return window.getComputedStyle(element)
  } }
}

describe.each(['dark', 'light'])('%s 聚焦样式', (theme) => {
  test('搜索输入框只使用外层边框反馈，失焦后恢复且尺寸不变', async () => {
    const { window, document, style } = await fixture(paletteMarkup, theme)
    try {
      const input = document.querySelector('input')!
      const group = input.closest('.field-group')!
      const resting = style(group).borderColor
      const width = style(group).borderWidth
      input.focus()
      expect(document.activeElement).toBe(input)
      expect(style(input).outlineStyle).toBe('none')
      expect(style(input).borderWidth).toBe('0px')
      expect(style(group).borderColor).not.toBe(resting)
      expect(style(group).borderWidth).toBe(width)
      input.blur()
      expect(style(group).borderColor).toBe(resting)
    }
    finally {
      await window.happyDOM.abort()
    }
  })

  test.each(['input', 'textarea', 'select'])('独立 %s 只改变原有边框颜色', async (tag) => {
    const { window, document, style } = await fixture(`<${tag} class="field-control"></${tag}>`, theme)
    try {
      const field = document.querySelector(tag)!
      const resting = style(field).borderColor
      const width = style(field).borderWidth
      field.focus()
      expect(style(field).outlineStyle).toBe('none')
      expect(style(field).borderColor).not.toBe(resting)
      expect(style(field).borderWidth).toBe(width)
      field.blur()
      expect(style(field).borderColor).toBe(resting)
    }
    finally {
      await window.happyDOM.abort()
    }
  })

  test('已选中按钮的键盘焦点与静态选中底色不同', async () => {
    const { window, document, style } = await fixture('<button class="control-quiet control-selected">当前选项</button>', theme)
    try {
      const button = document.querySelector('button')!
      const resting = style(button).backgroundColor
      button.focus()
      expect(style(button).outlineStyle).toBe('none')
      expect(style(button).backgroundColor).not.toBe(resting)
      button.blur()
      expect(style(button).backgroundColor).toBe(resting)
    }
    finally {
      await window.happyDOM.abort()
    }
  })

  test('文字链接通过下划线反馈，复选框通过标签底色反馈', async () => {
    const { window, document, style } = await fixture('<a href="#" class="ui-link">链接</a><label class="checkbox-field"><input type="checkbox">选项</label>', theme)
    try {
      const link = document.querySelector('a')!
      const label = document.querySelector('label')!
      const checkbox = document.querySelector('input')!
      const resting = style(label).backgroundColor
      link.focus()
      expect(style(link).outlineStyle).toBe('none')
      expect(style(link).textDecorationLine).toBe('underline')
      checkbox.focus()
      expect(style(checkbox).outlineStyle).toBe('none')
      expect(style(label).backgroundColor).not.toBe(resting)
      checkbox.blur()
      expect(style(label).backgroundColor).toBe(resting)
    }
    finally {
      await window.happyDOM.abort()
    }
  })

  test('下拉选项同时处于选中与高亮状态时，高亮底色优先', async () => {
    const { window, document, style } = await fixture(`<div role="option" tabindex="0" data-state="checked" class="${selectItemClass}">已选项</div>`, theme)
    try {
      const option = document.querySelector('[role="option"]')!
      const resting = style(option).backgroundColor
      option.setAttribute('data-highlighted', '')
      option.focus()
      const highlighted = style(option).backgroundColor
      expect(highlighted).not.toBe(resting)
      expect(style(option).outlineStyle).toBe('none')
      option.setAttribute('data-state', 'unchecked')
      expect(style(option).backgroundColor).toBe(highlighted)
    }
    finally {
      await window.happyDOM.abort()
    }
  })
})
