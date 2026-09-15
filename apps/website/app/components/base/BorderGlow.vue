<script setup lang="ts">
// Adapted from the Vue Bits BorderGlow TypeScript source supplied with this task.
import { useMediaQuery } from '@vueuse/core'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'

interface BorderGlowProps {
  className?: string
  edgeSensitivity?: number
  glowColor?: string
  backgroundColor?: string
  borderRadius?: number
  glowRadius?: number
  glowIntensity?: number
  coneSpread?: number
  animated?: boolean
  colors?: string[]
  fillOpacity?: number
}

const props = withDefaults(defineProps<BorderGlowProps>(), {
  className: '',
  edgeSensitivity: 30,
  glowColor: '40 80 80',
  backgroundColor: '#060010',
  borderRadius: 28,
  glowRadius: 40,
  glowIntensity: 1.0,
  coneSpread: 25,
  animated: false,
  colors: () => ['#c084fc', '#f472b6', '#38bdf8'],
  fillOpacity: 0.5,
})

function parseHSL(hslStr: string): { h: number, s: number, l: number } {
  const match = hslStr.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%?\s+(\d+(?:\.\d+)?)%?$/)
  if (!match)
    return { h: 40, s: 80, l: 80 }
  return { h: parseFloat(match[1]!), s: parseFloat(match[2]!), l: parseFloat(match[3]!) }
}

function buildBoxShadow(glowColor: string, intensity: number): string {
  const { h, s, l } = parseHSL(glowColor)
  const base = `${h}deg ${s}% ${l}%`
  const layers: [number, number, number, number, number, boolean][] = [
    [0, 0, 0, 1, 100, true],
    [0, 0, 1, 0, 60, true],
    [0, 0, 3, 0, 50, true],
    [0, 0, 6, 0, 40, true],
    [0, 0, 15, 0, 30, true],
    [0, 0, 25, 2, 20, true],
    [0, 0, 50, 2, 10, true],
    [0, 0, 1, 0, 60, false],
    [0, 0, 3, 0, 50, false],
    [0, 0, 6, 0, 40, false],
    [0, 0, 15, 0, 30, false],
    [0, 0, 25, 2, 20, false],
    [0, 0, 50, 2, 10, false],
  ]
  return layers
    .map(([x, y, blur, spread, alpha, inset]) => {
      const a = Math.min(alpha * intensity, 100)
      return `${inset ? 'inset ' : ''}${x}px ${y}px ${blur}px ${spread}px hsl(${base} / ${a}%)`
    })
    .join(', ')
}

function easeOutCubic(x: number) {
  return 1 - (1 - x) ** 3
}
function easeInCubic(x: number) {
  return x * x * x
}

interface AnimateOpts {
  start?: number
  end?: number
  duration?: number
  delay?: number
  ease?: (t: number) => number
  onUpdate: (v: number) => void
  onEnd?: () => void
}

function animateValue({
  start = 0,
  end = 100,
  duration = 1000,
  delay = 0,
  ease = easeOutCubic,
  onUpdate,
  onEnd,
}: AnimateOpts) {
  const t0 = performance.now() + delay
  let frame = 0
  function tick() {
    const elapsed = performance.now() - t0
    const t = Math.max(0, Math.min(elapsed / duration, 1))
    onUpdate(start + (end - start) * ease(t))
    if (t < 1)
      frame = requestAnimationFrame(tick)
    else if (onEnd)
      onEnd()
  }
  const timer = setTimeout(() => {
    frame = requestAnimationFrame(tick)
  }, delay)
  return () => {
    clearTimeout(timer)
    cancelAnimationFrame(frame)
  }
}

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%']
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1]

function buildMeshGradients(colors: string[]): string[] {
  const gradients: string[] = []
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i]!, colors.length - 1)]
    gradients.push(`radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`)
  }
  gradients.push(`linear-gradient(${colors[0]} 0 100%)`)
  return gradients
}

const cardRef = useTemplateRef<HTMLDivElement>('cardRef')
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const canHover = useMediaQuery('(hover: hover) and (pointer: fine)')
const motionEnabled = computed(() => canHover.value && !reducedMotion.value)
const isHovered = ref(false)
const cursorAngle = ref(45)
const edgeProximity = ref(0)
const sweepActive = ref(false)

function handlePointerMove(e: PointerEvent) {
  const card = cardRef.value
  if (!card || !motionEnabled.value || e.pointerType === 'touch')
    return
  const rect = card.getBoundingClientRect()
  if (!rect.width || !rect.height)
    return
  const dx = e.clientX - rect.left - rect.width / 2
  const dy = e.clientY - rect.top - rect.height / 2
  edgeProximity.value = Math.min(1, Math.max(Math.abs(dx) / (rect.width / 2), Math.abs(dy) / (rect.height / 2)))
  cursorAngle.value = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360
}

