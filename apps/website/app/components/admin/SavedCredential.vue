<script setup lang="ts">
const props = defineProps<{ service: 'ai' | 'audio' | 'assistant', field: string, label: string, configured: boolean, revision: number, active?: boolean, disabled?: boolean }>()
const model = defineModel<string>({ default: '' })
const { current, request } = useAdminSession()
const id = useId()
const savedValue = ref<string | null>(null)
const showInput = ref(false)
const busy = ref(false)
const error = ref('')
const visible = computed(() => showInput.value || savedValue.value !== null)
const display = computed(() => model.value || savedValue.value || '')
const actionLabel = computed(() => visible.value ? `隐藏${props.label}` : `${error.value ? '重试显示' : '显示'}${model.value ? '输入的' : '已保存的'}${props.label}`)
let sequence = 0
function hide() {
  sequence++
  savedValue.value = null
  showInput.value = false
  busy.value = false
  error.value = ''
}
watch(() => [props.revision, props.active, props.configured, props.service, props.field, current.value.user?.id], hide)
onBeforeUnmount(hide)
function edit(event: Event) {
  const input = event.target as HTMLInputElement
  const wasVisible = visible.value
  hide()
  showInput.value = wasVisible
  model.value = input.value
}
async function toggle() {
  if (busy.value || props.disabled || props.active === false || (!model.value && !props.configured))
    return
  if (visible.value)
    return hide()
  if (model.value) {
    showInput.value = true
    return
  }
  const token = ++sequence
  busy.value = true
  error.value = ''
  try {
    const result = await request<{ value: string }>(`${props.service}/credentials/reveal`, { method: 'POST', body: { field: props.field } })
    if (token === sequence)
      savedValue.value = result.value
  }
  catch (cause) {
    if (token === sequence)
      error.value = adminError(cause)
  }
  finally {
    if (token === sequence)
      busy.value = false
  }
}
</script>

<template>
  <div>
    <label :for="id" class="block text-sm text-muted">{{ label }}</label>
    <div class="relative mt-2">
      <input :id="id" :value="display" :type="visible ? 'text' : 'password'" :disabled="disabled" :placeholder="configured ? '已配置；留空保留' : '请输入密钥'" :aria-describedby="error ? `${id}-error` : undefined" autocomplete="new-password" spellcheck="false" class="field-control w-full pl-3 pr-12 text-sm font-mono placeholder:font-sans" @input="edit">
      <button type="button" class="control-quiet absolute right-0 top-0 h-full min-h-11 w-11 flex items-center justify-center text-muted hover:text-heading" :aria-label="actionLabel" :title="actionLabel" :aria-pressed="visible" :aria-busy="busy || undefined" :disabled="busy || disabled || (!model && !configured)" @click="toggle">
        <span :class="busy ? 'i-lucide-loader-circle animate-spin motion-reduce:animate-none' : visible ? 'i-lucide-eye-off' : 'i-lucide-eye'" aria-hidden="true" />
      </button>
    </div>
    <p v-if="error" :id="`${id}-error`" role="alert" class="mt-2 text-xs text-error">
      {{ error }}
    </p>
  </div>
</template>
