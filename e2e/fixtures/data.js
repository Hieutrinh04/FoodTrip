import { Buffer } from 'node:buffer'
export const user = { id: '10000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'customer@example.test', app_metadata: {}, user_metadata: {} }
export const tripId = '10000000-0000-4000-8000-000000000002'
export const place = { placeId: 'e2e-pho', name: 'Phở kiểm thử', address: 'Địa chỉ giả lập, Hà Nội', location: { lat: 21.0285, lng: 105.8542 }, rating: 4.5, ratingCount: 100, category: 'Restaurant' }
export const property = { id: '10000000-0000-4000-8000-000000000003', hotel_place_id: 'fixture-hotel', name: 'Cơ sở giả lập', active: true, inventory_enabled: true }
export function session() {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', exp: 4102444800 })).toString('base64url')
  return { access_token: `e30.${payload}.fixture`, refresh_token: 'fixture-refresh', expires_at: 4102444800, token_type: 'bearer', user }
}
