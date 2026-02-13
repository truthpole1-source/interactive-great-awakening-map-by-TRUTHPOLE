import type { Edge } from '../data/edges';
const W:Record<string,number>={evidence:3,citation:2,timeline:1.5,overlap:1,rumor:-2};
export function computeCredibilityScore(nodeId:string,edges:Edge[]){const rel=edges.filter(e=>e.from===nodeId||e.to===nodeId);let raw=0;for(const e of rel){const t=e.type||'overlap';raw+=(W[t]??0);raw+=((e.strength??1)*0.2);}const score=Math.max(0,Math.min(100,50+raw*8));const label=score>=75?'Stronger signal':score>=55?'Mixed signal':score>=35?'Weak signal':'Mostly narrative';return {score,label,relatedCount:rel.length};}
