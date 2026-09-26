/**
 * Складывает уже выданные дополнительные юзернеймы с теми, что вписали в поле.
 * Порядок прежних сохраняем, повторы (без учёта регистра и ведущего «@»)
 * отбрасываем — так «Добавить» именно добавляет, а не заменяет весь список.
 */
export function mergeHandles(existing: string[] | null | undefined, typed: string): string[] {
  const result = [...(existing ?? [])];
  const seen = new Set(result.map((handle) => handle.toLowerCase()));
  for (const raw of typed.split(/[,\s]+/)) {
    const handle = raw.trim().replace(/^@/, '');
    if (!handle) continue;
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(handle);
  }
  return result;
}
