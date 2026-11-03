export function selectedSection(sections, wanted, preferred) {
  return sections.find((s) => s.id === wanted)?.id ?? sections.find((s) => s.id === preferred)?.id ?? sections[0]?.id ?? null
}

export function selectedBusiness(businesses, wanted) {
  return businesses.find((b) => b.id === wanted) ?? businesses[0] ?? null
}

export function guideGroups(manifest, { query = '', filter = 'upcoming', now = Date.now() } = {}) {
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
  const q = fold(query).trim()
  const vnDay = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
  return manifest.filter((d) => {
    const ended = Date.parse(d.ends_at ?? d.starts_at) < now
    if (filter === 'upcoming' && ended) return false
    if (filter === 'past' && !ended) return false
    if (filter === 'today' && (ended || vnDay(d.starts_at) > vnDay(now))) return false
    return !q || fold(`${d.title} ${d.meeting_point} ${(d.guests ?? []).map((g) => g.name).join(' ')}`).includes(q)
  }).sort((a, b) => filter === 'past' ? Date.parse(b.starts_at) - Date.parse(a.starts_at) : Date.parse(a.starts_at) - Date.parse(b.starts_at))
}
