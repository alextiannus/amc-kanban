import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function checkUser(userId, label) {
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
      subscriptions: { where: { status: 'ACTIVE' } }
    }
  })

  // Get notifications for this user and this brand
  const notifs = await prisma.notification.findMany({
    where: { userId }
  })

  console.log(`=== ${label} (${userId}) ===`);
  console.log(`Crews: ${JSON.stringify(crewIds)}`);
  console.log(`Brands visible: ${brands.map(b => b.name).join(', ')}`);
  console.log(`Notifications list: ${JSON.stringify(notifs.map(n => ({ id: n.id, type: n.type, brandId: n.brandId, status: n.status })))}`);
}

async function run() {
  try {
    await checkUser('cmpuo2jt6000tlx2bb5i5l5lq', 'Jinjin');
    await checkUser('cmp0o5bgt0000n628zrlu1prx', 'Li Wei');
  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