onMounted(() => watch(
  () => props.animated && motionEnabled.value,
  (enabled, _, onCleanup) => {
    if (!enabled)
      return
    const angleStart = 110
    const angleEnd = 465
    sweepActive.value = true
    cursorAngle.value = angleStart

    const stop = [animateValue({ duration: 500, onUpdate: v => (edgeProximity.value = v / 100) }), animateValue({
      ease: easeInCubic,
      duration: 1500,
      end: 50,
      onUpdate: (v) => {
        cursorAngle.value = (angleEnd - angleStart) * (v / 100) + angleStart
      },
    }), animateValue({
      ease: easeOutCubic,
      delay: 1500,
      duration: 2250,
      start: 50,
      end: 100,
      onUpdate: (v) => {
        cursorAngle.value = (angleEnd - angleStart) * (v / 100) + angleStart
      },
    }), animateValue({
      ease: easeInCubic,
      delay: 2500,
      duration: 1500,
      start: 100,
      end: 0,
      onUpdate: v => (edgeProximity.value = v / 100),
      onEnd: () => (sweepActive.value = false),
    })]
    onCleanup(() => {
      stop.forEach(cancel => cancel())
      sweepActive.value = false
      edgeProximity.value = 0
    })
  },
  {
    immediate: true,
  },
))

const sensitivity = computed(() => Math.min(99, Math.max(0, props.edgeSensitivity)))
const colorSensitivity = computed(() => Math.min(99, sensitivity.value + 20))
const isVisible = computed(() => motionEnabled.value && (isHovered.value || sweepActive.value))
const borderOpacity = computed(() =>
  isVisible.value
    ? Math.max(0, (edgeProximity.value * 100 - colorSensitivity.value) / (100 - colorSensitivity.value))
    : 0,
)
const glowOpacity = computed(() =>
  isVisible.value ? Math.max(0, (edgeProximity.value * 100 - sensitivity.value) / (100 - sensitivity.value)) : 0,
)

const meshGradients = computed(() => buildMeshGradients(props.colors.length ? props.colors : ['#c084fc', '#f472b6', '#38bdf8']))
const borderBg = computed(() => meshGradients.value.map(g => `${g} border-box`))
const fillBg = computed(() => meshGradients.value.map(g => `${g} padding-box`))
const angleDeg = computed(() => `${cursorAngle.value.toFixed(3)}deg`)
</script>

<template>
  <div
    ref="cardRef"
    class="border-glow relative isolate grid border border-line" :class="[props.className]"
    :style="{
      background: props.backgroundColor,
      borderRadius: `${props.borderRadius}px`,
    }"
    @pointermove="handlePointerMove"
    @pointerenter="isHovered = true"
    @pointerleave="isHovered = false"
    @pointercancel="isHovered = false"
  >
    <!-- mesh gradient border -->
    <div
      class="pointer-events-none absolute inset-0 rounded-[inherit] -z-[1]"
      aria-hidden="true"
      :style="{
        border: '1px solid transparent',
        background: [
          `linear-gradient(${props.backgroundColor} 0 100%) padding-box`,
          'linear-gradient(rgb(255 255 255 / 0%) 0% 100%) border-box',
          ...borderBg,
        ].join(', '),
        opacity: borderOpacity,
        maskImage: `conic-gradient(from ${angleDeg} at center, black ${props.coneSpread}%, transparent ${
          props.coneSpread + 15
        }%, transparent ${100 - props.coneSpread - 15}%, black ${100 - props.coneSpread}%)`,
        WebkitMaskImage: `conic-gradient(from ${angleDeg} at center, black ${props.coneSpread}%, transparent ${
          props.coneSpread + 15
        }%, transparent ${100 - props.coneSpread - 15}%, black ${100 - props.coneSpread}%)`,
        transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
      }"
    />

    <!-- mesh gradient fill -->
    <div
      class="pointer-events-none absolute inset-0 rounded-[inherit] -z-[1]"
      aria-hidden="true"
      :style="{
        border: '1px solid transparent',
        background: fillBg.join(', '),
        maskImage: [
          'linear-gradient(to bottom, black, black)',
          'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
          'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
          `conic-gradient(from ${angleDeg} at center, transparent 5%, black 15%, black 85%, transparent 95%)`,
        ].join(', '),
        WebkitMaskImage: [
          'linear-gradient(to bottom, black, black)',
          'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
          'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
          `conic-gradient(from ${angleDeg} at center, transparent 5%, black 15%, black 85%, transparent 95%)`,
        ].join(', '),
        maskComposite: 'subtract, add, add, add, add, add',
        WebkitMaskComposite: 'source-out, source-over, source-over, source-over, source-over, source-over',
        opacity: borderOpacity * props.fillOpacity,
        mixBlendMode: 'soft-light',
        transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
      }"
    />

    <!-- outer glow -->
    <span
      class="pointer-events-none absolute z-[1] rounded-[inherit]"
      aria-hidden="true"
      :style="{
        inset: `-${props.glowRadius}px`,
        maskImage: `conic-gradient(from ${angleDeg} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`,
        WebkitMaskImage: `conic-gradient(from ${angleDeg} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`,
        opacity: glowOpacity,
        mixBlendMode: 'plus-lighter',
        transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
      }"
    >
      <span
        class="absolute rounded-[inherit]"
        :style="{
          inset: `${props.glowRadius}px`,
          boxShadow: buildBoxShadow(props.glowColor, props.glowIntensity),
        }"
      />
    </span>

    <!-- content -->
    <div class="relative z-[1] min-w-0 flex flex-col">
      <slot />
    </div>
  </div>
</template>
