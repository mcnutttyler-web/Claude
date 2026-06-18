import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await req.json()
  const block = await prisma.timeAuditBlock.update({
    where: { id },
    data: { ...data, date: new Date(data.date), weekStart: new Date(data.weekStart) },
    include: { category: true },
  })
  return NextResponse.json(block)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.timeAuditBlock.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
