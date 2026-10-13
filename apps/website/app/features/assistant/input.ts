export function pasteSingleLine(event: ClipboardEvent, input: HTMLInputElement, set: (value: string) => void) {
  const text = event.clipboardData?.getData('text')
  if (text === undefined)
    return
  event.preventDefault()
  const normalized = text.replace(/[\r\n]+/g, ' ')
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  set(input.value.slice(0, start) + normalized + input.value.slice(end))
  queueMicrotask(() => input.setSelectionRange(start + normalized.length, start + normalized.length))
}
