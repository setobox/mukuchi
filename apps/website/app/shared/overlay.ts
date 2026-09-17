import type { InjectionKey, Ref } from 'vue'

// Native modal dialogs are in the top layer; their popups must stay inside it.
export const overlayTargetKey: InjectionKey<Readonly<Ref<HTMLElement | null>>> = Symbol('overlay-target')
