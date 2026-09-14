import type { InjectionKey, MaybeRefOrGetter } from 'vue'
import type { IconName } from '../../shared/icons'
import { computed, readonly, ref, shallowRef, toValue } from 'vue'
import { searchTerms } from '../search/model'

export type PaletteMode = 'search' | 'commands'
export interface Command {
  id: string
  label: string
  keywords: string[]
  icon: IconName
  category?: string
  available?: MaybeRefOrGetter<boolean>
  status?: MaybeRefOrGetter<string>
  visible?: MaybeRefOrGetter<boolean>
  execute: () => void | Promise<void>
  keepOpen?: boolean
}
export interface PaletteFeatures { search: boolean, commands: boolean }

export function groupCommands<T extends { category?: string }>(commands: readonly T[]) {
  const groups = new Map<string, { category: string, items: T[] }>()
  for (const command of commands) {
    const category = command.category ?? '操作'
    if (!groups.has(category))
      groups.set(category, { category, items: [] })
    groups.get(category)!.items.push(command)
  }
  return [...groups.values()]
}

export function createCommandController(features: () => PaletteFeatures) {
  const isOpen = ref(false)
  const query = ref('')
  const focusVersion = ref(0)
  const registered = shallowRef<Command[]>([])
  const mode = computed<PaletteMode>(() => features().commands && (!features().search || query.value.trimStart().startsWith('>')) ? 'commands' : 'search')
  const commandQuery = computed(() => query.value.trimStart().replace(/^>/, '').trim())
  const inputQuery = computed({
    get: () => mode.value === 'commands' ? query.value.trimStart().replace(/^>/, '') : query.value,
    set: (value: string) => {
      query.value = mode.value === 'commands' ? `>${value}` : value
    },
  })
  const commands = computed(() => {
    const terms = searchTerms(commandQuery.value)
    const matching = registered.value.filter(command => toValue(command.visible ?? true) && terms.every(term => `${command.label} ${command.keywords.join(' ')}`.toLowerCase().includes(term)))
      .map(command => ({ ...command, available: toValue(command.available ?? true), status: toValue(command.status ?? '') }))
    return groupCommands(matching).flatMap(group => group.items)
  })

  function open(requested: PaletteMode) {
    const enabled = features()
    if (!enabled.search && !enabled.commands)
      return
    const target = enabled[requested] ? requested : enabled.search ? 'search' : 'commands'
    query.value = target === 'commands' ? '>' : ''
    isOpen.value = true
    focusVersion.value++
  }
  function register(command: Command) {
    if (registered.value.some(item => item.id === command.id))
      throw new Error(`命令 ID 重复：${command.id}`)
    registered.value = [...registered.value, command]
    return () => {
      registered.value = registered.value.filter(item => item !== command)
    }
  }
  function close() {
    isOpen.value = false
  }
  return { isOpen: readonly(isOpen), query, inputQuery, mode, commands, commandQuery, focusVersion: readonly(focusVersion), open, close, register }
}

export type CommandController = ReturnType<typeof createCommandController>
// The key must survive module HMR while the root provider stays mounted.
export const commandControllerKey: InjectionKey<CommandController> = Symbol.for('mukuchi:command-controller')

export function nextSelection(current: number, direction: 1 | -1, available: readonly boolean[]): number {
  if (!available.some(Boolean))
    return -1
  let candidate = current < 0 ? direction === 1 ? -1 : 0 : current
  for (let count = 0; count < available.length; count++) {
    candidate = (candidate + direction + available.length) % available.length
    if (available[candidate])
      return candidate
  }
  return -1
}

export function acceptsPaletteShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'repeat' | 'defaultPrevented'>, context: { enabled: boolean, open: boolean, editable: boolean, otherDialog: boolean }): boolean {
  return context.enabled && !event.defaultPrevented && !event.isComposing && !event.repeat
    && event.key.toLowerCase() === 'p' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
    && !context.otherDialog && (context.open || !context.editable)
}

export function paletteInputAction(event: Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode'>, composing: boolean): 'next' | 'previous' | 'execute' | undefined {
  if (event.isComposing || composing || event.keyCode === 229)
    return
  if (event.key === 'ArrowDown')
    return 'next'
  if (event.key === 'ArrowUp')
    return 'previous'
  if (event.key === 'Enter')
    return 'execute'
}
