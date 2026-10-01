import { useEffect, useState } from 'react'
import { createRoom, updateRoom, resetRoomDates, inventoryError, listRooms, listRoomDates, saveRoomDates } from '../../lib/inventory.js'
import { vietnamToday } from '../../lib/partner.js'

const INPUT = 'mt-1 w-full rounded-xl border border-line-strong bg-paper px-3 py-2'
const BUTTON = 'rounded-full bg-chili px-4 py-2 font-utility text-sm text-chili-ink disabled:opacity-50'

export default function RoomInventory({ property, onSaved }) {
  const [rooms, setRooms] = useState([])
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ name: '', capacity: 2, quantity: 1, price: 500000 })
  useEffect(() => {
    let active = true
    setState('loading'); setError('')
    listRooms(property.id).then((rows) => { if (active) { setRooms(rows); setState('ready') } })
      .catch((e) => { if (active) { setError(inventoryError(e)); setState('error') } })
    return () => { active = false }
  }, [property.id, revision])
  const owner = property.role === 'owner'
  async function act(fn, success) {
    setState('saving'); setError(''); setMessage('')
    try { await fn(); setMessage(success); setRevision((n) => n + 1); onSaved?.() }
    catch (e) { setError(inventoryError(e)); setState('ready') }
  }
  return <section className="space-y-4 rounded-2xl border border-line bg-surface p-5" aria-label="Kho phòng">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Kho phòng & giá theo ngày</h2><span className="text-sm text-herb">{property.inventory_enabled ? 'Đã bật kho phòng' : 'Chưa bật — đang giữ luồng đặt cũ'}</span></div>
    <p className="text-sm text-ink-muted">Mỗi đơn đặt một phòng. Ngày trả phòng không chiếm kho. Đơn chờ thanh toán giữ phòng đến khi bị hủy; hãy theo dõi các đơn chưa thanh toán.</p>
    {error && <p role="alert" className="text-chili">{error}</p>}{message && <p role="status" className="text-herb">{message}</p>}
    {state === 'loading' && <p role="status">Đang tải kho phòng…</p>}
    {state === 'error' && <button className={BUTTON} onClick={() => setRevision((n) => n + 1)}>Thử lại</button>}
    {owner && state !== 'error' && <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); act(() => createRoom(property.id, form), 'Đã thêm loại phòng.') }}>
      <label>Tên loại phòng<input className={INPUT} required minLength={2} maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      {[["capacity", 'Khách tối đa', 1, 20], ['quantity', 'Tổng số phòng', 1, 1000], ['price', 'Giá mặc định / đêm (VND)', 1000, 100000000]].map(([key, label, min, max]) => <label key={key}>{label}<input className={INPUT} required type="number" min={min} max={max} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <button disabled={state !== 'ready'} className={BUTTON}>Thêm loại phòng</button>
    </form>}
    {state === 'ready' && !rooms.length && <p className="text-sm text-ink-muted">Chưa có loại phòng. Chủ cơ sở có thể thêm loại phòng ở trên.</p>}
    {rooms.map((room) => <RoomDates key={`${room.id}-${revision}`} room={room} owner={owner} onSaved={() => setRevision((n) => n + 1)} />)}
    {owner && !property.inventory_enabled && rooms.length > 0 && <p className="rounded-xl border border-line p-4 text-sm text-ink-muted">Mở bán bằng nút “Mở bán trên FoodTrip” trong mục “Hoàn thiện hồ sơ để mở bán” phía trên — sau khi hoàn thành đủ 6 mục (ảnh, tiện nghi, chính sách, phòng, tài khoản nhận tiền, điều khoản).</p>}
  </section>
}

