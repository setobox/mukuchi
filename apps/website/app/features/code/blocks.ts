import type { VNode } from 'vue'
import { Comment, Fragment, isVNode, ref, Text } from 'vue'

export interface CodeEntry { node: VNode, label: string, code: string }

export function codeEntries(nodes: VNode[]): { entries: CodeEntry[], other: boolean } {
  const entries: CodeEntry[] = []
  let other = false
  function walk(children: VNode[]) {
    for (const node of children) {
      if (node.type === Fragment && Array.isArray(node.children)) {
        walk(node.children.filter(isVNode))
      }
      else if (node.type === Comment || (node.type === Text && !String(node.children ?? '').trim())) {
        continue
      }
      else if (typeof node.props?.code === 'string') {
        const filename: unknown = node.props.filename
        const language: unknown = node.props.language
        const label = typeof filename === 'string' && filename ? filename : typeof language === 'string' && language ? language : `代码 ${entries.length + 1}`
        entries.push({ node, label, code: node.props.code })
      }
      else {
        other = true
      }
    }
  }
  walk(nodes)
  return { entries, other }
}

export function nextCodeTab(key: string, current: number, count: number): number {
  if (!count)
    return 0
  if (key === 'Home')
    return 0
  if (key === 'End')
    return count - 1
  if (key === 'ArrowLeft')
    return (current + count - 1) % count
  if (key === 'ArrowRight')
    return (current + 1) % count
  return current
}

export function createCodeCopy(write: (text: string) => Promise<void>) {
  const state = ref<'idle' | 'copying' | 'success' | 'error'>('idle')
  let generation = 0
  return {
    state,
    reset: () => {
      generation++
      state.value = 'idle'
    },
    copy: async (code: string) => {
      if (state.value === 'copying')
        return
      const current = ++generation
      state.value = 'copying'
      try {
        await write(code)
        if (current === generation)
          state.value = 'success'
      }
      catch {
        if (current === generation)
          state.value = 'error'
      }
    },
  }
}
