import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { DEFAULT_NODES, type Node } from './data/nodes';
import { DEFAULT_EDGES, type Edge } from './data/edges';
import { InfoPanel } from './components/InfoPanel';
import { SearchSheet } from './components/SearchSheet';
import { ResumeSheet } from './components/ResumeSheet';
import { loadReadSet, markRead, clearRead } from './utils/readState';
import { computeCredibilityScore } from './utils/credibility';
import { loadLastVisited, saveLastVisited } from './utils/lastVisited';
import { loadCrumbs, pushCrumb } from './utils/breadcrumbs';
import './app.css';

const CONTENT_W = 1583;
const CONTENT_H = 2048;

function haptic(ms = 10) {
  if ('vibrate' in navigator) navigator.vibrate(ms);
}

function Home() {
  const navigate = useNavigate();
  const nodes = DEFAULT_NODES;
  const edges = DEFAULT_EDGES;

  const [readSet, setReadSet] = useState<Set<string>>(() => loadReadSet());
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [query, setQuery] = useState('');

  const [selected, setSelected] = useState<Node | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [resumeId, setResumeId] = useState<string | null>(() => loadLastVisited());
  const resumeNode = useMemo(
    () => (resumeId ? nodes.find(n => n.id === resumeId) || null : null),
    [resumeId, nodes]
  );

  const [t, setT] = useState({ scale: 1, positionX: 0, positionY: 0 });

  const filtered = useMemo(() => {
    let list = nodes;
    if (readFilter === 'unread') list = list.filter(n => !readSet.has(n.id));
    if (readFilter === 'read') list = list.filter(n => readSet.has(n.id));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(n => n.title.toLowerCase().includes(q));
  }, [nodes, readFilter, readSet, query]);

  const readCount = nodes.filter(n => readSet.has(n.id)).length;
  const unreadCount = nodes.length - readCount;
  const progressPct = Math.round((readCount / nodes.length) * 100);

  const focusNode = (n: Node) => {
    setSelected(n);
    setReadSet(prev => markRead(prev, n.id));
    saveLastVisited(n.id);
    setResumeId(n.id);
    navigate(`/topic/${n.id}`);
  };

  const clearSelection = () => {
    setSelected(null);
    navigate('/');
  };

  const continueNextUnread = () => {
    const next = nodes.find(n => !readSet.has(n.id));
    if (!next) return;
    haptic();
    focusNode(next);
  };

  const cred = useMemo(
    () => (selected ? computeCredibilityScore(selected.id, edges) : null),
    [selected]
  );

  return (
    <div className="app ultra">

      {/* ---------- TOPBAR ---------- */}
      <div className="topbarMinimal">

        <div className="brandMinimal">
          Great Awakening Map
        </div>

        <div className="progressMinimal">
          <div
            className="progressFillMinimal"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <input
          className="searchMinimal"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search topics..."
        />

        <div className="filterRowMinimal">
          {(['all','unread','read'] as const).map(v => (
            <button
              key={v}
              className={`filterMinimal ${readFilter===v?'active':''}`}
              onClick={() => setReadFilter(v)}
            >
              {v[0].toUpperCase()+v.slice(1)}
            </button>
          ))}
        </div>

      </div>

      {/* ---------- MAP ---------- */}
      <TransformWrapper
        minScale={0.5}
        maxScale={8}
        initialScale={0.85}  // slightly zoomed for immersion
        centerOnInit
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        onTransformed={(_, state) =>
          setT({ scale: state.scale, positionX: state.positionX, positionY: state.positionY })
        }
      >
        <TransformComponent wrapperClass="mapWrap" contentClass="mapContent">
          <div className="map" style={{ width: CONTENT_W, height: CONTENT_H }}>
            <img src="/map.jpg" className="mapImg" draggable={false} />

            {filtered.map(n => (
              <button
                key={n.id}
                className="hotspotMinimal"
                style={{
                  left: `${n.x * 100}%`,
                  top: `${n.y * 100}%`
                }}
                onClick={() => focusNode(n)}
              />
            ))}
          </div>
        </TransformComponent>
      </TransformWrapper>

      {/* ---------- PREMIUM DOCK ---------- */}
      <div className="dockMinimal">
        <button onClick={() => setSheetOpen(true)}>
          Find
        </button>
        <button onClick={continueNextUnread}>
          Next unread
          <span>{unreadCount}</span>
        </button>
      </div>

      {/* ---------- SEARCH ---------- */}
      <SearchSheet
        open={sheetOpen}
        nodes={nodes}
        readSet={readSet}
        readFilter={readFilter}
        onChangeReadFilter={setReadFilter}
        onPick={n => {
          setSheetOpen(false);
          focusNode(n);
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

      {selected && (
        <InfoPanel
          node={selected}
          edges={edges}
          cred={cred || undefined}
          onClose={clearSelection}
        />
      )}

      {/* ---------- PREMIUM RESUME ---------- */}
      {resumeNode && (
        <div className="resumeMinimal" onClick={() => focusNode(resumeNode)}>
          Resume · {resumeNode.title}
        </div>
      )}

    </div>
  );
}

function TopicRoute({
  nodes,
  onSelect,
  onClose
}: {
  nodes: Node[];
  onSelect: (n: Node | null) => void;
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