function RoomDates({ room, owner, onSaved }) {
  const [form, setForm] = useState({ start: vietnamToday(), end: vietnamToday(), quantity: room.quantity, price: room.nightly_price })
  const [settings, setSettings] = useState({ name: room.name, capacity: room.capacity, quantity: room.quantity, price: room.nightly_price, active: room.active })
  const [days, setDays] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let active = true
    listRoomDates(room.id, vietnamToday()).then((rows) => { if (active) setDays(rows) }).catch((e) => { if (active) setError(inventoryError(e)) })
    return () => { active = false }
  }, [room.id, tick])
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try { await saveRoomDates(room.id, form); setTick((n) => n + 1); setMessage('Đã cập nhật lịch bán phòng.') } catch (e) { setError(inventoryError(e)) }
    finally { setBusy(false) }
  }
  async function editRoom(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try { await updateRoom(room.id, settings); onSaved() } catch (err) { setError(inventoryError(err)) }
    finally { setBusy(false) }
  }
  async function resetDates() {
    setBusy(true); setError(''); setMessage('')
    try { await resetRoomDates(room.id, form); setTick((n) => n + 1); setMessage('Đã dùng lại giá và số lượng mặc định cho khoảng ngày đã chọn.') }
    catch (err) { setError(inventoryError(err)) } finally { setBusy(false) }
  }
  return <details className="rounded-xl border border-line p-4"><summary className="cursor-pointer font-semibold">{room.name} · {room.capacity} khách · {room.quantity} phòng · {Number(room.nightly_price).toLocaleString('vi-VN')}đ/đêm · {room.active ? 'Đang mở bán' : 'Ngừng nhận đơn mới'}</summary>
    {owner && <details className="mt-4 rounded-xl border border-line p-3"><summary>Sửa thông tin / ngừng bán loại phòng</summary>
      <p className="my-3 text-sm text-ink-muted">Chỉ áp dụng cho đơn mới. Ngừng bán không hủy đơn đã có; giá và số khách của đơn cũ được giữ nguyên.</p>
      <form onSubmit={editRoom} className="grid gap-3 sm:grid-cols-2"><fieldset disabled={busy} className="contents">
        <label>Tên loại phòng<input className={INPUT} required minLength={2} maxLength={150} value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} /></label>
        {[['capacity','Khách tối đa',1,20],['quantity','Tổng số phòng',1,1000],['price','Giá mặc định / đêm (VND)',1000,100000000]].map(([key,label,min,max]) => <label key={key}>{label}<input className={INPUT} type="number" required min={min} max={max} value={settings[key]} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} /></label>)}
        <label>Trạng thái<select className={INPUT} value={String(settings.active)} onChange={(e) => setSettings({ ...settings, active: e.target.value === 'true' })}><option value="true">Mở bán</option><option value="false">Ngừng nhận đơn mới</option></select></label>
        <button className={BUTTON}>Lưu loại phòng</button>
      </fieldset></form>
    </details>}
    {owner && <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      {[['start', 'Từ ngày'], ['end', 'Đến ngày (bao gồm)']].map(([key, label]) => <label key={key}>{label}<input className={INPUT} required type="date" min={key === 'end' ? form.start : vietnamToday()} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <label>Số phòng mở bán (0 = khóa ngày)<input className={INPUT} type="number" required min={0} max={room.quantity} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
      <label>Giá mỗi đêm (VND)<input className={INPUT} type="number" required min={1000} max={100000000} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
      <button className={BUTTON} disabled={busy}>Lưu khoảng ngày</button>
      <button type="button" className="rounded-full border border-line-strong px-4 py-2 text-sm disabled:opacity-50" disabled={busy || !form.start || !form.end} onClick={resetDates}>Dùng lại mặc định cho khoảng ngày này</button>
    </form>}
    {error && <p role="alert" className="mt-3 text-chili">{error}</p>}{message && <p role="status" className="mt-3 text-herb">{message}</p>}
    <p className="my-3 text-sm text-ink-muted">Ngày không có trong bảng dùng giá và số lượng mặc định. Số mở bán là tổng hạn mức, chưa trừ đơn đã giữ.</p>
    <div className="max-h-64 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Ngày</th><th>Mở bán</th><th>Giá / đêm</th></tr></thead><tbody>{days.map((d) => <tr key={d.stay_date}><td>{d.stay_date}</td><td>{d.quantity}</td><td>{Number(d.nightly_price).toLocaleString('vi-VN')}đ</td></tr>)}</tbody></table></div>
  </details>
}
