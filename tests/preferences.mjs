import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),extension=join(root,'extension'),temp=await mkdtemp(join(tmpdir(),'xpls-prefs-'));
const context=await chromium.launchPersistentContext(temp,{channel:'chromium',headless:true,viewport:{width:1100,height:1100},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
let count=0;const check=async(name,run)=>{await run();count++;console.log('PASS '+name);};
const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
const base=await readFile(join(root,'tests/fixture.html'),'utf8');
const fixture=base.replace('</body>',`<style>.tweet-box button{float:right;min-height:36px;border:0;border-radius:999px;background:#1d9bf0;color:white;font:bold 14px Arial;padding:8px 18px;}.native-sort{background:transparent;color:inherit;border:0;cursor:pointer;}#native-menu{position:fixed;left:650px;top:70px;z-index:60;background:#202020;padding:8px;}#native-menu button{display:block;padding:10px;background:transparent;color:white;border:0;}</style><script>
window.nativeSort='recent';window.actions=[];
const tabs=()=>[...document.querySelectorAll('main nav [role=tab]')];
tabs()[1].innerHTML='<div><span>Following</span><button class="native-sort" aria-haspopup="menu" aria-label="Sort Following"><svg viewBox="0 0 12 12" width="12" height="12"><path d="m2 4 4 4 4-4" stroke="currentColor" fill="none"/></svg></button></div>';
tabs()[2].setAttribute('href','/i/lists/111');tabs()[3].setAttribute('href','/i/lists/222');
document.querySelector('.tweet-box').innerHTML='<div contenteditable="true" data-testid="tweetTextarea_0">Draft content</div><div data-testid="toolBar">What’s happening? · GIF</div><button data-testid="tweetButtonInline">Tweet</button>';
const nativeStateKey='fixture:native:'+document.cookie;const nativeState=JSON.parse(sessionStorage.getItem(nativeStateKey)||'null');if(nativeState){window.nativeSort=nativeState.sort;tabs().forEach((tab,index)=>tab.setAttribute('aria-selected',String(index===nativeState.tab)));document.getElementById('selection').textContent=tabs()[nativeState.tab].textContent;}
window.readFeed=()=>{const xhr=new XMLHttpRequest();xhr.open('POST','/i/api/graphql/native/HomeLatestTimeline');xhr.onload=()=>document.querySelector('article h2').textContent=JSON.parse(xhr.responseText).post;xhr.send(JSON.stringify({variables:{enableRanking:window.nativeSort==='popular'}}));};
document.addEventListener('click',event=>{
const tab=event.target.closest('[role=tab]');if(tab===tabs()[1]&&!event.target.closest('.native-sort'))window.readFeed();
if(event.target.closest('.native-sort')){document.getElementById('native-menu')?.remove();const menu=document.createElement('div');menu.id='native-menu';menu.setAttribute('role','menu');for(const[value,label]of[['popular','Popular'],['recent','Recent']]){const item=document.createElement('button');item.textContent=label;item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(window.nativeSort===value));item.onclick=()=>{window.nativeSort=value;window.actions.push(value);menu.remove();window.readFeed();};menu.append(item);}document.body.append(menu);}
if(event.target.closest('[role=tab], [role=menuitemradio]'))sessionStorage.setItem(nativeStateKey,JSON.stringify({tab:tabs().findIndex(tab=>tab.getAttribute('aria-selected')==='true'),sort:window.nativeSort}));
});
if(nativeState?.tab===1)window.readFeed();
</script></body>`);
try{
 await context.addCookies([{name:'twid',value:'u%3D99',domain:'x.com',path:'/'},{name:'twid',value:'u%3D99',domain:'twitter.com',path:'/'}]);
 const requests=[];
 await context.route(/https:\/\/(?:x|twitter)\.com\/.*/,route=>{const req=route.request(),url=new URL(req.url());if(url.pathname.includes('/i/api/')){const v=req.postDataJSON().variables;requests.push(v);return route.fulfill({json:{post:v.enableRanking?'Popular feed':'Recent feed'}});}return route.fulfill({contentType:'text/html',body:fixture});});
 const page=await context.newPage();await page.goto('https://x.com/home');const prefs=page.locator('#xpls-preferences'),select=page.getByLabel('Home view',{exact:true}),minimal=page.getByRole('switch',{name:'Minimal UI'});
 const native=page.locator('main [role=tab]');
 const chooseHome=async value=>{await select.selectOption(value);if(/^\/(?:home\/?)?$/.test(new URL(page.url()).pathname))await page.locator('header nav a[href="/home"]').click();};
 const settled=async name=>{await page.waitForFunction(name=>document.querySelector('#xpls-timeline-label')?.textContent===name,name);};
 await check('compact account-footer controls match native text style and contain every pin',async()=>{
 await prefs.waitFor();await page.waitForFunction(()=>document.querySelector('#xpls-home-view')?.options.length===6);assert.equal(await prefs.evaluate(e=>e.nextElementSibling.dataset.testid),'SideNav_AccountSwitcher_Button');assert.equal(await select.locator('option').count(),6);
 assert.deepEqual((await select.locator('option').allTextContents()).slice(0,3),['For you','Following: popular','Following: recent']);
 assert.equal(await prefs.evaluate(e=>getComputedStyle(e).fontFamily),await page.locator('header nav span').first().evaluate(e=>getComputedStyle(e).fontFamily));
 assert.equal(await minimal.isChecked(),false);
 });
 await check('choosing Following popular uses the native menu and updates the actual feed',async()=>{
 await chooseHome('following:popular');await settled('Following · Popular');await page.waitForFunction(()=>document.querySelector('article h2').textContent==='Popular feed');assert.equal(await page.locator('#native-menu').count(),0);assert.equal(requests.at(-1).enableRanking,true);
 });
 await check('Following default survives refresh and native manual sort changes remain available',async()=>{
 await page.reload();await settled('Following · Popular');assert.equal(await select.inputValue(),'following:popular');await page.locator('.native-sort').click();await page.locator('#native-menu').getByText('Recent',{exact:true}).click();await settled('Following · Recent');assert.equal(await select.inputValue(),'following:popular');
 });
 await check('clicking Home reapplies the configured default without replacing manual tab controls',async()=>{
 await native.nth(0).click();await settled('For you');await page.locator('header nav a[href="/home"]').click();await settled('Following · Popular');
 });
 await check('Following recent and For you defaults also survive refresh',async()=>{
 await chooseHome('following:recent');await settled('Following · Recent');await page.reload();await settled('Following · Recent');await chooseHome('for-you');await settled('For you');await page.reload();await settled('For you');
 });
 await check('a late native tab restoration cannot override fresh Home entry; manual tab choices still win',async()=>{
 await page.goto('https://x.com/home');await settled('For you');
 await page.evaluate(()=>document.querySelectorAll('main [role=tab]')[1].click());await settled('For you');
 await native.nth(1).locator('span').click();await settled('Following · Recent');assert.equal(await select.inputValue(),'for-you');await chooseHome('following:recent');await chooseHome('for-you');await settled('For you');
 });
 await check('Minimal UI hides post controls and keeps pins, account and draft DOM',async()=>{
 const before=await page.locator('[contenteditable]').textContent();await minimal.check();await page.waitForFunction(()=>document.querySelector('[data-xpls-minimal-hidden]'));await page.locator('#xpls-sidebar .xpls-item').nth(2).waitFor();
 assert.equal(await page.locator('[data-testid=SideNav_NewTweet_Button]').isVisible(),false);assert.equal(await page.locator('.tweet-box').isVisible(),false);assert.equal(await page.locator('#xpls-sidebar .xpls-item').count(),3);assert.equal(await page.locator('[data-testid=SideNav_AccountSwitcher_Button]').isVisible(),true);assert.equal(await page.locator('[contenteditable]').textContent(),before);
 });
 await check('Minimal UI survives refresh and turning it off restores native controls and drafts',async()=>{
 await page.reload();await prefs.waitFor();await page.waitForFunction(()=>document.documentElement.dataset.xplsMinimal==='true');assert.equal(await minimal.isChecked(),true);assert.equal(await page.locator('.tweet-box').isVisible(),false);await minimal.uncheck();await page.waitForFunction(()=>!document.querySelector('[data-xpls-minimal-hidden]'));assert.equal(await page.locator('.tweet-box').isVisible(),true);assert.equal(await page.locator('[contenteditable]').textContent(),'Draft content');
 });
 await check('Minimal UI keeps the pinned sidebar functional on non-Home views',async()=>{
 await minimal.check();await page.goto('https://x.com/notifications');await prefs.waitFor();await page.locator('#xpls-sidebar').waitFor();assert.equal(await page.locator('#xpls-sidebar .xpls-item').count(),3);assert.equal(await page.locator('[data-testid=SideNav_NewTweet_Button]').isVisible(),false);assert.equal(await page.locator('.tweet-box').isVisible(),true);
 });
 await check('an explicit profile refresh stays on the profile; Home applies the default',async()=>{
 await page.goto('https://x.com/fixtureuser');await prefs.waitFor();await chooseHome('following:popular');assert.equal(page.url(),'https://x.com/fixtureuser');await page.reload();await prefs.waitFor();assert.equal(page.url(),'https://x.com/fixtureuser');await page.locator('header nav a[href="/home"]').click();await settled('Following · Popular');
 });
 await check('Home default also applies during native SPA navigation without a page reload',async()=>{
 await page.goto('https://x.com/fixtureuser');await prefs.waitFor();
 await page.evaluate(()=>document.querySelector('header nav a[href="/home"]').addEventListener('click',event=>{event.preventDefault();history.pushState({},'', '/home');document.querySelectorAll('main [role=tab]').forEach((tab,index)=>tab.setAttribute('aria-selected',String(index===0)));}));
 await page.locator('header nav a[href="/home"]').click();await settled('Following · Popular');assert.equal(page.url(),'https://x.com/home');
 });
 await check('an ID-based pinned Home view loads directly and survives refresh',async()=>{
 const option=await select.locator('option').filter({hasText:'AI experimentation'}).getAttribute('value');await chooseHome(option);await page.waitForURL('https://x.com/i/lists/111');await prefs.waitFor();await page.reload();await prefs.waitFor();assert.equal(page.url(),'https://x.com/i/lists/111');await page.goto('https://x.com/home');await page.waitForURL('https://x.com/i/lists/111');
 });
 await check('bare domain entry respects the selected pinned Home view',async()=>{
 await page.goto('https://x.com/');await page.waitForURL('https://x.com/i/lists/111');await prefs.waitFor();
 });
 await check('name-only pins can be opened as the default through their native Home tab',async()=>{
 const option=await select.locator('option').filter({hasText:'Computer science'}).getAttribute('value');await chooseHome(option);await page.goto('https://x.com/home');await settled('Computer science');assert.equal(page.url(),'https://x.com/home');
 });
 await check('ordinary sidebar navigation is not overridden by a Home default',async()=>{
 await page.goto('https://x.com/notifications');await prefs.waitFor();await chooseHome('following:popular');await page.locator('#xpls-sidebar .xpls-item').filter({hasText:'Computer science'}).click();await settled('Computer science');await page.waitForFunction(()=>!sessionStorage.getItem('xpls:open-pinned-list:v1'));
 });
 await check('controls collapse with the icon sidebar and restore their saved settings on desktop',async()=>{
 await page.setViewportSize({width:650,height:1100});await page.waitForFunction(()=>!document.getElementById('xpls-preferences'));await page.setViewportSize({width:1100,height:1100});await prefs.waitFor();assert.equal(await minimal.isChecked(),true);assert.equal(await select.inputValue(),'following:popular');
 });
 await check('preferences are account-scoped and malformed saved values fall back safely',async()=>{
 await page.evaluate(()=>localStorage.setItem('xpls:sidebar-preferences:v1:88','{"home":{"kind":"list","href":"https://evil.example"},"minimal":"yes"}'));
 await context.addCookies([{name:'twid',value:'u%3D88',domain:'x.com',path:'/'}]);await page.reload();await prefs.waitFor();assert.equal(await select.inputValue(),'for-you');assert.equal(await minimal.isChecked(),false);await context.addCookies([{name:'twid',value:'u%3D99',domain:'x.com',path:'/'}]);await page.goto('https://x.com/');await settled('Following · Popular');assert.equal(await minimal.isChecked(),true);
 });
 await check('preferences synchronize between tabs without affecting saved pin order or emoji',async()=>{
 await page.locator('.native-sort').click();await page.locator('#native-menu').getByText('Recent',{exact:true}).click();await settled('Following · Recent');
 const before=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('xpls:pinned-'))));const other=await context.newPage();await other.goto('https://x.com/notifications');await other.locator('#xpls-preferences').waitFor();await other.getByRole('switch',{name:'Minimal UI'}).uncheck();await page.waitForFunction(()=>!document.documentElement.dataset.xplsMinimal);assert.equal(await page.locator('#xpls-timeline-label').textContent(),'Following · Recent');assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('xpls:pinned-')))),before);await other.close();
 });
 await check('disabled extension restores both post controls and native behavior; saved choices remain',async()=>{
 const id=createHash('sha256').update(extension).digest('hex').slice(0,32).replace(/[0-9a-f]/g,h=>String.fromCharCode(97+parseInt(h,16)));const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await popup.locator('#enabled:not([disabled])').waitFor();await popup.locator('#enabled').uncheck();await page.waitForFunction(()=>!document.getElementById('xpls-preferences'));assert.equal(await page.locator('.tweet-box').isVisible(),true);assert.equal(await page.locator('[data-testid=SideNav_NewTweet_Button]').isVisible(),true);await page.reload();assert.equal(await prefs.count(),0);await popup.locator('#enabled').check();await prefs.waitFor();await settled('Following · Recent');await popup.close();
 });
 await check('legacy twitter.com supports the same controls and native default sort',async()=>{
 await page.goto('https://twitter.com/home');await prefs.waitFor();await chooseHome('following:recent');await settled('Following · Recent');await page.reload();await settled('Following · Recent');
 });
 await check('no browser runtime errors',async()=>assert.deepEqual(errors,[]));
 await page.goto('https://x.com/home');await settled('Following · Recent');await page.locator('#xpls-sidebar .xpls-item').first().waitFor();await page.waitForFunction(()=>document.querySelector('#xpls-home-view')?.options.length===6);await page.locator('[contenteditable]').evaluate(e=>e.textContent="What's happening?");await page.screenshot({path:join(root, 'screenshots', 'sidebar-preferences-preview.png')});await minimal.check();await page.waitForFunction(()=>document.documentElement.dataset.xplsMinimal==='true');await page.screenshot({path:join(root, 'screenshots', 'minimal-ui-preview.png')});
 console.log(count+' preferences checks passed');
}finally{await context.close();await rm(temp,{recursive:true,force:true});}
