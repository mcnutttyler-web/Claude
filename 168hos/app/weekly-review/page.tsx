'use client'
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { WeekSelector } from '@/components/week-selector'
import { startOfWeek, format } from 'date-fns'
import { Save, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

interface Review {
  id?: string
  weekStart: string
  whereTimeWent?: string
  mostEnergy?: string
  drainedEnergy?: string
  shouldEliminate?: string
  shouldAutomate?: string
  shouldDelegate?: string
  systemNeedsImprovement?: string
  nextWeekChanges?: string
  overallRating?: number
}

const QUESTIONS = [
  { key: 'whereTimeWent', label: 'Where did my time actually go?', emoji: '⏱️', placeholder: 'Reflect on how your hours were actually spent vs planned...' },
  { key: 'mostEnergy', label: 'What created the most energy?', emoji: '⚡', placeholder: 'Which activities, people, or moments gave you energy this week?' },
  { key: 'drainedEnergy', label: 'What drained my energy?', emoji: '🔋', placeholder: 'What activities felt draining, heavy, or misaligned?' },
  { key: 'shouldEliminate', label: 'What should I eliminate?', emoji: '🗑️', placeholder: 'What could be removed entirely without real consequence?' },
  { key: 'shouldAutomate', label: 'What should I automate?', emoji: '🤖', placeholder: 'What repetitive tasks could be handled by tools or systems?' },
  { key: 'shouldDelegate', label: 'What should I delegate?', emoji: '🤝', placeholder: 'What could someone else do if given the right SOP or training?' },
  { key: 'systemNeedsImprovement', label: 'What system needs improvement?', emoji: '⚙️', placeholder: 'Which recurring process broke down or needs a better design?' },
  { key: 'nextWeekChanges', label: 'What changes should I make next week?', emoji: '🎯', placeholder: 'Specific, actionable changes to schedule, systems, or behavior...' },
] as const

export default function WeeklyReviewPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [review, setReview] = useState<Review | null>(null)
  const [form, setForm] = useState<Partial<Review>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const weekStartStr = format(weekStart, 'yyyy-MM-dd')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/weekly-review?weekStart=${weekStartStr}`)
    const data = await res.json()
    setReview(data)
    setForm(data || { weekStart: weekStartStr })
    setLoading(false)
  }, [weekStartStr])

  useEffect(() => { load() }, [load])

  const setField = (key: string, value: string | number) => {
    setForm(f => ({ ...f, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, weekStart: weekStartStr }),
      })
      toast.success('Weekly review saved')
      load()
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const completedFields = QUESTIONS.filter(q => form[q.key as keyof typeof form]).length
  const completionPct = Math.round((completedFields / QUESTIONS.length) * 100)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Weekly Review</h1>
        <p className="text-muted-foreground text-sm mt-1">Reflect, learn, and design a better next week</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <WeekSelector weekStart={weekStart} onChange={w => { setWeekStart(w); setForm({}) }} />
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-[100px]">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${completionPct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{completedFields}/{QUESTIONS.length} answered</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : (
        <div className="space-y-4">
          {QUESTIONS.map(({ key, label, emoji, placeholder }, idx) => {
            const value = (form[key as keyof typeof form] as string) || ''
            return (
              <Card key={key} className={value ? 'border-primary/30' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base shrink-0 mt-0.5">
                      {emoji}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-muted-foreground font-medium">Q{idx + 1}</span>
                        <Label className="text-sm font-semibold">{label}</Label>
                        {value && <ChevronRight size={12} className="text-green-500 ml-auto" />}
                      </div>
                      <textarea
                        className="w-full min-h-[80px] p-2.5 text-sm rounded-lg border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                        placeholder={placeholder}
                        value={value}
                        onChange={e => setField(key, e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Overall rating */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base shrink-0">🏆</div>
                <div className="flex-1">
                  <Label className="text-sm font-semibold">Overall Week Rating</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <input
                      type="range" min={1} max={10}
                      value={form.overallRating || 7}
                      onChange={e => setField('overallRating', Number(e.target.value))}
                      className="flex-1"
                    />
                    <div className="text-2xl font-bold w-12 text-center">{form.overallRating || 7}</div>
                    <div className="text-sm text-muted-foreground">/10</div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Rough week</span>
                    <span>Peak performance</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between pt-2">
            {review?.id ? (
              <span className="text-xs text-muted-foreground">Last saved: review exists for this week</span>
            ) : (
              <span className="text-xs text-muted-foreground">No review saved for this week yet</span>
            )}
            <Button onClick={handleSave} disabled={saving} size="lg">
              <Save size={14} className="mr-2" />
              {saving ? 'Saving...' : review?.id ? 'Update Review' : 'Save Review'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
