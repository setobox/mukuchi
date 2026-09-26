import type { Ref } from 'vue'
import type { CommandController } from '~/features/commands/controller'
import type { NavigationDestination } from '~/features/navigation/model'
import { watch } from 'vue'

export function useNavigationCommands(
  destinations: Ref<readonly NavigationDestination[]>,
  register: CommandController['register'],
  navigate: (path: string) => void | Promise<void>,
) {
  watch(destinations, (items, _, onCleanup) => {
    const unregister = items.map(item => register({
      id: `navigate:${item.id}`,
      label: `前往${item.label}`,
      keywords: [...item.sections, item.to],
      icon: item.icon,
      category: '页面',
      execute: () => navigate(item.to),
    }))
    onCleanup(() => unregister.forEach(remove => remove()))
  }, { immediate: true, deep: true })
}
