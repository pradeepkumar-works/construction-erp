/**
 * Adds only the Devgarh town scheme (WS-2026-04) to the demo company: its work breakdown, DPRs and pipe network.
 * For a live database that stopped taking the full demo seed (SEED_ON_BUILD=false) but should show the work
 * breakdown; nothing outside that project is written. Runs on a Vercel build with SEED_TOWN_ON_BUILD=true, or by
 * hand with `npx tsx prisma/seed-town.ts`. Idempotent: each step returns when its part is already there.
 */
import { PrismaClient } from '@prisma/client';
import { seedTownDprs, seedTownProject } from './seed-structure';
import { seedTownNetwork } from './seed-pipes';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findUnique({ where: { code: 'DEMO' }, select: { id: true } });
  if (!org) {
    console.log('No demo company; nothing to add.');
    return;
  }
  const added = await seedTownProject(prisma, org.id);
  await seedTownDprs(prisma, org.id);
  await seedTownNetwork(prisma, org.id);
  console.log(added ? 'Added the Devgarh town scheme (WS-2026-04).' : 'The Devgarh town scheme is already there.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
