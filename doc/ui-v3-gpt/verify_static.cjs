// Verifies syntax, offline dependencies, UI state transitions, and token contrast.
// JSDOM has no layout engine: this file deliberately makes no geometry claims.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require(path.resolve(__dirname,'../../IRMS_App_Tauri/node_modules/jsdom'));
const root=__dirname, checks=[], errors=[];
function check(name,ok){checks.push({name,pass:!!ok});if(!ok)errors.push(name);}
for(const name of ['dashboard','settings','history-review']){
  const html=fs.readFileSync(path.join(root,`mockup-${name}.html`),'utf8');
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'file:///'+path.join(root,`mockup-${name}.html`).replaceAll('\\','/'),beforeParse(w){w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};}});
  const d=dom.window.document;
  check(`${name}: valid inline JavaScript`,[...d.scripts].every(s=>{new vm.Script(s.textContent);return true;}));
  check(`${name}: no external assets`,!d.querySelector('script[src],link[href],img[src],iframe[src],source[src]'));
  check(`${name}: no network/storage APIs`,!/(fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage)/.test([...d.scripts].map(s=>s.textContent).join('')));
  const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);check(`${name}: unique IDs`,new Set(ids).size===ids.length);
  check(`${name}: local navigation resolves`,[...d.querySelectorAll('a[href]')].every(a=>fs.existsSync(path.join(root,a.getAttribute('href')))));
  d.querySelector('#theme').click();check(`${name}: dark theme`,d.documentElement.dataset.theme==='dark');
  d.querySelector('#theme').click();check(`${name}: light theme`,d.documentElement.dataset.theme==='light');
  d.querySelector('[data-dialog="actions-dialog"]').click();check(`${name}: action preview opens`,d.querySelector('#actions-dialog').open);
  if(name==='dashboard'){
    for(const state of ['alarm','error','disconnected','uncalibrated','holding']){
      const select=d.querySelector('#state-preview');select.value=state;select.dispatchEvent(new dom.window.Event('change'));
      check(`dashboard: ${state}`,d.querySelector('#live').dataset.state===state);
      if(state==='uncalibrated')check('dashboard: no false calibration badge',d.querySelector('#calibration-chip').textContent.includes('尚未'));
      if(state==='error')check('dashboard: error suppresses live number',d.querySelector('#metric-number').textContent==='—');
    }
    d.querySelector('#pose-3d').click();check('dashboard: pose selection',d.querySelector('#pose-3d').getAttribute('aria-pressed')==='true');
  }
  if(name==='settings'){
    for(const button of d.querySelectorAll('[data-pane]')){button.click();check('settings: '+button.dataset.pane,!d.querySelector('#pane-'+button.dataset.pane).hidden);}
    d.querySelector('#telemetry-toggle').click();check('settings: consent before enabling',d.querySelector('#telemetry-consent').open&&!d.querySelector('#telemetry-toggle').checked);
    d.querySelector('#confirm-telemetry').click();check('settings: enabled endpoint locked',d.querySelector('#endpoint').disabled);
    d.querySelector('#telemetry-toggle').click();check('settings: disabled endpoint editable',!d.querySelector('#endpoint').disabled);
  }
  if(name==='history-review'){
    d.querySelector('[data-rep="8"]').click();check('review: over-limit rep selection',d.querySelector('#rep-peak').textContent==='142°');
    d.querySelector('[data-rep="7"]').click();check('review: incomplete rep',d.querySelector('#rep-status').textContent.includes('未達標'));
    d.querySelector('[data-dialog="compare-dialog"]').click();check('review: comparison opens',d.querySelector('#compare-dialog').open);
  }
  dom.window.close();
}
const html=fs.readFileSync(path.join(root,'mockup-dashboard.html'),'utf8');
const light=html.match(/:root\{([^}]+)\}/)[1],dark=html.match(/html\[data-theme=dark\]\{([^}]+)\}/)[1];
const tokens=Object.fromEntries([['light',light],['dark',dark]].map(([name,css])=>[name,Object.fromEntries([...css.matchAll(/--([\w-]+):(#\w+)/g)].map(m=>[m[1],m[2]]))]));
function lum(hex){const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
const pairs=[['ink','paper'],['ink','canvas'],['ink','soft'],['muted','paper'],['muted','canvas'],['muted','soft'],['accent','paper'],['accent','soft'],['accent','tint'],['on-accent','accent'],['good','good-bg'],['good','soft'],['warn','warn-bg'],['danger','danger-bg'],['danger','paper'],['on-danger','danger'],['edge','paper'],['edge','soft']];
const contrast=Object.fromEntries(Object.entries(tokens).map(([theme,t])=>[theme,pairs.map(([fg,bg])=>{const a=lum(t[fg]),b=lum(t[bg]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),required=fg==='edge'?3:4.5;check(`${theme}: ${fg}/${bg} contrast`,ratio>=required);return {fg,bg,ratio:Number(ratio.toFixed(2)),required,pass:ratio>=required};})]));
fs.mkdirSync(path.join(root,'verification'),{recursive:true});
fs.writeFileSync(path.join(root,'verification/static-results.json'),JSON.stringify({checks,errors,tokens,contrast,layoutVerification:'NOT RUN: browser process launch denied (spawn EPERM); connected browser inventory empty; IAB unavailable. JSDOM does not measure layout.'},null,2));
console.log(JSON.stringify({checks:checks.length,errors,contrast},null,2));
if(errors.length)process.exitCode=1;
