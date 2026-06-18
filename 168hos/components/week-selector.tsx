'use client'
import { addWeeks, subWeeks, format, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WeekSelectorProps {
  weekStart: Date
  onChange: (date: Date) => void
}

export function WeekSelector({ weekStart, onChange }: WeekSelectorProps) {
  const weekEnd = addWeeks(weekStart, 1)
  const isCurrentWeek = format(weekStart, 'yyyy-MM-dd') === format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => onChange(subWeeks(weekStart, 1))}>
        <ChevronLeft size={16} />
      </Button>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background min-w-[220px] justify-center">
        <CalendarDays size={14} className="text-muted-foreground" />
        <span className="text-sm font-medium">
          {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
        </span>
      </div>
      <Button variant="outline" size="icon" onClick={() => onChange(addWeeks(weekStart, 1))}>
        <ChevronRight size={16} />
      </Button>
      {!isCurrentWeek && (
        <Button variant="outline" size="sm" onClick={() => onChange(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          This Week
        </Button>
      )}
    </div>
  )
}
