// Local dataset only tracks a coarse 0-2 price tier per place — map that to a
// realistic per-person VND range for display/export, instead of just "đ" symbols.
const PRICE_RANGES = {
  0: { vi: 'Miễn phí', en: 'Free' },
  1: { vi: '20.000đ – 60.000đ', en: '20,000–60,000₫' },
  2: { vi: '100.000đ – 300.000đ', en: '100,000–300,000₫' },
}

export function priceRangeLabel(priceLevel, lang) {
  return (PRICE_RANGES[priceLevel] ?? PRICE_RANGES[1])[lang]
}
