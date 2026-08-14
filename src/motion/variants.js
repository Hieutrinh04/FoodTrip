export const easeOut = [0.16, 1, 0.3, 1]
export const easeInOut = [0.65, 0, 0.35, 1]
export const spring = { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 }
export const springSoft = { type: 'spring', stiffness: 180, damping: 24, mass: 1 }

export const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: easeOut },
  },
}

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: easeOut } },
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.55, ease: easeOut } },
}

export function staggerContainer(stagger = 0.08, delay = 0) {
  return {
    hidden: {},
    show: {
      transition: { staggerChildren: stagger, delayChildren: delay },
    },
  }
}

export const viewportOnce = { once: true, amount: 0.2, margin: '0px 0px -80px 0px' }

export const pageVariants = {
  initial: { opacity: 0, y: 18 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: easeOut, when: 'beforeChildren' },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.3, ease: easeInOut },
  },
}

export const cardHover = {
  rest: { y: 0, scale: 1 },
  hover: { y: -6, scale: 1.015, transition: spring },
}
