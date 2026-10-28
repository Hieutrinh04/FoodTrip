import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

export default function SystemReadiness({ lang }) {
  const [result,setResult] = useState(null)
  const [status,setStatus] = useState('loading')
  const [revision,setRevision] = useState(0)
  const t = (vi,en) => lang === 'vi' ? vi : en
  useEffect(() => {
    let active = true
    setStatus('loading')
    supabase.functions.invoke('system-readiness',{body:{}}).then(({data,error}) => {
      if (!active) return
      if (error) { setResult(null); setStatus('error'); return }
      setResult(data); setStatus('ready')
    }).catch(() => { if (active) { setResult(null); setStatus('error') } })
    return () => { active = false }
  },[revision])
  if (status === 'loading') return <p role="status">{t('Đang kiểm tra hệ thống…','Checking system…')}</p>
  if (status === 'error') return <div role="alert"><p>{t('Chưa đọc được trạng thái máy chủ. Không thể kết luận đã sẵn sàng.','Could not read server diagnostics. Readiness is unknown.')}</p><button onClick={() => setRevision((n)=>n+1)} className="mt-3 text-chili underline">{t('Thử lại','Retry')}</button></div>
  const config = result.configuration
  const checks = [
    [t('Thanh toán SePay','SePay payment'),result.mock_payments || config.sepay_real,result.mock_payments ? t('Mocktest — không chuyển tiền thật.','Mock test — no real funds.') : t('Cấu hình tài khoản thật. Vẫn cần kiểm thử webhook trước khi mở bán.','Real account configured. Verify webhooks before going live.')],
    [t('Phòng chia sẻ GPS','Private GPS rooms'),result.live_rooms,t('Kiểm tra quyền từng yêu cầu; không dùng kênh vị trí công khai.','Membership checked on every request; no public location channel.')],
    [t('Email thông báo','Notification email'),config.notification_email,t('Cần RESEND_API_KEY, EMAIL_FROM và SITE_URL HTTPS. SMTP đăng nhập/khôi phục mật khẩu cấu hình riêng trong Supabase Auth.','Requires RESEND_API_KEY, EMAIL_FROM and HTTPS SITE_URL. Auth/recovery SMTP is configured separately in Supabase Auth.')],
    [t('Tác vụ định kỳ','Scheduled jobs'),config.cron_secret && result.jobs.length === 7 && result.jobs.every((j)=>j.active && j.failures===0),t('Hết hạn đơn, nhắc lịch, gửi email và dọn dữ liệu tạm. Kiểm tra lỗi 24 giờ bên dưới.','Booking expiry, reminders, email dispatch and temporary-data cleanup. Check 24-hour failures below.')],
    [t('Khách sạn đang mở bán','Bookable properties'),result.bookable_properties>0,t(`${result.bookable_properties} cơ sở đã bật kho phòng. Cần đối tác nhập phòng và giá để đặt thử.`,`${result.bookable_properties} properties with inventory enabled. Partners must enter rooms and prices for booking tests.`)],
    [t('Tour đã xuất bản','Published tours'),result.published_tours>0,t(`${result.published_tours} tour từ đối tác được duyệt.`,`${result.published_tours} tours from approved operators.`)],
  ]
  return <section className="rounded-2xl border border-line bg-surface p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{t('Trạng thái hệ thống','System readiness')}</h2><button onClick={()=>setRevision((n)=>n+1)} className="rounded-full border border-line px-4 py-2 text-sm">{t('Kiểm tra lại','Refresh')}</button></div>
    <p className="mt-3 text-sm text-ink-muted">{t('Đây là kiểm tra cấu hình, không phải chứng nhận hoạt động thực tế. Không hiển thị khóa bí mật.','Configuration checks are not end-to-end certification. No secret values are displayed.')}</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">{checks.map(([title,ok,description])=><div key={title} className="rounded-xl border border-line p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{title}</h3><span className={`rounded-full px-2 py-1 text-xs ${ok?'bg-herb/10 text-herb':'bg-lantern/10 text-ink-muted'}`}>{ok?t('Đã cấu hình','Configured'):t('Cần bổ sung','Needs setup')}</span></div><p className="mt-2 text-sm text-ink-muted">{description}</p></div>)}</div>
    <ul className="mt-5 space-y-1 font-utility text-xs text-ink-muted">{result.jobs.map((job)=><li key={job.name}>{job.name}: {job.active?t('đang bật','active'):t('chưa bật','inactive')} · {t('lỗi 24 giờ qua','failures in 24h')}: {job.failures}</li>)}</ul>
    <p className="mt-4 text-xs text-ink-faint">{t('Kiểm tra lúc','Checked at')} {new Date(result.checked_at).toLocaleString(lang==='vi'?'vi-VN':'en-GB')}</p>
  </section>
}
