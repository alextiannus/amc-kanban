import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const state = url.searchParams.get('state')
  if (!state) {
    return NextResponse.json({ error: 'state parameter required' }, { status: 400 })
  }

  // Render a high-fidelity Google-styled Consent Interface
  const html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Google Accounts - Consent Simulation</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Roboto', sans-serif;
        }
      </style>
    </head>
    <body class="bg-slate-50 flex items-center justify-center min-h-screen p-4">
      <div class="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full shadow-lg flex flex-col items-center">
        <!-- Google Logo -->
        <svg class="h-8 mb-6" viewBox="0 0 74 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7.7 15.3C5.8 15.3 4.2 14.6 3 13.4C1.8 12.1 1.2 10.5 1.2 8.7C1.2 6.8 1.8 5.2 3.1 4C4.3 2.7 5.8 2.1 7.7 2.1C9.6 2.1 11.1 2.8 12.2 4.1L10.5 5.8C9.7 4.9 8.8 4.4 7.7 4.4C6.4 4.4 5.3 4.8 4.4 5.7C3.5 6.6 3.1 7.7 3.1 9C3.1 10.3 3.5 11.4 4.4 12.3C5.3 13.2 6.4 13.6 7.7 13.6C8.8 13.6 9.8 13.1 10.6 12.1L12.3 13.8C11.8 14.3 11.1 14.7 10.3 15C9.5 15.2 8.6 15.3 7.7 15.3ZM16.4 5.3C18.2 5.3 19.6 5.8 20.6 6.7C21.6 7.6 22.1 8.9 22.1 10.6V17.9H20.3V16.5H20.2C19.4 17.6 18.3 18.2 16.9 18.2C15.6 18.2 14.6 17.8 13.7 17C12.9 16.2 12.5 15.2 12.5 14.1C12.5 12.9 12.9 11.9 13.8 11.2C14.7 10.5 15.9 10.1 17.3 10.1C18.5 10.1 19.5 10.3 20.3 10.7V10.3C20.3 9.5 20 8.8 19.4 8.3C18.8 7.7 18 7.4 17.1 7.4C15.7 7.4 14.7 8 13.9 9.1L12.3 8C13.2 6.2 14.6 5.3 16.4 5.3ZM15.1 14.2C15.1 14.8 15.4 15.3 15.9 15.7C16.4 16.1 17 16.3 17.7 16.3C18.5 16.3 19.2 16 19.8 15.4C20.3 14.8 20.6 14.1 20.6 13.3C20 12.8 19.1 12.5 18 12.5C17.1 12.5 16.4 12.7 15.9 13.1C15.4 13.4 15.1 13.8 15.1 14.2ZM27.1 15.3C25.2 15.3 23.6 14.6 22.4 13.4C21.2 12.1 20.6 10.5 20.6 8.7C20.6 6.8 21.2 5.2 22.4 4C23.6 2.7 25.2 2.1 27.1 2.1C29 2.1 30.6 2.8 31.7 4.1L30 5.8C29.2 4.9 28.3 4.4 27.2 4.4C25.9 4.4 24.8 4.8 23.9 5.7C23 6.6 22.6 7.7 22.6 9C22.6 10.3 23 11.4 23.9 12.3C24.8 13.2 25.9 13.6 27.2 13.6C28.3 13.6 29.3 13.1 30.1 12.1L31.8 13.8C31.3 14.3 30.6 14.7 29.8 15C29 15.2 28.1 15.3 27.1 15.3ZM37.9 15.3C36 15.3 34.4 14.6 33.2 13.4C32 12.1 31.4 10.5 31.4 8.7C31.4 6.8 32 5.2 33.2 4C34.4 2.7 36 2.1 37.9 2.1C39.8 2.1 41.4 2.8 42.5 4.1L40.8 5.8C40 4.9 39.1 4.4 38 4.4C36.7 4.4 35.6 4.8 34.7 5.7C33.8 6.6 33.4 7.7 33.4 9C33.4 10.3 33.8 11.4 34.7 12.3C35.6 13.2 36.7 13.6 38 13.6C39.1 13.6 40.1 13.1 40.9 12.1L42.6 13.8C42.1 14.3 41.4 14.7 40.6 15C39.8 15.2 38.9 15.3 37.9 15.3ZM44.2 18.2H42.4V2.4H44.2V18.2ZM49.1 15.3C47.2 15.3 45.6 14.6 44.4 13.4C43.2 12.1 42.6 10.5 42.6 8.7C42.6 6.8 43.2 5.2 44.4 4C45.6 2.7 47.2 2.1 49.1 2.1C51 2.1 52.6 2.8 53.7 4.1L52 5.8C51.2 4.9 50.3 4.4 49.2 4.4C47.9 4.4 46.8 4.8 45.9 5.7C45 6.6 44.6 7.7 44.6 9C44.6 10.3 45 11.4 45.9 12.3C46.8 13.2 47.9 13.6 49.2 13.6C50.3 13.6 51.3 13.1 52.1 12.1L53.8 13.8C53.3 14.3 52.6 14.7 51.8 15C51 15.2 50.1 15.3 49.1 15.3ZM56.3 5.3C58.1 5.3 59.5 5.8 60.5 6.7C61.5 7.6 62 8.9 62 10.6V17.9H60.2V16.5H60.1C59.3 17.6 58.2 18.2 56.8 18.2C55.5 18.2 54.5 17.8 53.6 17C52.8 16.2 52.4 15.2 52.4 14.1C52.4 12.9 52.8 11.9 53.7 11.2C54.6 10.5 55.8 10.1 57.2 10.1C58.4 10.1 59.4 10.3 60.2 10.7V10.3C60.2 9.5 59.9 8.8 59.3 8.3C58.7 7.7 57.9 7.4 57 7.4C55.6 7.4 54.6 8 53.8 9.1L52.2 8C53.1 6.2 54.5 5.3 56.3 5.3ZM55 14.2C55 14.8 55.3 15.3 55.8 15.7C56.3 16.1 56.9 16.3 57.6 16.3C58.4 16.3 59.1 16 59.7 15.4C60.2 14.8 60.5 14.1 60.5 13.3C59.9 12.8 59 12.5 57.9 12.5C57 12.5 56.3 12.7 55.8 13.1C55.3 13.4 55 13.8 55 14.2ZM69.1 15.3C67.2 15.3 65.6 14.6 64.4 13.4C63.2 12.1 62.6 10.5 62.6 8.7C62.6 6.8 63.2 5.2 64.4 4C65.6 2.7 67.2 2.1 69.1 2.1C71 2.1 72.6 2.8 73.7 4.1L72 5.8C71.2 4.9 70.3 4.4 69.2 4.4C67.9 4.4 66.8 4.8 65.9 5.7C65 6.6 64.6 7.7 64.6 9C64.6 10.3 65 11.4 65.9 12.3C66.8 13.2 67.9 13.6 69.2 13.6C70.3 13.6 71.3 13.1 72.1 12.1L73.8 13.8C73.3 14.3 72.6 14.7 71.8 15C71 15.2 70.1 15.3 69.1 15.3Z" fill="#757575"/>
        </svg>

        <!-- Subheader -->
        <h2 class="text-xl font-medium text-slate-900 mb-1">AMC 平台申请授权</h2>
        <p class="text-xs text-slate-500 mb-6 text-center">系统检测到未配置 production 环境变量，已进入 Google API 开发者沙盒模式</p>

        <!-- Warning / Scope Box -->
        <div class="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
          <p class="text-xs font-bold text-slate-700 mb-2">该应用正在请求以下权限：</p>
          <ul class="space-y-2">
            <li class="flex items-start gap-2.5 text-xs text-slate-600">
              <span class="text-blue-500 mt-0.5">✓</span>
              <span>管理和查看您的 Google Business Profile 商家资料</span>
            </li>
            <li class="flex items-start gap-2.5 text-xs text-slate-600">
              <span class="text-blue-500 mt-0.5">✓</span>
              <span>读取及回复您店铺的客户评价 (Google Reviews)</span>
            </li>
            <li class="flex items-start gap-2.5 text-xs text-slate-600">
              <span class="text-blue-500 mt-0.5">✓</span>
              <span>获取您的商家位置信息与名称</span>
            </li>
          </ul>
        </div>

        <p class="text-xs text-slate-450 mb-8 text-center leading-relaxed">
          点击“确认授权”将向回调接口发送模拟凭证，完成该品牌直接关联 Google 商家账号的流程。
        </p>

        <!-- Actions -->
        <div class="flex w-full gap-3 justify-end">
          <a
            href="/board"
            class="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            取消
          </a>
          <a
            href="/api/integrations/google/oauth/callback?code=mock_code_${Date.now()}&state=${state}"
            class="px-5 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition"
          >
            确认授权
          </a>
        </div>
      </div>
    </body>
    </html>
  `

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
