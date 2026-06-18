import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await req.json()
  if (!data.recommendation) {
    if (data.requiresJudgment <= 2 && data.automationPotential >= 4) data.recommendation = 'Automate'
    else if (data.requiresJudgment <= 2 && data.sopExists) data.recommendation = 'Delegate'
    else if (data.strategicImpact >= 4 && data.requiresJudgment >= 4) data.recommendation = 'Keep'
    else if (data.strategicImpact <= 2 && data.requiresJudgment <= 2) data.recommendation = 'Eliminate'
    else data.recommendation = 'Keep'
  }
  const task = await prisma.delegationTask.update({ where: { id }, data })
  return NextResponse.json(task)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.delegationTask.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
