import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import CityPattern from '../CityPattern.jsx'
import RatingStars from '../ui/RatingStars.jsx'
import CategoryIcon from '../ui/CategoryIcon.jsx'
import { getCity, CATEGORY_LABEL } from '../../data/destinations.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { cardHover, fadeUp } from '../../motion/variants.js'

export default function PlaceCard({ place, index = 0 }) {
  const { lang } = useLanguage()
  const city = getCity(place.city)

  return (
    <motion.div variants={fadeUp} custom={index} className="h-full">
      <motion.div initial="rest" whileHover="hover" whileTap={{ scale: 0.985 }} variants={cardHover} className="h-full">
        <Link
          to={`/place/${place.id}`}
          className="group flex flex-col h-full bg-surface border border-line rounded-xl overflow-hidden shadow-soft"
        >
          <div className="relative h-[170px]">
            {place.image ? (
              <img src={place.image} alt={place.name[lang]} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <CityPattern pattern={city.pattern} accent={city.accent} className="h-full" />
            )}
            <span className="absolute top-3 left-3 w-8 h-8 rounded-full bg-surface/90 backdrop-blur flex items-center justify-center text-ink">
              <CategoryIcon category={place.category} />
            </span>
          </div>
          <div className="p-4 pb-5 flex flex-col gap-2 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-lg leading-snug">{place.name[lang]}</span>
              <RatingStars rating={place.rating} />
            </div>
            <p className="text-md text-ink-muted line-clamp-2 flex-1">{place.shortDesc[lang]}</p>
            <div className="flex items-center justify-between text-xs font-utility font-semibold text-ink-faint pt-1">
              <span>{city.name[lang]}</span>
              <span>{CATEGORY_LABEL[place.category][lang]}</span>
            </div>
          </div>
        </Link>
      </motion.div>
    </motion.div>
  )
}
