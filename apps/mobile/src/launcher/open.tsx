import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { navDestination, navTarget, projectTabHref, type NavNode, type NavVisitDto, type ProjectSummary } from '@erp/shared';
import { useApi, useFetch } from '../api/hooks';
import { fetchProjects } from '../api/lists';
import { phoneRoute } from '../ai/links';
import { BottomSheet } from '../components/BottomSheet';
import { useSnackbar } from '../components/Snackbar';
import { Touchable } from '../components/Touchable';
import { Skeleton } from '../components/Skeleton';
import { useT } from '../i18n/LanguageContext';
import { colors, maxFontScale, spacing, touch, typography } from '../theme';
import { phoneTarget, visitNode } from './routes';

/**
 * Opens a node of the tree from the Home tab or a module screen (launcher phase 4): the phone's own screen, the module's
 * screen, or the page on the web (a project tab asks which project first). Opening a page counts as a visit, so Recent
 * on the web and the phone stay one list.
 */
export function useOpenNode(webUrl: string | null) {
  const router = useRouter();
  const api = useApi();
  const { show } = useSnackbar();
  const t = useT();
  const [projectTab, setProjectTab] = useState<{ node: NavNode; tab: string; query?: string } | null>(null);

  const openWeb = useCallback(
    (href: string) => {
      if (!webUrl) {
        show(t('This page opens on the web. Ask your admin for the web address'), { tone: 'error' });
        return;
      }
      WebBrowser.openBrowserAsync(`${webUrl}${href}`).catch(() => show(t('This page is on the web only. Open {webUrl} on a computer.', { webUrl }), { tone: 'error' }));
    },
    [webUrl, show, t],
  );

  const visit = useCallback(
    (node: NavNode) => {
      const to = navDestination(node);
      if (to?.kind !== 'page') return;
      api.post('/launcher/visits', { kind: 'NODE', target: node.id, label: node.label, href: to.href }).catch(() => undefined);
    },
    [api],
  );

  const open = useCallback(
    (node: NavNode) => {
      const target = navTarget(node);
      const to = phoneTarget(target);
      if (!to) return;
      visit(target);
      if (to.kind === 'phone') router.push(to.path as Href);
      else if (to.kind === 'module') router.push({ pathname: '/module/[key]', params: { key: to.key } });
      else if (to.kind === 'project') setProjectTab({ node: target, tab: to.tab, query: to.query });
      else openWeb(to.href);
    },
    [router, visit, openWeb],
  );

  /** A Recent entry: a page of the tree, a project, or a record (its phone screen when there is one, else the web). */
  const openVisit = useCallback(
    (v: NavVisitDto) => {
      const node = visitNode(v);
      if (node) return open(node);
      if (v.kind === 'PROJECT') return router.push({ pathname: '/project/[id]', params: { id: v.target } });
      const own = phoneRoute(v.href);
      if (own) router.push(own as Href);
      else openWeb(v.href);
    },
    [open, router, openWeb],
  );

  const sheet = projectTab ? (
    <ProjectChooser
      node={projectTab.node}
      onClose={() => setProjectTab(null)}
      onChoose={(p) => {
        setProjectTab(null);
        openWeb(projectTabHref(p.id, projectTab.tab, projectTab.query));
      }}
    />
  ) : null;

  return { open, openVisit, openWeb, sheet };
}

/** Which project a project tab (Schedule, BOQ…) opens for, before the web page opens. */
function ProjectChooser({ node, onClose, onChoose }: { node: NavNode; onClose: () => void; onChoose: (p: ProjectSummary) => void }) {
  const t = useT();
  const projects = useFetch((api) => fetchProjects(api), [], { cacheKey: 'projects' });
  return (
    <BottomSheet visible onClose={onClose} title={t(node.label)} subtitle={t('Choose the project. The page opens on the web.')}>
      {projects.loading && !projects.data ? (
        <Skeleton variant="list" label={t('Loading…')} />
      ) : (
        <ScrollView style={styles.list}>
          {(projects.data ?? []).map((p) => (
            <Touchable key={p.id} accessibilityRole="button" onPress={() => onChoose(p)} style={styles.row}>
              <View style={styles.flex}>
                <Text style={typography.bodyStrong} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
                  {p.name}
                </Text>
                <Text style={typography.caption} maxFontSizeMultiplier={maxFontScale}>
                  {p.code}
                </Text>
              </View>
            </Touchable>
          ))}
          {projects.data?.length === 0 ? <Text style={typography.caption}>{t('You are not assigned to any project yet.')}</Text> : null}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { maxHeight: 420 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: touch.height, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
