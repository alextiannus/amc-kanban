# AI Marketing Crew - Comprehensive Code Review Report
**Date:** May 9, 2026  
**Scope:** Security, API Design, Database, Auth Flow, Type Safety, Documentation  
**Reviewers Assessment:** Critical issues found that must be addressed before production

---

## CRITICAL ISSUES 🔴

### 1. Hardcoded Default JWT Secret
**File:** [src/lib/auth.ts](src/lib/auth.ts#L3)  
**Lines:** 3-4  
**Severity:** CRITICAL - Cryptographic Secret Exposure  
**Description:**
```typescript
const secretKey = process.env.JWT_SECRET || 'secret-for-kanban-amc'
```
The JWT secret defaults to a weak, publicly visible string. Any deployed instance without `JWT_SECRET` env var uses this hardcoded value, making all tokens predictable and forgeable.

**Risk:** Session hijacking, unauthorized access, token forgery  
**Fix:**
```typescript
const secretKey = process.env.JWT_SECRET
if (!secretKey) {
  throw new Error('JWT_SECRET environment variable is required')
}
```

---

### 2. Hardcoded Bootstrap Admin Credentials
**File:** [src/app/api/auth/login/route.ts](src/app/api/auth/login/route.ts#L8-L25)  
**Lines:** 8-25  
**Severity:** CRITICAL - Account Takeover Risk  
**Description:**
```typescript
const bootstrapAdminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'alextiannus@gmail.com'
const hashedPassword = await bcrypt.hash('234567', 10)  // ← HARDCODED WEAK PASSWORD
```
When database is empty, a hardcoded default admin is created with a weak 6-character password and a personal email address.

**Risk:**
- Anyone can login with email `alextiannus@gmail.com` and password `234567`
- First-time deployment is vulnerable to immediate compromise
- Documentation leaks this in comments/instructions

**Fix:**
```typescript
if (userCount === 0) {
  throw new Error(
    'Database is empty. Admin user must be created via secure setup process. ' +
    'Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD env vars.'
  )
}
```

---

### 3. Weak API Key Validation - Database Not Checked
**File:** [src/lib/auth.ts](src/lib/auth.ts#L49-L53)  
**Lines:** 49-53  
**Severity:** CRITICAL - Authorization Bypass  
**Description:**
```typescript
export function verifyApiKey(request: Request): boolean {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false
  const token = authHeader.split(' ')[1]
  // For transition: accept any valid token format
  // Individual key verification happens at route level
  return token && token.length > 0  // ← ANY non-empty token accepted!
}
```
**Any** bearer token is accepted. The function never validates against the database. This makes the per-agent API key system ineffective - any random string works.

**Risk:** Unauthorized AI agents can access all API endpoints using any bearer token  
**Impact:** Routes using this function in `/api/tasks`, `/api/agents/profile`, and others are compromised

**Usage Examples:**
- [src/app/api/tasks/route.ts](src/app/api/tasks/route.ts#L11) - GET/POST tasks accept any API key
- [src/app/api/agents/profile/route.ts](src/app/api/agents/profile/route.ts#L14) - Agent registration only checks token exists

**Fix:**
Implement proper validation:
```typescript
export async function verifyApiKey(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  
  const token = authHeader.split(' ')[1]
  if (!token) return false
  
  // Verify token exists in database
  const agent = await getAgentFromApiKey(token)
  return !!agent
}

// Update all routes to use async validation
if (!await verifyApiKey(request)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

---

### 4. File Upload - No Size Limits
**File:** [src/app/api/agents/[id]/route.ts](src/app/api/agents/[id]/route.ts#L90-120)  
**File:** [src/app/api/settings/bg/route.ts](src/app/api/settings/bg/route.ts#L20-30)  
**Severity:** CRITICAL - Disk Space Exhaustion / DoS  
**Description:**
Both avatar and background upload endpoints accept file data without checking size limits:

```typescript
const bytes = await file.arrayBuffer()  // ← No size check!
const buffer = Buffer.from(bytes)
await fs.writeFile(filePath, buffer)    // ← Unlimited write
```

An attacker can upload gigabytes of data, exhausting disk space and causing DoS.

**Risk:**
- Server disk space exhaustion
- Denial of service attack
- File system corruption
- Production outage

**Fix:**
```typescript
const MAX_FILE_SIZE = 5 * 1024 * 1024  // 5MB
if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json(
    { error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }, 
    { status: 413 }
  )
}
```

---

### 5. Open CORS on Meta Endpoints
**File:** [src/app/api/meta/openapi/route.ts](src/app/api/meta/openapi/route.ts#L11-12)  
**File:** [src/app/api/meta/sop/route.ts](src/app/api/meta/sop/route.ts#L11-12)  
**File:** [src/app/api/meta/avatar-guide/route.ts](src/app/api/meta/avatar-guide/route.ts#L10-11)  
**Severity:** CRITICAL - Cross-Origin Resource Sharing Misconfiguration  
**Description:**
```typescript
'Access-Control-Allow-Origin': '*'  // ← Allows ANY domain
```

While these are public spec files, unrestricted CORS enables:
- Browser-based CSRF attacks
- Unauthorized API discovery by malicious domains
- Potential for abuse as unsecured endpoints

**Risk:** API specification exposure, enables attack surface discovery, CORS-based exploits

**Fix:**
```typescript
'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://amc-kanban.immedi.ai'
```

---

### 6. Weak Password Policy
**File:** [src/app/api/profile/route.ts](src/app/api/profile/route.ts#L54-57)  
**Severity:** CRITICAL - Weak Credential Security  
**Description:**
```typescript
if (!password || password.trim().length < 4) {
  return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
}
```

4-character minimum is insufficient. Combined with the hardcoded `234567` default, accounts are easily compromised.

**Risk:** Brute-force attacks, weak credentials accepted  
**Fix:**
```typescript
const MIN_PASSWORD_LENGTH = 12
if (!password || password.trim().length < MIN_PASSWORD_LENGTH) {
  return NextResponse.json(
    { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 
    { status: 400 }
  )
}
// Recommend: Add password complexity requirements (uppercase, numbers, symbols)
```

---

### 7. Bcrypt Cost Factor Too Low
**File:** [src/app/api/auth/login/route.ts](src/app/api/auth/login/route.ts#L22)  
**File:** [src/app/api/admin/users/route.ts](src/app/api/admin/users/route.ts#L105)  
**File:** [src/app/api/profile/route.ts](src/app/api/profile/route.ts#L58)  
**Severity:** HIGH - Password Hashing Weakness  
**Description:**
```typescript
await bcrypt.hash(password, 10)  // ← Cost factor of 10 (deprecated default)
```

Default cost factor of 10 is faster but less secure. Recommendation is 12+.

**Fix:**
```typescript
const BCRYPT_COST = 12
await bcrypt.hash(password, BCRYPT_COST)
```

---

## HIGH PRIORITY ISSUES 🟠

### 8. Task Status Update - Missing Authorization Check
**File:** [src/app/api/tasks/[id]/status/route.ts](src/app/api/tasks/[id]/status/route.ts#L1-40)  
**Lines:** 1-40  
**Severity:** HIGH - Unauthorized State Modification  
**Description:**
The PATCH endpoint accepts status updates from ANY authenticated user or API key, without verifying:
- Whether user is the task assignee
- Whether user has permission to change this task's status
- Whether the status change is valid

```typescript
export async function PATCH(...) {
  const session = await getSession()
  const isApiKeyValid = verifyApiKey(request)  // Only checks existence
  
  if (!session?.user && !isApiKeyValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ← No further authorization checks!
  const updatedTask = await prisma.workUnit.update({ ... })
}
```

**Risk:** Any user can change any task's status, bypassing workflow, blocking other agents, task hijacking

**Fix:**
```typescript
const task = await prisma.workUnit.findUnique({ where: { id } })
if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

// Only assignee or admin can update status
if (session?.user && session.user.role !== 'ADMIN' && task.assigneeId !== session.user.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
// If using API key, verify it matches assignee
if (isApiKeyValid) {
  const agent = await getAgentFromApiKey(token)
  if (agent?.id !== task.assigneeId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
}
```

---

### 9. Task Creation - No Validation of Assignee
**File:** [src/app/api/tasks/route.ts](src/app/api/tasks/route.ts#L39-70)  
**Lines:** 39-70  
**Severity:** HIGH - Data Integrity  
**Description:**
```typescript
export async function POST(request: Request) {
  // ... auth check ...
  const { title, description, materials, status, assigneeId } = body
  
  // NO CHECK that assigneeId is valid!
  const newTask = await prisma.workUnit.create({
    data: {
      title,
      description,
      materials,
      status: status || 'todo',
      assigneeId  // ← Could reference non-existent user
    }
  })
}
```

**Risk:** Tasks assigned to non-existent users, data integrity violations, referential integrity issues

**Fix:**
```typescript
if (assigneeId) {
  const assignee = await prisma.user.findUnique({ where: { id: assigneeId } })
  if (!assignee) {
    return NextResponse.json({ error: 'Assignee not found' }, { status: 400 })
  }
}
```

---

### 10. Task PATCH - Missing Authorization & Validation
**File:** [src/app/api/tasks/[id]/route.ts](src/app/api/tasks/[id]/route.ts#L36-60)  
**Lines:** 36-60  
**Severity:** HIGH - Unauthorized Modification  
**Description:**
```typescript
export async function PATCH(...) {
  // Auth check only, no authorization
  const { title, description, materials, assigneeId } = body
  
  // NO validation that:
  // 1. User has permission to edit this task
  // 2. New assigneeId is valid
  // 3. Required fields exist
  
  const updatedTask = await prisma.workUnit.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(materials !== undefined && { materials }),
      ...(assigneeId !== undefined && { assigneeId })
    }
  })
}
```

**Risk:** Unauthorized task modification, data corruption, assignment bypass

**Fix:**
```typescript
// Check authorization
const task = await prisma.workUnit.findUnique({ where: { id } })
if (session?.user?.role !== 'ADMIN') {
  if (task?.assigneeId !== session?.user?.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
}

// Validate new assignee
if (assigneeId) {
  const newAssignee = await prisma.user.findUnique({ where: { id: assigneeId } })
  if (!newAssignee) {
    return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 })
  }
}
```

---

### 11. Permissions Route - Missing Validation
**File:** [src/app/api/admin/permissions/route.ts](src/app/api/admin/permissions/route.ts#L1-50)  
**Lines:** 1-50  
**Severity:** HIGH - Privilege Escalation Risk  
**Description:**
```typescript
export async function POST(request: Request) {
  const { humanId, agentIds } = await request.json()
  
  if (!humanId || !Array.isArray(agentIds)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  
  // Validates human exists and agents are valid, BUT:
  // 1. No check that humanId is indeed HUMAN type (could be AI_AGENT)
  // 2. No check that agentIds are actually AI_AGENT type
  // 3. Silently succeeds if all IDs are swapped
  
  const human = await prisma.user.findUnique({
    where: { id: humanId },
    select: { id: true, type: true }
  })
  
  if (!human || human.type !== 'HUMAN') {  // ← Good check
    return NextResponse.json({ error: 'Human user not found' }, { status: 404 })
  }
}
```

**Risk:** While there IS a type check, the validation is done AFTER. Timing attack potential.

**Better Fix:**
```typescript
// Validate existence AND type upfront
const [humanUser, agents] = await Promise.all([
  prisma.user.findUnique({
    where: { id: humanId },
    select: { id: true, type: true }
  }),
  agentIds.length > 0 ? prisma.user.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, type: true }
  }) : Promise.resolve([])
])

if (!humanUser || humanUser.type !== 'HUMAN') {
  return NextResponse.json({ error: 'Human user not found' }, { status: 404 })
}

if (agents.some(a => a.type !== 'AI_AGENT')) {
  return NextResponse.json({ error: 'Invalid agent IDs' }, { status: 400 })
}
```

---

### 12. Agent Profile - No Proper API Key Validation
**File:** [src/app/api/agents/profile/route.ts](src/app/api/agents/profile/route.ts#L14-24)  
**Lines:** 14-24  
**Severity:** HIGH - Weak Authentication  
**Description:**
```typescript
export async function POST(request: Request) {
  const isApiKeyValid = verifyApiKey(request)
  
  if (!isApiKeyValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ← verifyApiKey() is broken (issue #3), accepts ANY token
  
  const body = await request.json()
  const { agentId, nickname, introduction, workflow, ... } = body
  // No validation that the API key belongs to this agentId!
}
```

**Risk:** Any agent can register with any agentId, impersonation, identity spoofing

**Fix:**
Implement proper verification:
```typescript
const token = request.headers.get('Authorization')?.split(' ')[1]
const agent = await getAgentFromApiKey(token)
if (!agent) {
  return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
}

// Only allow agent to update their own profile
const canonicalAgentId = singleAgentMode ? canonicalAgentId : agent.email.split('@')[0]
if (agentId !== canonicalAgentId) {
  return NextResponse.json({ error: 'Cannot update other agent profiles' }, { status: 403 })
}
```

---

### 13. Session Bootstrap - Race Condition on First Login
**File:** [src/app/api/auth/login/route.ts](src/app/api/auth/login/route.ts#L11-29)  
**Lines:** 11-29  
**Severity:** HIGH - Race Condition / Logic Error  
**Description:**
```typescript
let user = await prisma.user.findUnique({ where: { email } })

const userCount = await prisma.user.count()  // ← Could change between checks
if (userCount === 0) {
  const hashedPassword = await bcrypt.hash('234567', 10)
  await prisma.user.create({
    data: {
      email: 'alextiannus@gmail.com',  // ← Hardcoded, not the login email!
      password: hashedPassword,
      role: 'ADMIN',
    }
  })
  user = await prisma.user.findUnique({ where: { email } })  // ← Still might be null!
}

if (!user) {
  return NextResponse.json({ error: 'User not found' }, { status: 404 })
}
```

**Race Condition:** Between the `findUnique` and `count()` checks, another request could create a user, causing bootstrap logic to skip.

**Logic Error:** Bootstrap creates `alextiannus@gmail.com` but checks the login email. If you try to login with a different email first, it creates the bootstrap user but then returns "User not found" for your email.

**Fix:**
```typescript
let user = await prisma.user.findUnique({ where: { email } })

if (!user) {
  const userCount = await prisma.user.count()
  
  if (userCount === 0) {
    // Only create admin if email matches bootstrap email
    if (email === bootstrapAdminEmail) {
      const hashedPassword = await bcrypt.hash(process.env.BOOTSTRAP_ADMIN_PASSWORD || '', 10)
      user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          role: 'ADMIN',
        }
      })
    } else {
      return NextResponse.json(
        { error: 'System not initialized. Contact administrator.' },
        { status: 503 }
      )
    }
  } else {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
}
```

---

### 14. No Input Validation on Key Fields
**File:** [src/app/api/agents/profile/route.ts](src/app/api/agents/profile/route.ts#L22-24)  
**Severity:** HIGH - Data Validation  
**Description:**
```typescript
const { agentId, nickname, introduction, workflow, themeColor, avatar, insights } = body

if (!agentId) {
  return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
}
// ← NO validation of other fields!
// - nickname: could be empty/very long
// - workflow: could be XSS payload
// - themeColor: could be invalid hex
// - avatar: could be invalid URL
```

**Risk:** Data corruption, XSS if these fields rendered without escaping, buffer overflow on long strings

**Fix:**
```typescript
const validateString = (str: string | undefined, field: string, maxLen = 1000) => {
  if (str !== undefined && (typeof str !== 'string' || str.length > maxLen)) {
    throw new Error(`Invalid ${field}`)
  }
}

const validateColor = (color: string | undefined) => {
  if (color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error('Invalid hex color')
  }
}

try {
  validateString(agentId, 'agentId', 100)
  validateString(nickname, 'nickname', 100)
  validateString(introduction, 'introduction', 500)
  validateString(workflow, 'workflow', 1000)
  validateColor(themeColor)
  validateString(avatar, 'avatar', 2000)
  validateString(insights, 'insights', 1000)
} catch (e) {
  return NextResponse.json({ error: e.message }, { status: 400 })
}
```

---

### 15. No Error Logging - Security Blind Spot
**File:** Multiple files - All routes  
**Severity:** HIGH - Security Monitoring  
**Description:**
All routes catch errors but only log to console:
```typescript
catch (error) {
  console.error('Login error', error)  // ← Console only, no structured logging
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
}
```

**Risk:**
- No audit trail for security events
- Attacks impossible to investigate post-incident
- No alerting on repeated failed auth attempts
- No rate-limiting trigger detection

**Fix:**
Implement structured logging:
```typescript
import logger from '@/lib/logger'

catch (error) {
  logger.error({
    event: 'api_error',
    endpoint: request.url,
    method: request.method,
    userId: session?.user?.id,
    error: error.message,
    timestamp: new Date().toISOString()
  })
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
}
```

---

## MEDIUM PRIORITY ISSUES 🟡

### 16. Type Safety - Implicit `any` in Route Parameters
**File:** [src/app/api/tasks/route.ts](src/app/api/tasks/route.ts#L17)  
**Severity:** MEDIUM - Type Safety  
**Description:**
```typescript
export async function POST(request: Request) {
  const body = await request.json()  // ← body is any
  const { title, description, materials, status, assigneeId } = body
  // No validation of types at runtime
}
```

**Risk:** Type errors not caught, unexpected data types cause bugs

**Fix:**
```typescript
import { z } from 'zod'

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  materials: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'pending', 'done', 'void']).optional(),
  assigneeId: z.string().uuid().optional()
})

