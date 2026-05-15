const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
  const connectionString = 'postgresql://app:app@localhost:5434/pdf_ai';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  const docs = await prisma.document.findMany({
    select: { id: true, status: true, errorMessage: true }
  });
  console.log(JSON.stringify(docs, null, 2));
  await prisma.$disconnect();
}
main();
