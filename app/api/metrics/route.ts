import { NextResponse } from 'next/server'
import { computeMetrics } from '@/lib/get-metrics'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(computeMetrics())
}
