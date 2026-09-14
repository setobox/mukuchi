import { defineConfig, presetIcons, presetWind3 } from 'unocss'
import { icons } from './app/shared/icons.ts'

const breakpoints = { md: '900px', lg: '1200px' }

export default defineConfig({
  presets: [presetWind3(), presetIcons({ scale: 1.1 })],
  theme: {
    breakpoints,
    colors: {
      'canvas': 'var(--color-canvas)',
      'surface': 'var(--color-surface)',
      'ink': 'var(--color-text)',
      'heading': 'var(--color-heading)',
      'muted': 'var(--color-muted)',
      'accent': 'var(--color-accent)',
      'accent-surface': 'var(--color-accent-surface)',
      'accent-soft': 'var(--color-accent-text)',
      'themed': 'var(--color-title)',
      'on-accent': 'var(--color-on-accent)',
      'accent-hover': 'var(--color-accent-hover)',
      'code': 'var(--color-code)',
      'line': 'var(--color-border)',
      'line-strong': 'var(--color-border-strong)',
      'info': 'var(--color-info)',
      'success': 'var(--color-success)',
      'warn': 'var(--color-warn)',
      'error': 'var(--color-error)',
      'acrylic': 'var(--color-acrylic)',
      'scrim': 'var(--color-scrim)',
    },
    fontFamily: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
      display: 'var(--font-display)',
    },
    fontSize: {
      'xxxxl': ['var(--text-xxxxl)', '1.25'],
      'xxxl': ['var(--text-xxxl)', '1.25'],
      'xxl': ['var(--text-xxl)', '1.4'],
      'xl': ['var(--text-xl)', '1.5'],
      'l': ['var(--text-l)', '1.65'],
      'm': ['var(--text-m)', '1.8'],
      's': ['var(--text-s)', '1.65'],
      'xs': ['var(--text-xs)', '1.65'],
      'xxs': ['var(--text-xxs)', '1.65'],
      'xxxs': ['var(--text-xxxs)', '1.65'],
      'base': ['var(--text-s)', '1.65'],
      'sm': ['var(--text-xs)', '1.65'],
      'page': ['var(--text-xxxl)', '1.25'],
      'section': ['var(--text-xxl)', '1.4'],
      'title': ['var(--text-l)', '1.65'],
      'error-title': ['var(--text-xl)', '1.65'],
    },
    borderRadius: {
      panel: 'var(--radius-panel)',
      button: 'var(--radius-button)',
    },
    boxShadow: {
      floating: 'var(--shadow-float)',
      dialog: 'var(--shadow-dialog)',
    },
    maxWidth: { site: 'var(--layout-width)' },
    spacing: {
      layout: 'var(--layout-gap)',
    },
    zIndex: {
      header: 'var(--z-header)',
      actions: 'var(--z-actions)',
    },
  },
  extendTheme: theme => ({ ...theme, breakpoints }),
  shortcuts: {
    'site-container': 'mx-auto w-full max-w-site px-5 md:px-8',
    'section-label': 'text-base tracking-widest text-muted font-medium',
    'icon-button':
      'inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-xl text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-muted',
    'text-link': 'inline-flex items-center gap-2 min-h-11 text-heading hover:text-accent-soft',
  },
  safelist: Object.values(icons),
})
