'use client';

import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { tk } from '@/ds';
import { useResolved } from '@/ds/react';
import { SOURCE_NODE_KINDS, VALVE_NODE_KINDS, pipeRoute, type EditableNetwork, type PipeRoute } from '@erp/shared';

export type EditMode = 'select' | 'valve' | 'draw';
export type Picked = { kind: 'pipe' | 'node'; code: string } | null;

export interface PipeEditMapProps {
  network: EditableNetwork;
  picked: Picked;
  mode: EditMode;
  /** Codes added or changed in this edit, drawn in the accent */
  touched: Set<string>;
  label: string;
  onPick: (p: Picked) => void;
  onMoveNode: (code: string, to: [number, number]) => void;
  onReshape: (code: string, bends: PipeRoute) => void;
  onSplit: (code: string, at: [number, number]) => void;
  onDraw: (route: PipeRoute) => void;
}

const SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const STREET = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * The network on a real map (Leaflet, satellite or street): pipes along their routes, nodes as points. Select and move
 * drags a node or the bends of the picked pipe (Leaflet-Geoman), Add a valve cuts the pipe clicked, Draw a pipe draws a
 * new one from node to node. It only reports what was done; the editor changes the network and redraws it.
 */
export default function PipeEditMap(props: PipeEditMapProps) {
  const { network, picked, mode, touched, label } = props;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  // The latest handlers, so the map's own listeners never hold an old network.
  const on = useRef(props);
  useEffect(() => {
    on.current = props;
  });
  // Leaflet draws SVG paths, whose colours are values rather than CSS variables.
  const { color } = useResolved();

  useEffect(() => {
    if (!box.current) return;
    const el = box.current;
    // Leaflet focuses the map on a press for its arrow keys, and the browser scrolls the drawer to show it, so the
    // release lands somewhere else and the click is lost. Focusing first without the scroll keeps the click where it was.
    const focus = () => el.focus({ preventScroll: true });
    el.addEventListener('pointerdown', focus, true);
    const m = L.map(el, { zoomControl: true, attributionControl: true, maxZoom: 20 });
    const satellite = L.tileLayer(SATELLITE, { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagery &copy; Esri' });
    const street = L.tileLayer(STREET, { maxZoom: 20, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    satellite.addTo(m);
    L.control.layers({ Satellite: satellite, Street: street }, undefined, { position: 'topright' }).addTo(m);
    L.control.scale({ imperial: false }).addTo(m);
    m.setView([20.3, 85.8], 13);
    layer.current = L.layerGroup().addTo(m);
    m.pm.setGlobalOptions({ snappable: true, snapDistance: 20 });
    m.on('pm:create', (e) => {
      const drawn = (e.layer as L.Polyline).getLatLngs() as L.LatLng[];
      e.layer.remove();
      if (drawn.length >= 2) on.current.onDraw(drawn.map((p) => [p.lng, p.lat]));
    });
    map.current = m;
    return () => {
      el.removeEventListener('pointerdown', focus, true);
      m.remove();
      map.current = null;
      layer.current = null;
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (mode === 'draw') m.pm.enableDraw('Line', { snappable: true, snapDistance: 20, templineStyle: { color: color.accent.solid }, hintlineStyle: { color: color.accent.solid, dashArray: '5,5' } });
    else m.pm.disableDraw();
  }, [mode, color.accent.solid]);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds = L.latLngBounds([]);
    for (const p of network.pipes) {
      const route = pipeRoute(network, p);
      if (!route) continue;
      const isPicked = picked?.kind === 'pipe' && picked.code === p.code;
      const latLngs = route.map(([x, y]) => L.latLng(y, x));
      latLngs.forEach((ll) => bounds.extend(ll));
      if (isPicked) L.polyline(latLngs, { color: color.accent.chosen, weight: 12, opacity: 0.6, interactive: false, pmIgnore: true }).addTo(g);
      const line = L.polyline(latLngs, {
        color: touched.has(p.code) ? color.accent.solid : p.scope === 'EXISTING' ? color.line.base : color.tone.pending.solid,
        weight: 4,
        dashArray: p.scope === 'EXISTING' ? '4 6' : undefined,
        pmIgnore: !isPicked,
      }).addTo(g);
      line.bindTooltip(`${p.code}, ${p.from} to ${p.to}: ${p.diameterMm} mm, ${p.lengthM} m`, { sticky: true });
      line.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (on.current.mode === 'valve') on.current.onSplit(p.code, [e.latlng.lng, e.latlng.lat]);
        else if (on.current.mode === 'select') on.current.onPick({ kind: 'pipe', code: p.code });
      });
      if (isPicked && mode === 'select') {
        line.pm.enable({ allowSelfIntersection: true, draggable: false, snappable: false });
        line.on('pm:edit', () => {
          const now = line.getLatLngs() as L.LatLng[];
          on.current.onReshape(p.code, now.slice(1, -1).map((ll) => [ll.lng, ll.lat]));
        });
      }
    }
    for (const n of network.nodes) {
      if (typeof n.lat !== 'number' || typeof n.lon !== 'number') continue;
      bounds.extend([n.lat, n.lon]);
      const source = SOURCE_NODE_KINDS.includes(n.kind);
      const valve = VALVE_NODE_KINDS.includes(n.kind);
      const isPicked = picked?.kind === 'node' && picked.code === n.code;
      const fill = touched.has(n.code) ? tk.color.accent.solid : source ? tk.color.accent.solid : valve ? tk.color.surface.base : tk.color.text.base;
      const size = source || valve ? tk.space[4] : tk.space[3];
      const shape = valve ? 'transform: rotate(45deg);' : source ? '' : 'border-radius: 50%;';
      const ring = isPicked ? `box-shadow: 0 0 0 ${tk.space[1]} ${tk.color.accent.chosen};` : '';
      const marker = L.marker([n.lat, n.lon], {
        icon: L.divIcon({
          className: 'pipe-node',
          html: `<span style="display:block;width:${size};height:${size};background:${fill};border:${tk.space.half} solid ${tk.color.text.base};${shape}${ring}"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        title: n.code,
        alt: n.code,
        draggable: mode === 'select',
        keyboard: true,
        pmIgnore: false,
      }).addTo(g);
      marker.bindTooltip(n.code, { direction: 'top', offset: [0, -8] });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (on.current.mode === 'select') on.current.onPick({ kind: 'node', code: n.code });
      });
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        on.current.onMoveNode(n.code, [ll.lng, ll.lat]);
      });
    }
    if (!fitted.current && bounds.isValid()) {
      m.fitBounds(bounds, { padding: [24, 24] });
      fitted.current = true;
    }
  }, [network, picked, mode, touched, color.accent.solid, color.accent.chosen, color.line.base, color.tone.pending.solid]);

  return <div ref={box} role="region" aria-label={label} style={{ height: '62vh', minHeight: 320, borderRadius: tk.radius.md, border: tk.line('hairline') }} />;
}
