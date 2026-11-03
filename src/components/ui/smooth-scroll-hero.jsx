import * as React from 'react'
import { motion, useMotionTemplate, useReducedMotion, useScroll, useTransform } from 'framer-motion'

/**
 * Background layer for SmoothScrollHero: a sticky, clip-path-masked panel
 * that opens up as the page scrolls past it, with a slow scale
 * zoom-out for parallax depth. Desktop shows `desktopVideo` looping on its
 * own real-time pace, but only while the pointer is over the hero — it
 * starts paused (on its poster frame) and plays on hover, pausing again on
 * pointer-leave, rather than autoplaying immediately. Mobile shows a
 * static `mobileImage` instead, to save data on a connection where a
 * looping background video is a worse trade.
 */
function SmoothScrollHeroBackground({
  scrollHeight,
  desktopVideo,
  mobileImage,
  poster,
  initialClipPercentage,
  finalClipPercentage,
}) {
  const { scrollY } = useScroll()
  const videoRef = React.useRef(null)
  const reduced = useReducedMotion()

  const clipStart = useTransform(scrollY, [0, scrollHeight], [initialClipPercentage, 0])
  const clipEnd = useTransform(scrollY, [0, scrollHeight], [finalClipPercentage, 100])
  const clipPath = useMotionTemplate`polygon(${clipStart}% ${clipStart}%, ${clipEnd}% ${clipStart}%, ${clipEnd}% ${clipEnd}%, ${clipStart}% ${clipEnd}%)`

  const videoScale = useTransform(scrollY, [0, scrollHeight + 500], [1.7, 1])
  // Covering a portrait phone already enlarges the landscape photo about 2x,
  // so the phone layer starts less zoomed or it shows only a corner of it.
  const imageScale = useTransform(scrollY, [0, scrollHeight + 500], [1.15, 1])

  // overflow-hidden: clip-path only hides the zoomed layers visually; without
  // it the 1.7x video still widened the page to ~1040px on a 768px tablet.
  return (
    <motion.div
      className="absolute inset-0 h-full w-full overflow-hidden bg-black"
      style={{ clipPath: reduced ? undefined : clipPath }}
      onMouseEnter={() => { if (!reduced) videoRef.current?.play()?.catch(() => {}) }}
      onMouseLeave={() => videoRef.current?.pause()}
    >
      {/* Mobile: static image, no autoplaying video (saves data). Covered and
          zoomed with scale, like the video — a percentage background-size is
          a share of the *width*, which on a portrait phone left the landscape
          photo letterboxed in black. */}
      <motion.div
        className={`absolute inset-0 ${reduced ? '' : 'md:hidden'}`}
        style={{
          backgroundImage: `url(${mobileImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          scale: reduced ? 1 : imageScale,
        }}
      />
      {/* Desktop: loops while playing, but only plays on hover */}
      {!reduced && <motion.div className="absolute inset-0 hidden md:block overflow-hidden" style={{ scale: videoScale }}>
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src={desktopVideo}
          poster={poster}
          loop
          muted
          playsInline
          preload="none"
          aria-hidden="true"
        />
      </motion.div>}
    </motion.div>
  )
}

/**
 * A smooth-scroll hero with a scroll-linked clip-path reveal + parallax
 * zoom, and a looping video background (desktop) / static image (mobile).
 * Children share the same pinned viewport as the background and are visible
 * immediately. Reduced motion removes the additional scroll range and video.
 */
const SmoothScrollHero = ({
  scrollHeight = 1500,
  desktopVideo,
  mobileImage,
  poster,
  initialClipPercentage = 0,
  finalClipPercentage = 100,
  children,
}) => {
  const reduced = useReducedMotion()

  return (
    <div style={{ height: `calc(${reduced ? 0 : scrollHeight}px + 100svh - 72px)` }} className="relative w-full">
      <div className="sticky top-[72px] h-[calc(100svh-72px)] min-h-[400px] w-full">
        <SmoothScrollHeroBackground
          scrollHeight={scrollHeight}
          desktopVideo={desktopVideo}
          mobileImage={mobileImage}
          poster={poster}
          initialClipPercentage={initialClipPercentage}
          finalClipPercentage={finalClipPercentage}
        />
        {children && (
          <div className="pointer-events-none relative z-10 h-full w-full">
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
            <div
              className="relative flex h-full w-full items-center justify-center py-8"
            >
              <div className="pointer-events-auto">{children}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SmoothScrollHero
