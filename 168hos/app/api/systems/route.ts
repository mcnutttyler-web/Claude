import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const systems = await prisma.systemTracker.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(systems)
}

export async function POST(req: Request) {
  const data = await req.json()
  const system = await prisma.systemTracker.create({
    data: { ...data, nextImprovementDate: data.nextImprovementDate ? new Date(data.nextImprovementDate) : null },
  })
  return NextResponse.json(system)
}
