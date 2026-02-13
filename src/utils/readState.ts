const LS_KEY='ga_map_read_nodes_v1';
export function loadReadSet(){try{const r=localStorage.getItem(LS_KEY);const a=r?JSON.parse(r):[];return new Set(Array.isArray(a)?a.filter(x=>typeof x==='string'):[]);}catch{return new Set<string>();}}
export function saveReadSet(s:Set<string>){try{localStorage.setItem(LS_KEY,JSON.stringify([...s]));}catch{}}
export function markRead(prev:Set<string>,id:string){const n=new Set(prev);n.add(id);saveReadSet(n);return n;}
export function clearRead(){try{localStorage.removeItem(LS_KEY);}catch{}return new Set<string>();}
