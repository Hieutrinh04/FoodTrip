import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from '@phosphor-icons/react'

/**
 * A responsive card grid where one card expands (on hover, focus, or click)
 * to reveal its content, while the others collapse to a slim grayscale
 * strip. Stacks vertically on mobile, lays out horizontally from `md` up.
 *
 * `items`: [{ id, title, tagline, image, icon: Component, linkHref }]
 *
 * The first click on a collapsed card only expands it (so touch users see
 * the content before committing); clicking the already-active card
 * navigates through `linkHref`.
 */
export default function ExpandingCards({ items, defaultActiveIndex = 0 }) {
  const [activeIndex, setActiveIndex] = React.useState(defaultActiveIndex)

  return (
    <ul className="flex flex-col md:flex-row gap-2.5 h-[600px] md:h-[480px] w-full">
      {items.map((item, index) => {
        const isActive = index === activeIndex
        const Icon = item.icon

        return (
          <li
            key={item.id}
            style={{
              flexGrow: isActive ? 5 : 1,
              flexBasis: 0,
              transition: 'flex-grow 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            className="group relative min-h-0 min-w-0 md:min-w-[64px] overflow-hidden rounded-lg border border-line shadow-soft"
            data-active={isActive}
          >
            <Link
              to={item.linkHref}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={(e) => {
                if (!isActive) {
                  e.preventDefault()
                  setActiveIndex(index)
                }
              }}
              aria-expanded={isActive}
              className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-chili"
            >
              <img
                src={item.image}
                alt={item.title}
                className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ease-out ${
                  isActive ? 'scale-100 grayscale-0' : 'scale-110 grayscale'
                }`}
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

              <div className="absolute inset-0 flex flex-col justify-end gap-2 p-4 sm:p-5">
                {/* Collapsed label: rotated on desktop, hidden on mobile */}
                <h3
                  className={`hidden md:block origin-left rotate-90 font-utility text-sm font-semibold uppercase tracking-wider text-white/80 transition-all duration-300 ease-out ${
                    isActive ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {item.title}
                </h3>

                {/* Expanded content, staggered fade-in */}
                <div
                  className={`text-white/90 transition-all duration-300 ease-out ${
                    isActive ? 'opacity-100 delay-75' : 'opacity-0'
                  }`}
                >
                  <Icon size={24} weight="bold" />
                </div>
                <h3
                  className={`font-display text-xl sm:text-2xl font-bold text-white transition-all duration-300 ease-out ${
                    isActive ? 'opacity-100 delay-150' : 'opacity-0'
                  }`}
                >
                  {item.title}
                </h3>
                <p
                  className={`max-w-xs text-md sm:text-md text-white/80 transition-all duration-300 ease-out ${
                    isActive ? 'opacity-100 delay-225' : 'opacity-0'
                  }`}
                >
                  {item.tagline}
                </p>
                <span
                  className={`inline-flex items-center gap-1.5 font-utility text-xs font-bold uppercase tracking-wide text-[#FF9E6D] transition-all duration-300 ease-out ${
                    isActive ? 'opacity-100 delay-300' : 'opacity-0'
                  }`}
                >
                  Khám phá <ArrowRight size={14} />
                </span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
