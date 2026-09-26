import type { AlertTheme } from '#shared/content/alerts'
import type { CalloutDefinition, DefaultCallouts } from './upstream/types'
import { alertTheme } from '#shared/content/alerts'
import { docusaurusCallouts } from './upstream/docusaurus'
import { githubCallouts } from './upstream/github'
import { obsidianCallouts } from './upstream/obsidian'
import { vitepressCallouts } from './upstream/vitepress'

const themes: Record<AlertTheme, DefaultCallouts> = {
  github: githubCallouts,
  obsidian: obsidianCallouts,
  vitepress: vitepressCallouts,
  docusaurus: docusaurusCallouts,
}

export function resolveAlert(type: unknown, theme: unknown, defaultTheme: unknown, title: unknown): {
  theme: AlertTheme
  type: string
  title: string
  definition: CalloutDefinition
} {
  const resolvedTheme = alertTheme(theme) ?? alertTheme(defaultTheme) ?? 'github'
  const definitions = themes[resolvedTheme]
  const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : ''
  const resolvedType = Object.hasOwn(definitions, normalizedType) ? normalizedType : 'note'
  const definition = definitions[resolvedType]!
  return {
    theme: resolvedTheme,
    type: resolvedType,
    title: typeof title === 'string' && title.trim() ? title : definition.title,
    definition,
  }
}
