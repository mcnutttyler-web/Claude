import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const tasks = await prisma.delegationTask.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(tasks)
}

export async function POST(req: Request) {
  const data = await req.json()
  if (!data.recommendation) {
    if (data.requiresJudgment <= 2 && data.automationPotential >= 4) data.recommendation = 'Automate'
    else if (data.requiresJudgment <= 2 && data.sopExists) data.recommendation = 'Delegate'
    else if (data.strategicImpact >= 4 && data.requiresJudgment >= 4) data.recommendation = 'Keep'
    else if (data.strategicImpact <= 2 && data.requiresJudgment <= 2) data.recommendation = 'Eliminate'
    else data.recommendation = 'Keep'
  }
  const task = await prisma.delegationTask.create({ data })
  return NextResponse.json(task)
}
