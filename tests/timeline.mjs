import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)), extension=join(root,'extension');
const profile=await mkdtemp(join(tmpdir(),'xpls-native-timeline-'));
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1100,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
let checks=0;const check=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
const base=await readFile(new URL('fixture.html',import.meta.url),'utf8');
const fixture=base.replace('</body>',`<style>
main nav {position:relative;} [role=tablist]>div {flex:1;} [role=tab]{text-align:center;}
[role=tab][aria-selected=true]::after{left:50%;right:auto;width:72px;transform:translateX(-50%);}
[role=tab]>div{display:flex;flex-direction:column;align-items:center;}
.native-chevron{margin-top:8px;border:0;background:transparent;color:inherit;padding:4px;cursor:pointer;}
.native-chevron svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.5;}
#manage-timelines{position:absolute;right:8px;top:-50px;border:0;border-radius:50%;width:36px;height:36px;background:#16181c;color:#e7e9ea;}
#native-sort-menu{position:fixed;min-width:125px;background:#202020;color:#e7e9ea;border-radius:14px;z-index:80;box-shadow:0 4px 20px #0008;overflow:hidden;font:15px Arial;}
#native-sort-menu .heading{padding:18px 20px;color:#71767b;border-bottom:1px solid #2f3336;}
#native-sort-menu button{display:flex;justify-content:space-between;gap:20px;width:100%;padding:14px 16px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;}
#native-sort-menu button:hover{background:#303030;} #native-sort-menu .check{color:#1d9bf0;}
</style><script>
window.nativeSort='recent';window.nativeActions=[];window.startedAt=0;window.transport='post';window.currentView='for-you';
const tabs=()=>[...document.querySelectorAll('main [role=tab]')];
tabs()[1].innerHTML='<div><span style="font-family:Georgia">Following</span><button class="native-chevron" aria-haspopup="menu" aria-expanded="false" aria-label="Sort Following"><svg viewBox="0 0 12 12"><path d="m2 8 4-4 4 4"/></svg></button></div>';
document.querySelector('main nav').insertAdjacentHTML('afterend','<div style="position:relative;height:0"><button id="manage-timelines"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12.04 3.97l-1.414 1.414L15.243 10H3v2h12.243l-4.617 4.616 1.414 1.414L19.071 11l-7.03-7.03z" fill="currentColor"/></svg></button></div>');
function render(data){document.querySelector('article h2').textContent=data.post;}
window.requestFeed=function(value){
  window.startedAt=performance.now();
  const url='/i/api/graphql/native-follow/HomeLatestTimeline',body=JSON.stringify({variables:{enableRanking:window.forceRecent?false:value==='popular'},features:{nativeFeature:true},queryId:'native-follow'}),headers={authorization:'Bearer fixture-token','x-csrf-token':'fixture-csrf'};
  if(window.transport==='post'||window.transport==='get'){
    const xhr=new XMLHttpRequest();xhr.onload=()=>render(JSON.parse(xhr.responseText));
    xhr.open(window.transport==='post'?'POST':'GET',window.transport==='post'?url:url+'?variables='+encodeURIComponent(JSON.stringify({enableRanking:value==='popular'})));
    for(const[name,value]of Object.entries(headers))xhr.setRequestHeader(name,value);
    xhr.send(window.transport==='post'?body:undefined);
  }else{const init={method:'POST',headers,body};(window.transport==='request'?fetch(new Request(location.origin+url,init)):fetch(url,init)).then(r=>r.json()).then(render);}
};
function closeMenu(){document.getElementById('native-sort-menu')?.remove();document.querySelector('.native-chevron').setAttribute('aria-expanded','false');}
function openMenu(){
 if(document.getElementById('native-sort-menu')){closeMenu();return;}
 const trigger=document.querySelector('.native-chevron');trigger.setAttribute('aria-expanded','true');
 const menu=document.createElement('div');menu.id='native-sort-menu';menu.setAttribute('role','menu');menu.innerHTML='<div class="heading">Sort by</div>';
 const box=trigger.getBoundingClientRect();menu.style.left=box.left+'px';menu.style.top=box.bottom+6+'px';
 for(const[value,label]of[['popular','Popular'],['recent','Recent']]){
 const item=document.createElement('button');item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(window.nativeSort===value));item.dataset.sort=value;item.innerHTML=label+(window.nativeSort===value?'<span class="check">✓</span>':'');
 item.onclick=()=>{window.nativeActions.push(value);window.selectionAt=performance.now();closeMenu();if(window.nativeSort===value)return;window.nativeSort=value;window.requestFeed(value);};menu.append(item);}
 document.body.append(menu);
}
document.addEventListener('click',event=>{
 const tab=event.target.closest('[role=tab]');if(tab===tabs()[0])window.currentView='for-you';if(tab!==tabs()[1])return;
 window.lastClickTrusted=event.isTrusted;window.lastClickPrevented=event.defaultPrevented;
 if(event.target.closest('.native-chevron')){window.nativeActions.push('sort-trigger');openMenu();return;}
 window.nativeActions.push('following');if(window.currentView!=='following'){window.currentView='following';window.requestFeed(window.nativeSort);}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
</script></body>`);
try{
 const requests=[];let documentLoads=0;
 await context.route('https://x.com/**',route=>{
 const req=route.request(),url=new URL(req.url());if(!url.pathname.includes('/i/api/')){documentLoads++;return route.fulfill({contentType:'text/html',body:fixture});}
 const body=req.method()==='POST'?req.postDataJSON():null,variables=body?.variables||JSON.parse(url.searchParams.get('variables'));
 requests.push({method:req.method(),variables,body,headers:req.headers()});return route.fulfill({json:{post:variables.enableRanking?'Popular: most liked post':'Recent: newest post'}});
 });
 await context.addCookies([{name:'twid',value:'u%3D99',domain:'x.com',path:'/'}]);
 const page=await context.newPage();await page.goto('https://x.com/home');
 const following=page.locator('main [role=tab]').nth(1),forYou=page.locator('main [role=tab]').nth(0),trigger=following.locator('.native-chevron'),label=page.locator('#xpls-timeline-label'),menu=page.locator('#native-sort-menu');
 const choose=async value=>{await trigger.click();await menu.locator('[data-sort='+value+']').click();await page.waitForFunction(v=>document.querySelector('article h2').textContent.startsWith(v),value==='popular'?'Popular:':'Recent:');};
 await check('custom dropdown, startup sorter and request-rewriting code are removed',async()=>{
 const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
 assert(!manifest.content_scripts.some(s=>s.js?.includes('timeline-start.js')));
 const ui=await readFile(join(extension,'timeline.js'),'utf8'),api=await readFile(join(extension,'list-api.js'),'utf8');
 for(const term of ['chooseSort','location.reload','setTimeout','xpls-following-menu','following-sort','localStorage','sessionStorage','stopImmediatePropagation'])assert(!ui.includes(term),term);
 for(const term of ['rankedRequest','requestedRanking','confirmFollowing','following-sort','xplsFollowing'])assert(!api.includes(term),term);
 });
 await check('blue selection line remains with no white underline and view label below composer',async()=>{
 await label.waitFor();assert.equal(await label.textContent(),'For you');assert.equal(await label.evaluate(e=>e.previousElementSibling.className),'tweet-box');
 assert.equal(await forYou.locator('span').evaluate(e=>getComputedStyle(e).textDecorationLine),'none');assert.equal(await forYou.evaluate(e=>getComputedStyle(e,'::after').backgroundColor),'rgb(29, 155, 240)');
 });
 await check('all view labels use the same font and size despite Following-specific native styles',async()=>{
 const font=()=>label.evaluate(e=>{const s=getComputedStyle(e);return[s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight];});
 const reference=await font();await following.locator('span').click();await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='Following · Recent');
 assert.deepEqual(await font(),reference);assert.match(reference[0],/Arial/);assert.equal(reference[1],'12px');
 await page.locator('#xpls-sidebar .xpls-item').first().click();await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='AI experimentation');assert.deepEqual(await font(),reference);
 assert.equal(await label.evaluate(e=>getComputedStyle(e).textDecorationLine),'none');
 await following.locator('span').evaluate(e=>e.style.fontFamily='Arial');
 await page.waitForFunction(()=>document.querySelector('#xpls-sidebar .xpls-item[aria-current="page"]'));
 await page.mouse.move(1050,900);
 await page.screenshot({path:join(root, 'screenshots', 'list-view-preview.png')});
 await forYou.click();
 // Restore initial fixture view and clear request accounting for later checks.
 requests.length=0;
 });
 await check('one existing native chevron aligns beside text; no replacement icon or altered aria state',async()=>{
 await page.waitForFunction(()=>document.querySelector('[data-xpls-inline-sort]'));
 const geometry=await following.evaluate(e=>{const r=document.createRange();r.selectNodeContents(e.querySelector('span'));const a=r.getBoundingClientRect(),b=e.querySelector('svg').getBoundingClientRect();return{gap:b.left-a.right,delta:Math.abs(b.top+b.height/2-a.top-a.height/2)};});
 assert(geometry.gap>=3&&geometry.gap<=12,JSON.stringify(geometry));assert(geometry.delta<1,JSON.stringify(geometry));assert.equal(await following.locator('svg').count(),1);assert.equal(await trigger.getAttribute('aria-expanded'),'false');
 });
 await check('extra right-arrow is hidden without hiding the native sorting control',async()=>{assert.equal(await page.locator('#manage-timelines').isVisible(),false);assert.equal(await trigger.isVisible(),true);});
 await check('hover produces no custom or native popup and never activates Following',async()=>{
 await following.hover();await page.waitForTimeout(300);assert.equal(await page.locator('[role=menu]').count(),0);assert.equal(await following.getAttribute('aria-selected'),'false');assert.equal(requests.length,0);
 });
 await check('plain Following click reaches native handler and renders native Recent feed',async()=>{
 await following.locator('span').click();await page.waitForFunction(()=>document.querySelector('article h2').textContent.startsWith('Recent:'));assert.equal(requests.at(-1).variables.enableRanking,false);await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='Following · Recent');assert.equal(await label.textContent(),'Following · Recent');assert.equal(await page.evaluate(()=>window.lastClickTrusted),true);
 });
 await check('click opens only X’s native Sort by menu; native aria-expanded and Escape still work',async()=>{
 await trigger.click();assert.equal(await page.locator('[role=menu]').count(),1);assert.equal(await page.locator('#xpls-following-menu').count(),0);assert.equal(await menu.locator('.heading').textContent(),'Sort by');assert.equal(await trigger.getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await menu.count(),0);assert.equal(await trigger.getAttribute('aria-expanded'),'false');
 });
 await check('native Recent to Popular updates rendered posts with no extension wait or reload',async()=>{
 const count=requests.length;await choose('popular');assert.equal(requests.length,count+1);assert.equal(requests.at(-1).variables.enableRanking,true);assert(await page.evaluate(()=>window.startedAt-window.selectionAt<20));assert.equal(documentLoads,1);
 });
 await check('Following label reads Popular from native requests and omits sorting on other views',async()=>{
 await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='Following · Popular');
 await forYou.click();await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='For you');
 await following.locator('span').click();await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='Following · Popular');
 });
 await check('native Popular to Recent also updates immediately without reload',async()=>{
 await choose('recent');assert.equal(requests.at(-1).variables.enableRanking,false);assert(await page.evaluate(()=>window.startedAt-window.selectionAt<20));assert.equal(documentLoads,1);
 });
 await check('GET/XHR ranking and authentication pass through unchanged',async()=>{
 await page.evaluate(()=>window.transport='get');await choose('popular');assert.equal(requests.at(-1).method,'GET');assert.equal(requests.at(-1).headers.authorization,'Bearer fixture-token');assert.equal(requests.at(-1).variables.enableRanking,true);
 });
 await check('fetch body, ranking, features and credentials pass through unchanged',async()=>{
 await page.evaluate(()=>window.transport='fetch');await choose('recent');const r=requests.at(-1);assert.deepEqual(r.body,{variables:{enableRanking:false},features:{nativeFeature:true},queryId:'native-follow'});assert.equal(r.headers['x-csrf-token'],'fixture-csrf');
 });
 await check('Request-based fetch retains its native body and ranking',async()=>{
 await page.evaluate(()=>window.transport='request');await choose('popular');assert.equal(requests.at(-1).variables.enableRanking,true);assert.equal(requests.at(-1).body.features.nativeFeature,true);
 });
 await check('label follows the effective native request if another extension changes ranking',async()=>{
 await choose('recent');await page.evaluate(()=>window.forceRecent=true);
 await trigger.click();await menu.locator('[data-sort=popular]').click();
 await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='Following · Recent');
 assert.equal(requests.at(-1).variables.enableRanking,false);await page.evaluate(()=>window.forceRecent=false);
 });
 await check('old saved sorts and remount markers cannot override X or reload the page',async()=>{
 await page.evaluate(()=>{localStorage.setItem('xpls:following-sort:v1:99','popular');sessionStorage.setItem('xpls:following-remount:v1',JSON.stringify({viewer:'99',from:'old-page'}));});await page.reload();await label.waitFor();assert.equal(await following.getAttribute('aria-selected'),'false');assert.equal(await menu.count(),0);await following.locator('span').click();await page.waitForFunction(()=>document.querySelector('article h2').textContent.startsWith('Recent:'));assert.equal(requests.at(-1).variables.enableRanking,false);assert.equal(documentLoads,2);
 });
 await check('sort label is isolated by signed-in account and learns native checked menu state',async()=>{
 await context.addCookies([{name:'twid',value:'u%3D88',domain:'x.com',path:'/'}]);
 await forYou.click();
 await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='For you');
 await following.locator('span').click();await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='Following · Recent');
 await trigger.click();await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='Following · Recent');await page.keyboard.press('Escape');
 await context.addCookies([{name:'twid',value:'u%3D99',domain:'x.com',path:'/'}]);await forYou.click();await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='For you');await following.locator('span').click();await page.waitForFunction(()=>document.querySelector('#xpls-timeline-label').textContent==='Following · Recent');
 });
 await check('native cached choice closes its menu without forced refresh or extra request',async()=>{
 const count=requests.length;await trigger.click();await menu.locator('[data-sort=recent]').click();await page.waitForTimeout(100);assert.equal(requests.length,count);assert.equal(documentLoads,2);assert.equal(await menu.count(),0);
 });
 await check('composer drafts survive both native sort choices',async()=>{
 await page.locator('.tweet-box').evaluate(e=>e.insertAdjacentHTML('beforeend','<div contenteditable="true" data-testid="tweetTextarea_0">Draft to keep</div>'));await choose('popular');await choose('recent');assert.equal(await page.locator('[contenteditable]').textContent(),'Draft to keep');assert.equal(documentLoads,2);
 });
 await check('keyboard activates the native dropdown directly',async()=>{await trigger.focus();await page.keyboard.press('Enter');await menu.waitFor();assert.equal(await page.locator('[role=menu]').count(),1);await page.keyboard.press('Escape');});
 await check('native controls remain clickable after responsive resize and tab replacement',async()=>{
 await page.setViewportSize({width:1000,height:900});await page.evaluate(()=>{const e=document.querySelector('main nav');e.replaceWith(e.cloneNode(true));});await page.waitForFunction(()=>document.querySelector('[data-xpls-inline-sort]'));await trigger.click();await menu.waitFor();await page.keyboard.press('Escape');await page.setViewportSize({width:1100,height:1000});
 });
 // Capture the native-menu fixture for visual review, not a signed-in account.
 await page.locator('[contenteditable]').evaluate(e=>e.remove());await choose('popular');await page.screenshot({path:join(root, 'screenshots', 'timeline-preview.png')});await trigger.click();await page.screenshot({path:join(root, 'screenshots', 'timeline-dropdown-preview.png')});await page.keyboard.press('Escape');
 await check('disabling restores original native geometry and controls',async()=>{
 const id=createHash('sha256').update(extension).digest('hex').slice(0,32).replace(/[0-9a-f]/g,hex=>String.fromCharCode(97+parseInt(hex,16)));const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await popup.locator('#enabled:not([disabled])').waitFor();await popup.locator('#enabled').uncheck();await page.waitForFunction(()=>!document.querySelector('[data-xpls-inline-sort]'));assert.equal(await label.count(),0);assert.equal(await page.locator('#manage-timelines').isVisible(),true);assert.equal(await trigger.evaluate(e=>e.style.getPropertyValue('--xpls-sort-left')),'');await trigger.click();await menu.waitFor();await menu.locator('[data-sort=recent]').click();await page.waitForFunction(()=>document.querySelector('article h2').textContent.startsWith('Recent:'));assert.equal(requests.at(-1).variables.enableRanking,false);
 });
 await check('no runtime errors',async()=>assert.deepEqual(errors,[]));
 console.log(checks+' native timeline checks passed');
}finally{await context.close();await rm(profile,{recursive:true,force:true});}
