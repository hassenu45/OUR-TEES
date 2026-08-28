const { PrismaClient } = require('./generated/prisma/client');

const prisma = new PrismaClient();

prisma.siteSettings.update({
  where: { id: 1 },
  data: { adminPassword: '2007127' }
})
.then(() => {
  console.log('Database updated successfully');
  prisma.$disconnect();
  process.exit(0);
})
.catch((e) => {
  console.error('Error updating database:', e.message);
  prisma.$disconnect();
  process.exit(1);
});