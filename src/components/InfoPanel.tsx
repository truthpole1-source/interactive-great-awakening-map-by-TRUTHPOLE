import { useMemo } from "react";
import type { Node } from "../data/nodes";
import type { Edge } from "../data/edges";

export function InfoPanel({
  node,
  edges,
  cred,
  onClose,
}: {
  node: Node;
  edges: Edge[];
  cred?: any;
  onClose: () => void;
}) {
  const connections = useMemo(() => {
    const id = node.id;
    return edges
      .filter((e) => e.from === id || e.to === id)
      .map((e) => {
        const other = e.from === id ? e.to : e.from;
        return {
          other,
          type: e.type || "overlap",
        };
      });
  }, [node.id, edges]);

  return (
    <>
      {/* Backdrop (tap to close) */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.35)",
          zIndex: 9998,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          left: 10,
          right: 10,
          bottom: 10,
          zIndex: 9999,

          maxHeight: "55vh",
          overflow: "auto",

          background: "rgba(10,12,16,.95)",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,.45)",
          padding: 12,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.06)",
              color: "rgba(255,255,255,.9)",
              fontSize: 18,
              lineHeight: "38px",
            }}
          >
            ×
          </button>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>
              {node.title}
            </div>
            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>
              {node.category}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, opacity: 0.9, fontSize: 13 }}>
          {cred?.label ? (
            <>
              <div style={{ fontWeight: 700 }}>{cred.label}</div>
              {cred?.pct != null ? (
                <div style={{ opacity: 0.8 }}>{cred.pct}%</div>
              ) : null}
              {cred?.summary ? <div style={{ marginTop: 6 }}>{cred.summary}</div> : null}
            </>
          ) : null}
        </div>

        {node?.claims?.length ? (
          <>
            <div style={{ marginTop: 14, fontWeight: 800 }}>Claims</div>
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {node.claims.map((c: string, i: number) => (
                <li key={i} style={{ marginBottom: 6, opacity: 0.92 }}>
                  {c}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {node?.counterpoints?.length ? (
          <>
            <div style={{ marginTop: 12, fontWeight: 800 }}>Counterpoints</div>
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {node.counterpoints.map((c: string, i: number) => (
                <li key={i} style={{ marginBottom: 6, opacity: 0.92 }}>
                  {c}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div style={{ marginTop: 12, fontWeight: 800 }}>Connections</div>
        <ul style={{ marginTop: 8, paddingLeft: 18 }}>
          {connections.length ? (
            connections.map((c, i) => (
              <li key={i} style={{ marginBottom: 6, opacity: 0.92 }}>
                {node.id} → {c.other} ({c.type})
              </li>
            ))
          ) : (
            <li style={{ opacity: 0.7 }}>No connections</li>
          )}
        </ul>
      </div>
    </>
  );
}
