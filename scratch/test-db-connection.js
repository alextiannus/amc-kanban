const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  console.log('Connecting to database...');
  const users = await prisma.user.findMany({ take: 1 });
  console.log('Users:', users);
}
main().catch(err => {
  console.error('Error:', err);
}).finally(() => {
  prisma.$disconnect();
});
