const { prisma } = require('./src/lib/prisma');
const { syncSetupNotifications } = require('./src/lib/notification/notificationService');

async function run() {
  try {
    const jinjinNotifs = await syncSetupNotifications('cmpuo2jt6000tlx2bb5i5l5lq');
    const liweiNotifs = await syncSetupNotifications('cmp0o5bgt0000n628zrlu1prx');
    
    // Check brand crew members and active status
    const jinjinCrews = await prisma.crewMember.findMany({ where: { userId: 'cmpuo2jt6000tlx2bb5i5l5lq' } });
    const liweiCrews = await prisma.crewMember.findMany({ where: { userId: 'cmp0o5bgt0000n628zrlu1prx' } });
    
    const brand = await prisma.brand.findUnique({
      where: { id: 'cmros67sb0006p92ahjt7dbl9' },
      include: {
        accounts: true,
        subscriptions: { where: { status: 'ACTIVE' } }
      }
    });

    const result = {
      jinjinNotifs,
      liweiNotifs,
      jinjinCrews,
      liweiCrews,
      brand: brand ? {
        id: brand.id,
        name: brand.name,
        postfastApiKey: brand.postfastApiKey ? 'present' : 'missing',
        subscriptionsCount: brand.subscriptions.length,
        accountsCount: brand.accounts.length,
        accounts: brand.accounts.map(a => ({ platformId: a.platformId }))
      } : null
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
