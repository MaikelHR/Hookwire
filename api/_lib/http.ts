/* Los headers de Node pueden venir como string o string[]; normaliza a uno. */
export function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
