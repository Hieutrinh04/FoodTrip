export default function Chip({ active, onClick, children, as = 'button', className = '' }) {
  const Cmp = as
  return (
    <Cmp
      onClick={onClick}
      type={as === 'button' ? 'button' : undefined}
      className={[
        'shrink-0 whitespace-nowrap font-utility text-[12.5px] font-semibold px-3.5 py-[7px] rounded-full border-[1.5px] transition-colors duration-150',
        active
          ? 'bg-herb border-herb text-herb-ink'
          : 'bg-transparent border-line-strong text-ink hover:border-chili',
        className,
      ].join(' ')}
    >
      {children}
    </Cmp>
  )
}
