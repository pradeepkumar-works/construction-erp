/**
 * A project never vanishes for the person who saved it. A project manager sees only the projects they manage or are on
 * the team of, so one who creates a project for another manager, or hands their own to one, is put on its team: before
 * this the project answered "Project not found" for them the moment it was saved. Someone who sees every project is
 * not added. Runs on the demo company; the projects it makes go again.
 *
 *   DATABASE_URL=… node dist/scripts/project-creator-test.js
 */
import type { RoleKey } from '@erp/shared';

async function main(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { ProjectsService } = await import('../projects/projects.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const projects = app.get(ProjectsService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n  ${detail}`}`);
    if (!ok) problems.push(name);
  };
  const made: string[] = [];
  const said = (e: unknown) => `${(e as Error).constructor.name}: ${(e as Error).message}`;

  await new Promise<void>((resolve, reject) =>
    tenantMiddleware(null, null, () => {
      setTenant(org.id);
      (async () => {
        const users = await prisma.user.findMany({ where: { organizationId: org.id, isActive: true }, include: { role: true } });
        const as = (email: string) => {
          const u = users.find((x) => x.email === email);
          if (!u) throw new Error(`No ${email} in the demo company`);
          return { id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName, seesAllProjects: u.seesAllProjects };
        };
        const pm = as('pm@demo.com');
        const md = as('md@demo.com');
        const other = as('pm2@demo.com');
        const stamp = Date.now().toString(36).toUpperCase();
        const dto = (n: number, projectManagerId?: string) => ({ code: `ZZ-${stamp}-${n}`, name: `Creator test ${n}`, type: 'BUILDING' as const, projectManagerId });

        const forAnother = await projects.create(pm, dto(1, md.id));
        made.push(forAnother.id);
        check('a manager who creates a project for another manager is on its team', forAnother.members.some((m) => m.userId === pm.id), `team: ${forAnother.members.map((m) => m.fullName).join(', ') || 'no one'}`);
        const opened = await projects.get(pm, forAnother.id).then(() => 'opens', said);
        check('and still opens it', opened === 'opens', opened);
        const listed = await projects.list(pm, { q: forAnother.code } as never);
        check('and finds it in the list', listed.items.some((p) => p.id === forAnother.id));

        const own = await projects.create(pm, dto(2, pm.id));
        made.push(own.id);
        check('a manager who manages their own project is not added twice', own.members.length === 0);
        const handed = await projects.update(pm, own.id, { projectManagerId: other.id }).then((p) => p, said);
        check('handing it to another manager keeps them on its team', typeof handed !== 'string' && handed.members.some((m) => m.userId === pm.id), typeof handed === 'string' ? handed : '');
        const after = await projects.get(pm, own.id).then(() => 'opens', said);
        check('and they still open it', after === 'opens', after);

        const byMd = await projects.create(md, dto(3, other.id));
        made.push(byMd.id);
        check('someone who sees every project is not put on the team', byMd.members.length === 0);
      })()
        .finally(async () => {
          await prisma.auditLog.deleteMany({ where: { entityId: { in: made } } });
          await prisma.projectMember.deleteMany({ where: { projectId: { in: made } } });
          await prisma.project.deleteMany({ where: { id: { in: made } } });
        })
        .then(resolve, reject);
    }),
  );
  await app.close();
  console.log(`\nA project stays with its creator: ${checks - problems.length} of ${checks} checks pass`);
  return problems.length;
}

main().then(
  (failed) => process.exit(failed ? 1 : 0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
