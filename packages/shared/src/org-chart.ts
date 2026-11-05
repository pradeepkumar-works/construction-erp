/**
 * The org chart: people under the person they report to (`Employee.reportingToId`, the operational line). The
 * functional line (`functionalManagerId`, e.g. a site QA/QC engineer to the head office QA/QC manager) is drawn beside
 * it and never moves anyone in the tree.
 */

export interface OrgPerson {
  id: string;
  fullName: string;
  reportingToId: string | null;
}

export interface OrgNode<P extends OrgPerson> {
  person: P;
  reports: OrgNode<P>[];
  /** Everyone below them, at every level */
  below: number;
  /** A root only because their line loops back to them (A reports to B, B to A); the record needs fixing */
  loop: boolean;
}

/**
 * The tree, roots first by name: a root is someone with no manager, or whose manager is not among `people` (they left,
 * or sit outside the filter). A loop in the lines cannot hang it: one person on each loop becomes a root, marked `loop`.
 */
export function orgChart<P extends OrgPerson>(people: readonly P[]): OrgNode<P>[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const byName = (a: P, b: P) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id);
  const children = new Map<string, P[]>();
  for (const p of people) {
    if (!p.reportingToId || !byId.has(p.reportingToId) || p.reportingToId === p.id) continue;
    children.set(p.reportingToId, [...(children.get(p.reportingToId) ?? []), p]);
  }
  const placed = new Set<string>();
  const grow = (p: P, loop: boolean): OrgNode<P> => {
    placed.add(p.id);
    const reports = (children.get(p.id) ?? [])
      .filter((c) => !placed.has(c.id))
      .sort(byName)
      .map((c) => grow(c, false));
    return { person: p, reports, below: reports.reduce((n, r) => n + 1 + r.below, 0), loop };
  };
  const isRoot = (p: P) => !p.reportingToId || p.reportingToId === p.id || !byId.has(p.reportingToId);
  const roots = [...people].filter(isRoot).sort(byName).map((p) => grow(p, false));
  // Whoever is left sits on a loop or under one: walk up from them to the loop and start there.
  for (const p of [...people].sort(byName)) {
    if (placed.has(p.id)) continue;
    const seen = new Set<string>();
    let at = p;
    while (!seen.has(at.id)) {
      seen.add(at.id);
      at = byId.get(at.reportingToId!)!;
    }
    roots.push(grow(at, true));
  }
  return roots;
}
