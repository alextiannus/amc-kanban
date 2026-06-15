import { prisma } from '../src/lib/prisma.ts';

async function main() {
  const brands = await prisma.brand.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      subscriptions: {
        select: {
          id: true,
          planId: true,
          status: true,
          contractEndDate: true
        }
      },
      brandAgents: {
        select: {
          agentId: true,
          active: true
        }
      }
    }
  });

  console.log(JSON.stringify(brands, null, 2));
}

main().catch(console.error);
