import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import AuthModal from '../components/auth/AuthModal.jsx'
import { TOUR_STATUS, tourDate, tourError, tourMoney, tourRows, tourRpc, vnDate, vnTime, OPERATOR_TYPES } from '../lib/tours.js'
import TourContentEditor from '../components/tours/TourContentEditor.jsx'
import TourApplication from '../components/tours/TourApplication.jsx'
import { OperatorChecklist, TourChecklist } from '../components/tours/TourOnboarding.jsx'
import './Tours.css'

// Server permissions remain authoritative; these forms only expose actions
// for the selected operator and never set a user's global account role.
export default function TourPartner() {
  const { user } = useAuth()
  return <TourPartnerAccount key={user?.id ?? 'guest'} />
}

function TourPartnerAccount() {
  const { user, loading } = useAuth()
  const [data, setData] = useState(null)
  const [tick, setTick] = useState(0)
  const [error, setError] = useState('')
  const [auth, setAuth] = useState(false)
  const [operatorId, setOperatorId] = useState('')
  // Bumped when the operator profile or terms change: every tour's checklist depends on them.
  const [profileTick, setProfileTick] = useState(0)
  const reload = () => setTick((n) => n + 1)
  useEffect(() => {
    let active = true; setData(null); setError('')
    if (!user) return () => { active = false }
    Promise.all([tourRows('tour_operators'),tourRows('tour_members'),tourRows('tours'),tourRows('tour_departures'),tourRows('tour_reservations'),tourRpc('tour_guide_manifest')])
      .then(([operators,members,tours,departures,bookings,manifest]) => { if (active) setData({ operators,members,tours,departures,bookings,manifest }) })
      .catch((e) => { if (active) setError(tourError(e)) })
    return () => { active = false }
  }, [user, tick])
  const operators = data?.operators.filter((o) => o.status === 'approved' && data.members.some((m) => m.operator_id===o.id && m.user_id===user?.id && ['owner','manager'].includes(m.role))) ?? []
  const operator = operators.find((o) => o.id===operatorId) ?? operators[0]
  const owner = data?.members.some((m) => m.operator_id===operator?.id && m.user_id===user?.id && m.role==='owner')
  return <div className="tour-page"><span className="eyebrow">Cổng đối tác</span><h1>Quản lý tour & đoàn khách</h1>
    <div className="tour-links"><Link to="/partner">Quản lý khách sạn →</Link><Link to="/plan">Khách chọn tour trong trang Tạo lịch trình →</Link></div>
    <p className="text-ink-muted">Yêu cầu đặt chỗ chưa thu tiền. Xác nhận chỗ không thay đổi trạng thái thanh toán và không tạo giao dịch ngân hàng.</p>
    {loading && <p role="status">Đang kiểm tra tài khoản…</p>}
    {!loading && !user && <button className="tour-primary" onClick={() => setAuth(true)}>Đăng nhập cổng đối tác</button>}
    {error && <p role="alert" className="tour-error">{error}</p>}
    {user && <button className="tour-secondary mt-4" onClick={reload}>Tải lại dữ liệu</button>}
    {user && !data && !error && <p role="status">Đang tải dữ liệu đối tác…</p>}
    {data && <>
      {data.operators.filter((o) => o.applicant_id===user.id && o.status==='pending').map((o) => <div key={o.id} className="tour-card"><h2>Hồ sơ “{o.name}” đang chờ duyệt</h2><p className="text-ink-muted">FoodTrip sẽ gọi {o.phone ? `số ${o.phone}` : 'số điện thoại bạn đã khai'} để xác minh và duyệt trong 1–3 ngày làm việc. Khi được duyệt, trang này hiện danh sách việc cần làm để công bố tour đầu tiên.</p></div>)}
      {!data.operators.some((o) => o.applicant_id===user.id && ['pending','approved'].includes(o.status)) && (
        <TourApplication onDone={reload} rejected={data.operators.filter((o) => o.applicant_id===user.id && o.status==='rejected').sort((x, y) => y.created_at.localeCompare(x.created_at))[0]} />
      )}
      {operator && <>
        <label className="mt-6">Đơn vị đang quản lý<select value={operator.id} onChange={(e) => setOperatorId(e.target.value)}>{operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        {owner && <OperatorChecklist key={operator.id} operator={operator} onSaved={() => setProfileTick((n) => n + 1)} />}
        {owner && <details className="tour-card"><summary>Thêm nhân sự cho đơn vị</summary><p>Nhập email của tài khoản FoodTrip đã có. Quản lý được thao tác tour và xem khách; hướng dẫn viên chỉ xem đoàn được giao.</p>
          <ActionForm key={operator.id} onDone={reload} label="Cấp quyền cho thành viên" submit={(f) => tourRpc('tour_add_member',{ p_operator:operator.id,p_email:f.email,p_role:f.role })} fields={[
            { key:'email',label:'Email thành viên',type:'email' },{ key:'role',label:'Vai trò',options:[['guide','Hướng dẫn viên'],['manager','Quản lý tour']] },
          ]} />
          <ul className="mt-4 text-sm">{data.members.filter((m) => m.operator_id===operator.id).map((m) => <li key={m.user_id}>{m.display_name || m.user_id} · {m.role}</li>)}</ul>
          {data.members.some((m) => m.operator_id===operator.id && m.role!=='owner') && <details className="mt-4"><summary>Thu hồi quyền nhân sự</summary><ActionForm key={`remove-${operator.id}`} label="Xác nhận thu hồi quyền" onDone={reload} submit={(f) => tourRpc('tour_remove_member',{ p_operator:operator.id,p_user:f.member })} fields={[
            { key:'member',label:'Nhân sự cần thu hồi',options:data.members.filter((m) => m.operator_id===operator.id && m.role!=='owner').map((m) => [m.user_id,`${m.display_name || m.user_id} · ${m.role}`]) },
          ]} /></details>}
        </details>}
        <details className="tour-card"><summary>Tạo tour mẫu</summary><ActionForm key={operator.id} onDone={reload} label="Lưu tour nháp" submit={(f) => tourRpc('tour_create',{ p_operator:operator.id,p_title:f.title,p_destination:f.destination,p_description:f.description,p_meeting:f.meeting })} fields={[
          { key:'title',label:'Tên tour',minLength:3,maxLength:200 },{ key:'destination',label:'Điểm đến',minLength:2,maxLength:200 },
          { key:'description',label:'Lịch trình, dịch vụ bao gồm/không bao gồm và điều kiện',type:'textarea',minLength:20,maxLength:10000 },
          { key:'meeting',label:'Địa chỉ điểm hẹn cụ thể',minLength:5,maxLength:500 },
        ]} /></details>
        {data.tours.filter((t) => t.operator_id===operator.id).map((t) => <ManagedTour key={t.id} tour={t} data={data} reload={reload} profileTick={profileTick} />)}
        {!data.tours.some((t) => t.operator_id===operator.id) && <p>Chưa có tour. Tạo tour nháp, thêm lịch khởi hành rồi công bố để nhận yêu cầu.</p>}
      </>}
      {data.members.some((m) => m.user_id===user.id) && <section className="tour-card"><h2>Đoàn được giao hướng dẫn</h2>{!data.manifest.length && <p>Chưa có chuyến sắp tới được giao cho bạn.</p>}{data.manifest.map((d) => <article className="tour-card" key={d.id}><h3 className="font-bold">{d.title}</h3><p>{tourDate(d.starts_at)} · {d.meeting_point}</p><ul>{d.guests.map((g,i) => <li key={i}>{g.name} · {g.seats} người</li>)}</ul></article>)}</section>}
    </>}{auth && <AuthModal onClose={() => setAuth(false)} />}
  </div>
}

function ManagedTour({ tour, data, reload, profileTick }) {
  const [busy,setBusy] = useState(false)
  const [ready,setReady] = useState(false)
  const [check,setCheck] = useState(0)
  const [error,setError] = useState('')
  const guides = data.members.filter((m) => m.operator_id===tour.operator_id && m.role==='guide')
  async function publish() {
    setBusy(true); setError('')
    try { await tourRpc('tour_publish',{ p_tour:tour.id,p_published:!tour.published }); reload() } catch(e) { setError(tourError(e)); setBusy(false) }
  }
  return <section className="tour-card"><h2>{tour.title}</h2><p>{tour.destination} · {tour.published ? 'Đã công bố' : 'Bản nháp'}</p>
    {!tour.published && <TourChecklist tourId={tour.id} refresh={check + profileTick} onReady={setReady} />}
    <button disabled={busy || (!tour.published && !ready)} onClick={publish} className={tour.published ? 'tour-secondary' : 'tour-primary'}>{tour.published ? 'Ẩn tour khỏi danh sách đặt mới' : 'Công bố tour'}</button>
    {!tour.published && !ready && <p className="text-2xs text-ink-faint">Hoàn thành đủ các mục trên để công bố tour.</p>}
    {error && <p role="alert" className="tour-error">{error}</p>}
    <details><summary>Sửa tên tour, điểm đến và điểm hẹn</summary><p>Chỉ sửa khi tour đã ẩn và chưa từng có đơn đặt, để bảo toàn thông tin lịch sử của khách.</p>
      <ActionForm label="Lưu thông tin cơ bản" onDone={reload} submit={(f) => tourRpc('tour_update_basics',{ p_tour:tour.id,p_title:f.title,p_destination:f.destination,p_description:f.description,p_meeting:f.meeting })} fields={[
        { key:'title',label:'Tên tour',initial:tour.title,minLength:3,maxLength:200 },{ key:'destination',label:'Điểm đến',initial:tour.destination,minLength:2,maxLength:200 },
        { key:'description',label:'Mô tả',initial:tour.description,type:'textarea',minLength:20,maxLength:10000 },{ key:'meeting',label:'Điểm hẹn',initial:tour.meeting_point,minLength:5,maxLength:500 },
      ]} />
    </details>
    <details><summary>Nội dung trang tour (ảnh, giới thiệu, lịch trình, bao gồm, chính sách){!tour.cover_url && ' — chưa có ảnh bìa'}</summary>
      <TourContentEditor tour={tour} departures={data.departures.filter((d) => d.tour_id===tour.id)} operatorName={data.operators.find((o) => o.id===tour.operator_id)?.name ?? ''} onSaved={() => setCheck((n) => n + 1)} />
    </details>
    <details><summary>Thêm lịch khởi hành</summary><p>Thời gian nhập theo giờ Việt Nam (UTC+7). Giá mới chỉ áp dụng cho yêu cầu đặt mới, không sửa tổng tiền của đơn đã có.</p>
      <ActionForm label="Tạo lịch khởi hành" onDone={reload} submit={(f) => tourRpc('tour_create_departure',{
        p_tour:tour.id,p_start:new Date(`${f.start}:00+07:00`).toISOString(),p_end:new Date(`${f.end}:00+07:00`).toISOString(),p_capacity:Number(f.capacity),p_price:Number(f.price),p_guide:f.guide || null,
      })} fields={[
        { key:'start',label:'Khởi hành',type:'datetime-local' },{ key:'end',label:'Kết thúc',type:'datetime-local' },
        { key:'capacity',label:'Số chỗ',type:'number',min:1,max:500 },{ key:'price',label:'Giá VND / người',type:'number',min:1000,max:100000000 },
        { key:'guide',label:'Hướng dẫn viên',required:false,options:[['','Chưa phân công'],...guides.map((g) => [g.user_id,g.display_name || g.user_id])] },
      ]} />
    </details>
    {data.departures.filter((d) => d.tour_id===tour.id).sort((a,b) => a.starts_at.localeCompare(b.starts_at)).map((d) => <article key={d.id} className="tour-card"><h3 className="font-bold">{tourDate(d.starts_at)} → {tourDate(d.ends_at)}</h3><p>{d.capacity} chỗ · {tourMoney(d.price)}/người</p>
      <p>Hướng dẫn viên: {guides.find((g) => g.user_id===d.guide_id)?.display_name || (d.guide_id ? 'Cần phân công lại nhân sự' : 'Chưa phân công')}</p>
      <p>{d.status==='open' ? 'Đang mở nhận khách' : 'Đã đóng nhận khách'} · Đã giữ {data.bookings.filter((b) => b.departure_id===d.id && b.status!=='cancelled').reduce((sum,b) => sum+b.seats,0)}/{d.capacity} chỗ</p>
      {new Date(d.starts_at)>new Date() && <details><summary>Sửa giờ, giá và số chỗ</summary><p>Giờ chỉ đổi được khi chưa có lịch sử đặt chỗ. Giá mới không đổi tổng tiền đơn cũ; số chỗ không được thấp hơn chỗ đã giữ.</p>
        <ActionForm label="Lưu giá và số chỗ" onDone={reload} submit={(f) => tourRpc('tour_edit_departure',{
          p_departure:d.id,p_start:new Date(`${f.start}:00+07:00`).toISOString(),p_end:new Date(`${f.end}:00+07:00`).toISOString(),p_capacity:Number(f.capacity),p_price:Number(f.price),
        })} fields={[
          { key:'start',label:'Khởi hành (giờ Việt Nam)',type:'datetime-local',initial:`${vnDate(d.starts_at)}T${vnTime(d.starts_at)}` },
          { key:'end',label:'Kết thúc (giờ Việt Nam)',type:'datetime-local',initial:`${vnDate(d.ends_at)}T${vnTime(d.ends_at)}` },
          { key:'capacity',label:'Tổng số chỗ',type:'number',initial:d.capacity,min:1,max:500 },{ key:'price',label:'Giá mới / người (VND)',type:'number',initial:d.price,min:1000,max:100000000 },
        ]} />
      </details>}
      {new Date(d.starts_at)>new Date() && <details><summary>Phân công hướng dẫn viên / đóng nhận chỗ mới</summary><p>Đóng nhận chỗ không hủy các đơn đã có. Khi lưu, hướng dẫn viên được thay bằng lựa chọn bên dưới.</p><ActionForm label="Lưu lịch khởi hành" onDone={reload} submit={(f) => tourRpc('tour_update_departure',{ p_departure:d.id,p_open:f.open==='yes',p_guide:f.guide || null })} fields={[
        { key:'open',label:'Nhận yêu cầu mới',options:d.status==='open' ? [['yes','Đang mở'],['no','Đóng']] : [['no','Đang đóng'],['yes','Mở lại']] },
        { key:'guide',label:'Hướng dẫn viên',required:false,options:[...(d.guide_id && guides.some((g) => g.user_id===d.guide_id) ? [[d.guide_id,guides.find((g) => g.user_id===d.guide_id).display_name || d.guide_id]] : []),['','Chưa phân công'],...guides.filter((g) => g.user_id!==d.guide_id).map((g) => [g.user_id,g.display_name || g.user_id])] },
      ]} /></details>}
      {data.bookings.filter((b) => b.departure_id===d.id).map((b) => <div key={b.id} className="mt-4 border-t border-line pt-3"><p>{b.guest_name} · {b.phone} · {b.seats} người · {tourMoney(b.total_price)}</p><p>{TOUR_STATUS[b.status]} · Chưa thu tiền qua FoodTrip</p>{b.note && <p>{b.note}</p>}
        {['requested','confirmed'].includes(b.status) && <ActionForm label="Cập nhật đơn" onDone={reload} submit={(f) => tourRpc('tour_set_reservation',{ p_booking:b.id,p_status:f.status,p_note:f.note })} fields={[
          { key:'status',label:'Thao tác',options:b.status==='requested' ? [['confirmed','Xác nhận chỗ'],['cancelled','Hủy yêu cầu']] : [['completed','Hoàn thành (sau giờ kết thúc)'],['cancelled','Hủy trước khởi hành']] },
          { key:'note',label:'Ghi chú / lý do hủy',required:false,maxLength:2000 },
        ]} />}
      </div>)}
    </article>)}
  </section>
}

/**
 * One operator application as the admin checks it: who, where, which papers,
 * the terms accepted — then approve in one click after the verification call,
 * or reject with a reason the applicant will read.
 */
function OperatorReviewRow({ o, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  async function review(approve) {
    if (!approve && note.trim().length < 3) { setError('Ghi lý do từ chối (ít nhất 3 ký tự) — người đăng ký sẽ thấy.'); return }
    setBusy(true); setError('')
    try { await tourRpc('tour_review_operator', { p_operator: o.id, p_approve: approve, p_note: approve ? 'Đã xác minh' : note.trim() }); onDone() } catch (e) { setError(tourError(e)); setBusy(false) }
  }
  const papers = [o.travel_license && `GP lữ hành ${o.travel_license}`, o.business_license && `GPKD ${o.business_license}`, o.guide_card && `Thẻ HDV ${o.guide_card}`, o.tax_code && `MST ${o.tax_code}`].filter(Boolean)
  const STATUS = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' }
  return <article className="tour-card">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="font-bold">{o.name}</h3>
      <span className={`rounded-full px-2.5 py-0.5 font-utility text-2xs font-bold ${o.status === 'pending' ? 'bg-lantern/20 text-lantern' : o.status === 'approved' ? 'bg-herb/15 text-herb' : 'bg-paper-2 text-ink-muted'}`}>{STATUS[o.status] ?? o.status}</span>
    </div>
    <p className="text-sm text-ink-muted">{[OPERATOR_TYPES[o.operator_type]?.vi, o.cities?.length ? o.cities.join(', ') : null].filter(Boolean).join(' · ') || 'Đăng ký theo mẫu cũ'}</p>
    <p className="text-sm">{o.contact_name ? `${o.contact_name} (${o.contact_role === 'manager' ? 'quản lý' : 'chủ'}) · ${o.phone}` : o.contact}</p>
    {papers.length > 0 && <p className="text-2xs text-ink-muted">{papers.join(' · ')}</p>}
    {o.website && <a href={o.website} target="_blank" rel="noopener noreferrer" className="break-all text-2xs text-chili hover:underline">{o.website}</a>}
    {o.description && <p className="text-sm text-ink-muted">“{o.description}”</p>}
    {o.terms_accepted_at && <p className="text-2xs text-herb">Đã đồng ý điều khoản tour v{o.terms_version} · {new Date(o.terms_accepted_at).toLocaleString('vi-VN')}</p>}
    {o.review_note && o.status !== 'pending' && <p className="text-2xs text-ink-faint">Ghi chú: {o.review_note}</p>}
    {o.status === 'pending' && <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => review(true)} className="inline-flex items-center gap-1.5 rounded-full bg-herb px-4 py-1.5 font-utility text-xs font-semibold text-herb-ink disabled:opacity-50">✓ Duyệt (đã gọi xác minh)</button>
      {!rejecting ? <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="tour-secondary">Từ chối…</button> : <>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do từ chối" maxLength={2000} className="!mt-0 !w-auto flex-1" />
        <button type="button" disabled={busy} onClick={() => review(false)} className="tour-secondary">Xác nhận từ chối</button>
      </>}
    </div>}
    {error && <p role="alert" className="tour-error">{error}</p>}
  </article>
}

export function TourOperatorReview() {
  const [rows,setRows] = useState([])
  const [error,setError] = useState('')
  const [tick,setTick] = useState(0)
  const [loading,setLoading] = useState(true)
  useEffect(() => {
    let active=true; setLoading(true); setError('')
    tourRows('tour_operators').then((data) => { if(active) { setRows(data); setLoading(false) } }).catch((e) => { if(active) { setError(tourError(e)); setLoading(false) } })
    return () => { active=false }
  }, [tick])
  return <div className="tour-page !p-0"><h2 className="text-xl font-bold">Đơn vị tổ chức tour</h2><p>Xác minh thông tin đơn vị trước khi duyệt. Phê duyệt cho phép chủ đơn vị công bố tour và nhận thông tin khách đặt.</p><button className="tour-secondary" onClick={() => setTick((n) => n+1)}>Tải lại</button>
    {loading && <p role="status">Đang tải hồ sơ…</p>}{error && <p role="alert" className="tour-error">{error}</p>}
    {!loading && !error && !rows.length && <p>Chưa có hồ sơ đối tác tour.</p>}
    {[...rows].sort((x, y) => (x.status === 'pending' ? -1 : 0) - (y.status === 'pending' ? -1 : 0)).map((o) => <OperatorReviewRow key={o.id} o={o} onDone={() => setTick((n) => n+1)} />)}
  </div>
}

function ActionForm({ fields, submit, onDone, label }) {
  const [form,setForm] = useState(() => Object.fromEntries(fields.map((f) => [f.key,f.initial ?? f.options?.[0]?.[0] ?? ''])))
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  async function run(e) {
    e.preventDefault(); setBusy(true); setError('')
    try { await submit(form); onDone() } catch(e) { setError(tourError(e)) } finally { setBusy(false) }
  }
  return <form onSubmit={run} className="tour-form"><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
    {fields.map(({ key,label:fieldLabel,options,initial: _initial,required=true,...attrs }) => <label key={key}>{fieldLabel}{options ? <select required={required} value={form[key]} onChange={(e) => setForm({ ...form,[key]:e.target.value })}>{options.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select> : attrs.type==='textarea' ? <textarea required={required} minLength={attrs.minLength} maxLength={attrs.maxLength} rows={5} value={form[key]} onChange={(e) => setForm({ ...form,[key]:e.target.value })} /> : <input {...attrs} required={required} value={form[key]} onChange={(e) => setForm({ ...form,[key]:e.target.value })} />}</label>)}
  </fieldset>{error && <p role="alert" className="tour-error">{error}</p>}<button className="tour-primary justify-self-start" disabled={busy}>{busy ? 'Đang xử lý…' : label}</button></form>
}
