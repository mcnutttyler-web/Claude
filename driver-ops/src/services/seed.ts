import { db } from './db'
import type { Driver, Route, Market, Call, Note, Task, Tag, Assignment } from '@/types'
import { nanoid } from './nanoid'

const markets: Market[] = [
  { id: 'm1', name: 'Boston', timezone: 'America/New_York', region: 'Northeast', active: true },
  { id: 'm2', name: 'New York', timezone: 'America/New_York', region: 'Northeast', active: true },
  { id: 'm3', name: 'Chicago', timezone: 'America/Chicago', region: 'Midwest', active: true },
  { id: 'm4', name: 'Los Angeles', timezone: 'America/Los_Angeles', region: 'West', active: true },
  { id: 'm5', name: 'Houston', timezone: 'America/Chicago', region: 'South', active: true },
]

const tags: Tag[] = [
  { id: 't1', name: 'Top Performer', color: '#22c55e' },
  { id: 't2', name: 'Needs Follow-up', color: '#f59e0b' },
  { id: 't3', name: 'High Cancellation', color: '#ef4444' },
  { id: 't4', name: 'Weekend Only', color: '#8b5cf6' },
  { id: 't5', name: 'Morning Preferred', color: '#3b82f6' },
  { id: 't6', name: 'Downtown OK', color: '#06b6d4' },
]

const firstNames = ['James', 'Maria', 'David', 'Sarah', 'Michael', 'Ashley', 'Robert', 'Jennifer',
  'William', 'Lisa', 'Carlos', 'Angela', 'Kevin', 'Michelle', 'Brian', 'Amanda',
  'Daniel', 'Melissa', 'Jason', 'Stephanie', 'Eric', 'Nicole', 'Ryan', 'Heather',
  'Justin', 'Tiffany', 'Andrew', 'Crystal', 'Tyler', 'Brittany', 'Brandon', 'Amber']

const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White']

const stages = ['prospect','needs_survey','survey_sent','survey_completed','interested',
  'qualified','ready','committed','assigned','active','inactive','expired_docs','do_not_call'] as const
const vehicles = ['sedan','suv','cargo_van','sprinter','box_truck'] as const
const statuses = ['active','inactive','active','active','active','inactive','do_not_call'] as const

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function randDate(daysBack: number) {
  const d = new Date(); d.setDate(d.getDate() - randInt(0, daysBack)); return d.toISOString()
}
function futureDate(daysAhead: number) {
  const d = new Date(); d.setDate(d.getDate() + randInt(1, daysAhead)); return d.toISOString()
}

const days = ['mon','tue','wed','thu','fri','sat','sun'] as const

function makeDriver(i: number): Driver {
  const firstName = firstNames[i % firstNames.length]
  const lastName = lastNames[i % lastNames.length]
  const market = markets[i % markets.length]
  const stage = stages[i % stages.length]
  const driverTags: string[] = []
  if (Math.random() > 0.7) driverTags.push('t1')
  if (Math.random() > 0.6) driverTags.push('t5')
  if (Math.random() > 0.8) driverTags.push('t4')
  const acceptance = Math.random() * 0.4 + 0.6
  const cancellation = Math.random() * 0.15
  return {
    id: `d${i + 1}`,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
    phone: `(${randInt(200,999)}) ${randInt(200,999)}-${randInt(1000,9999)}`,
    status: statuses[i % statuses.length],
    pipelineStage: stage,
    marketId: market.id,
    vehicleClass: rand(vehicles),
    vehicleMake: rand(['Toyota','Honda','Ford','Chevy','RAM','Mercedes']),
    vehicleModel: rand(['Camry','Civic','F-150','Silverado','ProMaster','Sprinter']),
    vehicleYear: randInt(2015, 2024),
    insuranceExpiry: Math.random() > 0.2 ? futureDate(365) : futureDate(30),
    licenseExpiry: futureDate(730),
    backgroundCheckDate: randDate(365),
    preferences: {
      days: days.filter(() => Math.random() > 0.4),
      startTimeEarliest: `0${randInt(5,8)}:00`,
      startTimeLatest: `${randInt(9,11)}:00`,
      stopMin: randInt(50, 100),
      stopMax: randInt(100, 200),
      milesMax: randInt(80, 200),
      payMin: randInt(120, 200),
      durationMaxMin: randInt(300, 600),
      willingDowntown: Math.random() > 0.5,
      commodities: rand([['food'], ['food','grocery'], ['grocery'], ['food','pharmacy']]),
    },
    reliabilityScore: randInt(60, 100),
    acceptanceRate: acceptance,
    cancellationRate: cancellation,
    onTimeRate: Math.random() * 0.2 + 0.8,
    totalRoutes: randInt(0, 150),
    lastContactAt: Math.random() > 0.3 ? randDate(30) : undefined,
    nextFollowupAt: Math.random() > 0.5 ? futureDate(14) : undefined,
    tags: driverTags,
    notes: i % 5 === 0 ? 'Prefers early morning routes. Very reliable.' : undefined,
    createdAt: randDate(365),
    updatedAt: randDate(30),
  }
}

