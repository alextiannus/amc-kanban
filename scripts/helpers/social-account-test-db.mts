import assert from 'node:assert/strict'

export function bindingTestDb() {
  let state: any = { accounts: [], drafts: [], audit: [], brands: [{ id: 'brand', postfastApiKey: 'test-key' }] }
  const held = new Set<string>()
  function matches(row: any, where: any): boolean {
    return Object.entries(where || {}).every(([key, value]: [string, any]) => {
      if (key === 'OR') return value.some((v: any) => matches(row, v))
      if (key === 'drafts' || key === 'actionItems' || key === 'snapshots' || key === 'inboxConversations') return !(row[key]?.length)
      if (key === 'postfastDeliveryJobs') return row.jobs?.some((j: any) => matches(j, value.some)) || false
      if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key])
      return row[key] === value || (value === null && row[key] == null)
    })
  }
  function client(read: () => any, acquired?: string[]) {
    const c: any = {
      $queryRaw: async (_sql: unknown, key: string) => {
        assert(key.startsWith('social-account:') || key.startsWith('social-account-sync:'))
        if (acquired?.includes(key)) return [{ locked: true }]
        if (held.has(key)) return [{ locked: false }]
        held.add(key)
        acquired?.push(key)
        return [{ locked: true }]
      },
      socialAccount: {
        findMany: async ({ where }: any = {}) => read().accounts.filter((a: any) => matches(a, where)).map((a: any) => ({ ...a })),
        findUnique: async ({ where }: any) => read().accounts.find((a: any) => matches(a, where)) ?? null,
        findFirst: async ({ where }: any) => read().accounts.find((a: any) => matches(a, where)) ?? null,
        create: async ({ data }: any) => {
          const row = { id: `local-${read().accounts.length}`, unboundAt: null, autoPilot: true, ...data }
          read().accounts.push(row)
          return { ...row }
        },
        update: async ({ where, data }: any) => {
          const row = read().accounts.find((a: any) => matches(a, where))
          assert(row, 'account must exist')
          Object.assign(row, data)
          return { ...row }
        },
        deleteMany: async ({ where }: any) => {
          const before = read().accounts.length
          read().accounts = read().accounts.filter((a: any) => !matches(a, where))
          return { count: before - read().accounts.length }
        },
      },
      brand: {
        findMany: async ({ where }: any) => read().brands.filter((b: any) => matches(b, where)),
        findUnique: async ({ where }: any) => read().brands.find((b: any) => matches(b, where)),
      },
      contentDraft: { count: async ({ where }: any) => read().drafts.filter((d: any) => matches(d, where)).length },
      auditLog: { create: async ({ data }: any) => { read().audit.push(data); return data } },
    }
    c.$extends = () => c
    return c
  }
  const db = client(() => state)
  db.$transaction = async (work: any) => {
    const acquired: string[] = []
    const snapshot = structuredClone(state)
    const tx = client(() => snapshot, acquired)
    try {
      const result = await work(tx)
      state = snapshot
      return result
    } finally {
      for (const key of acquired) held.delete(key)
    }
  }
  return { db, state: () => state, reset: (next: any) => { state = structuredClone(next); held.clear() } }
}
