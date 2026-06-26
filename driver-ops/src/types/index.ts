// ─── Core domain types ───────────────────────────────────────────────────────

export type DriverStatus = 'active' | 'inactive' | 'suspended' | 'do_not_call'

export type PipelineStage =
  | 'prospect'
  | 'needs_survey'
  | 'survey_sent'
  | 'survey_completed'
  | 'interested'
  | 'qualified'
  | 'ready'
  | 'committed'
  | 'assigned'
  | 'active'
  | 'inactive'
  | 'expired_docs'
  | 'do_not_call'

export type VehicleClass = 'sedan' | 'suv' | 'cargo_van' | 'sprinter' | 'box_truck'

export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface DriverPreferences {
  days: Day[]
  startTimeEarliest: string   // "06:00"
  startTimeLatest: string     // "10:00"
  stopMin: number
  stopMax: number
  milesMax: number
  payMin: number
  durationMaxMin: number      // minutes
  willingDowntown: boolean
  commodities: string[]
}

export interface Driver {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  status: DriverStatus
  pipelineStage: PipelineStage
  marketId: string
  vehicleClass: VehicleClass
  vehicleMake?: string
  vehicleModel?: string
  vehicleYear?: number
  insuranceExpiry?: string    // ISO date
  licenseExpiry?: string
  backgroundCheckDate?: string
  preferences: DriverPreferences
  reliabilityScore: number    // 0-100
  acceptanceRate: number      // 0-1
  cancellationRate: number    // 0-1
  onTimeRate: number          // 0-1
  totalRoutes: number
  lastContactAt?: string
  nextFollowupAt?: string
  tags: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export type RouteStatus =
  | 'open'
  | 'needs_driver'
  | 'tentative'
  | 'committed'
  | 'assigned'
  | 'completed'
  | 'cancelled'

export interface Route {
  id: string
  marketId: string
  date: string                // ISO date "2025-01-20"
  startTime: string           // "08:00"
  vehicleClass: VehicleClass
  stops: number
  miles: number
  pay: number
  durationMin: number
  status: RouteStatus
  priority: 'low' | 'normal' | 'high' | 'critical'
  notes?: string
  createdAt: string
  updatedAt: string
}

export type AssignmentStatus = 'tentative' | 'committed' | 'confirmed' | 'completed' | 'cancelled'
export type AssignmentType = 'primary' | 'backup'

export interface Assignment {
  id: string
  routeId: string
  driverId: string
  type: AssignmentType
  status: AssignmentStatus
  assignedAt: string
  assignedBy: string
  notes?: string
}

export type CallOutcome = 'answered' | 'voicemail' | 'no_answer' | 'callback_requested' | 'wrong_number'

export interface Call {
  id: string
  driverId: string
  userId: string
  calledAt: string
  durationSec?: number
  outcome: CallOutcome
  notes?: string
  nextFollowupAt?: string
}

export interface Note {
  id: string
  driverId: string
  userId: string
  body: string
  pinned: boolean
  createdAt: string
}

export interface Market {
  id: string
  name: string
  timezone: string
  region: string
  active: boolean
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Document {
  id: string
  driverId: string
  type: 'insurance' | 'license' | 'w9' | 'background'
  expiresAt?: string
  fileUrl?: string
  verified: boolean
  verifiedBy?: string
  verifiedAt?: string
}

export interface Survey {
  id: string
  driverId: string
  sentAt: string
  completedAt?: string
  responses: Record<string, string | number | boolean | string[]>
}

export interface Task {
  id: string
  userId: string
  driverId?: string
  routeId?: string
  type: 'call' | 'email' | 'review_docs' | 'follow_up' | 'other'
  body: string
  dueAt: string
  done: boolean
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'operator' | 'viewer'
  active: boolean
}

// ─── UI / view types ──────────────────────────────────────────────────────────

export interface SmartMatchResult {
  driver: Driver
  score: number
  reasons: string[]
  warnings: string[]
}

export type FilterOperator = 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'in' | 'between'

export interface ColumnFilter {
  field: string
  operator: FilterOperator
  value: unknown
}

export interface SavedView {
  id: string
  name: string
  entity: 'drivers' | 'routes'
  filters: ColumnFilter[]
  sortField: string
  sortDir: 'asc' | 'desc'
  visibleColumns: string[]
}
