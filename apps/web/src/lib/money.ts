const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

/** Amounts are integer centavos everywhere (contract uses 2 decimals). */
export const formatPeso = (centavos: number) => peso.format(centavos / 100)

/** "150" or "150.50" → 15050; returns null for anything that isn't a positive peso amount. */
export function parsePeso(input: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(input.trim())) return null
  const centavos = Math.round(Number(input) * 100)
  return centavos > 0 ? centavos : null
}
