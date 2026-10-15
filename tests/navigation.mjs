import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),extension=join(root,'extension'),temp=await mkdtemp(join(tmpdir(),'xpls-prefs-'));
const context=await chromium.launchPersistentContext(temp,{channel:'chromium',headless:true,viewport:{width:1100,height:1100},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-features=BackForwardCache']});
let count=0;const check=async(name,run)=>{await run();count++;console.log('PASS '+name);};
const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
const base=await readFile(join(root,'tests/fixture.html'),'utf8');
const preferenceFixture=base.replace('</body>',`<style>.tweet-box button{float:right;min-height:36px;border:0;border-radius:999px;background:#1d9bf0;color:white;font:bold 14px Arial;padding:8px 18px;}.native-sort{background:transparent;color:inherit;border:0;cursor:pointer;}#native-menu{position:fixed;left:650px;top:70px;z-index:60;background:#202020;padding:8px;}#native-menu button{display:block;padding:10px;background:transparent;color:white;border:0;}</style><script>
window.nativeSort='recent';window.actions=[];
const tabs=()=>[...document.querySelectorAll('main nav [role=tab]')];
tabs()[1].innerHTML='<div><span>Following</span><button class="native-sort" aria-haspopup="menu" aria-label="Sort Following"><svg viewBox="0 0 12 12" width="12" height="12"><path d="m2 4 4 4 4-4" stroke="currentColor" fill="none"/></svg></button></div>';
tabs()[2].setAttribute('href','/i/lists/111');tabs()[3].setAttribute('href','/i/lists/222');
document.querySelector('.tweet-box').innerHTML='<div contenteditable="true" data-testid="tweetTextarea_0">Draft content</div><div data-testid="toolBar">What’s happening? · GIF</div><button data-testid="tweetButtonInline">Tweet</button>';
window.readFeed=()=>{const xhr=new XMLHttpRequest();xhr.open('POST','/i/api/graphql/native/HomeLatestTimeline');xhr.onload=()=>document.querySelector('article h2').textContent=JSON.parse(xhr.responseText).post;xhr.send(JSON.stringify({variables:{enableRanking:window.nativeSort==='popular'}}));};
document.addEventListener('click',event=>{
const tab=event.target.closest('[role=tab]');if(tab===tabs()[1]&&!event.target.closest('.native-sort'))window.readFeed();
if(event.target.closest('.native-sort')){document.getElementById('native-menu')?.remove();const menu=document.createElement('div');menu.id='native-menu';menu.setAttribute('role','menu');for(const[value,label]of[['popular','Popular'],['recent','Recent']]){const item=document.createElement('button');item.textContent=label;item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(window.nativeSort===value));item.onclick=()=>{window.nativeSort=value;window.actions.push(value);menu.remove();window.readFeed();};menu.append(item);}document.body.append(menu);}
});
</script></body>`);

const fixture=preferenceFixture.replace('</body>', `<script>
const feedRoot=document.querySelector('main');
for(let index=0;index<30;index++){const post=document.createElement('article');post.innerHTML='<h2>Post '+index+'</h2><p>Feed content with a stable position.</p><a href="/fixtureuser/status/'+index+'" data-thread-link>Open thread '+index+'</a>';feedRoot.append(post);}
const feedMarkup=feedRoot.innerHTML;
const feedTabs=()=>[...document.querySelectorAll('main nav [role=tab]')];
const countNative=()=>sessionStorage.setItem('fixture:native-actions',String(Number(sessionStorage.getItem('fixture:native-actions')||0)+1));
window.saveFeed=()=>{if(location.pathname.includes('/status/'))return;history.replaceState({...history.state,fixture:{tab:feedTabs().findIndex(tab=>tab.getAttribute('aria-selected')==='true'),sort:window.nativeSort,scroll:scrollY}},'',location.href);};
function showThread(){feedRoot.innerHTML='<button data-testid="app-bar-back">← Back</button><h1>Thread</h1><article style="height:1400px">Read this thread, then return to your feed.</article>';scrollTo(0,0);}
function showFeed(state){feedRoot.innerHTML=feedMarkup;window.nativeSort=state?.sort||'recent';const index=state?.tab??(location.pathname.includes('/i/lists/')?2:0);feedTabs().forEach((tab,i)=>tab.setAttribute('aria-selected',String(i===index)));document.getElementById('selection').textContent=feedTabs()[index].textContent;scrollTo(0,state?.scroll||0);}
document.addEventListener('click',event=>{
 const link=event.target.closest('[data-thread-link]');
 if(link){event.preventDefault();window.saveFeed();history.pushState({fixtureThread:true},'',link.getAttribute('href'));showThread();return;}
 if(event.target.closest('[data-testid="app-bar-back"]')){history.back();return;}
 if(event.target.closest('header nav a[href="/home"]')){event.preventDefault();window.saveFeed();if(location.pathname!=='/home')history.pushState({},'','/home');showFeed();return;}
 if(event.target.closest('main [role=tab], #native-menu [role=menuitemradio]')){countNative();scrollTo(0,0);window.saveFeed();}
});
// Headless Chromium does not dispatch browser keyboard accelerators. The fixture
// models the browser's history action; the extension never handles these keys.
addEventListener('keydown',event=>{if(event.altKey&&event.key==='ArrowLeft'){event.preventDefault();history.back();}});
// Native router hydration restores the saved entry after the browser's own
// document restoration, just as the delayed SPA renderer does below.
addEventListener('pageshow',()=>{if(history.state?.fixture&&!location.pathname.includes('/status/'))setTimeout(()=>scrollTo(0,history.state.fixture.scroll||0),100);});
addEventListener('popstate',()=>{setTimeout(()=>{if(location.pathname.includes('/status/'))showThread();else showFeed(history.state?.fixture);},80);});
if(location.pathname.includes('/status/'))showThread();else showFeed(history.state?.fixture);
</script></body>`);
try{
 await context.addCookies([{name:'twid',value:'u%3D99',domain:'x.com',path:'/'}]);
 await context.route(/https:\/\/x\.com\/.*/,route=>{const request=route.request();if(new URL(request.url()).pathname.includes('/i/api/'))return route.fulfill({json:{post:request.postDataJSON().variables.enableRanking?'Popular feed':'Recent feed'}});return route.fulfill({contentType:'text/html',body:fixture});});
 const page=await context.newPage();
 const select=()=>page.getByLabel('Home view',{exact:true}),label=()=>page.locator('#xpls-timeline-label');
 const tabs=()=>page.locator('main [role=tab]');
 const waitLabel=async value=>{await page.waitForFunction(value=>document.querySelector('#xpls-timeline-label')?.textContent===value,value);};
 const countActions=()=>page.evaluate(()=>Number(sessionStorage.getItem('fixture:native-actions')||0));
 const pin=async name=>{await page.locator('#xpls-sidebar .xpls-item').filter({hasText:name}).click();await waitLabel(name);};
 const sorting=async value=>{await tabs().nth(1).locator('span').click();await page.locator('.native-sort').click();await page.locator('#native-menu').getByText(value,{exact:true}).click();await waitLabel('Following · '+value);};
 await page.goto('https://x.com/home');await select().waitFor();await page.waitForFunction(()=>document.querySelector('#xpls-home-view')?.options.length===6);
 await check('fresh entry opens the configured Home default',async()=>{await select().selectOption({label:'Computer science'});await page.locator('header nav a[href="/home"]').click();await waitLabel('Computer science');await page.goto('https://x.com/home');await waitLabel('Computer science');});
 async function roundTrip(name,method='arrow'){
  await page.evaluate(()=>scrollTo(0,1050));const position=await page.evaluate(()=>scrollY);assert.ok(position>800);
  const before=await countActions();const target=await page.locator('[data-thread-link]').evaluateAll(elements=>{const element=elements.find(element=>{const rect=element.getBoundingClientRect();return rect.top>0&&rect.bottom<innerHeight;});const rect=element.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2};});await page.mouse.click(target.x,target.y);await page.waitForURL(/\/status\/\d+$/);await page.locator('[data-testid=app-bar-back]').waitFor();await page.waitForTimeout(550);
  if(method==='arrow')await page.locator('[data-testid=app-bar-back]').click();else if(method==='alt')await page.keyboard.press('Alt+ArrowLeft');else await page.goBack();
  await waitLabel(name);await page.waitForTimeout(650);assert.equal(await label().textContent(),name);assert.equal(await countActions(),before);assert.equal(await page.evaluate(()=>scrollY),position);assert.equal(await page.locator('#native-menu').count(),0);
 }
 await check('saving a new Home preference does not navigate or reset the current feed',async()=>{await tabs().nth(0).click();await waitLabel('For you');const before=await countActions();await select().selectOption('following:popular');await page.waitForTimeout(650);await waitLabel('For you');assert.equal(await countActions(),before);await select().selectOption({label:'Computer science'});await page.waitForTimeout(300);assert.equal(await countActions(),before);});
 await check('cross-tab Home preference sync preserves the open feed',async()=>{const before=await countActions();const other=await context.newPage();await other.goto('https://x.com/notifications');await other.getByLabel('Home view',{exact:true}).selectOption('following:recent');await page.waitForFunction(()=>document.querySelector('#xpls-home-view').value==='following:recent');await waitLabel('For you');assert.equal(await countActions(),before);await other.getByLabel('Home view',{exact:true}).selectOption({label:'Computer science'});await page.waitForFunction(()=>document.querySelector('#xpls-home-view').selectedOptions[0].textContent==='Computer science');await other.close();});
 await check('resize and account controls remount without reapplying the Home preference',async()=>{const before=await countActions();await page.setViewportSize({width:650,height:1100});await page.waitForTimeout(200);await page.setViewportSize({width:1100,height:1100});await select().waitFor();await waitLabel('For you');assert.equal(await countActions(),before);});
 await check('re-enabling the extension preserves the current feed',async()=>{const before=await countActions();const id=createHash('sha256').update(extension).digest('hex').slice(0,32).replace(/[0-9a-f]/g,h=>String.fromCharCode(97+parseInt(h,16)));const popup=await context.newPage();await popup.goto('chrome-extension://'+id+'/popup.html');await popup.locator('#enabled:not([disabled])').waitFor();await popup.locator('#enabled').uncheck();await page.waitForFunction(()=>!document.querySelector('#xpls-preferences'));await popup.locator('#enabled').check();await select().waitFor();await waitLabel('For you');assert.equal(await countActions(),before);await popup.close();});
 await check('thread Back preserves For you and its exact feed position instead of the saved list',async()=>{await tabs().nth(0).click();await waitLabel('For you');await roundTrip('For you');});
 await check('thread Back preserves Following Recent without a sort action',async()=>{await sorting('Recent');await roundTrip('Following · Recent');});
 await check('thread Back preserves Following Popular without a sort action',async()=>{await sorting('Popular');await roundTrip('Following · Popular');});
 await check('thread Back preserves a different pinned Home tab and scroll',async()=>{await pin('Artificial intelligence');await roundTrip('Artificial intelligence');});
 await check('thread Back preserves a name-only pinned list and scroll',async()=>{await pin('Computer science');await roundTrip('Computer science');});
 await check('browser Back preserves For you and scroll',async()=>{await tabs().nth(0).click();await waitLabel('For you');await roundTrip('For you','browser');});
 await check('Alt+Left preserves the current custom list and scroll',async()=>{await pin('AI experimentation');await roundTrip('AI experimentation','alt');});
 await check('Forward to the thread and Back again leave the feed unchanged',async()=>{const before=await countActions(),position=await page.evaluate(()=>scrollY);await page.goForward();await page.locator('[data-testid=app-bar-back]').waitFor();await page.goBack();await waitLabel('AI experimentation');await page.waitForTimeout(650);assert.equal(await countActions(),before);assert.equal(await page.evaluate(()=>scrollY),position);});
 await check('late profile metadata does not re-arm the default on a history return',async()=>{const before=await countActions();await page.locator('[data-testid=AppTabBar_Profile_Link]').evaluate(element=>{element.removeAttribute('href');setTimeout(()=>element.setAttribute('href','/fixtureuser'),100);});await page.waitForTimeout(700);assert.equal(await label().textContent(),'AI experimentation');assert.equal(await countActions(),before);});
 await check('native Back preserves a dedicated list URL and feed position',async()=>{await page.goto('https://x.com/i/lists/111');await waitLabel('AI experimentation');await roundTrip('AI experimentation');assert.equal(new URL(page.url()).pathname,'/i/lists/111');});
 await check('new-document browser history restores the feed without applying the Home default',async()=>{await page.goto('https://x.com/home');await waitLabel('Computer science');await tabs().nth(0).click();await waitLabel('For you');await page.evaluate(()=>{scrollTo(0,1100);window.saveFeed();});const before=await countActions();await page.goto('https://x.com/fixtureuser/status/88');await page.locator('[data-testid=app-bar-back]').waitFor();await page.goBack();await waitLabel('For you');await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation')[0].type),'back_forward');assert.equal(await countActions(),before);assert.equal(await page.evaluate(()=>scrollY),1100);});
 await check('refresh keeps the current Home tab and scroll rather than the configured default',async()=>{const before=await countActions();await page.evaluate(()=>window.saveFeed());await page.reload();await waitLabel('For you');await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation')[0].type),'reload');assert.equal(await countActions(),before);assert.equal(await page.evaluate(()=>scrollY),1100);assert.equal(await select().inputValue(),'list:'+JSON.stringify(['label:Computer science',0]));});
 await check('refresh of Following retains the current sort without invoking the default',async()=>{await sorting('Popular');await page.evaluate(()=>window.saveFeed());const before=await countActions();await page.reload();await select().waitFor();await page.waitForTimeout(650);assert.equal(await countActions(),before);await page.locator('.native-sort').click();await page.waitForFunction(()=>document.querySelector('#native-menu [aria-checked=true]')?.textContent==='Popular');await page.locator('#native-menu').evaluate(element=>element.remove());await page.waitForTimeout(650);assert.equal(await tabs().nth(1).getAttribute('aria-selected'),'true');assert.equal(await countActions(),before+1);});
 await check('refresh of a dedicated list preserves its URL and scroll',async()=>{await page.goto('https://x.com/i/lists/111');await waitLabel('AI experimentation');await page.evaluate(()=>{scrollTo(0,1100);window.saveFeed();});const before=await countActions();await page.reload();await waitLabel('AI experimentation');await page.waitForTimeout(650);assert.equal(new URL(page.url()).pathname,'/i/lists/111');assert.equal(await countActions(),before);assert.equal(await page.evaluate(()=>scrollY),1100);});
 await check('refresh of a thread keeps its URL and does not open Home',async()=>{await page.goto('https://x.com/fixtureuser/status/99');await page.reload();await page.locator('[data-testid=app-bar-back]').waitFor();await page.waitForTimeout(650);assert.equal(new URL(page.url()).pathname,'/fixtureuser/status/99');});
 await check('Home to a list replaces the native Home waypoint, keeping a single Back step',async()=>{await select().selectOption({label:'AI experimentation'});assert.equal(new URL(page.url()).pathname,'/fixtureuser/status/99');const length=await page.evaluate(()=>history.length);await page.locator('header nav a[href="/home"]').click();await page.waitForURL('https://x.com/i/lists/111');await waitLabel('AI experimentation');assert.equal(await page.evaluate(()=>history.length),length+1);await page.goBack();await page.locator('[data-testid=app-bar-back]').waitFor();assert.equal(new URL(page.url()).pathname,'/fixtureuser/status/99');await select().selectOption({label:'Computer science'});});
 await check('explicit Home click still opens the configured default through native SPA navigation',async()=>{await page.locator('header nav a[href="/home"]').click();await waitLabel('Computer science');assert.equal(new URL(page.url()).pathname,'/home');});
 await check('Home to a list from the existing Home page keeps the previous feed in history',async()=>{await tabs().nth(0).click();await waitLabel('For you');await page.evaluate(()=>{scrollTo(0,1100);window.saveFeed();});await select().selectOption({label:'AI experimentation'});await page.evaluate(()=>{scrollTo(0,1100);window.saveFeed();});const length=await page.evaluate(()=>history.length);const box=await page.locator('header nav a[href="/home"]').boundingBox();assert.ok(box.y>=0&&box.y<1100);await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.waitForURL('https://x.com/i/lists/111');await waitLabel('AI experimentation');assert.equal(await page.evaluate(()=>history.length),length+1);await page.goBack();await waitLabel('For you');await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>scrollY),1100);});
 await check('no browser errors and history remains owned by the native fixture',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(Object.keys(await page.evaluate(()=>history.state)),['fixture']);});
 console.log(count+' history and refresh checks passed');
}finally{await context.close();await rm(temp,{recursive:true,force:true});}
