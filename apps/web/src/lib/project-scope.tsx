'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useProjects } from './queries';
import { readPref, writePref } from './prefs';

interface Scope {
  projectId?: string;
  setProjectId: (id?: string) => void;
}

const Ctx = createContext<Scope | null>(null);

/**
 * The project the signed-in user is working on, chosen in the header and remembered on this browser: every list's
 * project filter reads and writes it, so picking a project once narrows Daily reports, Stock, Bills and the rest.
 */
export function ProjectScopeProvider({ userId, enabled, children }: { userId: string; enabled: boolean; children: React.ReactNode }) {
  const key = `nirmaan.project.${userId}`;
  const [stored, setStored] = useState<string | undefined>(() => readPref<string | null>(key, null) ?? undefined);
  const { data: projects } = useProjects(enabled);
  // A remembered project this user can no longer see counts as all projects.
  const projectId = stored && projects && !projects.some((p) => p.id === stored) ? undefined : stored;

  const setProjectId = useCallback(
    (id?: string) => {
      setStored(id);
      writePref(key, id ?? null);
    },
    [key],
  );
  const value = useMemo(() => ({ projectId, setProjectId }), [projectId, setProjectId]);
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
