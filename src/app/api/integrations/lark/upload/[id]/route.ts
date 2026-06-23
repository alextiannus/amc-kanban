import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Lark Drive cloud docs upload is disabled. Please upload assets to Huawei OBS.' },
    { status: 400 }
  )
}
