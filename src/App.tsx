import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
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

// Matches the dimensions of public/map.jpg
const CONTENT_W = 1583;
const CONTENT_H = 2048;

function haptic(ms = 12) {
  try {
    if ('vibrate' in navigator) (navigator as any).vibrate(ms);
  } catch {}
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

  // auto-hide resume on mobile after 6s
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
        n.category.toLowerCase().includes(q)
    );
  }, [nodes, readFilter, readSet, query]);

  const readCount = useMemo(() => nodes.reduce((a, n) => a + (readSet.has(n.id) ? 1 : 0), 0), [nodes, readSet]);
  const unreadCount = useMemo(() => nodes.length - readCount, [nodes.length, readCount]);
  const progressPct = useMemo(() => (nodes.length ? Math.round((readCount / nodes.length) * 100) : 0), [readCount, nodes.length]);

  // Track transform for nearest-unread
  const [t, setT] = useState({ scale: 1, positionX: 0, positionY: 0 });
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onR = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  const viewCenter = useMemo(() => {
    const left = -t.positionX / t.scale;
    const top = -t.positionY / t.scale;
    const cx = left + (vp.w / 2) / t.scale;
    const cy = top + (vp.h / 2) / t.scale;
    return { cx, cy };
  }, [t, vp]);

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

  const pickNearestUnread = (pool: Node[]) => {
    const placedPool = pool.filter((n) => n.x >= 0 && n.y >= 0);
    const unread = placedPool.filter((n) => !readSet.has(n.id));
    if (!unread.length) return null;

    let best = unread[0];
    let bestD = Infinity;

    for (const n of unread) {
      const nx = n.x * CONTENT_W;
      const ny = n.y * CONTENT_H;
      const dx = nx - viewCenter.cx;
      const dy = ny - viewCenter.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = n;
      }
    }
    return best;
  };

  const continueNextUnread = () => {
    const pool = readFilter === 'all' ? nodes : filtered;
    const next = pickNearestUnread(pool);
    if (!next) return;
    haptic(12);
    focusNode(next, true);
  };

  // Keyboard: N next unread
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
  }, [readFilter, filtered, readSet, viewCenter]);

  const cred = useMemo(() => (selected ? computeCredibilityScore(selected.id, edges) : null), [selected, edges]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="app">
      {/* TOP BAR */}
      <header className="topbar">
        <div className="topRow">
          <div className="brand">Great Awakening Map</div>

          <div className="progressMini" title="Read progress">
            <div className="progressTrack">
              <div className="progressFill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="progressText">
              {readCount}/{nodes.length} · {progressPct}%
            </div>
          </div>
        </div>

        <div className="searchRow">
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

        <div className="actionsRow">
          <div className="counts">
            <span className="count read">Read {readCount}</span>
            <span className="dot">•</span>
            <span className="count unread">Unread {unreadCount}</span>
          </div>

          <div className="actions">
            <button className="btn" onClick={() => { haptic(10); setSheetOpen(true); }}>
              Find
            </button>
            <button className="btn primary" onClick={() => { haptic(12); continueNextUnread(); }}>
              {unreadCount === 0 ? 'Complete' : 'Continue'}
            </button>

            {/* Desktop-only extra tools */}
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

      {/* Resume */}
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

      {/* MAP */}
      <main className="stage">
        <TransformWrapper
          minScale={0.65}
          maxScale={8}
          initialScale={1}
          centerOnInit={true}
          doubleClick={{ disabled: true }}
          wheel={{ step: 0.12 }}
          pinch={{ step: 6 }}
          panning={{ velocityDisabled: true }}
          onTransformed={(_, state) => setT({ scale: state.scale, positionX: state.positionX, positionY: state.positionY })}
        >
          <TransformComponent wrapperClass="mapWrap" contentClass="mapContent">
            <div className="map" style={{ width: CONTENT_W, height: CONTENT_H }}>
              <img className="mapImg" src="/map.jpg" alt="Map background" draggable={false} />

              {/* Edges */}
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

              {/* Hotspots */}
              {filtered.filter((n) => n.x >= 0 && n.y >= 0).map((n) => {
                const left = n.x * 100;
                const top = n.y * 100;
                const isRead = readSet.has(n.id);
                const isSel = selected?.id === n.id;
                return (
                  <button
                    key={n.id}
                    className={`hotspot ${isSel ? 'active' : ''} ${isRead ? 'read' : ''}`}
                    style={{ left: `${left}%`, top: `${top}%` }}
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

      {/* CLEAN MOBILE DOCK */}
      <div className="dock" role="group" aria-label="Quick actions">
        <button className="dockBtn" onClick={() => { haptic(10); setSheetOpen(true); }} aria-label="Find a topic">
          Find
        </button>
        <button className="dockBtn primary" onClick={() => { haptic(12); continueNextUnread(); }} aria-label="Next unread topic">
          {unreadCount === 0 ? 'Complete' : 'Next unread'}
          <span className="dockSub">Unread {unreadCount}</span>
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
          element={<TopicRoute nodes={nodes} edges={edges} onSelect={setSelected} selected={selected} onClose={clearSelection} />}
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
  edges,
  onSelect,
  selected,
  onClose,
}: {
  nodes: Node[];
  edges: Edge[];
  onSelect: (n: Node | null) => void;
  selected: Node | null;
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

export default function App() {
  return <Home />;
}            className="search"
            placeholder="Search topics..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />

          <div className="filterPill">
            {(['all', 'unread', 'read'] as const).map(v => (
              <button
                key={v}
                className={`filterBtn ${readFilter === v ? 'on' : ''}`}
                onClick={() => setReadFilter(v)}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="countsPill">
            <span className="countItem">Read {readCount}</span>
            <span className="countDot">•</span>
            <span className="countItem">Unread {unreadCount}</span>
          </div>

          <div className="progressPill">
            <span className="progressNum">
              {readCount}/{nodes.length}
            </span>
            <span className="progressPct">{progressPct}%</span>
          </div>

          <div className="actions">
            <button className="ioBtn" onClick={() => setSheetOpen(true)}>
              Find
            </button>
            <button className="ioBtn" onClick={() => setReadSet(clearRead())}>
              Reset
            </button>
          </div>

        </div>

        <div className="topProgress">
          <div
            className="topProgressFill"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="crumbRow">
          {crumbs.map(id => {
            const n = nodes.find(x => x.id === id)
            if (!n) return null
            return (
              <button
                key={id}
                className="crumb"
                onClick={() => focusNode(n)}
              >
                {n.title}
              </button>
            )
          })}
        </div>

      </div>

      {/* ---------------- MAP ---------------- */}
      <TransformWrapper
        minScale={0.5}
        maxScale={6}
        initialScale={1}
        limitToBounds={false}
        centerOnInit
        doubleClick={{ disabled: true }}
      >
        <TransformComponent wrapperClass="mapWrap" contentClass="mapContent">
          <div
            className="map"
            style={{ width: CONTENT_W, height: CONTENT_H }}
          >
            <img
              className="mapImg"
              src="/map.jpg"
              alt="Map background"
              draggable={false}
            />
          </div>
        </TransformComponent>
      </TransformWrapper>

      {/* ---------------- SEARCH ---------------- */}
      <SearchSheet
        open={sheetOpen}
        nodes={nodes}
        readSet={readSet}
        readFilter={readFilter}
        onChangeReadFilter={setReadFilter}
        onPick={n => {
          setSheetOpen(false)
          focusNode(n)
        }}
        onClose={() => setSheetOpen(false)}
      />

      {/* ---------------- ROUTES ---------------- */}
      <Routes>
        <Route path="/" element={null} />
        <Route
          path="/topic/:id"
          element={
            <TopicRoute
              nodes={nodes}
              onSelect={setSelected}
              onClose={clearSelection}
            />
          }
        />
      </Routes>

      {selected && (
        <InfoPanel
          node={selected}
          edges={edges}
          cred={cred || undefined}
          onClose={clearSelection}
        />
      )}
    </div>
  )
}

function TopicRoute({
  nodes,
  onSelect,
  onClose
}: {
  nodes: Node[]
  onSelect: (n: Node | null) => void
  onClose: () => void
}) {
  const { id } = useParams()

  useEffect(() => {
    if (!id) return
    const n = nodes.find(x => x.id === id) || null
    onSelect(n)
    if (!n) onClose()
  }, [id])

  return null
}

export default function App() {
  return <Home />
}  // ✅ zoom-pan ref so we can center on init
  const zref = useRef<ReactZoomPanPinchRef | null>(null);

  // ✅ Fit + center once when mounted AND when viewport changes
  useEffect(() => {
    const api = zref.current;
    if (!api) return;

    const stageW = vp.w;
    const stageH = vp.h - TOPBAR_H;

    const scale = Math.min(stageW / CONTENT_W, stageH / CONTENT_H);
    const x = (stageW - CONTENT_W * scale) / 2;
    const y = (stageH - CONTENT_H * scale) / 2;

    // setTransform(x, y, scale, animationTime, animationType)
    api.setTransform(x, y, scale, 0);
  }, [vp.w, vp.h]);

  const cred = useMemo(() => (selected ? computeCredibilityScore(selected.id, edges) : null), [selected, edges]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">Great Awakening Map</div>
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topics..." />

        <div className="filterPill" role="group" aria-label="Read filter">
          {(['all', 'unread', 'read'] as const).map((v) => (
            <button key={v} className={`filterBtn ${readFilter === v ? 'on' : ''}`} onClick={() => setReadFilter(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div className="countsPill" title="Read / Unread">
          <span className={`countItem read ${readFilter === 'read' ? 'emphasis' : ''}`}>Read {readCount}</span>
          <span className="countDot">•</span>
          <span className={`countItem unread ${readFilter === 'unread' ? 'emphasis' : ''}`}>Unread {unreadCount}</span>
        </div>

        <div className="progressPill" title="Read progress">
          <span className="progressNum">{readCount}/{nodes.length}</span>
          <span className="progressPct">{progressPct}%</span>
        </div>

        <div className="actions">
          <button className="ioBtn" onClick={() => { haptic(10); setSheetOpen(true); }}>Find</button>
          <button className="ioBtn" onClick={() => { haptic(12); continueNextUnread(nodes, filtered, readFilter, readSet, focusNode); }}>
            {unreadCount === 0 ? 'Complete' : 'Continue'}
          </button>
          <button className="ioBtn" onClick={() => setReadSet(clearRead())}>Reset Read</button>
          <button className="ioBtn" onClick={() => exportGraph(nodes, edges)}>Export</button>
          <button className="ioBtn" onClick={() => fileInputRef.current?.click()}>Import</button>
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

        <div className="topProgress">
          <div className="topProgressFill" style={{ width: `${progressPct}%` }} />
        </div>

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
      </div>

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
        <button className="resumeChip" onClick={() => { haptic(10); setShowResume(true); }} aria-label="Show resume" title={`Resume: ${resumeNode.title}`}>
          <span className="resumeChipK">Resume</span>
          <span className="resumeChipT">{resumeNode.title}</span>
        </button>
      ) : null}

      <TransformWrapper
        ref={zref as any}
        minScale={0.2}
        maxScale={8}
        initialScale={1}
        limitToBounds={false}
        centerOnInit={false}
        doubleClick={{ disabled: true }}
        panning={{ velocityDisabled: true }}
        wheel={{ step: 0.12 }}
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
                return <line key={e.id} x1={x1} y1={y1} x2={x2} y2={y2} className={`linkLine t-${e.type || 'overlap'}`} strokeWidth={sw} />;
              })}
            </svg>

            {filtered.filter((n) => n.x >= 0 && n.y >= 0).map((n) => {
              const left = n.x * 100;
              const top = n.y * 100;
              const isRead = readSet.has(n.id);
              const isSel = selected?.id === n.id;
              return (
                <button
                  key={n.id}
                  className={`hotspot ${isSel ? 'active' : ''} ${isRead ? 'read' : ''}`}
                  style={{ left: `${left}%`, top: `${top}%` }}
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

      <div className="fabDock" role="group" aria-label="Quick actions">
        <button className={`fabAction primary ${unreadCount === 0 ? 'complete' : ''}`} onClick={() => continueNextUnread(nodes, filtered, readFilter, readSet, focusNode)} aria-label="Next unread topic">
          Next unread
          <span className="fabSub">Unread {unreadCount}</span>
        </button>
        <button className="fabAction" onClick={() => { haptic(10); setSheetOpen(true); }} aria-label="Find a topic">
          Find
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
        <Route path="/topic/:id" element={<TopicRoute nodes={nodes} onSelect={setSelected} onClose={clearSelection} />} />
      </Routes>

      {selected ? <InfoPanel node={selected} edges={edges} cred={cred || undefined} onClose={clearSelection} /> : null}
    </div>
  );
}

function continueNextUnread(
  nodes: Node[],
  filtered: Node[],
  readFilter: 'all' | 'unread' | 'read',
  readSet: Set<string>,
  focusNode: (n: Node, openPanel?: boolean) => void
) {
  const pool = readFilter === 'all' ? nodes : filtered;
  const placedPool = pool.filter((n) => n.x >= 0 && n.y >= 0);
  const unread = placedPool.filter((n) => !readSet.has(n.id));
  if (!unread.length) return;
  focusNode(unread[0], true);
}

function TopicRoute({ nodes, onSelect, onClose }: { nodes: Node[]; onSelect: (n: Node | null) => void; onClose: () => void }) {
  const { id } = useParams();
  useEffect(() => {
    if (!id) return;
    const n = nodes.find((x) => x.id === id) || null;
    onSelect(n);
    if (!n) onClose();
  }, [id]);
  return null;
}

export default function App() {
  return <Home />;
}    const left = -t.positionX / t.scale;
    const top = -t.positionY / t.scale;
    const cx = left + (vp.w / 2) / t.scale;
    const cy = top + (vp.h / 2) / t.scale;
    return { cx, cy };
  }, [t, vp]);

  const pickNearestUnread = (pool: Node[]) => {
    const placedPool = pool.filter((n) => n.x >= 0 && n.y >= 0);
    const unread = placedPool.filter((n) => !readSet.has(n.id));
    if (!unread.length) return null;
    let best = unread[0];
    let bestD = Infinity;
    for (const n of unread) {
      const nx = n.x * CONTENT_W;
      const ny = n.y * CONTENT_H;
      const dx = nx - viewCenter.cx;
      const dy = ny - viewCenter.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = n;
      }
    }
    return best;
  };

  const continueNextUnread = () => {
    const pool = readFilter === 'all' ? nodes : filtered;
    const next = pickNearestUnread(pool);
    if (!next) return;
    haptic(12);
    focusNode(next, true);
  };

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
  }, [continueNextUnread]);

  const cred = useMemo(() => (selected ? computeCredibilityScore(selected.id, edges) : null), [selected, edges]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">Great Awakening Map</div>
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topics..." />

        <div className="filterPill" role="group" aria-label="Read filter">
          {(['all', 'unread', 'read'] as const).map((v) => (
            <button key={v} className={`filterBtn ${readFilter === v ? 'on' : ''}`} onClick={() => setReadFilter(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div className="countsPill" title="Read / Unread">
          <span className={`countItem read ${readFilter === 'read' ? 'emphasis' : ''}`}>Read {readCount}</span>
          <span className="countDot">•</span>
          <span className={`countItem unread ${readFilter === 'unread' ? 'emphasis' : ''}`}>Unread {unreadCount}</span>
        </div>

        <div className="progressPill" title="Read progress">
          <span className="progressNum">
            {readCount}/{nodes.length}
          </span>
          <span className="progressPct">{progressPct}%</span>
        </div>

        <div className="actions">
          <button className="ioBtn" onClick={() => { haptic(10); setSheetOpen(true); }}>Find</button>
          <button className="ioBtn" onClick={() => { haptic(12); continueNextUnread(); }}>{unreadCount === 0 ? 'Complete' : 'Continue'}</button>
          <button className="ioBtn" onClick={() => setReadSet(clearRead())}>Reset Read</button>
          <button className="ioBtn" onClick={() => exportGraph(nodes, edges)}>Export</button>
          <button className="ioBtn" onClick={() => fileInputRef.current?.click()}>Import</button>
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

        <div className="topProgress">
          <div className="topProgressFill" style={{ width: `${progressPct}%` }} />
        </div>

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
      </div>

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
        <button className="resumeChip" onClick={() => { haptic(10); setShowResume(true); }} aria-label="Show resume" title={`Resume: ${resumeNode.title}`}>
          <span className="resumeChipK">Resume</span>
          <span className="resumeChipT">{resumeNode.title}</span>
        </button>
      ) : null}

      <TransformWrapper
        minScale={0.6}
        maxScale={8}
        initialScale={1}
        limitToBounds={false}      /* IMPORTANT: stops snap-back */
        centerOnInit={true}
        doubleClick={{ disabled: true }}
        wheel={{ step: 0.12 }}
        panning={{ velocityDisabled: true }}
        onTransformed={(_, state) => setT({ scale: state.scale, positionX: state.positionX, positionY: state.positionY })}
      >
        <TransformComponent wrapperClass="mapWrap" contentClass="mapContent">
          <div className="map" style={{ width: CONTENT_W, height: CONTENT_H }}>
            <img className="mapImg" src="/map.jpg" alt="Map background" draggable={false} />

            <svg className="edges" width={CONTENT_W} height={CONTENT_H}>
              {edges.map((e) => {
                const a = nodes.find((n) => n.id === e.from);
                const b = nodes.find((n) => n.id === e.to);
                if (!a || !b) return null;
                const x1 = a.x * CONTENT_W,
                  y1 = a.y * CONTENT_H;
                const x2 = b.x * CONTENT_W,
                  y2 = b.y * CONTENT_H;
                const sw = e.strength === 3 ? 2.6 : e.strength === 2 ? 2.0 : 1.4;
                return <line key={e.id} x1={x1} y1={y1} x2={x2} y2={y2} className={`linkLine t-${e.type || 'overlap'}`} strokeWidth={sw} />;
              })}
            </svg>

            {filtered.filter((n) => n.x >= 0 && n.y >= 0).map((n) => {
              const left = n.x * 100;
              const top = n.y * 100;
              const isRead = readSet.has(n.id);
              const isSel = selected?.id === n.id;
              return (
                <button
                  key={n.id}
                  className={`hotspot ${isSel ? 'active' : ''} ${isRead ? 'read' : ''}`}
                  style={{ left: `${left}%`, top: `${top}%` }}
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

      <div className="fabDock" role="group" aria-label="Quick actions">
        <button className={`fabAction primary ${unreadCount === 0 ? 'complete' : ''}`} onClick={continueNextUnread} aria-label="Next unread topic">
          Next unread
          <span className="fabSub">Unread {unreadCount}</span>
        </button>
        <button className="fabAction" onClick={() => { haptic(10); setSheetOpen(true); }} aria-label="Find a topic">
          Find
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
        <Route path="/topic/:id" element={<TopicRoute nodes={nodes} edges={edges} onSelect={setSelected} selected={selected} onClose={clearSelection} />} />
      </Routes>

      {selected ? <InfoPanel node={selected} edges={edges} cred={cred || undefined} onClose={clearSelection} /> : null}
    </div>
  );
}

function TopicRoute({
  nodes,
  edges,
  onSelect,
  selected,
  onClose,
}: {
  nodes: Node[];
  edges: Edge[];
  onSelect: (n: Node | null) => void;
  selected: Node | null;
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

export default function App() {
  return <Home />;
}    if (!resumeNode) return;
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
    if (readFilter === 'unread') list = list.filter(n => !readSet.has(n.id));
    if (readFilter === 'read') list = list.filter(n => readSet.has(n.id));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      n =>
        n.title.toLowerCase().includes(q) ||
        (n.tags || []).some(t => t.toLowerCase().includes(q)) ||
        n.category.toLowerCase().includes(q)
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

  // track transform for nearest-unread
  const [t, setT] = useState({ scale: 1, positionX: 0, positionY: 0 });
  const viewCenter = useMemo(() => {
    const left = -t.positionX / t.scale;
    const top = -t.positionY / t.scale;
    const cx = left + wrapSize.w / 2 / t.scale;
    const cy = top + wrapSize.h / 2 / t.scale;
    return { cx, cy };
  }, [t, wrapSize]);

  const focusNode = (n: Node, openPanel = true) => {
    setSelected(n);
    setReadSet(prev => markRead(prev, n.id));
    saveLastVisited(n.id);
    setResumeId(n.id);
    setCrumbs(pushCrumb(n.id));
    if (openPanel) navigate(`/topic/${n.id}`);
  };

  const clearSelection = () => {
    setSelected(null);
    navigate('/');
  };

  const pickNearestUnread = (pool: Node[]) => {
    const placedPool = pool.filter(n => n.x >= 0 && n.y >= 0);
    const unread = placedPool.filter(n => !readSet.has(n.id));
    if (!unread.length) return null;

    let best = unread[0];
    let bestD = Infinity;
    for (const n of unread) {
      const nx = n.x * CONTENT_W;
      const ny = n.y * CONTENT_H;
      const dx = nx - viewCenter.cx;
      const dy = ny - viewCenter.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = n;
      }
    }
    return best;
  };

  const continueNextUnread = () => {
    const pool = readFilter === 'all' ? nodes : filtered;
    const next = pickNearestUnread(pool);
    if (!next) return;
    haptic(12);
    focusNode(next, true);
  };

  // keyboard: N next unread
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
  }, [continueNextUnread]);

  const cred = useMemo(
    () => (selected ? computeCredibilityScore(selected.id, edges) : null),
    [selected, edges]
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ✅ A safer minScale so you can zoom out
  const minScale = 0.2;

  return (
    <div className="app" ref={wrapRef}>
      <div className="topbar">
        <div className="brand">Great Awakening Map</div>
        <input
          className="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search topics..."
        />

        <div className="filterPill" role="group" aria-label="Read filter">
          {(['all', 'unread', 'read'] as const).map(v => (
            <button
              key={v}
              className={`filterBtn ${readFilter === v ? 'on' : ''}`}
              onClick={() => setReadFilter(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div className="countsPill" title="Read / Unread">
          <span className={`countItem read ${readFilter === 'read' ? 'emphasis' : ''}`}>
            Read {readCount}
          </span>
          <span className="countDot">•</span>
          <span
            className={`countItem unread ${readFilter === 'unread' ? 'emphasis' : ''}`}
          >
            Unread {unreadCount}
          </span>
        </div>

        <div className="progressPill" title="Read progress">
          <span className="progressNum">
            {readCount}/{nodes.length}
          </span>
          <span className="progressPct">{progressPct}%</span>
        </div>

        <div className="actions">
          <button className="ioBtn" onClick={() => { haptic(10); setSheetOpen(true); }}>
            Find
          </button>
          <button className="ioBtn" onClick={() => { haptic(12); continueNextUnread(); }}>
            {unreadCount === 0 ? 'Complete' : 'Continue'}
          </button>
          <button className="ioBtn" onClick={() => setReadSet(clearRead())}>
            Reset Read
          </button>
          <button className="ioBtn" onClick={() => exportGraph(nodes, edges)}>
            Export
          </button>
          <button className="ioBtn" onClick={() => fileInputRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const { edges: ie } = await importGraphFile(f);
                setEdges(Array.isArray(ie) ? ie : edges);
              } catch {}
            }}
          />
        </div>

        <div className="topProgress">
          <div className="topProgressFill" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="crumbRow">
          {crumbs.map(id => {
            const n = nodes.find(x => x.id === id);
            if (!n) return null;
            return (
              <button key={id} className="crumb" onClick={() => focusNode(n, true)}>
                {n.title}
              </button>
            );
          })}
        </div>
      </div>

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

      <TransformWrapper
        minScale={minScale}
        maxScale={8}
        initialScale={fitScale}
        centerOnInit
        // ✅ prevents snap-back / stuck feeling
        limitToBounds={false}
        // smoother
        alignmentAnimation={{ disabled: true }}
        doubleClick={{ disabled: true }}
        onTransformed={(_, state) =>
          setT({ scale: state.scale, positionX: state.positionX, positionY: state.positionY })
        }
      >
        <TransformComponent wrapperClass="mapWrap" contentClass="mapContent">
          <div className="map" style={{ width: CONTENT_W, height: CONTENT_H }}>
            <img className="mapImg" src="/map.jpg" alt="Map background" draggable={false} />

            {/* edges */}
            <svg className="edges" width={CONTENT_W} height={CONTENT_H}>
              {edges.map(e => {
                const a = nodes.find(n => n.id === e.from);
                const b = nodes.find(n => n.id === e.to);
                if (!a || !b) return null;
                const x1 = a.x * CONTENT_W,
                  y1 = a.y * CONTENT_H;
                const x2 = b.x * CONTENT_W,
                  y2 = b.y * CONTENT_H;
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

            {filtered
              .filter(n => n.x >= 0 && n.y >= 0)
              .map(n => {
                const left = n.x * 100;
                const top = n.y * 100;
                const isRead = readSet.has(n.id);
                const isSel = selected?.id === n.id;
                return (
                  <button
                    key={n.id}
                    className={`hotspot ${isSel ? 'active' : ''} ${isRead ? 'read' : ''}`}
                    style={{ left: `${left}%`, top: `${top}%` }}
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

      {/* Mobile dock */}
      <div className="fabDock" role="group" aria-label="Quick actions">
        <button
          className={`fabAction primary ${unreadCount === 0 ? 'complete' : ''}`}
          onClick={continueNextUnread}
          aria-label="Next unread topic"
        >
          Next unread
          <span className="fabSub">Unread {unreadCount}</span>
        </button>
        <button
          className="fabAction"
          onClick={() => { haptic(10); setSheetOpen(true); }}
          aria-label="Find a topic"
        >
          Find
        </button>
      </div>

      <SearchSheet
        open={sheetOpen}
        nodes={nodes}
        readSet={readSet}
        readFilter={readFilter}
        onChangeReadFilter={setReadFilter}
        onPick={n => { setSheetOpen(false); focusNode(n, true); }}
        onClose={() => setSheetOpen(false)}
      />

      <Routes>
        <Route path="/" element={null} />
        <Route
          path="/topic/:id"
          element={
            <TopicRoute
              nodes={nodes}
              edges={edges}
              onSelect={setSelected}
              selected={selected}
              onClose={clearSelection}
            />
          }
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
  edges,
  onSelect,
  selected,
  onClose
}: {
  nodes: Node[];
  edges: Edge[];
  onSelect: (n: Node | null) => void;
  selected: Node | null;
  onClose: () => void;
}) {
  const { id } = useParams();
  useEffect(() => {
    if (!id) return;
    const n = nodes.find(x => x.id === id) || null;
    onSelect(n);
    if (!n) onClose();
  }, [id]);
  return null;
}

export default function App() {
  return <Home />;
}
