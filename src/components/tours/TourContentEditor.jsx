import { useState } from 'react'
import { ArrowDown, ArrowUp, ImageSquare, Plus, Star, Trash } from '@phosphor-icons/react'
import TourDetail from './TourDetail.jsx'
import { tourError, updateTourDetails, uploadTourPhoto } from '../../lib/tours.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'

const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean)
const FIELD = 'mt-1 block w-full rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm'

/**
 * The operator's editor for a tour's page: photos (the first is the cover),
 * the short introduction the planner's card shows, highlights, the programme
 * day by day, inclusions, and policies — with a preview of the page as
 * travellers will see it.
 */
export default function TourContentEditor({ tour, departures, operatorName, onSaved }) {
  const { lang } = useLanguage()
  const t = (vi, en) => (lang === 'vi' ? vi : en)
  const [photos, setPhotos] = useState(() => [...new Set([tour.cover_url, ...(tour.gallery ?? [])].filter(Boolean))])
  const [form, setForm] = useState(() => ({
    summary: tour.summary ?? '',
    highlights: (tour.highlights ?? []).join('\n'),
    transport: tour.transport ?? '',
    start_point: tour.start_point ?? '',
    includes: (tour.includes ?? []).join('\n'),
    excludes: (tour.excludes ?? []).join('\n'),
    child_policy: tour.child_policy ?? '',
    cancel_policy: tour.cancel_policy ?? '',
    notes: tour.notes ?? '',
  }))
  const [schedule, setSchedule] = useState(() => (tour.schedule?.length ? tour.schedule : [{ title: '', meals: '', body: '' }]))
  const [photoUrl, setPhotoUrl] = useState('')
  const [status, setStatus] = useState('idle') // idle | uploading | saving | saved
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)

  const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setStatus('idle') }
  const details = () => ({
    ...form,
    cover_url: photos[0] ?? '',
    gallery: photos,
    highlights: lines(form.highlights),
    includes: lines(form.includes),
    excludes: lines(form.excludes),
    schedule: schedule.filter((day) => day.title.trim()),
  })

  async function upload(files) {
    setStatus('uploading'); setError('')
    try {
      const added = []
      for (const file of [...files].slice(0, 12 - photos.length)) added.push(await uploadTourPhoto(tour.operator_id, file))
      setPhotos((old) => [...old, ...added])
    } catch (e) {
      setError(tourError(e, lang))
    } finally {
      setStatus('idle')
    }
  }
  function addUrl() {
    const url = photoUrl.trim()
    if (!/^https:\/\//.test(url)) { setError(tourError({ code: 'invalid-photo-url' }, lang)); return }
    setPhotos((old) => [...new Set([...old, url])].slice(0, 12)); setPhotoUrl(''); setError('')
  }
  const move = (i, step) => setPhotos((old) => {
    const next = [...old]; const [item] = next.splice(i, 1); next.splice(Math.max(0, Math.min(next.length, i + step)), 0, item); return next
  })
  const editDay = (i, key, value) => setSchedule((old) => old.map((day, j) => (j === i ? { ...day, [key]: value } : day)))

  async function save(e) {
    e.preventDefault()
    setStatus('saving'); setError('')
    try {
      await updateTourDetails(tour.id, details())
      setStatus('saved'); onSaved?.()
    } catch (err) {
      setError(tourError(err, lang)); setStatus('idle')
    }
  }

  const previewTour = {
    ...tour, ...details(), operator_name: operatorName,
    departures: departures.filter((d) => d.status === 'open').map((d) => ({ ...d, available: d.capacity })),
  }

  return (
    <form onSubmit={save} className="tour-form">
      <p className="text-sm text-ink-muted">{t('Nội dung này hiện trên thẻ gợi ý và trang chi tiết tour khi khách lên lịch trình. Ảnh đầu tiên là ảnh bìa.', "This appears on the suggestion card and the tour's page when travellers plan a trip. The first photo is the cover.")}</p>

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">{t('Ảnh tour', 'Tour photos')} ({photos.length}/12)</legend>
        {photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((src, i) => (
              <li key={src} className="relative overflow-hidden rounded-lg border border-line">
                <img src={src} alt="" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover" />
                {i === 0 && <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-chili px-2 py-0.5 text-2xs font-bold text-chili-ink"><Star size={10} weight="fill" />{t('Ảnh bìa', 'Cover')}</span>}
                <div className="flex justify-between bg-surface px-1.5 py-1">
                  <span className="flex gap-1">
                    <button type="button" aria-label={t('Lên trước', 'Move earlier')} disabled={i === 0} onClick={() => move(i, -1)} className="p-1 disabled:opacity-30"><ArrowUp size={13} /></button>
                    <button type="button" aria-label={t('Xuống sau', 'Move later')} disabled={i === photos.length - 1} onClick={() => move(i, 1)} className="p-1 disabled:opacity-30"><ArrowDown size={13} /></button>
                  </span>
                  <button type="button" aria-label={t('Xoá ảnh', 'Remove photo')} onClick={() => setPhotos((old) => old.filter((p) => p !== src))} className="p-1 text-chili"><Trash size={13} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line-strong px-4 py-2 text-sm font-semibold">
            <ImageSquare size={15} />{status === 'uploading' ? t('Đang tải ảnh…', 'Uploading…') : t('Tải ảnh lên (JPG/PNG/WebP, ≤ 3 MB)', 'Upload photos (JPG/PNG/WebP, ≤ 3 MB)')}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={status === 'uploading' || photos.length >= 12} onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
          </label>
          <span className="text-sm text-ink-faint">{t('hoặc', 'or')}</span>
          <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder={t('https://… đường dẫn ảnh', 'https://… photo link')} className="min-w-[220px] flex-1 !mt-0" />
          <button type="button" onClick={addUrl} className="tour-secondary">{t('Thêm', 'Add')}</button>
        </div>
      </fieldset>

      <label>{t('Giới thiệu ngắn (hiện trên thẻ gợi ý)', 'Summary (shown on the suggestion card)')}<textarea rows={3} maxLength={600} value={form.summary} onChange={set('summary')} className={FIELD} /></label>
      <label>{t('Điểm nổi bật — mỗi dòng một ý (tối đa 10)', 'Highlights — one per line (up to 10)')}<textarea rows={4} value={form.highlights} onChange={set('highlights')} className={FIELD} placeholder={t('Ăn cao lầu tại quán 50 năm tuổi\nThả đèn hoa đăng sông Hoài', 'Cao lau at a 50-year-old shop\nFloating lanterns on the Hoai river')} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>{t('Phương tiện', 'Transport')}<input maxLength={120} value={form.transport} onChange={set('transport')} placeholder={t('Xe du lịch, đi bộ, xe đạp…', 'Coach, walking, bicycle…')} /></label>
        <label>{t('Xuất phát từ', 'Starts from')}<input maxLength={200} value={form.start_point} onChange={set('start_point')} placeholder={t('TP Đà Nẵng / đón tại khách sạn', 'Da Nang / hotel pick-up')} /></label>
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">{t('Lịch trình theo ngày / chặng', 'Programme by day / stage')}</legend>
        {schedule.map((day, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between"><span className="font-utility text-xs font-bold text-chili">{schedule.length > 1 ? t(`Ngày ${i + 1}`, `Day ${i + 1}`) : t('Chương trình', 'Programme')}</span>
              {schedule.length > 1 && <button type="button" onClick={() => setSchedule((old) => old.filter((_, j) => j !== i))} className="text-xs text-chili">{t('Xoá', 'Remove')}</button>}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
              <input maxLength={200} value={day.title} onChange={(e) => editDay(i, 'title', e.target.value)} placeholder={t('TP. Đà Nẵng - Phố cổ Hội An', 'Da Nang - Hoi An old town')} aria-label={t('Tiêu đề', 'Title')} className="!mt-0" />
              <input maxLength={120} value={day.meals} onChange={(e) => editDay(i, 'meals', e.target.value)} placeholder={t('Ăn sáng, trưa', 'Breakfast, lunch')} aria-label={t('Bữa ăn', 'Meals')} className="!mt-0" />
            </div>
            <textarea rows={4} maxLength={4000} value={day.body} onChange={(e) => editDay(i, 'body', e.target.value)} placeholder={t('08:00 Đón khách…\n09:30 Tham quan…', '08:00 Pick-up…\n09:30 Visit…')} aria-label={t('Chi tiết', 'Details')} className={`${FIELD} !mt-0`} />
          </div>
        ))}
        {schedule.length < 15 && <button type="button" onClick={() => setSchedule((old) => [...old, { title: '', meals: '', body: '' }])} className="tour-secondary justify-self-start"><Plus size={12} className="mr-1 inline" />{t('Thêm ngày / chặng', 'Add a day / stage')}</button>}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>{t('Tour bao gồm — mỗi dòng một mục', 'Included — one per line')}<textarea rows={5} value={form.includes} onChange={set('includes')} className={FIELD} /></label>
        <label>{t('Tour chưa bao gồm — mỗi dòng một mục', 'Not included — one per line')}<textarea rows={5} value={form.excludes} onChange={set('excludes')} className={FIELD} /></label>
      </div>
      <label>{t('Chính sách trẻ em', 'Children')}<textarea rows={3} maxLength={3000} value={form.child_policy} onChange={set('child_policy')} className={FIELD} /></label>
      <label>{t('Chính sách huỷ tour', 'Cancellation policy')}<textarea rows={3} maxLength={3000} value={form.cancel_policy} onChange={set('cancel_policy')} className={FIELD} /></label>
      <label>{t('Lưu ý khi tham gia', 'Good to know')}<textarea rows={3} maxLength={3000} value={form.notes} onChange={set('notes')} className={FIELD} /></label>

      {error && <p role="alert" className="tour-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="tour-primary" disabled={status === 'saving' || status === 'uploading'}>{status === 'saving' ? t('Đang lưu…', 'Saving…') : t('Lưu nội dung trang tour', 'Save tour page')}</button>
        <button type="button" className="tour-secondary" onClick={() => setPreview(!preview)}>{preview ? t('Ẩn xem trước', 'Hide preview') : t('Xem trước trang tour', 'Preview tour page')}</button>
        {status === 'saved' && <span role="status" className="text-sm text-herb">{t('Đã lưu.', 'Saved.')}</span>}
      </div>
      {preview && <div className="mt-2 rounded-2xl border border-dashed border-line-strong p-4"><TourDetail tour={previewTour} lang={lang} /></div>}
    </form>
  )
}
