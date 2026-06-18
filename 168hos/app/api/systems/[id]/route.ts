import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await req.json()
  const system = await prisma.systemTracker.update({
    where: { id },
    data: { ...data, nextImprovementDate: data.nextImprovementDate ? new Date(data.nextImprovementDate) : null },
  })
  return NextResponse.json(system)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.systemTracker.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
