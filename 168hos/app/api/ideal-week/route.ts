import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const blocks = await prisma.idealWeekBlock.findMany({
    include: { category: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })
  return NextResponse.json(blocks)
}

export async function POST(req: Request) {
  const data = await req.json()
  const block = await prisma.idealWeekBlock.create({
    data,
    include: { category: true },
  })
  return NextResponse.json(block)
}
