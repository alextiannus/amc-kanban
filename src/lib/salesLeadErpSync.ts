import { createErpLead, getImmediErpConfig } from '@/lib/integrations/immediErp'
import { prisma } from '@/lib/prisma'

const SYNCABLE_STATUSES = ['PENDING', 'FAILED']
const STALE_SYNC_MS = 5 * 60 * 1000

export async function syncSalesLeadToErp(leadId: string) {
  const claim = await prisma.salesLead.updateMany({
    where: {
      id: leadId,
      OR: [
        { erpSyncStatus: { in: SYNCABLE_STATUSES } },
        {
          erpSyncStatus: 'SYNCING',
          erpLastSyncAt: { lt: new Date(Date.now() - STALE_SYNC_MS) },
        },
      ],
    },
    data: {
      erpSyncStatus: 'SYNCING',
      erpSyncError: null,
      erpSyncAttempts: { increment: 1 },
      erpLastSyncAt: new Date(),
    },
  })

  const lead = await prisma.salesLead.findUnique({
    where: { id: leadId },
    include: { bdUser: { select: { name: true, email: true } } },
  })
  if (!lead) return { ok: false as const, code: 'NOT_FOUND', error: 'Lead not found' }
  if (lead.erpSyncStatus === 'SYNCED') return { ok: true as const, lead }
  if (claim.count === 0) {
    return { ok: false as const, code: 'IN_PROGRESS', error: 'ERP sync is already in progress', lead }
  }

  const cfg = await getImmediErpConfig()
  if (!cfg) return markFailed(leadId, 'ERP integration is disabled or not configured')

  const result = await createErpLead(cfg, {
    item_code: cfg.itemCodeMap.bd_lead || 'AMC-STARTER',
    lead_name: lead.name,
    company_name: lead.name,
    mobile_no: lead.phone,
    email_id: lead.email,
    source: 'AMC-MM BD',
    remarks: buildAuditRemarks(lead),
  })

  if (!result.ok || !result.erpLeadName) {
    return markFailed(leadId, result.error || 'ERP did not return a Lead ID')
  }

  const updated = await prisma.salesLead.update({
    where: { id: leadId },
    data: {
      erpLeadName: result.erpLeadName,
      erpSyncStatus: 'SYNCED',
      erpSyncError: null,
      erpSyncedAt: new Date(),
    },
  })
  return { ok: true as const, lead: updated, alreadyExists: result.alreadyExists || false }
}

function buildAuditRemarks(lead: {
  id: string
  notes: string | null
  bdUser: { name: string | null; email: string } | null
}) {
  const bdIdentity = lead.bdUser?.name || lead.bdUser?.email || 'Unknown BD user'
  return [
    `AMC-MM SalesLead: ${lead.id}`,
    `Submitted by: ${bdIdentity}`,
    lead.notes ? `BD notes: ${lead.notes}` : '',
  ].filter(Boolean).join('\n').slice(0, 2000)
}

async function markFailed(leadId: string, error: string) {
  const safeError = String(error || 'ERP sync failed').slice(0, 500)
  const lead = await prisma.salesLead.update({
    where: { id: leadId },
    data: { erpSyncStatus: 'FAILED', erpSyncError: safeError },
  })
  return { ok: false as const, code: 'ERP_SYNC_FAILED', error: safeError, lead }
}
