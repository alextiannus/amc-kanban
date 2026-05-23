import { POST as handlePOST, GET as handleGET } from '../route'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Params) {
  return handlePOST(request, context)
}

export async function GET(request: Request, context: Params) {
  return handleGET(request, context)
}
