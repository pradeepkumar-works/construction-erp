'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { inVertical } from '@erp/shared';
import { useProjects } from './queries';
import { readPref, writePref } from './prefs';

interface Scope {
  projectId?: string;
  setProjectId: (id?: string) => void;
  /** The vertical the header shows: a code of the vertical master, `none`, or every vertical */
  vertical?: string;
  setVertical: (code?: string) => void;
}

const Ctx = createContext<Scope | null>(null);

/**
 * The project the signed-in user is working on, chosen in the header and remembered on this browser: every list's
 * project filter reads and writes it, so picking a project once narrows Daily reports, Stock, Bills and the rest. The
 * header can also show one vertical: it narrows the projects offered there, the Projects list, the
 * management dashboard and its reports.
 */
export function ProjectScopeProvider({ userId, enabled, children }: { userId: string; enabled: boolean; children: React.ReactNode }) {
  const key = `nirmaan.project.${userId}`;
  const verticalKey = `nirmaan.vertical.${userId}`;
  const [stored, setStored] = useState<string | undefined>(() => readPref<string | null>(key, null) ?? undefined);
  const [vertical, setVerticalState] = useState<string | undefined>(() => readPref<string | null>(verticalKey, null) ?? undefined);
  const { data: projects } = useProjects(enabled);
  // A remembered project this user can no longer see counts as all projects.
  const projectId = stored && projects && !projects.some((p) => p.id === stored) ? undefined : stored;
  // So does a remembered vertical none of their projects is in.
  const shownVertical = vertical && projects && !projects.some((p) => inVertical(p.verticalCode, vertical)) ? undefined : vertical;

  const setProjectId = useCallback(
    (id?: string) => {
      setStored(id);
      writePref(key, id ?? null);
    },
    [key],
  );
  const setVertical = useCallback(
    (code?: string) => {
      setVerticalState(code);
      writePref(verticalKey, code ?? null);
    },
    [verticalKey],
  );
  const value = useMemo(() => ({ projectId, setProjectId, vertical: shownVertical, setVertical }), [projectId, setProjectId, shownVertical, setVertical]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * A list's project filter: the shared project scope inside the app shell (local state outside it). `initial`, from a
 * link such as `?projectId=…`, switches the scope to that project.
 */
export function useProjectScope(initial?: string): [string | undefined, (id?: string) => void] {
  const ctx = useContext(Ctx);
  const [local, setLocal] = useState<string | undefined>(initial);
  // Shown straight away, then handed to the shared scope once.
  const [linked, setLinked] = useState<string | undefined>(initial);
  const setScope = ctx?.setProjectId;
  useEffect(() => {
    if (!linked || !setScope) return;
    setScope(linked);
    setLinked(undefined);
  }, [linked, setScope]);
  if (!ctx) return [local, setLocal];
  return [linked ?? ctx.projectId, ctx.setProjectId];
}

/**
 * The project a page that shows one project at a time opens on: the header's project, else the busiest running site (most
 * entries waiting, then first in the header's list; never a store or plant), so the page opens on a project rather than "Choose a
 * project". Picking one sets the header's project, as any list's filter does. The third value is true while the projects are
 * still loading and none is picked, so the page shows its loading state then rather than flashing "Choose a project".
 */
export function useOneProject(initial?: string): [string | undefined, (id?: string) => void, boolean] {
  const [scoped, setScoped] = useProjectScope(initial);
  const { data: projects, isLoading } = useProjects();
  const busiest = useMemo(() => {
    const sites = (projects ?? []).filter((p) => p.type !== 'STORE' && p.type !== 'PLANT' && p.status === 'ACTIVE');
    return [...sites].sort((a, b) => b.pendingApprovals - a.pendingApprovals || a.code.localeCompare(b.code))[0]?.id;
  }, [projects]);
  return [scoped ?? busiest, setScoped, !scoped && isLoading];
}

const noVertical = () => {};

/** The header's vertical, for the pages it narrows; every vertical outside the app shell. */
export function useVerticalScope(): [string | undefined, (code?: string) => void] {
  const ctx = useContext(Ctx);
  return ctx ? [ctx.vertical, ctx.setVertical] : [undefined, noVertical];
}
