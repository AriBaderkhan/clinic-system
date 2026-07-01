// Money formatting for PDFs.
// - Whole numbers show no decimals (IQD-style); amounts with cents show 2 (USD).
// - The currency CODE is always appended, so mixed-currency reports are never
//   ambiguous and cents are never silently dropped.
// (We show the 3-letter code, not a symbol, because the built-in PDF fonts
// don't render every currency glyph.)
export function fmtMoney(amount, code) {
  const n = Number(amount);
  const val = Number.isFinite(n) ? n : 0;
  const hasCents = !Number.isInteger(val);
  const num = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(val);
  return code ? `${num} ${code}` : num;
}
