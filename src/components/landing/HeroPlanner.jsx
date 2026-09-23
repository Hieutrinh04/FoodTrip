import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Clock, Wallet, Users, ArrowRight } from '@phosphor-icons/react'
import Chip from '../ui/Chip.jsx'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { fadeUp } from '../../motion/variants.js'

const C = {
  vi: {
    destination: 'Điểm đến', destinationV: 'Hội An, Quảng Nam',
    duration: 'Thời gian', durationV: '2 ngày 1 đêm',
    budget: 'Ngân sách / người', budgetV: '1.500.000đ',
    people: 'Số người', peopleV: '2 người',
    chips: ['Hải sản', 'Cà phê', 'Phố cổ & check-in', 'Ăn chay', 'Xe máy', 'Ô tô riêng'],
    note: 'AI sẽ kiểm tra giờ mở cửa & khoảng cách thực tế giữa các điểm.',
    cta: 'Tạo lịch trình',
  },
  en: {
    destination: 'Destination', destinationV: 'Hoi An, Quang Nam',
    duration: 'Duration', durationV: '2 days, 1 night',
    budget: 'Budget / person', budgetV: '1,500,000đ',
    people: 'People', peopleV: '2 people',
    chips: ['Seafood', 'Coffee', 'Old town & photos', 'Vegetarian', 'Motorbike', 'Private car'],
    note: 'Our AI checks real opening hours & distances between stops.',
    cta: 'Plan my trip',
  },
}

export default function HeroPlanner() {
  const { lang } = useLanguage()
  const c = C[lang]
  const navigate = useNavigate()
  const [active, setActive] = useState([0, 1, 4])

  function toggle(i) {
    setActive((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
  }

  return (
    <motion.div variants={fadeUp} className="w-full bg-surface border border-line rounded-[14px] shadow-soft p-5 md:p-6 mt-10 md:mt-14">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field icon={MapPin} label={c.destination} value={c.destinationV} />
        <Field icon={Clock} label={c.duration} value={c.durationV} />
        <Field icon={Wallet} label={c.budget} value={c.budgetV} />
        <Field icon={Users} label={c.people} value={c.peopleV} />
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {c.chips.map((chip, i) => (
          <Chip key={chip} active={active.includes(i)} onClick={() => toggle(i)}>
            {chip}
          </Chip>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 mt-5 flex-wrap">
        <span className="text-sm text-ink-faint max-w-[38ch]">{c.note}</span>
        <button
          onClick={() => navigate('/plan')}
          className="inline-flex items-center gap-2 font-utility font-semibold text-md px-6 py-[14px] rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted active:scale-[0.97] transition-all"
        >
          {c.cta} <ArrowRight size={16} />
        </button>
      </div>
    </motion.div>
  )
}

function Field({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-utility text-2xs font-bold uppercase tracking-wider text-ink-faint">{label}</label>
      <div className="font-semibold text-md flex items-center gap-1.5 pb-2.5 border-b-[1.5px] border-line">
        <Icon size={16} className="text-chili" />
        {value}
      </div>
    </div>
  )
}
