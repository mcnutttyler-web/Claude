import Dexie, { type Table } from 'dexie'
import type {
  Driver, Route, Assignment, Call, Note, Market,
  Tag, Document, Survey, Task, User,
} from '@/types'

export class DriverOpsDB extends Dexie {
  drivers!: Table<Driver>
  routes!: Table<Route>
  assignments!: Table<Assignment>
  calls!: Table<Call>
  notes!: Table<Note>
  markets!: Table<Market>
  tags!: Table<Tag>
  documents!: Table<Document>
  surveys!: Table<Survey>
  tasks!: Table<Task>
  users!: Table<User>

  constructor() {
    super('DriverOpsDB')
    this.version(1).stores({
      drivers: 'id, status, pipelineStage, marketId, vehicleClass, lastContactAt, nextFollowupAt, *tags',
      routes: 'id, marketId, date, status, vehicleClass, priority',
      assignments: 'id, routeId, driverId, status, type',
      calls: 'id, driverId, userId, calledAt, outcome',
      notes: 'id, driverId, userId, createdAt',
      markets: 'id, name, active',
      tags: 'id, name',
      documents: 'id, driverId, type, expiresAt',
      surveys: 'id, driverId, sentAt, completedAt',
      tasks: 'id, userId, driverId, dueAt, done, type',
      users: 'id, email, role, active',
    })
  }
}

export const db = new DriverOpsDB()
