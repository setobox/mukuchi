import type { Command } from '~/features/commands/controller'
import { inject, onScopeDispose, provide } from 'vue'
import { commandControllerKey, createCommandController } from '~/features/commands/controller'

export function useProvideCommandPalette() {
  const { site } = useAppConfig()
  const controller = createCommandController(() => site.features)
  provide(commandControllerKey, controller)
  return controller
}

export function useCommandPalette() {
  const controller = inject(commandControllerKey)
  if (!controller)
    throw new Error('命令面板需要在应用提供者下使用。')
  return controller
}

export function useCommand(command: Command) {
  const unregister = useCommandPalette().register(command)
  onScopeDispose(unregister)
  return unregister
}
