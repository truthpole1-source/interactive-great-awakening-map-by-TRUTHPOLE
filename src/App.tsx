import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

import { DEFAULT_NODES, type Node } from './data/nodes';
import { DEFAULT_EDGES, type Edge } from './data/edges';

import { InfoPanel } from './components/InfoPanel';
import { SearchSheet } from './components/SearchSheet';
import { ResumeSheet } from './components/ResumeSheet';

import { loadReadSet, markRead, clearRead } from './utils/readState';
import { loadEdgesFromLocalStorage, saveEdgesToLocalStorage, exportGraph, importGraphFile } from './utils/graphIO';
import { computeCredibilityScore } from './utils/credibility';
import { loadLastVisited, saveLastVisited } from './utils/lastVisited';
import { loadCrumbs, pushCrumb } from './utils/breadcrumbs';

import './app.css';

// Matches public/map.jpg
const CONTENT_W = 1583;
const CONTENT_H = 2048;

function haptic(ms = 10) {
  try {
    if ('vibrate' in navigator) (navigator as any).vibrate(ms);
  } catch {}
}

export default function App() {
  return <Home />;
}

function Home() {
  const navigate = useNavigate();
  const nodes = DEFAULT_NODES;

  const [edges, setEdges] = useState<Edge[]>(() => loadEdgesFromLocalStorage(DEFAULT_EDGES));
  useEffect(() => saveEdgesToLocalStorage(edges), [edges]);

  const [readSet, setReadSet] = useState<Set<string>>(() => loadReadSet());
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [query, setQuery] = useState('');

  const [selected, setSelected] = useState<Node | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [crumbs, setCrumbs] = useState<string[]>(() => loadCrumbs());
  const [resumeId, setResumeId] = useState<string | null>(() => loadLastVisited());

  const resumeNode = useMemo(
    () => (resumeId ? nodes.find((n) => n.id === resumeId) || null : null),
    [resumeId, nodes]
  );

  const [showResume, setShowResume] = useState(true);
  const [chipReady, setChipReady] = useState(true);

  // Auto-hide resume on mobile after 6s
  useEffect(() => {
    if (!resumeNode) return;
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (!isMobile) return;
    const t = window.setTimeout(() => {
      setChipReady(false);
      setShowResume(false);
      window.setTimeout(() => setChipReady(true), 180);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [resumeNode]);

  const filtered = useMemo(() => {
    let list = nodes;
    if (readFilter === 'unread') list = list.filter((n) => !readSet.has(n.id));
    if (readFilter === 'read') list = list.filter((n) => readSet.has(n.id));

    const q = query.trim().toLowerCase();
    if (!q) return list;

    return list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        (n.category || '').toLowerCase().includes(q)
    );
  }, [nodes, readFilter, readSet, query]);

  const readCount = useMemo(
    () => nodes.reduce((a, n) => a + (readSet.has(n.id) ? 1 : 0), 0),
    [nodes, readSet]
  );

  const unreadCount = useMemo(() => nodes.length - readCount, [nodes.length, readCount]);

  const progressPct = useMemo(
    () => (nodes.length ? Math.round((readCount / nodes.length) * 100) : 0),
    [readCount, nodes.length]
  );

  const focusNode = (n: Node, openPanel = true) => {
    setSelected(n);
    setReadSet((prev) => markRead(prev, n.id));
    saveLastVisited(n.id);
    setResumeId(n.id);
    setCrumbs(pushCrumb(n.id));
    if (openPanel) navigate(`/topic/${n.id}`);
  };

  const clearSelection = () => {
    setSelected(null);
    navigate('/');
  };

  // ---- Zoom / Fit / Center ----
  const zref = useRef<ReactZoomPanPinchRef | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);

  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onR = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  const fitAndCenter = () => {
    const api = zref.current;
    if (!api) return;

    const topH = topbarRef.current?.getBoundingClientRect().height ?? 0;
    const dockH = dockRef.current?.getBoundingClientRect().height ?? 0;

    // A little padding so it never looks cramped
    const pad = 12;

    const stageW = vp.w;
    const stageH = vp.h - topH - dockH;

    const scale = Math.min(
      (stageW - pad * 2) / CONTENT_W,
      (stageH - pad * 2) / CONTENT_H
    );

    // Centering positions in TransformWrapper coordinates
    const x = (stageW - CONTENT_W * scale) / 2;
    const y = (stageH - CONTENT_H * scale) / 2;

    api.setTransform(x, y, scale, 0);
  };

  // Fit/center on first mount + when viewport changes
  useLayoutEffect(() => {
    // slight delay helps after fonts/layout settle on mobile
    const t = window.setTimeout(() => fitAndCenter(), 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp.w, vp.h]);

  // If user closes/open panels, topbar height can change; refit
  useEffect(() => {
    const t = window.setTimeout(() => fitAndCenter(), 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen, showResume]);

  // ---- Continue Next Unread (simple: first unread) ----
  const continueNextUnread = () => {
    const pool = readFilter === 'all' ? nodes : filtered;
    const unread = pool.filter((n) => n.x >= 0 && n.y >= 0 && !readSet.has(n.id));
    if (!unread.length) return;
    haptic(12);
    focusNode(unread[0], true);
  };

  // Keyboard: N
  useEffect(() => {
    const onK = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        continueNextUnread();
      }
    };
    window.addEventListener('keydown', onK);
    return () => window.removeEventListener('keydown', onK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readFilter, filtered, readSet]);

  const cred = useMemo(() => (selected ? computeCredibilityScore(selected.id, edges) : null), [selected, edges]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="app">
      {/* TOPBAR */}
      <header ref={topbarRef} className="topbar">
        <div className="topbarRow">
          <div className="brand">Great Awakening Map</div>

          <div className="progressMini" title="Progress">
            <div className="progressTrack">
              <div className="progressFill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="progressText">
              {readCount}/{nodes.length} · {progressPct}%
            </div>
          </div>
        </div>

        <div className="topbarRow">
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics…"
          />

          <div className="filters" role="group" aria-label="Read filter">
            {(['all', 'unread', 'read'] as const).map((v) => (
              <button
                key={v}
                className={`pillBtn ${readFilter === v ? 'on' : ''}`}
                onClick={() => setReadFilter(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="topbarRow actionsRow">
          <div className="counts">
            <span className="count read">Read {readCount}</span>
            <span className="dot">•</span>
            <span className="count unread">Unread {unreadCount}</span>
          </div>

          <div className="actions">
            <button className="btn" onClick={() => { haptic(10); setSheetOpen(true); }}>
              Find
            </button>
            <button className="btn primary" onClick={() => continueNextUnread()}>
              {unreadCount === 0 ? 'Complete' : 'Continue'}
            </button>

            <button className="btn ghost hideMobile" onClick={() => setReadSet(clearRead())}>Reset</button>
            <button className="btn ghost hideMobile" onClick={() => exportGraph(nodes, edges)}>Export</button>
            <button className="btn ghost hideMobile" onClick={() => fileInputRef.current?.click()}>Import</button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const { edges: ie } = await importGraphFile(f);
                  setEdges(Array.isArray(ie) ? ie : edges);
                } catch {}
              }}
            />
          </div>
        </div>

        {crumbs.length > 0 ? (
          <div className="crumbRow">
            {crumbs.map((id) => {
              const n = nodes.find((x) => x.id === id);
              if (!n) return null;
              return (
                <button key={id} className="crumb" onClick={() => focusNode(n, true)}>
                  {n.title}
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      {/* RESUME */}
      {resumeNode ? (
        <ResumeSheet
          open={showResume}
          title={resumeNode.title}
          onJump={() => { haptic(10); focusNode(resumeNode, true); }}
          onRequestClose={() => {
            haptic(8);
            setChipReady(false);
            setShowResume(false);
            window.setTimeout(() => setChipReady(true), 180);
          }}
        />
      ) : null}

      {!showResume && chipReady && resumeNode ? (
        <button
          className="resumeChip"
          onClick={() => { haptic(10); setShowResume(true); }}
          aria-label="Show resume"
          title={`Resume: ${resumeNode.title}`}
        >
          <span className="resumeChipK">Resume</span>
          <span className="resumeChipT">{resumeNode.title}</span>
        </button>
      ) : null}

      {/* MAP STAGE */}
      <main className="stage">
        <TransformWrapper
          ref={zref}
          minScale={0.12}
          maxScale={8}
          initialScale={1}
          centerOnInit={false}
          limitToBounds={false}
          alignmentAnimation={{ disabled: true }}
          doubleClick={{ disabled: true }}
          wheel={{ step: 0.12 }}
          pinch={{ step: 6 }}
          panning={{ velocityDisabled: true }}
        >
          <TransformComponent wrapperClass="mapWrap" contentClass="mapContent">
            <div className="map" style={{ width: CONTENT_W, height: CONTENT_H }}>
              <img className="mapImg" src="/map.jpg" alt="Map background" draggable={false} />

              <svg className="edges" width={CONTENT_W} height={CONTENT_H}>
                {edges.map((e) => {
                  const a = nodes.find((n) => n.id === e.from);
                  const b = nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;

                  const x1 = a.x * CONTENT_W, y1 = a.y * CONTENT_H;
                  const x2 = b.x * CONTENT_W, y2 = b.y * CONTENT_H;
                  const sw = e.strength === 3 ? 2.6 : e.strength === 2 ? 2.0 : 1.4;

                  return (
                    <line
                      key={e.id}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className={`linkLine t-${e.type || 'overlap'}`}
                      strokeWidth={sw}
                    />
                  );
                })}
              </svg>

              {filtered.filter((n) => n.x >= 0 && n.y >= 0).map((n) => {
                const isRead = readSet.has(n.id);
                const isSel = selected?.id === n.id;

                return (
                  <button
                    key={n.id}
                    className={`hotspot ${isSel ? 'active' : ''} ${isRead ? 'read' : ''}`}
                    style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
                    onClick={() => { haptic(10); focusNode(n, true); }}
                    aria-label={n.title}
                  >
                    <span className="hotspotLabel">{n.title}</span>
                  </button>
                );
              })}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </main>

      {/* MOBILE DOCK */}
      <div ref={dockRef} className="dock" role="group" aria-label="Quick actions">
        <button className="dockBtn" onClick={() => { haptic(10); setSheetOpen(true); }}>
          Find
        </button>
        <button className="dockBtn primary" onClick={() => continueNextUnread()}>
          {unreadCount === 0 ? 'Complete' : 'Next unread'}
          <span className="dockSub">Unread {unreadCount}</span>
        </button>
        <button className="dockBtn ghost" onClick={() => { haptic(8); fitAndCenter(); }}>
          Center
        </button>
      </div>

      <SearchSheet
        open={sheetOpen}
        nodes={nodes}
        readSet={readSet}
        readFilter={readFilter}
        onChangeReadFilter={setReadFilter}
        onPick={(n) => { setSheetOpen(false); focusNode(n, true); }}
        onClose={() => setSheetOpen(false)}
      />

      <Routes>
        <Route path="/" element={null} />
        <Route
          path="/topic/:id"
          element={<TopicRoute nodes={nodes} onSelect={setSelected} onClose={clearSelection} />}
        />
      </Routes>

      {selected ? (
        <InfoPanel node={selected} edges={edges} cred={cred || undefined} onClose={clearSelection} />
      ) : null}
    </div>
  );
}

function TopicRoute({
  nodes,
  onSelect,
  onClose,
}: {
  nodes: Node[];
  onSelect: (n: Node | null) => void;
  onClose: () => void;
}) {
  const { id } = useParams();

  useEffect(() => {
    if (!id) return;
    const n = nodes.find((x) => x.id === id) || null;
    onSelect(n);
    if (!n) onClose();
  }, [id]);

  return null;
}
