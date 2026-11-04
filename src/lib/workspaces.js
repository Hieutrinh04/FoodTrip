import { canAccess, ROLES } from './accessPolicy.js'

/** Navigation is derived from verified, scoped grants, never from a selected role. */
export function accountWorkspaces(access) {
  if (!access.userId) return []
  const entries = [{ id: 'personal', type: 'personal', to: '/account', label: { vi: 'Tài khoản cá nhân', en: 'Personal account' }, role: 'member' }]
  if (access.status !== 'ready') return entries
  if (canAccess(access, 'admin')) entries.push({ id: 'admin', type: 'admin', to: '/admin', role: 'admin', label: { vi: 'Quản trị FoodTrip', en: 'FoodTrip administration' } })
  for (const p of access.properties ?? []) {
    if (!canAccess(access, 'hotel.portal', { propertyId: p.id })) continue
    entries.push({ id: `hotel:${p.id}`, type: 'hotel', to: `/partner?property=${encodeURIComponent(p.id)}`, scopeId: p.id, role: p.role === 'owner' ? 'hotel_owner' : 'hotel_staff', label: { vi: p.name, en: p.name }, suspended: !p.active })
  }
  for (const o of access.operators ?? []) {
    if (!canAccess(access, 'tour.manage', { operatorId: o.id }) || !['owner', 'manager'].includes(o.role)) continue
    entries.push({ id: `tour:${o.id}`, type: 'tour', to: `/partner/tours?operator=${encodeURIComponent(o.id)}`, scopeId: o.id, role: o.role === 'owner' ? 'tour_owner' : 'tour_manager', label: { vi: o.name, en: o.name } })
  }
  if (canAccess(access, 'tour.manifest')) entries.push({ id: 'guide', type: 'guide', to: '/partner/tours?view=guide', role: 'guide', label: { vi: 'Đoàn được giao hướng dẫn', en: 'Assigned guiding groups' } })
  return entries
}

export function currentWorkspace(entries, pathname, search = '') {
  const params = new URLSearchParams(search)
  if (params.get('view') === 'application' || params.has('claim')) return entries.find((e) => e.type === 'personal') ?? null
  let selected
  if (pathname === '/admin') selected = entries.find((e) => e.type === 'admin')
  else if (pathname === '/partner') selected = entries.find((e) => e.type === 'hotel' && e.scopeId === params.get('property')) ?? entries.find((e) => e.type === 'hotel')
  else if (pathname === '/partner/tours') {
    if (params.get('view') === 'guide') selected = entries.find((e) => e.type === 'guide')
    else selected = entries.find((e) => e.type === 'tour' && e.scopeId === params.get('operator')) ?? entries.find((e) => e.type === 'tour') ?? entries.find((e) => e.type === 'guide')
  }
  return selected ?? entries.find((e) => e.type === 'personal') ?? null
}

export const workspaceRole = (entry, lang) => ROLES[entry.role]?.[lang] ?? ''