const body = CreateTaskSchema.parse(await request.json())
```

---

### 17. XSS Risk in Markdown Rendering
**File:** [src/components/TaskModal.tsx](src/components/TaskModal.tsx#L95-100)  
**Severity:** MEDIUM - XSS Vulnerability  
**Description:**
```tsx
import ReactMarkdown from 'react-markdown'

// ← ReactMarkdown needs sanitization
<ReactMarkdown remarkPlugins={[remarkGfm]}>
  {task.description}
</ReactMarkdown>
```

**Risk:** If user descriptions contain malicious markdown/HTML, could execute scripts

**Note:** ReactMarkdown is relatively safe but should use `rehype-sanitize`:
```tsx
import rehypeSanitize from 'rehype-sanitize'

<ReactMarkdown 
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeSanitize]}
>
  {task.description}
</ReactMarkdown>
```

---

### 18. Null Pointer Risk - Task Assignee
**File:** [src/components/TaskCard.tsx](src/components/TaskCard.tsx#L7-16)  
**Severity:** MEDIUM - Runtime Error  
**Description:**
```tsx
{task.assignee.avatar ? (
  <img src={task.assignee.avatar} alt="Agent Avatar" />
) : (
  (task.assignee.nickname || task.assignee.email.split('@')[0])  // ← No null check on task.assignee
)}
```

**Risk:** If `task.assignee` is null, component crashes

**Fix:**
```tsx
{task.assignee ? (
  task.assignee.avatar ? (
    <img src={task.assignee.avatar} alt="Agent Avatar" />
  ) : (
    <span>{(task.assignee.nickname || task.assignee.email.split('@')[0]).substring(0, 2)}</span>
  )
) : (
  <span>?</span>
)}
```

---

### 19. No Rate Limiting on Auth Endpoints
**File:** [src/app/api/auth/login/route.ts](src/app/api/auth/login/route.ts)  
**Severity:** MEDIUM - Brute Force Attack  
**Description:**
No rate limiting on login endpoint. An attacker can attempt unlimited password guesses.

**Risk:** Brute force password attacks, account takeover

**Fix:**
```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'),  // 5 attempts per 15 minutes
})

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = await ratelimit.limit(ip)
  
  if (!success) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 })
  }
  // ... rest of login logic
}
```

---

### 20. Inconsistent Error Messages - Information Disclosure
**File:** Multiple routes  
**Severity:** MEDIUM - Security  
**Description:**
Different error messages for user exists vs user not found:
```typescript
// admin/users/route.ts
if (existing) return NextResponse.json({ error: 'User already exists' }, { status: 400 })
// Leaks info that email is registered

