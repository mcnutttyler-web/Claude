import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('weekStart')
  const exportCsv = searchParams.get('export') === 'csv'

  const where = weekStart ? { weekStart: new Date(weekStart) } : {}
  const blocks = await prisma.timeAuditBlock.findMany({
    where,
    include: { category: true },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  if (exportCsv) {
    const headers = ['date','startTime','endTime','durationMinutes','category','activity','planned','energyRating','qualityRating','revenueImpact','completed','notes']
    const rows = blocks.map(b => [
      b.date.toISOString().split('T')[0],
      b.startTime, b.endTime, b.durationMinutes,
      b.category.name, b.activity,
      b.planned, b.energyRating, b.qualityRating, b.revenueImpact, b.completed,
      `"${(b.notes || '').replace(/"/g, '""')}"`
    ].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="time-audit.csv"' } })
  }

  return NextResponse.json(blocks)
}

export async function POST(req: Request) {
  const data = await req.json()
  const block = await prisma.timeAuditBlock.create({
    data: { ...data, date: new Date(data.date), weekStart: new Date(data.weekStart) },
    include: { category: true },
  })
  return NextResponse.json(block)
}
