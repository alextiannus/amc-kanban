import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import yaml from 'js-yaml'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'skills', 'kanban-openapi.yaml')
    const content = await readFile(filePath, 'utf-8')
    const jsonContent = yaml.load(content)
    return NextResponse.json(jsonContent, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Error serving OpenAPI endpoint:', error)
    return NextResponse.json({ error: 'Failed to load OpenAPI specification' }, { status: 500 })
  }
}
