import { cn } from '@/lib/utils'

const COLORS = [
  'bg-blue-700', 'bg-violet-700', 'bg-emerald-700', 'bg-orange-700',
  'bg-pink-700', 'bg-cyan-700', 'bg-red-700', 'bg-yellow-700',
]

function colorFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={cn(
      'flex-shrink-0 rounded-full flex items-center justify-center font-semibold text-white select-none',
      colorFor(name),
      size === 'sm' && 'size-7 text-xs',
      size === 'md' && 'size-9 text-sm',
      size === 'lg' && 'size-12 text-base',
      className,
    )}>
      {initials}
    </div>
  )
}
