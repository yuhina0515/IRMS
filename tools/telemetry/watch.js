// Poll IRMS telemetry; print one line per non-packet event and per ERR/angle transition.
const T=process.env.READ_TOKEN, H={Authorization:'Bearer '+T}, U='https://hina-tw.ddns.net/irms-api/v1';
let ff=false, run=null, seq=0, state=null;
async function tick(){
  try{
    const runs=await (await fetch(U+'/runs',{headers:H})).json();
    const top=runs[0]; if(!top) return;
    if(top.id!==run){ const first=run===null; if(!first) console.log('NEW RUN',top.id.slice(0,8),top.app_version); run=top.id; seq=0; ff=first; state=null; }
    for(;;){
      const ev=await (await fetch(`${U}/runs/${run}/events?afterSeq=${seq}&limit=5000`,{headers:H})).json();
      if(ff){ if(ev.length) seq=ev.at(-1).seq; if(ev.length<5000){ ff=false; break;} continue; }
      if(!ev.length) break;
      for(const e of ev){ seq=e.seq;
        if(e.kind==='packet'){ const s=e.data.raw.startsWith('ERR')?e.data.raw:'ANGLE'; if(s!==state){ if(state) console.log(e.t.slice(11,19),'stream ->',s); state=s;} continue; }
        if(e.kind==='app_log'&&/^Packet #/.test(e.data.message)) continue;
        console.log(e.t.slice(11,19),e.kind,JSON.stringify(e.data).slice(0,200));
      }
      if(ev.length<5000) break;
    }
  }catch(err){ console.log('poll error',String(err).slice(0,120)); }
}
(async()=>{ for(;;){ await tick(); await new Promise(r=>setTimeout(r,15000)); } })();
