import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('weekStart')
  if (weekStart) {
    const scorecard = await prisma.weeklyScorecard.findUnique({ where: { weekStart: new Date(weekStart) } })
    return NextResponse.json(scorecard)
  }
  const scorecards = await prisma.weeklyScorecard.findMany({ orderBy: { weekStart: 'desc' } })
  return NextResponse.json(scorecards)
}

export async function POST(req: Request) {
  const data = await req.json()
  const scorecard = await prisma.weeklyScorecard.upsert({
    where: { weekStart: new Date(data.weekStart) },
    create: { ...data, weekStart: new Date(data.weekStart) },
    update: { ...data, weekStart: new Date(data.weekStart) },
  })
  return NextResponse.json(scorecard)
}
