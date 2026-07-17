import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function syncSetupNotifications(userId) {
  // 1. Fetch user's brands and active subscriptions
  const crewMembers = await prisma.crewMember.findMany({
    where: { userId, active: true },
    select: { crewId: true }
  })
  const crewIds = crewMembers.map((m) => m.crewId)

  const orgMemberships = await prisma.organizationMember.findMany({
    where: { memberId: userId },
    select: { ownerId: true }
  })
  const orgOwnerIds = orgMemberships.map((m) => m.ownerId)

  const queryOr = [
    { crew: { id: { in: crewIds } } }
  ]

  if (orgOwnerIds.length > 0) {
    const orgOwnerCrewMembers = await prisma.crewMember.findMany({
      where: { userId: { in: orgOwnerIds }, active: true },
      select: { crewId: true }
    })
    const orgOwnerCrewIds = orgOwnerCrewMembers.map((m) => m.crewId)
    if (orgOwnerCrewIds.length > 0) {
      queryOr.push({ crew: { id: { in: orgOwnerCrewIds } } })
    }
  }

  const brands = await prisma.brand.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      OR: queryOr
    },
    include: {
      accounts: true,
      knowledge: true,
      subscriptions: {
        where: {
          status: 'ACTIVE',
          OR: [
            { contractEndDate: null },
            { contractEndDate: { gt: new Date() } }
          ]
        }
      }
    }
  })

  return brands.map(b => ({
    id: b.id,
    name: b.name,
    postfastApiKey: !!b.postfastApiKey,
    subscriptions: b.subscriptions.map(s => ({ id: s.id, status: s.status, endDate: s.contractEndDate })),
    accounts: b.accounts.map(a => ({ platformId: a.platformId }))
  }))
}

async function run() {
  try {
    const jinjinResult = await syncSetupNotifications('cmpuo2jt6000tlx2bb5i5l5lq');
    const liweiResult = await syncSetupNotifications('cmp0o5bgt0000n628zrlu1prx');

    const result = {
      jinjinResult,
      liweiResult
    };

    await prisma.auditLog.create({
      data: {
        id: 'diagnose_' + Date.now(),
        action: 'DIAGNOSTIC_NOTIF',
        newValue: result,
        actorName: 'Diagnostic Agent',
        actorId: 'system',
        actorType: 'SYSTEM'
      }
    });
    console.log('Diagnostic log written successfully!');
  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
