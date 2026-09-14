export function visibleCategoryCount(
  widths: readonly number[],
  available: number,
  allWidth: number,
  moreWidth: number,
  gap = 10,
): number {
  const full = allWidth + widths.reduce((sum, width) => sum + gap + width, 0)
  if (full <= available)
    return widths.length
  let used = allWidth + gap + moreWidth
  let count = 0
  for (const width of widths) {
    if (used + gap + width > available)
      break
    used += gap + width
    count++
  }
  return count
}
