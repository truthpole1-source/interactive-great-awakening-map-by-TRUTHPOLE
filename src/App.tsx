import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";

import { DEFAULT_NODES, type Node } from "./data/nodes";
import { DEFAULT_EDGES, type Edge } from "./data/edges";

import { InfoPanel } from "./components/InfoPanel";
import { SearchSheet } from "./components/SearchSheet";

import { loadReadSet, markRead, clearRead } from "./utils/readState";
import {
  loadEdgesFromLocalStorage,
  saveEdgesToLocalStorage,
  exportGraph,
  importGraphFile,
} from "./utils/graphIO";
import { computeCredibilityScore } from "./utils/credibility";
import { saveLastVisited } from "./utils/lastVisited";
import { loadCrumbs, pushCrumb } from "./utils/breadcrumbs";

import "./app.css";

// Matches the dimensions of public/map.jpg
const CONTENT_W = 1583;
const CONTENT_H = 2048;

// Layout heights (CSS uses the same)
const TOPBAR_H = 168;
const DOCK_H = 86;

function haptic(ms = 12) {
  try {
    if ("vibrate" in navigator) (navigator as any).vibrate(ms);
  } catch {}
}

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onR = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  return vp;
}

/** Ritual Splash: Hold-to-unlock (3s) */
function Splash({ onEnter }: { onEnter: () => void }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdRef = useRef<number | null>(null);

  const HOLD_TIME = 3000;
  const RING = 2 * Math.PI * 45; // circle circumference

  const startHold = () => {
    if (holding) return;
    setHolding(true);

    const start = Date.now();
    holdRef.current = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / HOLD_TIME) * 100, 100);
      setProgress(pct);

      if (pct >= 100) {
        if (holdRef.current) window.clearInterval(holdRef.current);
        holdRef.current = null;
        haptic(25);
        // small “snap” delay feels powerful
        window.setTimeout(onEnter, 180);
      }
    }, 16);
  };

  const cancelHold = () => {
    setHolding(false);
    setProgress(0);
    if (holdRef.current) {
      window.clearInterval(holdRef.current);
      holdRef.current = null;
    }
  };

  // prevent stuck interval if component unmounts
  useEffect(() => {
    return () => {
      if (holdRef.current) window.clearInterval(holdRef.current);
    };
  }, []);

  const dashOffset = RING - (progress / 100) * RING;

  return (
    <div className={`splash ${holding ? "is-holding" : ""}`}>
      <div className="ritual">
        <img
          className="ritualLogo"
          src="/truthpole-logo.jpg"
          alt="Truthpole"
          draggable={false}
        />

        <div className="ritualTitle">Great Awakening Map</div>
        <div className="ritualSub">
          {holding ? "Ritual unlocking…" : "Hold to initiate"}
        </div>

        <button
          className="ritualBtn"
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          aria-label="Hold to initiate"
        >
          <span className="ritualBtnText">INITIATE</span>

          <svg className="progressRing" viewBox="0 0 100 100" aria-hidden="true">
            <circle className="progressBg" cx="50" cy="50" r="45" />
            <circle
              className="progressBar"
              cx="50"
              cy="50"
              r="45"
              strokeDasharray={RING}
              strokeDashoffset={dashOffset}
            />
          </svg>
        </button>

        <div className="ritualHint">
          Release early to reset
        </div>
      </div>
    </div>
  );
}

