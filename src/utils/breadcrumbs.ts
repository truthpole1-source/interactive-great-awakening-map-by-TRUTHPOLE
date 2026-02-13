const LS_KEY='ga_map_breadcrumbs_v1';
export function loadCrumbs(){try{const r=localStorage.getItem(LS_KEY);const a=r?JSON.parse(r):[];return Array.isArray(a)?a.filter(x=>typeof x==='string'):[];}catch{return [];}}
export function pushCrumb(id:string,max=5){const prev=loadCrumbs();const next=[id,...prev.filter(x=>x!==id)].slice(0,max);try{localStorage.setItem(LS_KEY,JSON.stringify(next));}catch{}return next;}
