export function wheelItemLabel(item, lang) {
  return typeof item === 'string' ? item : item[lang]
}
