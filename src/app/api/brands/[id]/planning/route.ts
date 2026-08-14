import { NextResponse } from 'next/server'

const retired = () => NextResponse.json({
  error: 'kanban_planning_retired',
  message: '品牌灵感与推广计划已迁移到 AMC Growth；Kanban 仅保留 /api/brands/:id/promotion-execution 素材执行接口。',
}, { status: 410 })

export async function GET() { return retired() }
export async function POST() { return retired() }