// auth/login/route.ts
if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
// Leaks info that email is not registered
```

**Risk:** Attackers can enumerate valid emails/usernames

**Fix:**
```typescript
// Always return generic message for auth failures
return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })

// For admin operations, use 400 consistently
return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
```

---

### 21. Agent Permission - No Existence Check Before Deletion
**File:** [src/app/api/admin/permissions/route.ts](src/app/api/admin/permissions/route.ts#L34-45)  
**Severity:** MEDIUM - Data Integrity  
**Description:**
```typescript
await prisma.agentPermission.deleteMany({
  where: { humanId }
})

// Silently succeeds even if permissions don't exist
```

**Risk:** Silent failures, unclear API behavior

**Better:**
```typescript
const deletedCount = await prisma.agentPermission.deleteMany({
  where: { humanId }
})
// Return count or verify operation
```

---

### 22. No DELETE Operation for Tasks
**File:** [src/app/api/tasks/[id]/route.ts](src/app/api/tasks/[id]/route.ts)  
**Severity:** MEDIUM - Feature Gap  
**Description:**
No DELETE endpoint for tasks. Only GET and PATCH exist. Tasks cannot be removed, only marked "void".

**Risk:** Data accumulation, confusion about what "void" means vs deleted

**Fix:** Add DELETE method or clarify permanent deletion approach.

---

### 23. Session Expiration - No Refresh Mechanism
**File:** [src/lib/auth.ts](src/lib/auth.ts#L8-10)  
**Severity:** MEDIUM - UX/Security  
**Description:**
```typescript
.setExpirationTime('7d')  // Fixed 7 days, no refresh
```

After 7 days, user is forcibly logged out even if actively using the system.

**Fix:** Implement refresh tokens or extend expiry on activity.

---

## LOW PRIORITY ISSUES 🟢

### 24. TypeScript Strict Mode - Some Potential Issues
**File:** [tsconfig.json](tsconfig.json#L5)  
**Status:** ✅ Good - `"strict": true` is enabled

However, some routes still use implicit `any`:
```typescript
const { params }: { params: any }  // Should be Promise<{id: string}>
```

**Fix:** Ensure all params are properly typed:
```typescript
{ params }: { params: Promise<{ id: string }> }  // ✅ Already done in most places
```

---

### 25. Environment Configuration - Missing Validation
**File:** [.env](.env)  
**Severity:** LOW - Configuration Safety  
**Description:**
```env
DATABASE_URL="file:./dev.db"  # ← SQLite for development
```

Production should use PostgreSQL but there's no validation that `.env` is configured correctly.

**Fix:**
```typescript
// At startup, validate env
if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL?.startsWith('file:')) {
  throw new Error('SQLite not allowed in production. Use PostgreSQL.')
}
```

---

### 26. No HTTPS Redirect in Production
**File:** [src/app/api/auth/login/route.ts](src/app/api/auth/login/route.ts#L53)  
**Severity:** LOW - Transport Security  
**Description:**
```typescript
cookieStore.set('session', encryptedSession, {
  secure: process.env.NODE_ENV === 'production',  // ← Good
  sameSite: 'lax',  // ← Could be 'strict' for better security
})
```

**Note:** The code is actually correct - `secure` flag is set for production. SameSite could be stricter.

**Recommendation:**
```typescript
sameSite: 'strict'  // More protective against CSRF
```

---

### 27. File Upload Filenames - Timing Attack
**File:** [src/app/api/agents/[id]/route.ts](src/app/api/agents/[id]/route.ts#L103)  
**Severity:** LOW - Timing Side-Channel  
**Description:**
```typescript
const fileName = `${id}-avatar-${Date.now()}.${extension}`
```

Using Date.now() in filename is observable. While not critical, could be used to enumerate user activity.

**Recommendation:**
```typescript
const fileName = `${id}-avatar-${crypto.randomUUID()}.${extension}`
```

---

### 28. Code Organization - Repeated Auth Patterns
**Severity:** LOW - Code Quality  
**Description:**
Auth check is duplicated across all routes:
```typescript
const session = await getSession()
if (!session || !session.user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**Recommendation:** Extract to middleware:
```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session')?.value
  
  if (!session && request.nextUrl.pathname.startsWith('/api/protected/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
```

---

### 29. Missing Documentation on API Key Lifecycle
**File:** [src/app/api/agents/profile/route.ts](src/app/api/agents/profile/route.ts)  
**Severity:** LOW - Documentation  
**Description:**
No endpoint to:
- Rotate/regenerate API keys
- Revoke/disable keys
- List active keys

**Recommendation:** Add key management endpoints.

---

### 30. Default Task Status Not Validated
**File:** [src/app/api/tasks/route.ts](src/app/api/tasks/route.ts#L60)  
**Severity:** LOW - Data Validation  
**Description:**
```typescript
status: status || 'todo'  // ← Could accept invalid status earlier
```

**Fix:** Validate against enum:
```typescript
const VALID_STATUSES = ['todo', 'in_progress', 'pending', 'done', 'void']
if (status && !VALID_STATUSES.includes(status)) {
  return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
}
```

---

## DOCUMENTATION & CONSISTENCY ISSUES 📋

### 31. System Instructions - Multiple Versions (Partially Aligned)
**Files:** 
- [skills/agent-instructions.md](skills/agent-instructions.md)
- [src/components/KanbanBoard.tsx](src/components/KanbanBoard.tsx#L90-180)
- [USER_MANUAL.md](USER_MANUAL.md)
- [docs/PRD.md](docs/PRD.md#L30-80)

**Status:** ✅ Mostly aligned on API key usage ✅ Good: All three reference the same flow

**Issue:** Hardcoded hostname `https://amc-kanban.immedi.ai` - should be configurable:
```markdown
# Current (hardcoded):
- API 规范：GET https://amc-kanban.immedi.ai/api/meta/openapi

# Should be:
- API 规范：GET {KANBAN_API_HOST}/api/meta/openapi
```

**Fix:**
```typescript
const KANBAN_HOST = process.env.NEXT_PUBLIC_KANBAN_HOST || 'https://amc-kanban.immedi.ai'
```

---

### 32. Missing Endpoint Documentation
**Severity:** MEDIUM - API Documentation  
**Missing Endpoints Documentation:**
- No OpenAPI/Swagger schema served (though `kanban-openapi.yaml` exists)
- No response schema validation examples
- No error code documentation

**Recommendation:**
- Serve OpenAPI at `/api/meta/openapi` (already done ✅)
- Document all error codes
- Add rate limit headers to responses

---

## SUMMARY TABLE

| Issue # | Category | Severity | Status |
|---------|----------|----------|--------|
| 1 | Security | CRITICAL | 🔴 Must Fix |
| 2 | Security | CRITICAL | 🔴 Must Fix |
| 3 | Security | CRITICAL | 🔴 Must Fix |
| 4 | Security | CRITICAL | 🔴 Must Fix |
| 5 | Security | CRITICAL | 🔴 Must Fix |
| 6 | Security | CRITICAL | 🔴 Must Fix |
| 7 | Security | HIGH | 🔴 Must Fix |
| 8 | API Design | HIGH | 🔴 Must Fix |
| 9 | Data Integrity | HIGH | 🔴 Must Fix |
| 10 | API Design | HIGH | 🔴 Must Fix |
| 11 | Authorization | HIGH | 🟠 Should Fix |
| 12 | Authentication | HIGH | 🟠 Should Fix |
| 13 | Logic Error | HIGH | 🟠 Should Fix |
| 14 | Validation | HIGH | 🟠 Should Fix |
| 15 | Monitoring | HIGH | 🟠 Should Fix |
| 16-23 | Various | MEDIUM | 🟡 Nice to Have |
| 24-30 | Various | LOW | 🟢 Polish |
| 31-32 | Documentation | MEDIUM | 🟡 Nice to Have |

---

## RECOMMENDATIONS

### Immediate Actions (Next Sprint)
1. ✅ Fix JWT secret to require env var (Issue #1)
2. ✅ Remove hardcoded admin credentials (Issue #2)
3. ✅ Implement proper API key validation (Issues #3, #12)
4. ✅ Add file upload size limits (Issue #4)
5. ✅ Fix CORS configuration (Issue #5)
6. ✅ Strengthen password policy (Issue #6)
7. ✅ Fix task authorization checks (Issues #8, #10)
8. ✅ Validate task assignee exists (Issue #9)
9. ✅ Fix session bootstrap race condition (Issue #13)
10. ✅ Add input validation with schema (Issue #14)

### Short Term (Next 2 Sprints)
1. Implement structured logging (Issue #15)
2. Add type safety with Zod (Issue #16)
3. Add rehype-sanitize to markdown (Issue #17)
4. Implement rate limiting (Issue #19)
5. Standardize error messages (Issue #20)
6. Add TypeScript middleware (Issue #28)

### Medium Term (Next Quarter)
1. Implement API key management endpoints
2. Add comprehensive audit logging
3. Set up security monitoring/alerting
4. Implement refresh token mechanism
5. Add API rate limiting via Redis
6. Create security.md documentation

---

## DEPLOYMENT CHECKLIST

⚠️ **DO NOT DEPLOY to production without addressing:**
- [ ] All CRITICAL issues (1-6, 7)
- [ ] All HIGH priority security issues (8, 9, 12, 13, 14, 15)

**Pre-Deployment:**
- [ ] Set `JWT_SECRET` environment variable
- [ ] Set `BOOTSTRAP_ADMIN_PASSWORD` environment variable  
- [ ] Remove hardcoded `'234567'` password
- [ ] Enable proper API key validation
- [ ] Add file upload size limits
- [ ] Set restrictive CORS headers
- [ ] Enable HTTPS on production
- [ ] Verify all auth checks are in place
- [ ] Test rate limiting on auth endpoints
- [ ] Set up structured logging

---

## REFERENCES & STANDARDS

- OWASP Top 10 2021: https://owasp.org/Top10/
- CWE-307: Improper Restriction of Rendered UI Layers or Frames (Password input)
- CWE-434: Unrestricted Upload of File with Dangerous Type (File uploads)
- CWE-352: Cross-Site Request Forgery (CSRF)
- NIST Guidelines on Password Policies

---

**Report Generated:** May 9, 2026  
**Next Review:** After fixing CRITICAL issues
