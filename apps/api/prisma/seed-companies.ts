/**
 * Adds only the demo group's companies (`seed-group.ts`): Demo Infra Holdings, Demo Buildcon, Demo Design Consultants and
 * Demo Quality Labs with their people and records, and the sisters' work order and bills in the demo company. For a live
 * database that stopped taking the full demo seed (SEED_ON_BUILD=false). Runs on a Vercel build with
 * SEED_GROUP_ON_BUILD=true, or by hand with `npx tsx prisma/seed-companies.ts`. Idempotent: each company's records are
 * written once, and a sign-in that already exists keeps its password.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedGroupCompanies } from './seed-group';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findUnique({ where: { code: 'DEMO' }, select: { id: true } });
  if (!org) {
    console.log('No demo company; nothing to add.');
    return;
  }
  await seedGroupCompanies(prisma, org.id, await bcrypt.hash('password123', 10));
  const { groupId } = await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { groupId: true } });
  const companies = await prisma.organization.findMany({ where: { groupId }, select: { name: true, _count: { select: { projects: true } } }, orderBy: { name: 'asc' } });
  console.log(`Demo Infra Group: ${companies.map((c) => `${c.name} (${c._count.projects} projects)`).join(', ')}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
