const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const brands = await prisma.brand.findMany({
    select: { id: true, name: true }
  });
  console.log('Brands in database:');
  console.dir(brands);
}

main().catch(console.error).finally(() => prisma.$disconnect());
