import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('weekStart')
  if (weekStart) {
    const review = await prisma.weeklyReview.findUnique({ where: { weekStart: new Date(weekStart) } })
    return NextResponse.json(review)
  }
  const reviews = await prisma.weeklyReview.findMany({ orderBy: { weekStart: 'desc' } })
  return NextResponse.json(reviews)
}

export async function POST(req: Request) {
  const data = await req.json()
  const review = await prisma.weeklyReview.upsert({
    where: { weekStart: new Date(data.weekStart) },
    create: { ...data, weekStart: new Date(data.weekStart) },
    update: { ...data, weekStart: new Date(data.weekStart) },
  })
  return NextResponse.json(review)
}
