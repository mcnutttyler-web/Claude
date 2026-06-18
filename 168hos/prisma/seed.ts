import path from 'path'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const dbUrl = `file://${path.join(process.cwd(), 'prisma/dev.db')}`
const adapter = new PrismaLibSql({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

async function main() {
  // Clear existing data
  await prisma.timeAuditBlock.deleteMany()
  await prisma.idealWeekBlock.deleteMany()
  await prisma.weeklyScorecard.deleteMany()
  await prisma.weeklyReview.deleteMany()
  await prisma.systemTracker.deleteMany()
  await prisma.delegationTask.deleteMany()
  await prisma.category.deleteMany()

  // Create categories
  const categories = await Promise.all([
    prisma.category.create({ data: { name: 'Sleep', color: '#6366f1', icon: '😴' } }),
    prisma.category.create({ data: { name: 'Health', color: '#22c55e', icon: '💪' } }),
    prisma.category.create({ data: { name: 'Family', color: '#f59e0b', icon: '👨‍👩‍👧' } }),
    prisma.category.create({ data: { name: 'Deep Work', color: '#3b82f6', icon: '🎯' } }),
    prisma.category.create({ data: { name: 'Meetings', color: '#8b5cf6', icon: '📅' } }),
    prisma.category.create({ data: { name: 'Admin', color: '#64748b', icon: '📋' } }),
    prisma.category.create({ data: { name: 'Finance', color: '#10b981', icon: '💰' } }),
    prisma.category.create({ data: { name: 'Personal Growth', color: '#ec4899', icon: '📚' } }),
    prisma.category.create({ data: { name: 'Fun', color: '#f97316', icon: '🎉' } }),
    prisma.category.create({ data: { name: 'Buffer', color: '#94a3b8', icon: '⏱️' } }),
  ])

  const cat = Object.fromEntries(categories.map(c => [c.name, c]))

  // Ideal week blocks (0=Sun, 1=Mon...6=Sat)
  const idealBlocks = [
    // Monday
    { dayOfWeek: 1, startTime: '06:00', endTime: '07:00', category: 'Health', activity: 'Morning Workout', goalOutcome: 'Build energy and focus', energyTarget: 9 },
    { dayOfWeek: 1, startTime: '07:00', endTime: '07:30', category: 'Personal Growth', activity: 'Journaling & Intention Setting', goalOutcome: 'Clarity for the day', energyTarget: 8 },
    { dayOfWeek: 1, startTime: '07:30', endTime: '08:30', category: 'Family', activity: 'Family Morning Routine', goalOutcome: 'Connection before work', energyTarget: 8 },
    { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', category: 'Deep Work', activity: 'Product Strategy & Vision', goalOutcome: 'Move biggest needle', energyTarget: 9 },
    { dayOfWeek: 1, startTime: '12:00', endTime: '13:00', category: 'Health', activity: 'Lunch & Walk', goalOutcome: 'Recharge midday', energyTarget: 7 },
    { dayOfWeek: 1, startTime: '13:00', endTime: '15:00', category: 'Deep Work', activity: 'Content Creation / Writing', goalOutcome: 'Publish valuable content', energyTarget: 8 },
    { dayOfWeek: 1, startTime: '15:00', endTime: '16:00', category: 'Meetings', activity: 'Team Standup & 1:1s', goalOutcome: 'Unblock team', energyTarget: 7 },
    { dayOfWeek: 1, startTime: '16:00', endTime: '17:00', category: 'Admin', activity: 'Email & Slack Triage', goalOutcome: 'Clear inbox', energyTarget: 5 },
    { dayOfWeek: 1, startTime: '17:30', endTime: '21:00', category: 'Family', activity: 'Family Evening', goalOutcome: 'Present with family', energyTarget: 8 },
    { dayOfWeek: 1, startTime: '21:30', endTime: '22:30', category: 'Personal Growth', activity: 'Reading', goalOutcome: '1 book/month', energyTarget: 7 },
    { dayOfWeek: 1, startTime: '22:30', endTime: '06:00', category: 'Sleep', activity: 'Sleep', goalOutcome: '7.5hrs quality sleep', energyTarget: 10 },
    // Tuesday
    { dayOfWeek: 2, startTime: '06:00', endTime: '07:00', category: 'Health', activity: 'Morning Workout', goalOutcome: 'Build energy and focus', energyTarget: 9 },
    { dayOfWeek: 2, startTime: '07:30', endTime: '08:30', category: 'Family', activity: 'Family Morning Routine', goalOutcome: 'Connection before work', energyTarget: 8 },
    { dayOfWeek: 2, startTime: '09:00', endTime: '12:00', category: 'Deep Work', activity: 'Engineering / Product Development', goalOutcome: 'Ship features', energyTarget: 9 },
    { dayOfWeek: 2, startTime: '12:00', endTime: '13:00', category: 'Health', activity: 'Lunch & Walk', goalOutcome: 'Recharge midday', energyTarget: 7 },
    { dayOfWeek: 2, startTime: '13:00', endTime: '15:30', category: 'Meetings', activity: 'Partner & Investor Calls', goalOutcome: 'Relationships & funding', energyTarget: 7 },
    { dayOfWeek: 2, startTime: '15:30', endTime: '17:00', category: 'Finance', activity: 'Financial Review', goalOutcome: 'Track key metrics', energyTarget: 7 },
    { dayOfWeek: 2, startTime: '17:30', endTime: '21:00', category: 'Family', activity: 'Family Evening', goalOutcome: 'Present with family', energyTarget: 8 },
    { dayOfWeek: 2, startTime: '21:30', endTime: '22:30', category: 'Personal Growth', activity: 'Online Course / Podcast', goalOutcome: 'Continuous learning', energyTarget: 7 },
    { dayOfWeek: 2, startTime: '22:30', endTime: '06:00', category: 'Sleep', activity: 'Sleep', goalOutcome: '7.5hrs quality sleep', energyTarget: 10 },
    // Wednesday
    { dayOfWeek: 3, startTime: '06:00', endTime: '07:00', category: 'Health', activity: 'Morning Workout', goalOutcome: 'Build energy and focus', energyTarget: 9 },
    { dayOfWeek: 3, startTime: '07:30', endTime: '08:30', category: 'Family', activity: 'Family Morning Routine', goalOutcome: 'Connection before work', energyTarget: 8 },
    { dayOfWeek: 3, startTime: '09:00', endTime: '12:00', category: 'Deep Work', activity: 'Sales & Biz Dev', goalOutcome: 'Revenue growth', energyTarget: 9 },
    { dayOfWeek: 3, startTime: '12:00', endTime: '13:30', category: 'Fun', activity: 'Lunch with friend / networking', goalOutcome: 'Relationships', energyTarget: 8 },
    { dayOfWeek: 3, startTime: '13:30', endTime: '16:00', category: 'Deep Work', activity: 'Marketing & Growth', goalOutcome: 'Increase reach', energyTarget: 8 },
    { dayOfWeek: 3, startTime: '16:00', endTime: '17:00', category: 'Admin', activity: 'Weekly planning prep', goalOutcome: 'Ready for Thursday review', energyTarget: 6 },
    { dayOfWeek: 3, startTime: '17:30', endTime: '21:00', category: 'Family', activity: 'Family Evening', goalOutcome: 'Present with family', energyTarget: 8 },
    { dayOfWeek: 3, startTime: '22:30', endTime: '06:00', category: 'Sleep', activity: 'Sleep', goalOutcome: '7.5hrs quality sleep', energyTarget: 10 },
    // Thursday
    { dayOfWeek: 4, startTime: '06:00', endTime: '07:00', category: 'Health', activity: 'Morning Workout', goalOutcome: 'Build energy and focus', energyTarget: 9 },
    { dayOfWeek: 4, startTime: '07:30', endTime: '08:30', category: 'Family', activity: 'Family Morning Routine', goalOutcome: 'Connection before work', energyTarget: 8 },
    { dayOfWeek: 4, startTime: '09:00', endTime: '11:00', category: 'Deep Work', activity: 'Weekly Review & Systems Audit', goalOutcome: 'Improve systems', energyTarget: 8 },
    { dayOfWeek: 4, startTime: '11:00', endTime: '12:00', category: 'Admin', activity: 'Delegation & SOPs', goalOutcome: 'Remove self from tasks', energyTarget: 7 },
    { dayOfWeek: 4, startTime: '12:00', endTime: '13:00', category: 'Health', activity: 'Lunch & Walk', goalOutcome: 'Recharge midday', energyTarget: 7 },
    { dayOfWeek: 4, startTime: '13:00', endTime: '16:00', category: 'Meetings', activity: 'Team Reviews & Planning', goalOutcome: 'Align team', energyTarget: 7 },
    { dayOfWeek: 4, startTime: '17:30', endTime: '21:00', category: 'Family', activity: 'Family Evening', goalOutcome: 'Present with family', energyTarget: 8 },
    { dayOfWeek: 4, startTime: '22:30', endTime: '06:00', category: 'Sleep', activity: 'Sleep', goalOutcome: '7.5hrs quality sleep', energyTarget: 10 },
    // Friday
    { dayOfWeek: 5, startTime: '06:00', endTime: '07:00', category: 'Health', activity: 'Morning Workout', goalOutcome: 'Build energy and focus', energyTarget: 9 },
    { dayOfWeek: 5, startTime: '07:30', endTime: '08:30', category: 'Family', activity: 'Family Morning Routine', goalOutcome: 'Connection before work', energyTarget: 8 },
    { dayOfWeek: 5, startTime: '09:00', endTime: '11:00', category: 'Deep Work', activity: 'Creative Work / Big Thinking', goalOutcome: 'Innovation', energyTarget: 9 },
    { dayOfWeek: 5, startTime: '11:00', endTime: '12:00', category: 'Finance', activity: 'Bookkeeping & Financial Admin', goalOutcome: 'Books current', energyTarget: 6 },
    { dayOfWeek: 5, startTime: '12:00', endTime: '13:00', category: 'Buffer', activity: 'Buffer / Catch-up', goalOutcome: 'Handle overflow', energyTarget: 6 },
    { dayOfWeek: 5, startTime: '13:00', endTime: '15:00', category: 'Admin', activity: 'Email batch & admin tasks', goalOutcome: 'Clear the week', energyTarget: 5 },
    { dayOfWeek: 5, startTime: '15:00', endTime: '17:00', category: 'Fun', activity: 'Fun / Personal Project', goalOutcome: 'Recharge and enjoy', energyTarget: 9 },
    { dayOfWeek: 5, startTime: '17:30', endTime: '22:00', category: 'Family', activity: 'Family Fun Night', goalOutcome: 'End week strong with family', energyTarget: 9 },
    { dayOfWeek: 5, startTime: '22:30', endTime: '06:00', category: 'Sleep', activity: 'Sleep', goalOutcome: '7.5hrs quality sleep', energyTarget: 10 },
    // Saturday
    { dayOfWeek: 6, startTime: '07:00', endTime: '08:30', category: 'Health', activity: 'Long Run / Hike', goalOutcome: 'Physical endurance', energyTarget: 9 },
    { dayOfWeek: 6, startTime: '09:00', endTime: '11:00', category: 'Family', activity: 'Family Activities', goalOutcome: 'Weekend presence', energyTarget: 9 },
    { dayOfWeek: 6, startTime: '11:00', endTime: '13:00', category: 'Personal Growth', activity: 'Learning / Reading', goalOutcome: 'Growth mindset', energyTarget: 8 },
    { dayOfWeek: 6, startTime: '13:00', endTime: '20:00', category: 'Family', activity: 'Family Time / Outings', goalOutcome: 'Memories and connection', energyTarget: 9 },
    { dayOfWeek: 6, startTime: '22:00', endTime: '07:00', category: 'Sleep', activity: 'Sleep', goalOutcome: 'Weekend recovery', energyTarget: 10 },
    // Sunday
    { dayOfWeek: 0, startTime: '07:00', endTime: '08:00', category: 'Personal Growth', activity: 'Meditation & Reflection', goalOutcome: 'Mental clarity', energyTarget: 8 },
    { dayOfWeek: 0, startTime: '08:00', endTime: '10:00', category: 'Family', activity: 'Family Breakfast & Church', goalOutcome: 'Spiritual grounding', energyTarget: 8 },
    { dayOfWeek: 0, startTime: '10:00', endTime: '12:00', category: 'Admin', activity: 'Weekly Planning & Goal Setting', goalOutcome: 'Ready for the week', energyTarget: 7 },
    { dayOfWeek: 0, startTime: '12:00', endTime: '20:00', category: 'Family', activity: 'Family Day', goalOutcome: 'Recharge and connect', energyTarget: 9 },
    { dayOfWeek: 0, startTime: '22:00', endTime: '06:00', category: 'Sleep', activity: 'Sleep', goalOutcome: 'Ready for Monday', energyTarget: 10 },
  ]

  for (const block of idealBlocks) {
    await prisma.idealWeekBlock.create({
      data: {
        dayOfWeek: block.dayOfWeek,
        startTime: block.startTime,
        endTime: block.endTime,
        categoryId: cat[block.category].id,
        activity: block.activity,
        goalOutcome: block.goalOutcome,
        energyTarget: block.energyTarget,
        color: cat[block.category].color,
      }
    })
  }

  // Sample time audit blocks for current week
  const today = new Date()
  const weekStart = getMonday(today)

  const auditBlocks = [
    { dayOffset: 0, startTime: '06:00', endTime: '07:00', category: 'Health', activity: 'Morning Workout', planned: true, energyRating: 9, qualityRating: 8, revenueImpact: 0, completed: true, notes: 'Great session' },
    { dayOffset: 0, startTime: '07:30', endTime: '08:30', category: 'Family', activity: 'Family Morning', planned: true, energyRating: 8, qualityRating: 8, revenueImpact: 0, completed: true },
    { dayOffset: 0, startTime: '09:00', endTime: '12:00', category: 'Deep Work', activity: 'Product Strategy', planned: true, energyRating: 9, qualityRating: 9, revenueImpact: 3, completed: true, notes: 'Made major progress on Q3 roadmap' },
    { dayOffset: 0, startTime: '12:00', endTime: '13:00', category: 'Health', activity: 'Lunch & Walk', planned: true, energyRating: 7, qualityRating: 7, revenueImpact: 0, completed: true },
    { dayOffset: 0, startTime: '13:00', endTime: '14:30', category: 'Deep Work', activity: 'Content Writing', planned: true, energyRating: 7, qualityRating: 8, revenueImpact: 2, completed: true },
    { dayOffset: 0, startTime: '14:30', endTime: '16:00', category: 'Meetings', activity: 'Team Standup + 1:1', planned: true, energyRating: 6, qualityRating: 7, revenueImpact: 1, completed: true },
    { dayOffset: 0, startTime: '16:00', endTime: '17:00', category: 'Admin', activity: 'Email triage', planned: true, energyRating: 5, qualityRating: 5, revenueImpact: 0, completed: true },
    { dayOffset: 0, startTime: '17:30', endTime: '21:00', category: 'Family', activity: 'Family evening', planned: true, energyRating: 9, qualityRating: 9, revenueImpact: 0, completed: true },
    { dayOffset: 0, startTime: '21:30', endTime: '22:30', category: 'Personal Growth', activity: 'Reading', planned: true, energyRating: 7, qualityRating: 7, revenueImpact: 0, completed: true },
    { dayOffset: 0, startTime: '22:30', endTime: '23:59', category: 'Sleep', activity: 'Sleep (part 1)', planned: true, energyRating: 9, qualityRating: 9, revenueImpact: 0, completed: true },
    // Tuesday
    { dayOffset: 1, startTime: '00:00', endTime: '06:00', category: 'Sleep', activity: 'Sleep (cont)', planned: true, energyRating: 9, qualityRating: 9, revenueImpact: 0, completed: true },
    { dayOffset: 1, startTime: '06:00', endTime: '07:00', category: 'Health', activity: 'Gym', planned: true, energyRating: 8, qualityRating: 8, revenueImpact: 0, completed: true },
    { dayOffset: 1, startTime: '07:30', endTime: '08:30', category: 'Family', activity: 'Family Morning', planned: true, energyRating: 8, qualityRating: 8, revenueImpact: 0, completed: true },
    { dayOffset: 1, startTime: '09:00', endTime: '12:00', category: 'Deep Work', activity: 'Engineering work', planned: true, energyRating: 8, qualityRating: 9, revenueImpact: 3, completed: true, notes: 'Shipped new feature' },
    { dayOffset: 1, startTime: '12:00', endTime: '13:00', category: 'Health', activity: 'Lunch', planned: true, energyRating: 7, qualityRating: 6, revenueImpact: 0, completed: true },
    { dayOffset: 1, startTime: '13:00', endTime: '15:30', category: 'Meetings', activity: 'Investor calls', planned: true, energyRating: 7, qualityRating: 8, revenueImpact: 3, completed: true },
    { dayOffset: 1, startTime: '15:30', endTime: '16:30', category: 'Finance', activity: 'Financial review', planned: true, energyRating: 6, qualityRating: 7, revenueImpact: 2, completed: true },
    { dayOffset: 1, startTime: '16:30', endTime: '17:00', category: 'Admin', activity: 'Unplanned Slack', planned: false, energyRating: 4, qualityRating: 4, revenueImpact: 0, completed: true, notes: 'Team needed help - unplanned' },
    { dayOffset: 1, startTime: '17:30', endTime: '21:00', category: 'Family', activity: 'Family evening', planned: true, energyRating: 9, qualityRating: 9, revenueImpact: 0, completed: true },
    { dayOffset: 1, startTime: '22:00', endTime: '23:59', category: 'Sleep', activity: 'Sleep', planned: true, energyRating: 8, qualityRating: 8, revenueImpact: 0, completed: true },
    // Wednesday
    { dayOffset: 2, startTime: '00:00', endTime: '06:30', category: 'Sleep', activity: 'Sleep (cont)', planned: true, energyRating: 8, qualityRating: 8, revenueImpact: 0, completed: true },
    { dayOffset: 2, startTime: '06:30', endTime: '07:30', category: 'Health', activity: 'Run', planned: true, energyRating: 9, qualityRating: 9, revenueImpact: 0, completed: true },
    { dayOffset: 2, startTime: '07:30', endTime: '08:30', category: 'Family', activity: 'Family Morning', planned: true, energyRating: 8, qualityRating: 8, revenueImpact: 0, completed: true },
    { dayOffset: 2, startTime: '09:00', endTime: '12:00', category: 'Deep Work', activity: 'Sales & Biz Dev', planned: true, energyRating: 8, qualityRating: 8, revenueImpact: 3, completed: true },
    { dayOffset: 2, startTime: '12:00', endTime: '13:30', category: 'Fun', activity: 'Lunch with friend', planned: true, energyRating: 9, qualityRating: 9, revenueImpact: 1, completed: true },
    { dayOffset: 2, startTime: '13:30', endTime: '16:00', category: 'Deep Work', activity: 'Marketing work', planned: true, energyRating: 7, qualityRating: 8, revenueImpact: 2, completed: true },
    { dayOffset: 2, startTime: '16:00', endTime: '17:30', category: 'Admin', activity: 'Planning prep', planned: true, energyRating: 6, qualityRating: 6, revenueImpact: 0, completed: true },
    { dayOffset: 2, startTime: '17:30', endTime: '21:00', category: 'Family', activity: 'Family evening', planned: true, energyRating: 9, qualityRating: 9, revenueImpact: 0, completed: true },
    { dayOffset: 2, startTime: '22:00', endTime: '23:59', category: 'Sleep', activity: 'Sleep', planned: true, energyRating: 8, qualityRating: 8, revenueImpact: 0, completed: true },
  ]

  for (const block of auditBlocks) {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + block.dayOffset)
    const duration = minutesBetween(block.startTime, block.endTime)
    await prisma.timeAuditBlock.create({
      data: {
        date,
        startTime: block.startTime,
        endTime: block.endTime,
        durationMinutes: duration < 0 ? duration + 1440 : duration,
        categoryId: cat[block.category].id,
        activity: block.activity,
        planned: block.planned,
        energyRating: block.energyRating,
        qualityRating: block.qualityRating,
        revenueImpact: block.revenueImpact,
        completed: block.completed,
        notes: block.notes,
        weekStart,
      }
    })
  }

  // Weekly scorecard
  await prisma.weeklyScorecard.create({
    data: {
      weekStart,
      sleepHours: 49.5,
      fitnessHours: 5.5,
      deepWorkHours: 22,
      meetingHours: 8.5,
      familyHours: 21,
      taskCompletionPct: 87,
      avgEnergy: 7.8,
      delegatedHoursSaved: 6,
    }
  })

  // Systems
  await prisma.systemTracker.createMany({
    data: [
      { name: 'Weekly Review', area: 'Operations', owner: 'Founder', frequency: 'Weekly', trigger: 'Every Thursday 9am', stepsSummary: 'Review metrics, audit time, plan next week, update goals', estimatedTimeSaved: 5, kpiLinked: 'Revenue, Energy', status: 'Active' },
      { name: 'Email Batch Processing', area: 'Admin', owner: 'Founder', frequency: 'Daily', trigger: '12pm and 4pm only', stepsSummary: 'Process inbox to zero, respond, delegate, archive', toolAutomation: 'Gmail filters + labels', estimatedTimeSaved: 3, kpiLinked: 'Admin hours', status: 'Active' },
      { name: 'Content Publishing Pipeline', area: 'Marketing', owner: 'Team', frequency: 'Weekly', trigger: 'Tuesday content review', stepsSummary: 'Write → Edit → Design → Schedule → Publish → Distribute', sopLink: 'https://notion.so/content-sop', toolAutomation: 'Buffer + Canva', estimatedTimeSaved: 4, kpiLinked: 'Followers, Leads', status: 'Active' },
      { name: 'Financial Reporting', area: 'Finance', owner: 'CFO', frequency: 'Monthly', trigger: '1st of month', stepsSummary: 'P&L review, cash flow, runway, burn rate update', toolAutomation: 'QuickBooks + Stripe', estimatedTimeSaved: 8, kpiLinked: 'Revenue, Runway', status: 'Active' },
      { name: 'Customer Onboarding', area: 'Sales', owner: 'Team', frequency: 'Per customer', trigger: 'Contract signed', stepsSummary: 'Welcome email → setup call → training → 30-day check-in', sopLink: 'https://notion.so/onboarding', toolAutomation: 'Intercom + Calendly', estimatedTimeSaved: 5, kpiLinked: 'Churn rate, NPS', status: 'Active' },
    ]
  })

  // Delegation tasks
  const delegationTasks = [
    { task: 'Social media posting', frequency: 'Daily', strategicImpact: 2, requiresJudgment: 1, sopExists: true, automationPotential: 5, notes: 'Schedule with Buffer' },
    { task: 'Investor updates', frequency: 'Monthly', strategicImpact: 5, requiresJudgment: 5, sopExists: false, automationPotential: 1, notes: 'Must be personal' },
    { task: 'Bookkeeping entry', frequency: 'Weekly', strategicImpact: 1, requiresJudgment: 1, sopExists: true, automationPotential: 4, notes: 'Can use Zapier + QuickBooks' },
    { task: 'Customer support tier 1', frequency: 'Daily', strategicImpact: 2, requiresJudgment: 2, sopExists: true, automationPotential: 3, notes: 'Train VA with SOP' },
    { task: 'Product roadmap decisions', frequency: 'Weekly', strategicImpact: 5, requiresJudgment: 5, sopExists: false, automationPotential: 1, notes: 'Core founder responsibility' },
    { task: 'Meeting scheduling', frequency: 'Daily', strategicImpact: 1, requiresJudgment: 1, sopExists: true, automationPotential: 5, notes: 'Use Calendly' },
    { task: 'Blog post formatting', frequency: 'Weekly', strategicImpact: 1, requiresJudgment: 1, sopExists: true, automationPotential: 4, notes: 'VA can handle' },
    { task: 'Partnership negotiations', frequency: 'Monthly', strategicImpact: 5, requiresJudgment: 4, sopExists: false, automationPotential: 1, notes: 'High stakes, keep' },
  ]

  for (const task of delegationTasks) {
    let recommendation = 'Keep'
    if (task.requiresJudgment <= 2 && task.automationPotential >= 4) recommendation = 'Automate'
    else if (task.requiresJudgment <= 2 && task.sopExists) recommendation = 'Delegate'
    else if (task.strategicImpact >= 4 && task.requiresJudgment >= 4) recommendation = 'Keep'
    else if (task.strategicImpact <= 2 && task.requiresJudgment <= 2) recommendation = 'Eliminate'

    await prisma.delegationTask.create({ data: { ...task, recommendation } })
  }

  // Weekly review
  await prisma.weeklyReview.create({
    data: {
      weekStart,
      whereTimeWent: 'Deep work took up ~22hrs which is on target. Meetings crept up slightly due to unplanned investor call. Admin was lower than usual - good sign.',
      mostEnergy: 'Morning deep work sessions from 9-12. Product strategy work on Monday felt incredible - total flow state. Family evenings consistently restored my energy.',
      drainedEnergy: 'Unplanned Slack firefighting on Tuesday afternoon. The 30min context switch cost at least 2hrs of productivity.',
      shouldEliminate: 'Reactive Slack checking throughout the day. Need hard boundaries on notification times.',
      shouldAutomate: 'Email sorting and categorization. Currently spending 45min/day on this manually.',
      shouldDelegate: 'Blog post formatting and social media scheduling to VA. Have SOP ready, just need to train.',
      systemNeedsImprovement: 'Customer support escalation process - too many tier-1 questions reaching me directly.',
      nextWeekChanges: 'Turn off Slack notifications before 10am. Schedule VA training session for content pipeline. Add buffer time on Tuesday afternoon.',
      overallRating: 8,
    }
  })

  console.log('Seed completed successfully')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
