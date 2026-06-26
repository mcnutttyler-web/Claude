import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPhone(phone: string) {
  return phone
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function formatDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatRelative(iso: string | undefined) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return formatDate(iso)
}

export function pct(n: number) {
  return `${Math.round(n * 100)}%`
}

export const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  needs_survey: 'Needs Survey',
  survey_sent: 'Survey Sent',
  survey_completed: 'Survey Completed',
  interested: 'Interested',
  qualified: 'Qualified',
  ready: 'Ready',
  committed: 'Committed',
  assigned: 'Assigned',
  active: 'Active',
  inactive: 'Inactive',
  expired_docs: 'Expired Docs',
  do_not_call: 'Do Not Call',
}

export const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-slate-700 text-slate-200',
  needs_survey: 'bg-yellow-900 text-yellow-200',
  survey_sent: 'bg-blue-900 text-blue-200',
  survey_completed: 'bg-blue-800 text-blue-100',
  interested: 'bg-indigo-900 text-indigo-200',
  qualified: 'bg-violet-900 text-violet-200',
  ready: 'bg-teal-900 text-teal-200',
  committed: 'bg-green-900 text-green-200',
  assigned: 'bg-green-800 text-green-100',
  active: 'bg-emerald-800 text-emerald-100',
  inactive: 'bg-slate-800 text-slate-300',
  expired_docs: 'bg-red-900 text-red-200',
  do_not_call: 'bg-red-950 text-red-300',
}

export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-900 text-green-200',
  inactive: 'bg-slate-800 text-slate-300',
  suspended: 'bg-orange-900 text-orange-200',
  do_not_call: 'bg-red-900 text-red-300',
}

export const ROUTE_STATUS_COLORS: Record<string, string> = {
  open: 'bg-slate-700 text-slate-200',
  needs_driver: 'bg-red-900 text-red-200',
  tentative: 'bg-yellow-900 text-yellow-200',
  committed: 'bg-blue-900 text-blue-200',
  assigned: 'bg-green-900 text-green-200',
  completed: 'bg-emerald-900 text-emerald-200',
  cancelled: 'bg-slate-800 text-slate-400',
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-slate-400',
  normal: 'text-slate-300',
  high: 'text-orange-400',
  critical: 'text-red-400',
}

export const VEHICLE_LABELS: Record<string, string> = {
  sedan: 'Sedan',
  suv: 'SUV',
  cargo_van: 'Cargo Van',
  sprinter: 'Sprinter',
  box_truck: 'Box Truck',
}
