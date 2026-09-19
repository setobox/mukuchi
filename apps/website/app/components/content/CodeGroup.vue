<script lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { cloneVNode, defineComponent, h, nextTick, ref, shallowRef, useId } from 'vue'
import { codeEntries, nextCodeTab } from '~/features/code/blocks'
import CodeCopy from '../code/CodeCopy.vue'

export default defineComponent({
  name: 'CodeGroup',
  setup(_, { slots }) {
    const id = useId()
    const active = ref(0)
    const bar = shallowRef<HTMLElement | null>(null)
    const buttons = new Map<number, HTMLButtonElement>()
    const register = (index: number) => (element: Element | ComponentPublicInstance | null) => {
      if (element instanceof HTMLButtonElement)
        buttons.set(index, element)
      else
        buttons.delete(index)
    }
    function reveal(index: number) {
      const button = buttons.get(index)
      const element = bar.value
      if (!button || !element)
        return
      const left = button.offsetLeft
      if (left < element.scrollLeft)
        element.scrollLeft = left
      else if (left + button.offsetWidth > element.scrollLeft + element.clientWidth)
        element.scrollLeft = left + button.offsetWidth - element.clientWidth
    }
    async function navigate(event: KeyboardEvent, count: number) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return
      event.preventDefault()
      active.value = nextCodeTab(event.key, active.value, count)
      await nextTick()
      buttons.get(active.value)?.focus({ preventScroll: true })
      reveal(active.value)
    }
    return () => {
      const nodes = slots.default?.() ?? []
      const { entries, other } = codeEntries(nodes)
      // Preserve unexpected Markdown instead of silently dropping it.
      if (other || entries.length < 2)
        return nodes
      const selected = Math.min(active.value, entries.length - 1)
      return h('div', { class: 'my-6 min-w-0 overflow-hidden border border-line rounded-xl bg-code' }, [
        h('div', { class: 'min-w-0 flex items-center gap-2 border-b border-line px-2 py-1' }, [
          h('div', {
            'ref': bar,
            'role': 'tablist',
            'aria-label': '代码示例',
            'class': 'relative min-w-0 flex flex-1 overflow-x-auto gap-1',
          }, entries.map((entry, index) => h('button', {
            'ref': register(index),
            'type': 'button',
            'role': 'tab',
            'id': `${id}-tab-${index}`,
            'aria-controls': `${id}-panel-${index}`,
            'aria-selected': selected === index,
            'tabindex': selected === index ? 0 : -1,
            'class': ['control-base control-quiet shrink-0 whitespace-nowrap px-3 text-s', selected === index ? 'control-selected' : 'text-muted'],
            'onClick': () => {
              active.value = index
              reveal(index)
            },
            'onFocus': () => {
              active.value = index
              reveal(index)
            },
            'onKeydown': (event: KeyboardEvent) => navigate(event, entries.length),
          }, entry.label))),
          h(CodeCopy, { key: selected, code: entries[selected]!.code }),
        ]),
        ...entries.map((entry, index) => h('div', {
          'key': index,
          'id': `${id}-panel-${index}`,
          'role': 'tabpanel',
          'aria-labelledby': `${id}-tab-${index}`,
          'hidden': selected !== index,
          'class': 'min-w-0',
        }, [cloneVNode(entry.node, { grouped: true })])),
      ])
    }
  },
})
</script>
