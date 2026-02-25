export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new Error('min 不能大于 max');
  }

  return Math.min(max, Math.max(min, value));
}
