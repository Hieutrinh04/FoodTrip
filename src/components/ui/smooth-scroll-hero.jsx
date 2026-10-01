import * as React from 'react'
import { motion, useMotionTemplate, useScroll, useTransform } from 'framer-motion'

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
      className="sticky top-0 h-screen w-full overflow-hidden bg-black"
      style={{ clipPath, willChange: 'transform, opacity' }}
      onMouseEnter={() => videoRef.current?.play()}
      onMouseLeave={() => videoRef.current?.pause()}
    >
      {/* Mobile: static image, no autoplaying video (saves data). Covered and
          zoomed with scale, like the video — a percentage background-size is
          a share of the *width*, which on a portrait phone left the landscape
          photo letterboxed in black. */}
      <motion.div
        className="absolute inset-0 md:hidden"
        style={{
          backgroundImage: `url(${mobileImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          scale: imageScale,
        }}
      />
      {/* Desktop: loops while playing, but only plays on hover */}
      <motion.div className="absolute inset-0 hidden md:block overflow-hidden" style={{ scale: videoScale }}>
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src={desktopVideo}
          poster={poster}
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        />
      </motion.div>
    </motion.div>
  )
}

/**
 * A smooth-scroll hero with a scroll-linked clip-path reveal + parallax
 * zoom, and a looping video background (desktop) / static image (mobile).
 * Optional `children` render as a pinned overlay that stays hidden until
 * the user starts scrolling, then fades/rises into view over the first
 * portion of the scroll range (and stays visible for the rest of the hero).
 */
const SmoothScrollHero = ({
  scrollHeight = 1500,
  desktopVideo,
  mobileImage,
  poster,
  initialClipPercentage = 25,
  finalClipPercentage = 75,
  revealAt = 0.15,
  children,
}) => {
  const { scrollY } = useScroll()
  const overlayOpacity = useTransform(scrollY, [0, scrollHeight * revealAt], [0, 1])
  const overlayY = useTransform(scrollY, [0, scrollHeight * revealAt], [28, 0])

  return (
    <div style={{ height: `calc(${scrollHeight}px + 100vh)` }} className="relative w-full">
      <SmoothScrollHeroBackground
        scrollHeight={scrollHeight}
        desktopVideo={desktopVideo}
        mobileImage={mobileImage}
        poster={poster}
        initialClipPercentage={initialClipPercentage}
        finalClipPercentage={finalClipPercentage}
      />
      {children && (
        <div className="pointer-events-none sticky top-0 z-10 h-screen w-full">
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
          <motion.div
            style={{ opacity: overlayOpacity, y: overlayY }}
            className="relative flex h-full w-full items-end justify-center pb-14 sm:pb-20"
          >
            <div className="pointer-events-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default SmoothScrollHero
