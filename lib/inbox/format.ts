export function formatCount(count: number) {
  return new Intl.NumberFormat("de-DE").format(count);
}
