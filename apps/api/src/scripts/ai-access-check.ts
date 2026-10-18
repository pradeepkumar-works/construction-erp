/**
 * Ask Nirmaan's access check (AI item 67): runs every assistant tool as every active user of the demo company and
 * fails if a tool shows anyone a project they cannot open, or answers a role it is not meant for. CI runs it after
 * the seed, against the same database as the browser tests:
 *
 *   DATABASE_URL=… node dist/scripts/ai-access-check.js
 */
import { NestFactory } from '@nestjs/core';
import { canViewLetters, type RoleKey } from '@erp/shared';
import { AppModule } from '../app.module';
import { AiToolsService } from '../ai/ai-tools.service';
import { ProjectAccessService } from '../common/project-access.service';
import type { RequestUser } from '../common/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { setTenant, tenantMiddleware } from '../prisma/tenant-context';

const ORG_CODE = process.env.AI_CHECK_ORG ?? 'DEMO';

/** Runs `fn` with the tenant set, as a request would. */
const asTenant = <T>(orgId: string, fn: () => Promise<T>) =>
  new Promise<T>((resolve, reject) =>
    tenantMiddleware(null, null, () => {
      setTenant(orgId);
      fn().then(resolve, reject);
    }),
  );

/** Every project a result mentions: `projectId`, a nested `project.id`, or a link to /projects/<id>. */
function projectIdsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => projectIdsIn(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'projectId' && typeof v === 'string') out.add(v);
      else if (k === 'project' && v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') out.add((v as { id: string }).id);
      else if (k === 'href' && typeof v === 'string') {
        const m = v.match(/^\/projects\/([0-9a-f-]{36})/);
        if (m) out.add(m[1]);
      }
      projectIdsIn(v, out);
    }
  }
  return out;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const tools = app.get(AiToolsService);
  const access = app.get(ProjectAccessService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: ORG_CODE } });

  const failures: string[] = [];
  let runs = 0;
  await asTenant(org.id, async () => {
    const users = await prisma.user.findMany({ where: { organizationId: org.id, isActive: true }, include: { role: true }, orderBy: { email: 'asc' } });
    const projects = await prisma.project.findMany({ where: { organizationId: org.id }, select: { id: true } });
    const defs = tools.allDefinitions();
    const kinds = ((defs.find((d) => d.name === 'list_records')?.input_schema.properties as Record<string, { enum?: string[] }>).kind.enum ?? []) as string[];

    // Record ids from every project, found as the most senior user, to ask for one by one as everyone else.
    const admin = users.find((u) => u.role.key === 'ADMIN');
    if (!admin) throw new Error('No admin in the demo company');
    const asUser = (u: (typeof users)[number]): RequestUser => ({ id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName });
    const samples: { kind: string; id: string }[] = [];
    for (const kind of kinds) {
      const r = await tools.run(asUser(admin), 'list_records', { kind });
      const items = (r.result as { items?: { id: string }[] } | null)?.items ?? [];
      samples.push(...items.slice(0, 3).map((i) => ({ kind, id: i.id })));
    }

    for (const u of users) {
      const user = asUser(u);
      if (u.role.key === 'CLIENT_ENGINEER' || u.role.key === 'CONSULTANT') continue;
      const visible = new Set((await prisma.project.findMany({ where: access.projectWhere(user), select: { id: true } })).map((p) => p.id));
      const allowed = new Set(tools.definitions(user).map((d) => d.name));
      const calls: [string, Record<string, unknown>][] = [];
      for (const d of defs) {
        const props = (d.input_schema.properties ?? {}) as Record<string, unknown>;
        if (d.name === 'list_records') kinds.forEach((kind) => calls.push([d.name, { kind }]));
        else if (d.name === 'get_record') samples.forEach((s) => calls.push([d.name, s]));
        else if (d.name === 'search_records') ['a', 'cement', 'PO', 'bill'].forEach((q) => calls.push([d.name, { q }]));
        else if (d.name === 'search_documents') {
          ['liquidated damages', 'encroachment hindrance', 'drawing'].forEach((query) => calls.push([d.name, { query }]));
          projects.forEach((p) => calls.push([d.name, { query: 'payment', projectId: p.id }]));
        }
        else if ('projectId' in props) {
          if (!(d.input_schema.required ?? []).includes('projectId')) calls.push([d.name, {}]);
          projects.forEach((p) => calls.push([d.name, { projectId: p.id }]));
        } else calls.push([d.name, {}]);
      }
      for (const [name, input] of calls) {
        runs++;
        const r = await tools.run(user, name, input);
        const label = `${u.email} (${u.role.key}) ${name} ${JSON.stringify(input)}`;
        if (!allowed.has(name)) {
          if (!r.isError || !r.text.startsWith('Not allowed')) failures.push(`${label}: answered a role it is not meant for`);
          continue;
        }
        if (r.isError) continue;
        for (const id of projectIdsIn(r.result)) if (!visible.has(id)) failures.push(`${label}: shows project ${id}, which this user cannot open`);
        if (name === 'search_documents' && !canViewLetters(user.roleKey) && JSON.stringify(r.result).includes('"source":"LETTER"')) failures.push(`${label}: shows a letter to a role that does not see letters`);
      }
    }
  });
  await app.close();

  console.log(`Ask ${ORG_CODE} access check: ${runs} tool runs, ${failures.length} problems`);
  if (failures.length) {
    failures.slice(0, 50).forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
