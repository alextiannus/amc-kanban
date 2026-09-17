import { roleRequest } from '@/lib/role-permissions/role-handler'
import { createRole } from '@/lib/role-permissions/roles'
import { readPolicies } from '@/lib/role-permissions/store'
import { contentPolicyReady } from '@/lib/role-permissions/readiness'
export async function GET(request: Request) { return roleRequest(request, async () => ({ roles: (await readPolicies()).roles, contentReady: await contentPolicyReady() })) }
export async function POST(request: Request) { return roleRequest(request, async actor => createRole(actor, await request.json()), true) }
