import { buildAdminStatusUpdateData, buildOfflineInvoiceResponse } from '../src/lib/subscription/workflow.ts'

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label} failed. expected=${String(expected)}, actual=${String(actual)}`)
  }
}

function assertDate(value: unknown, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} failed. expected valid Date, actual=${String(value)}`)
  }
}

function run() {
  const offline = buildOfflineInvoiceResponse({
    subscriptionId: 'sub_123',
    status: 'PENDING',
    totalDueUsd: 10100,
  })
  assertEqual(offline.paymentMode, 'OFFLINE', 'offline payment mode')
  assertEqual(offline.status, 'PENDING', 'offline invoice status')
  assertEqual(offline.totalDueUsd, 10100, 'offline invoice total')

  const now = new Date('2026-05-29T10:00:00.000Z')
  const activeFromPending = buildAdminStatusUpdateData(
    {
      paidAt: null,
      contractStartDate: null,
      contractEndDate: null,
      durationMonths: 3,
    },
    'ACTIVE',
    now
  )

  assertEqual(activeFromPending.status, 'ACTIVE', 'activate status')
  assertDate(activeFromPending.paidAt, 'activate paidAt')
  assertDate(activeFromPending.contractStartDate, 'activate contractStartDate')
  assertDate(activeFromPending.contractEndDate, 'activate contractEndDate')

  const activeKeepDates = buildAdminStatusUpdateData(
    {
      paidAt: new Date('2026-01-01T00:00:00.000Z'),
      contractStartDate: new Date('2026-01-05T00:00:00.000Z'),
      contractEndDate: new Date('2026-04-05T00:00:00.000Z'),
      durationMonths: 3,
    },
    'ACTIVE',
    now
  )
  assertEqual(activeKeepDates.paidAt?.toISOString(), '2026-01-01T00:00:00.000Z', 'active keeps paidAt')
  assertEqual(activeKeepDates.contractStartDate?.toISOString(), '2026-01-05T00:00:00.000Z', 'active keeps start')
  assertEqual(activeKeepDates.contractEndDate?.toISOString(), '2026-04-05T00:00:00.000Z', 'active keeps end')

  const failedUpdate = buildAdminStatusUpdateData(
    {
      paidAt: null,
      contractStartDate: null,
      contractEndDate: null,
      durationMonths: 12,
    },
    'FAILED',
    now
  )
  assertEqual(failedUpdate.status, 'FAILED', 'failed status')
  assertEqual(failedUpdate.paidAt, null, 'failed keeps paidAt null')
  assertEqual(failedUpdate.contractStartDate, null, 'failed keeps start null')
  assertEqual(failedUpdate.contractEndDate, null, 'failed keeps end null')

  console.log('[subscription-workflow-test] all workflow tests passed')
}

run()