const routeStatuses = ['open','needs_driver','tentative','committed','assigned','completed','cancelled'] as const
const priorities = ['low','normal','normal','high','critical'] as const

function makeRoute(i: number): Route {
  const market = markets[i % markets.length]
  const d = new Date()
  d.setDate(d.getDate() + randInt(-7, 14))
  return {
    id: `r${i + 1}`,
    marketId: market.id,
    date: d.toISOString().slice(0,10),
    startTime: `0${randInt(5,9)}:${rand(['00','30'])}`,
    vehicleClass: rand(vehicles),
    stops: randInt(80, 250),
    miles: randInt(60, 200),
    pay: randInt(130, 280),
    durationMin: randInt(240, 600),
    status: routeStatuses[i % routeStatuses.length],
    priority: priorities[i % priorities.length],
    notes: i % 4 === 0 ? 'High-density urban route. Downtown parking required.' : undefined,
    createdAt: randDate(30),
    updatedAt: randDate(7),
  }
}

export async function seedDatabase() {
  const count = await db.drivers.count()
  if (count > 0) return

  const drivers = Array.from({ length: 80 }, (_, i) => makeDriver(i))
  const routes = Array.from({ length: 60 }, (_, i) => makeRoute(i))

  const calls: Call[] = drivers.slice(0, 40).map((d, i) => ({
    id: `c${i + 1}`,
    driverId: d.id,
    userId: 'u1',
    calledAt: randDate(14),
    durationSec: rand([null as unknown as number, randInt(30, 600)]) ?? undefined,
    outcome: rand(['answered','voicemail','no_answer','answered','answered'] as const),
    notes: i % 3 === 0 ? 'Driver confirmed availability for next week.' : undefined,
    nextFollowupAt: i % 2 === 0 ? futureDate(7) : undefined,
  }))

  const notes: Note[] = drivers.slice(0, 20).map((d, i) => ({
    id: `n${i + 1}`,
    driverId: d.id,
    userId: 'u1',
    body: rand([
      'Called — said they need 2 weeks notice for new routes.',
      'Prefers Boston South routes only.',
      'Great communicator. Always on time.',
      'Needs reminder 3 days before route.',
      'Has second job on Mondays — avoid Monday assignments.',
    ]),
    pinned: i < 3,
    createdAt: randDate(30),
  }))

  const assignments: Assignment[] = []
  routes.filter(r => ['committed','assigned','completed'].includes(r.status)).forEach((r, i) => {
    assignments.push({
      id: `a${i + 1}`,
      routeId: r.id,
      driverId: drivers[i % drivers.length].id,
      type: 'primary',
      status: r.status === 'completed' ? 'completed' : 'confirmed',
      assignedAt: randDate(14),
      assignedBy: 'u1',
    })
  })

  const tasks: Task[] = drivers.slice(0, 15).map((d, i) => ({
    id: `tk${i + 1}`,
    userId: 'u1',
    driverId: d.id,
    type: rand(['call','follow_up','review_docs','email'] as const),
    body: rand([
      'Follow up on route commitment',
      'Review insurance documents',
      'Send survey link',
      'Confirm Monday availability',
      'Check in — inactive 30 days',
    ]),
    dueAt: futureDate(7),
    done: i > 10,
    createdAt: randDate(7),
  }))

  await Promise.all([
    db.markets.bulkAdd(markets),
    db.tags.bulkAdd(tags),
    db.drivers.bulkAdd(drivers),
    db.routes.bulkAdd(routes),
    db.calls.bulkAdd(calls),
    db.notes.bulkAdd(notes),
    db.assignments.bulkAdd(assignments),
    db.tasks.bulkAdd(tasks),
    db.users.bulkAdd([
      { id: 'u1', name: 'Alex Operator', email: 'alex@hellofresh.com', role: 'admin', active: true },
      { id: 'u2', name: 'Jamie Ops', email: 'jamie@hellofresh.com', role: 'operator', active: true },
    ]),
  ])
}
