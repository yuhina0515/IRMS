// Offline browser checks; all authored output remains in this design folder.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.IRMS_PLAYWRIGHT_MODULE || 'C:/Temp/node_modules/playwright-core');
const root = __dirname;
const output = path.join(root, 'verification');
fs.mkdirSync(output, {recursive:true});
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.IRMS_BROWSER_EXECUTABLE || 'C:/Users/Yuhina/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
  const results = [];
  const errors = [];
  const requests = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {if (/^https?:/.test(r.url())) requests.push(r.url());});
  // Check the page and each element that should not be its own scroller.
  async function audit(label){
    const result = await page.evaluate(() => {
      const root=document.documentElement;
      const clipped=[...document.querySelectorAll('main *,header.top *,footer *')].filter(e=>{
        const c=getComputedStyle(e),r=e.getBoundingClientRect();
        if(!r.width||!r.height||e.closest('[hidden]')||['svg','path','g','text','line','circle','polyline','rect','ellipse','defs','linearGradient','stop'].includes(e.tagName))return false;
        if(['auto','scroll'].includes(c.overflowY)||['auto','scroll'].includes(c.overflowX))return false;
        return e.scrollWidth>e.clientWidth+2 || e.scrollHeight>e.clientHeight+2;
      }).map(e=>({tag:e.tagName,cls:e.className,id:e.id,w:[e.clientWidth,e.scrollWidth],h:[e.clientHeight,e.scrollHeight]}));
      return {viewport:[innerWidth,innerHeight],page:[root.scrollWidth,root.scrollHeight],pageFits:root.scrollWidth===innerWidth&&root.scrollHeight===innerHeight,clipped};
    });
    results.push({label,...result});
  }
  for(const name of ['dashboard','settings','history-review']){
    for(const [w,h] of [[1280,720],[1920,1080],[1024,600]]){
      await page.setViewportSize({width:w,height:h});
      await page.goto(pathToFileURL(path.join(root,`mockup-${name}.html`)).href);
      for(const theme of ['light','dark']){
        if(theme==='dark')await page.locator('#theme').click();
        await audit(`${name}-${w}x${h}-${theme}`);
        if(w===1280)await page.screenshot({path:path.join(output,`${name}-${theme}.png`)});
      }
    }
  }
  await page.setViewportSize({width:1024,height:600});
  await page.goto(pathToFileURL(path.join(root,'mockup-settings.html')).href);
  await page.locator('#advanced summary').click();
  await audit('settings-advanced-1024x600');
  await page.locator('#telemetry-toggle').check();
  if(!await page.locator('#telemetry-consent').isVisible())throw Error('Consent dialog did not open');
  await page.locator('#confirm-telemetry').click();
  if(!await page.locator('#endpoint').isDisabled())throw Error('Enabled telemetry must lock endpoint');
  await page.locator('#telemetry-toggle').uncheck();
  for(const key of ['device','calibration','display','updates','demo','telemetry']){
    await page.locator(`[data-pane="${key}"]`).click();
    if(!await page.locator(`#pane-${key}`).isVisible())throw Error('Settings pane failed: '+key);
    await audit('settings-pane-'+key);
  }
  await page.goto(pathToFileURL(path.join(root,'mockup-dashboard.html')).href);
  for(const state of ['alarm','error','disconnected','uncalibrated','holding']){
    await page.locator('#state-preview').selectOption(state);
    await audit('dashboard-state-'+state);
    if(['alarm','error'].includes(state))await page.screenshot({path:path.join(output,`dashboard-${state}-1024.png`)});
  }
  await page.locator('#pose-3d').click();
  if(await page.locator('#pose-3d').getAttribute('aria-pressed')!=='true')throw Error('Pose toggle failed');
  await page.locator('#pose-2d').click();
  await page.goto(pathToFileURL(path.join(root,'mockup-history-review.html')).href);
  await page.locator('[data-rep="8"]').click();
  if(await page.locator('#rep-peak').textContent()!=='142°')throw Error('Rep detail failed');
  await page.locator('[data-dialog="compare-dialog"]').click();
  if(!await page.locator('#compare-dialog').isVisible())throw Error('Comparison failed');
  await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'reduce'});
  await audit('history-reduced-motion');
  const tokens=await page.evaluate(()=>{
    const read=()=>Object.fromEntries(['canvas','paper','soft','ink','muted','edge','accent','on-accent','tint','good','good-bg','warn','warn-bg','danger','danger-bg','on-danger'].map(t=>[t,getComputedStyle(document.documentElement).getPropertyValue('--'+t).trim()]));
    document.documentElement.dataset.theme='light';const light=read();document.documentElement.dataset.theme='dark';return {light,dark:read()};
  });
  function lum(hex){const rgb=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
  const pairs=[['ink','paper'],['ink','canvas'],['ink','soft'],['muted','paper'],['muted','canvas'],['muted','soft'],['accent','paper'],['accent','tint'],['on-accent','accent'],['good','good-bg'],['warn','warn-bg'],['danger','danger-bg'],['danger','paper'],['on-danger','danger'],['edge','paper'],['edge','soft']];
  const contrast=Object.fromEntries(Object.entries(tokens).map(([theme,t])=>[theme,pairs.map(([fg,bg])=>{const a=lum(t[fg]),b=lum(t[bg]);return {fg,bg,ratio:Number(((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2)),required:fg==='edge'?3:4.5};})]));
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,errors,requests,tokens,contrast,limitations:['CSS viewport testing only; not native Tauri, physical Windows DPI, assistive technology, or a 2 m user study.']},null,2));
  console.log(JSON.stringify({checks:results.length,pageFailures:results.filter(r=>!r.pageFits),clipping:results.filter(r=>r.clipped.length),errors,networkRequests:requests,contrastFailures:Object.entries(contrast).flatMap(([theme,rows])=>rows.filter(r=>r.ratio<r.required).map(r=>({theme,...r})))},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
