import type { ModuleOptions } from '@nuxtjs/mdc'

/** Syntax colors follow Shiki; code backgrounds use the site's warm gray surface. */
export const codeThemes = {
  github: { theme: { default: 'github-dark-default', light: 'github-light-default' }, foreground: { dark: '#e6edf3', light: '#1f2328' } },
  catppuccin: { theme: { default: 'catppuccin-mocha', light: 'catppuccin-latte' }, foreground: { dark: '#cdd6f4', light: '#4c4f69' } },
  one: { theme: { default: 'one-dark-pro', light: 'one-light' }, foreground: { dark: '#abb2bf', light: '#383a42' } },
  rosePine: { theme: { default: 'rose-pine', light: 'rose-pine-dawn' }, foreground: { dark: '#e0def4', light: '#575279' } },
  vitesse: { theme: { default: 'vitesse-dark', light: 'vitesse-light' }, foreground: { dark: '#dbd7caee', light: '#393a34' } },
} as const

export type CodeTheme = keyof typeof codeThemes

// Change this setting and rebuild to apply a theme to articles and admin previews.
export const codeTheme: CodeTheme = 'catppuccin'
const selected = codeThemes[codeTheme]

export const codeHighlight = {
  theme: selected.theme,
  langs: [
    'javascript',
    'js',
    'jsx',
    'json',
    'typescript',
    'ts',
    'tsx',
    'vue',
    'html',
    'css',
    'scss',
    'shellscript',
    'bash',
    'sh',
    'shell',
    'zsh',
    'markdown',
    'md',
    'mdc',
    'yaml',
    'yml',
    'python',
    'powershell',
    'java',
    'xml',
    'sql',
    'rust',
    'toml',
    'dockerfile',
  ],
} satisfies Exclude<ModuleOptions['highlight'], boolean | undefined>

// Content strips Shiki's wrapper styles; preserve each theme's plain text color.
export const codeThemeStyle = {
  '--code-dark-fg': selected.foreground.dark,
  '--code-light-fg': selected.foreground.light,
}
