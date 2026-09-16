<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import { Node } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'

const props = defineProps<{ segments: { source: string, raw: boolean }[], imagePreviews: Record<string, string> }>()
const emit = defineEmits<{ change: [source: string] }>()
const link = ref('')
const showLink = ref(false)
const RawSource = Node.create({
  name: 'rawSource',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ source: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-raw-source]' }],
  renderHTML: () => ['div', { 'data-raw-source': '' }],
  renderMarkdown: node => String(node.attrs?.source ?? ''),
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div')
      dom.className = 'my-4 rounded-button border border-line-strong bg-surface p-3'
      const label = document.createElement('label')
      label.textContent = 'MDC / 扩展语法源码'
      label.className = 'mb-2 block text-xs text-muted'
      const textarea = document.createElement('textarea')
      textarea.id = `raw-${crypto.randomUUID()}`
      label.htmlFor = textarea.id
      textarea.value = String(node.attrs.source)
      textarea.rows = Math.max(3, Math.min(16, textarea.value.split('\n').length))
      textarea.className = 'w-full resize-y rounded bg-canvas p-3 font-mono text-xs text-ink'
      textarea.spellcheck = false
      textarea.addEventListener('input', () => {
        const position = getPos()
        if (typeof position === 'number')
          editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { source: textarea.value }))
      })
      dom.append(label, textarea)
      return { dom, stopEvent: () => true, ignoreMutation: () => true, update: (next) => {
        if (next.type.name !== 'rawSource')
          return false
        if (textarea.value !== next.attrs.source)
          textarea.value = String(next.attrs.source)
        return true
      } }
    }
  },
})
const PreviewImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('img')
      const render = (attributes: Record<string, unknown>) => {
        const src = String(attributes.src ?? '')
        dom.src = props.imagePreviews[src] ?? src
        dom.alt = String(attributes.alt ?? '')
        dom.title = String(attributes.title ?? '')
      }
      render(node.attrs)
      return { dom, update(next) {
        if (next.type.name !== 'image')
          return false
        render(next.attrs)
        return true
      } }
    }
  },
})
const extensions = [StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, link: { openOnClick: false } }), PreviewImage, TableKit, TaskList, TaskItem.configure({ nested: true, a11y: { checkboxLabel: node => `任务：${node.textContent || '未命名'}` } }), RawSource, Markdown]
const manager = new MarkdownManager({ extensions })
const content: JSONContent[] = props.segments.flatMap(segment => segment.raw ? [{ type: 'rawSource', attrs: { source: segment.source } }] : manager.parse(segment.source).content ?? [])
const editor = useEditor({ extensions, content: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }, editorProps: { attributes: { 'class': 'min-h-[420px] p-5 outline-none text-m leading-8', 'role': 'textbox', 'aria-label': '文章正文富文本编辑', 'aria-multiline': 'true' } }, onUpdate: ({ editor }) => emit('change', editor.getMarkdown()) })
function setLink() {
  if (!editor.value || !/^(?:https?:\/\/|\/(?!\/)|#)/.test(link.value))
    return
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: link.value }).run()
  showLink.value = false
}
onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div class="overflow-hidden border border-line-strong rounded-panel">
    <div v-if="editor" class="flex flex-wrap gap-1 border-b border-line bg-surface p-2" role="toolbar" aria-label="正文格式">
      <button class="min-h-11 rounded px-3 hover:bg-line" :aria-pressed="editor.isActive('bold')" @click="editor.chain().focus().toggleBold().run()">
        加粗
      </button>
      <button class="min-h-11 rounded px-3 hover:bg-line" :aria-pressed="editor.isActive('italic')" @click="editor.chain().focus().toggleItalic().run()">
        斜体
      </button>
      <select aria-label="段落级别" class="min-h-11 rounded bg-surface px-2" @change="editor.chain().focus().setHeading({ level: Number(($event.target as HTMLSelectElement).value) as 1 | 2 | 3 | 4 | 5 | 6 }).run()">
        <option value="2">
          标题级别
        </option><option v-for="level in 6" :key="level" :value="level">
          H{{ level }}
        </option>
      </select>
      <button class="min-h-11 rounded px-3 hover:bg-line" @click="editor.chain().focus().setParagraph().run()">
        正文
      </button>
      <button class="min-h-11 rounded px-3 hover:bg-line" @click="editor.chain().focus().toggleBulletList().run()">
        无序列表
      </button>
      <button class="min-h-11 rounded px-3 hover:bg-line" @click="editor.chain().focus().toggleOrderedList().run()">
        有序列表
      </button>
      <button class="min-h-11 rounded px-3 hover:bg-line" @click="editor.chain().focus().toggleTaskList().run()">
        任务
      </button>
      <button class="min-h-11 rounded px-3 hover:bg-line" @click="editor.chain().focus().toggleBlockquote().run()">
        引用
      </button>
      <button class="min-h-11 rounded px-3 hover:bg-line" @click="editor.chain().focus().toggleCodeBlock().run()">
        代码
      </button>
      <button class="min-h-11 rounded px-3 hover:bg-line" @click="showLink = !showLink">
        链接
      </button>
      <button class="min-h-11 rounded px-3 hover:bg-line" @click="editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()">
        表格
      </button>
      <button class="min-h-11 rounded px-3 hover:bg-line" aria-label="撤销" @click="editor.chain().focus().undo().run()">
        <span class="i-lucide-undo-2" />
      </button>
      <button class="min-h-11 rounded px-3 hover:bg-line" aria-label="重做" @click="editor.chain().focus().redo().run()">
        <span class="i-lucide-redo-2" />
      </button>
    </div>
    <form v-if="showLink" class="flex gap-2 border-b border-line p-3" @submit.prevent="setLink">
      <input v-model="link" aria-label="链接地址" placeholder="https://" class="min-h-11 min-w-0 flex-1 border border-line rounded bg-canvas px-3"><BaseButton type="submit">
        插入链接
      </BaseButton>
    </form>
    <EditorContent :editor="editor" class="break-words [&_.tiptap_p]:my-3 [&_.tiptap_img]:max-w-full [&_.tiptap_table]:w-full [&_.tiptap_ol]:list-decimal [&_.tiptap_ul]:list-disc [&_.tiptap_pre]:overflow-x-auto [&_.tiptap_td]:border [&_.tiptap_th]:border [&_.tiptap_blockquote]:border-l-3 [&_.tiptap_blockquote]:border-accent [&_.tiptap_td]:border-line-strong [&_.tiptap_th]:border-line-strong [&_.tiptap_pre]:rounded [&_.tiptap_pre]:bg-surface [&_.tiptap_pre]:p-4 [&_.tiptap_td]:p-2 [&_.tiptap_th]:p-2 [&_.tiptap_blockquote]:pl-4 [&_.tiptap_ol]:pl-6 [&_.tiptap_ul]:pl-6 [&_.tiptap_h1]:text-page [&_.tiptap_h2]:text-section [&_.tiptap_h3]:text-title [&_.tiptap_a]:text-accent-soft [&_.tiptap_h4]:font-bold" />
  </div>
</template>
