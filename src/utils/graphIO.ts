import type { Edge } from '../data/edges';
const LS_KEY='ga_map_edges_v1';
export function loadEdgesFromLocalStorage(fallback:Edge[]){try{const r=localStorage.getItem(LS_KEY);const a=r?JSON.parse(r):null;return Array.isArray(a)?a:fallback;}catch{return fallback;}}
export function saveEdgesToLocalStorage(edges:Edge[]){try{localStorage.setItem(LS_KEY,JSON.stringify(edges));}catch{}}
export function exportGraph(nodes:any[],edges:Edge[]){const blob=new Blob([JSON.stringify({nodes,edges},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='great-awakening-graph.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
export async function importGraphFile(file:File){const txt=await file.text();const p=JSON.parse(txt);if(!p||!Array.isArray(p.nodes)||!Array.isArray(p.edges)) throw new Error('Expected { nodes: [], edges: [] }');return {nodes:p.nodes,edges:p.edges as Edge[]};}
