const LS_KEY='ga_map_last_visited_v1';
export function loadLastVisited(){try{return localStorage.getItem(LS_KEY);}catch{return null;}}
export function saveLastVisited(id:string){try{localStorage.setItem(LS_KEY,id);}catch{}}
export function clearLastVisited(){try{localStorage.removeItem(LS_KEY);}catch{}}
