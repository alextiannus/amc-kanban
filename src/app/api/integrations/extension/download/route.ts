import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

/**
 * GET /api/integrations/extension/download
 * Dynamically packages the local chrome-extension folder into a ZIP file
 * and streams it directly to the user.
 */
export async function GET() {
  try {
    const extensionPath = path.resolve(/*turbopackIgnore: true*/ 'chrome-extension')
    if (!fs.existsSync(extensionPath)) {
      return NextResponse.json({ error: 'Extension directory not found' }, { status: 404 })
    }

    // Spawn zip to stream output: zip -r - chrome-extension
    // We execute it in the project root to keep the directory structure in the zip file
    const zipProcess = spawn('zip', ['-r', '-', 'chrome-extension'], {
      cwd: path.resolve(/*turbopackIgnore: true*/ '.'),
    })

    const stream = new ReadableStream({
      start(controller) {
        zipProcess.stdout.on('data', (chunk) => {
          controller.enqueue(chunk)
        })
        zipProcess.stdout.on('end', () => {
          controller.close()
        })
        zipProcess.stderr.on('data', (err) => {
          console.error('[Extension Download] zip stderr:', err.toString())
        })
        zipProcess.on('error', (err) => {
          console.error('[Extension Download] zip process error:', err)
          controller.error(err)
        })
      },
      cancel() {
        zipProcess.kill()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="amc-assistant-extension.zip"',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    })
  } catch (error) {
    console.error('[Extension Download] Server Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
