import { useMemo, useState } from 'react';
import type { Node } from '../data/nodes';

type Props={open:boolean;nodes:Node[];readSet:Set<string>;readFilter:'all'|'unread'|'read';onChangeReadFilter:(v:'all'|'unread'|'read')=>void;onPick:(n:Node)=>void;onClose:()=>void};

export function SearchSheet({open,nodes,readSet,readFilter,onChangeReadFilter,onPick,onClose}:Props){
  const [q,setQ]=useState('');
  const list=useMemo(()=>{
    let base=nodes;
    if(readFilter==='unread') base=base.filter(n=>!readSet.has(n.id));
    if(readFilter==='read') base=base.filter(n=>readSet.has(n.id));
    const qq=q.trim().toLowerCase();
    if(!qq) return base.slice(0,120);
    return base.filter(n=>n.title.toLowerCase().includes(qq)||(n.tags||[]).some(t=>t.toLowerCase().includes(qq))||n.category.toLowerCase().includes(qq)).slice(0,180);
  },[nodes,q,readFilter,readSet]);
  if(!open) return null;
  return (
    <div className='sheetBackdrop' onMouseDown={onClose}>
      <div className='sheet' onMouseDown={e=>e.stopPropagation()} role='dialog' aria-label='Search topics'>
        <div className='sheetTop'>
          <div className='sheetTitle'>Find a topic</div>
          <button className='sheetClose' onClick={onClose} aria-label='Close'>✕</button>
        </div>
        <input className='sheetInput' value={q} onChange={e=>setQ(e.target.value)} placeholder='Search titles, tags...' autoFocus />
        <div className='sheetFilters' role='group' aria-label='Read filter'>
          {(['all','unread','read'] as const).map(v=> (
            <button key={v} className={`sheetChip ${readFilter===v?'on':''}`} onClick={()=>onChangeReadFilter(v)}>{v[0].toUpperCase()+v.slice(1)}</button>
          ))}
        </div>
        <div className='sheetList'>
          {list.map(n=> (
            <button key={n.id} className={`sheetItem ${readSet.has(n.id)?'read':''}`} onClick={()=>onPick(n)}>
              <div className='sheetItemTop'>
                <div className='sheetItemTitle'>{n.title}</div>
                <div className='sheetItemMeta'>{n.category}</div>
              </div>
              <div className='sheetItemSub'>{readSet.has(n.id)?'Read':'Unread'}{n.tags?.length?` • ${n.tags.slice(0,3).join(', ')}`:''}</div>
            </button>
          ))}
        </div>
        <div className='sheetHint'>Tap a topic to jump and open it.</div>
      </div>
    </div>
  );
}
