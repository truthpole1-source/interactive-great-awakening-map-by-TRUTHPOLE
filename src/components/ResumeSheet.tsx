import { useEffect, useRef, useState } from 'react';

type Props={open:boolean;title:string;onJump:()=>void;onRequestClose:()=>void};

function rubberBand(d:number,dim=260,c=0.55){return (dim*c*d)/(dim+c*d);}

export function ResumeSheet({open,title,onJump,onRequestClose}:Props){
  const sheetRef=useRef<HTMLDivElement|null>(null);
  const [visible,setVisible]=useState(open);
  const [closing,setClosing]=useState(false);
  const [dy,setDy]=useState(0);
  const [snapMs,setSnapMs]=useState(180);
  const startY=useRef(0);const lastY=useRef(0);const lastT=useRef(0);const vel=useRef(0);const dragging=useRef(false);

  useEffect(()=>{
    if(open){setVisible(true);setClosing(false);setDy(0);} 
    else if(visible){setClosing(true);const t=window.setTimeout(()=>{setVisible(false);setClosing(false);},180);return ()=>window.clearTimeout(t);} 
  },[open]);

  const begin=(y:number)=>{dragging.current=true;startY.current=y;lastY.current=0;lastT.current=performance.now();vel.current=0;};
  const move=(y:number)=>{if(!dragging.current) return;const raw=y-startY.current;const down=Math.max(0,raw);const TH=120;const eased=down<=TH?down:TH+rubberBand(down-TH,260,0.55);const now=performance.now();const dt=Math.max(8,now-lastT.current);const dv=(eased-lastY.current)/dt;vel.current=dv*0.8+vel.current*0.2;lastT.current=now;lastY.current=eased;setDy(eased);};
  const end=()=>{if(!dragging.current) return;dragging.current=false;const v=Math.abs(vel.current);const shouldClose=lastY.current>150||vel.current>0.9;setSnapMs(Math.max(120,Math.min(240,Math.round(220-v*90))));if(shouldClose){setDy(320);window.setTimeout(()=>onRequestClose(),120);} else {setDy(0);} lastY.current=0;vel.current=0;};

  const onPointerDown=(e:React.PointerEvent<HTMLDivElement>)=>{if(e.pointerType==='mouse'&&e.button!==0) return;sheetRef.current?.setPointerCapture?.(e.pointerId);begin(e.clientY);};
  const onPointerMove=(e:React.PointerEvent<HTMLDivElement>)=>{if(!dragging.current) return;e.preventDefault();move(e.clientY);};
  const onPointerUp=(e:React.PointerEvent<HTMLDivElement>)=>{try{sheetRef.current?.releasePointerCapture?.(e.pointerId);}catch{}end();};
  const onPointerCancel=()=>end();

  if(!visible) return null;
  const dimBase=Math.min(0.45,(dy/180)*0.45);
  const dim=closing?0:dimBase;
  const depth=Math.min(1,dy/140);
  const shadowA=0.45+depth*0.2;
  const borderA=0.12-depth*0.04;

  return (
    <>
      <div className={`resumeDim ${closing?'closing':''}`} style={{opacity:dim}} aria-hidden='true' onClick={onRequestClose} />
      <div
        ref={sheetRef}
        className={`resumeSheet ${closing?'closing':''}`}
        style={{
          transform:`translateY(${closing?14:dy}px)`,
          boxShadow:`0 14px 60px rgba(0,0,0,${shadowA})`,
          borderColor:`rgba(255,255,255,${borderA})`,
          transitionDuration:`${snapMs}ms`
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        role='region'
        aria-label='Resume'
      >
        <div className='resumeGrab' aria-hidden='true' />
        <div className='resumeSheetRow'>
          <div>
            <div className='resumeSheetKicker'>Resume</div>
            <div className='resumeSheetTitle'>{title}</div>
          </div>
          <div className='resumeSheetActions'>
            <button className='resumeBtn' onClick={onJump}>Jump back in</button>
            <button className='resumeX' onClick={onRequestClose} aria-label='Dismiss resume'>✕</button>
          </div>
        </div>
        <div className='resumeSwipeHint'>Drag down to dismiss</div>
      </div>
    </>
  );
}
