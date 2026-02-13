import type { Node } from '../data/nodes';
import type { Edge } from '../data/edges';

type Props={node:Node;edges:Edge[];cred?:{score:number;label:string;relatedCount:number};onClose:()=>void};

export function InfoPanel({node,edges,cred,onClose}:Props){
  const rel=edges.filter(e=>e.from===node.id||e.to===node.id);
  return (
    <div className='panel' role='dialog' aria-label='Topic info'>
      <div className='panelHead'>
        <div>
          <div className='panelTitle'>{node.title}</div>
          <div className='panelSub'>{node.category}</div>
        </div>
        <button className='panelClose' onClick={onClose} aria-label='Close'>✕</button>
      </div>
      {cred?(
        <div className='credBox'>
          <div className='credTop'><div className='credLabel'>{cred.label}</div><div className='credPct'>{Math.round(cred.score)}%</div></div>
          <div className='credBar'><div className='credFill' style={{width:`${cred.score}%`}} /></div>
          <div className='credSub'>Based on link types, {cred.relatedCount} connections</div>
        </div>
      ):null}
      <div className='panelBody'>
        <div className='panelP'>{node.summary}</div>
        <div className='panelH'>Claims</div>
        <ul className='panelList'>{node.claims.map((c,i)=><li key={i}>{c}</li>)}</ul>
        <div className='panelH'>Counterpoints</div>
        <ul className='panelList'>{node.counterpoints.map((c,i)=><li key={i}>{c}</li>)}</ul>
        {rel.length?(
          <>
            <div className='panelH'>Connections</div>
            <ul className='panelList'>
              {rel.map(e=>(
                <li key={e.id}>{e.from} → {e.to}{e.label?` - ${e.label}`:''} ({e.type||'overlap'})</li>
              ))}
            </ul>
          </>
        ):null}
      </div>
    </div>
  );
}