function Home() {
  const navigate = useNavigate();
  const vp = useViewport();

  const nodes = DEFAULT_NODES;

  const [edges, setEdges] = useState<Edge[]>(() =>
    loadEdgesFromLocalStorage(DEFAULT_EDGES)
  );
  useEffect(() => saveEdgesToLocalStorage(edges), [edges]);

  const [readSet, setReadSet] = useState<Set<string>>(() => loadReadSet());
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<Node | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [crumbs, setCrumbs] = useState<string[]>(() => loadCrumbs());

  const filtered = useMemo(() => {
    let list = nodes;
    if (readFilter === "unread") list = list.filter((n) => !readSet.has(n.id));
    if (readFilter === "read") list = list.filter((n) => readSet.has(n.id));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.tags || []).some((t) => t.toLowerCase().includes(q)) ||
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

  // Track transform for nearest-unread
  const [t, setT] = useState({ scale: 1, positionX: 0, positionY: 0 });

  const viewCenter = useMemo(() => {
    const left = -t.positionX / t.scale;
    const top = -t.positionY / t.scale;

    const stageW = vp.w;
    const stageH = vp.h - TOPBAR_H - DOCK_H;

    const cx = left + (stageW / 2) / t.scale;
    const cy = top + (stageH / 2) / t.scale;
    return { cx, cy };
  }, [t, vp]);

  const focusNode = (n: Node, openPanel = true) => {
    setSelected(n);
    setReadSet((prev) => markRead(prev, n.id));
    saveLastVisited(n.id);
    setCrumbs((prev) => pushCrumb(n.id, prev));
    if (openPanel) navigate(`/topic/${n.id}`);
  };

  const clearSelection = () => {
    setSelected(null);
    navigate("/");
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
    const pool = readFilter === "all" ? nodes : filtered;
    const next = pickNearestUnread(pool);
    if (!next) return;
    haptic(12);
    focusNode(next, true);
  };

  // Keyboard: N next unread
  useEffect(() => {
    const onK = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        continueNextUnread();
      }
    };
    window.addEventListener("keydown", onK);
    return () => window.removeEventListener("keydown", onK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readFilter, filtered, readSet, viewCenter]);

  const cred = useMemo(
    () => (selected ? computeCredibilityScore(selected.id, edges) : null),
    [selected, edges]
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Zoom-pan ref for Center button
  const zref = useRef<ReactZoomPanPinchRef | null>(null);

  const centerToFit = () => {
    const api = zref.current;
    if (!api) return;

    const stageW = vp.w;
    const stageH = vp.h - TOPBAR_H - DOCK_H;

    const scale = Math.min(stageW / CONTENT_W, stageH / CONTENT_H);
    const x = (stageW - CONTENT_W * scale) / 2;
    const y = (stageH - CONTENT_H * scale) / 2;

    api.setTransform(x, y, scale, 250, "easeOut");
  };

  useEffect(() => {
    const tt = window.setTimeout(() => centerToFit(), 120);
    return () => window.clearTimeout(tt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="topbarRow">
          <div className="brandWrap">
            <img className="brandLogo" src="/truthpole-logo.jpg" alt="" />
            <div className="brandText">Great Awakening Map</div>
          </div>

          <div className="progressMini" title="Read progress">
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
        </div>

        <div className="topbarRow split">
          <div className="filters" role="group" aria-label="Read filter">
            {(["all", "unread", "read"] as const).map((v) => (
              <button
                key={v}
                className={`pillBtn ${readFilter === v ? "on" : ""}`}
                onClick={() => setReadFilter(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          <div className="counts">
            <span className="count">Read {readCount}</span>
            <span className="dot">•</span>
            <span className="count">Unread {unreadCount}</span>
          </div>

          <div className="actions hideMobile">
            <button className="btn" onClick={() => { haptic(10); setSheetOpen(true); }}>
              Search
            </button>
            <button className="btn primary" onClick={() => { haptic(12); continueNextUnread(); }}>
              {unreadCount === 0 ? "Complete" : "Continue"}
            </button>
            <button className="btn ghost" onClick={() => setReadSet(clearRead())}>
              Reset
            </button>
            <button className="btn ghost" onClick={() => exportGraph(nodes, edges)}>
              Export
            </button>
            <button className="btn ghost" onClick={() => fileInputRef.current?.click()}>
              Import
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
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

      <main className="stage">
        <TransformWrapper
          ref={zref as any}
          minScale={0.2}
          maxScale={8}
          initialScale={1}
          centerOnInit={false}
          limitToBounds={false}
          alignmentAnimation={{ disabled: true }}
          doubleClick={{ disabled: true }}
          wheel={{ step: 0.12 }}
          pinch={{ step: 6 }}
          panning={{ velocityDisabled: true }}
          onTransformed={(_, state) =>
            setT({
              scale: state.scale,
              positionX: state.positionX,
              positionY: state.positionY,
            })
          }
        >
          <TransformComponent wrapperClass="mapWrap" contentClass="mapContent">
            <div className="map" style={{ width: CONTENT_W, height: CONTENT_H }}>
              <img className="mapImg" src="/map.jpg" alt="Map background" draggable={false} />

              <svg className="edges" width={CONTENT_W} height={CONTENT_H}>
                {edges.map((e) => {
                  const a = nodes.find((n) => n.id === e.from);
                  const b = nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;

                  const x1 = a.x * CONTENT_W;
                  const y1 = a.y * CONTENT_H;
                  const x2 = b.x * CONTENT_W;
                  const y2 = b.y * CONTENT_H;

                  const sw = e.strength === 3 ? 2.6 : e.strength === 2 ? 2.0 : 1.4;

                  return (
                    <line
                      key={e.id}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className={`linkLine t-${e.type || "overlap"}`}
                      strokeWidth={sw}
                    />
                  );
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
                    className={`hotspot ${isSel ? "active" : ""} ${isRead ? "read" : ""}`}
                    style={{ left: `${left}%`, top: `${top}%` }}
                    onClick={() => {
                      haptic(10);
                      focusNode(n, true);
                    }}
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

      <div className="dock" role="group" aria-label="Quick actions">
        <button
          className="dockBtn"
          onClick={() => { haptic(10); setSheetOpen(true); }}
          aria-label="Search topics"
        >
          Search
        </button>

        <button
          className="dockBtn primary"
          onClick={() => { haptic(12); continueNextUnread(); }}
          aria-label="Next unread"
        >
          Next unread
          <span className="dockSub">Unread {unreadCount}</span>
        </button>

        <button
          className="dockBtn"
          onClick={() => { haptic(10); centerToFit(); }}
          aria-label="Center map"
        >
          Center
        </button>
      </div>

      <SearchSheet
        open={sheetOpen}
        nodes={nodes}
        readSet={readSet}
        readFilter={readFilter}
        onChangeReadFilter={setReadFilter}
        onPick={(n) => {
          setSheetOpen(false);
          focusNode(n, true);
        }}
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

export default function App() {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem("ga_entered") === "1";
    if (v) setEntered(true);
  }, []);

  return (
    <div className="app">
      <Home />
      {!entered && (
        <Splash
          onEnter={() => {
            localStorage.setItem("ga_entered", "1");
            setEntered(true);
          }}
        />
      )}
    </div>
  );
      }
