import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),extension=join(root,'extension'),temp=await mkdtemp(join(tmpdir(),'xpls-cold-start-'));
const base=await readFile(join(root,'tests/fixture.html'),'utf8');
const errors=[];let count=0,context,page;
const check=async(name,run)=>{await run();count++;console.log('PASS '+name);};
const fixture=base.replace('</body>',`<style>
.native-sort{border:0;background:transparent;color:inherit;cursor:pointer;padding:4px;}#right-sidebar{position:fixed;top:15px;right:15px;width:220px;color:#e7e9ea;font:14px Arial;}#right-sidebar form{border:1px solid #536471;padding:10px;border-radius:24px;display:flex;gap:5px;}#right-sidebar input{background:none;border:0;color:inherit;width:150px;min-width:0;outline:0;}#right-sidebar button{background:none;color:inherit;border:0;cursor:pointer;}#right-sidebar .module{padding:16px;margin-top:12px;border:1px solid #2f3336;border-radius:12px;}#search-suggestions{padding:15px;background:#202020;border-radius:12px;}
[data-native-account-trigger]{cursor:pointer;}#account-menu{position:fixed;left:80px;top:20px;background:#202020;padding:20px;border-radius:12px;z-index:90;}
</style><aside id="right-sidebar" data-testid="sidebarColumn"><div class="shared-right-wrapper"><div class="search-and-ad"><form role="search"><input data-testid="SearchBox_Search_Input" aria-label="Search" aria-controls="search-suggestions" placeholder="Search"><button type="button" aria-label="Clear search">×</button></form><div id="search-ad" class="module">Advertisement below search</div></div><div id="suggestion-mount"></div><section id="trends" class="module">Trends for you</section><section id="who-to-follow" class="module">Who to follow</section><section id="subscribe" class="module">Subscribe</section><div id="profile-media" class="module">Profile media gallery</div><footer id="right-footer" class="module">Terms and links</footer></div></aside><script>
window.accountClicks=0;window.accountPointerDowns=0;
const account=document.querySelector('[data-testid=SideNav_AccountSwitcher_Button]');
const trigger=document.createElement('div');trigger.setAttribute('role','button');trigger.tabIndex=0;trigger.dataset.nativeAccountTrigger='';
const inner=document.createElement('div');inner.className='native-account-column';account.before(trigger);trigger.append(inner);inner.append(account);
trigger.addEventListener('pointerdown',event=>{window.accountPointerDowns++;event.preventDefault();},true);
trigger.addEventListener('click',event=>{window.accountClicks++;event.preventDefault();const current=document.getElementById('account-menu');if(current)current.remove();else{const menu=document.createElement('div');menu.id='account-menu';menu.textContent='Add an existing account · Log out';document.body.append(menu);}},true);
const tabs=()=>[...document.querySelectorAll('main nav [role=tab]')];
tabs()[1].innerHTML='<div><span>Following</span><button class="native-sort" aria-haspopup="menu" aria-label="Sort Following"><svg width="12" height="12" viewBox="0 0 12 12"><path d="m2 4 4 4 4-4" stroke="currentColor" fill="none"/></svg></button></div>';
tabs()[2].setAttribute('href','/i/lists/111');tabs()[3].setAttribute('href','/i/lists/222');
const pins=tabs().slice(2).map(tab=>tab.parentElement);if(/^\\/(?:home)?$/.test(location.pathname)){const list=document.querySelector('main [role=tablist]');pins.forEach(pin=>pin.remove());setTimeout(()=>pins.forEach(pin=>list.append(pin)),750);}
window.nativeSort='recent';
function read(){const xhr=new XMLHttpRequest();xhr.open('POST','/i/api/graphql/native/HomeLatestTimeline');xhr.send(JSON.stringify({variables:{enableRanking:window.nativeSort==='popular'}}));}
document.addEventListener('click',event=>{if(event.target.closest('.native-sort')){const menu=document.createElement('div');menu.id='native-sort-menu';menu.setAttribute('role','menu');for(const[value,label]of[['popular','Popular'],['recent','Recent']]){const item=document.createElement('button');item.textContent=label;item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(window.nativeSort===value));item.onclick=()=>{window.nativeSort=value;menu.remove();read();};menu.append(item);}document.body.append(menu);}else if(event.target.closest('[role=tab]')===tabs()[1])read();});
const input=document.querySelector('[aria-label=Search]');input.addEventListener('input',()=>{const mount=document.getElementById('suggestion-mount');mount.innerHTML='<div id="search-suggestions" role="listbox" data-testid="typeaheadDropdown"><div role="option">'+(input.value?'Search results':'Recent searches')+'</div></div>';});
document.querySelector('[aria-label="Clear search"]').onclick=()=>{input.value='';input.dispatchEvent(new Event('input'));input.focus();};
</script></body>`);
async function launch(){
 context=await chromium.launchPersistentContext(temp,{channel:'chromium',headless:true,viewport:{width:1440,height:1150},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.route(/https:\/\/(?:www\.)?(?:x|twitter)\.com\/.*/,route=>new URL(route.request().url()).pathname.startsWith('/i/api/')?route.fulfill({json:{data:{}}}):route.fulfill({contentType:'text/html',body:fixture}));
 page=await context.newPage();
}
const prefs=()=>page.locator('#xpls-preferences'),select=()=>page.getByLabel('Home view',{exact:true}),minimal=()=>page.getByRole('switch',{name:'Minimal UI',exact:true});
const label=async name=>page.waitForFunction(name=>document.querySelector('#xpls-timeline-label')?.textContent===name,name);
const id=createHash('sha256').update(extension).digest('hex').slice(0,32).replace(/[0-9a-f]/g,h=>String.fromCharCode(97+parseInt(h,16)));
async function stored(){const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);const value=await popup.evaluate(()=>chrome.storage.local.get('xpls:sidebar-preferences:v2:99'));await popup.close();return value['xpls:sidebar-preferences:v2:99'];}
try{
 await launch();await context.addCookies(['x.com','twitter.com'].map(domain=>({name:'twid',value:'u%3D99',domain,path:'/',expires:Math.floor(Date.now()/1000)+86400})));
 await context.addInitScript(()=>{if(location.protocol!=='https:'||!['x.com','twitter.com'].includes(location.hostname))return;if(!localStorage.getItem('fixture:seeded')){localStorage.setItem('fixture:seeded','yes');localStorage.setItem('xpls:sidebar-preferences:v1:99',JSON.stringify({home:{kind:'list',key:JSON.stringify(['label:Computer science',0]),label:'Computer science',href:null},minimal:false}));}});
 await check('old site-only preferences migrate without touching pin order or emoji',async()=>{
 await page.goto('https://x.com/notifications');await prefs().waitFor();const saved=await stored();assert.equal(saved.home.label,'Computer science');assert.equal(saved.uid,'99');
 });
 await check('cold Home entry waits for delayed name-only pins instead of declaring them unpinned',async()=>{
 await page.goto('https://x.com/home');await prefs().waitFor();await page.waitForTimeout(150);assert.doesNotMatch(await prefs().textContent(),/no longer pinned|Unavailable/);await label('Computer science');
 });
 await check('preferences sit outside the entire native account Pressable and receive real pointer clicks',async()=>{
 assert.equal(await prefs().evaluate(node=>node.closest('[data-native-account-trigger]')),null);assert.equal(await prefs().evaluate(node=>node.nextElementSibling.hasAttribute('data-native-account-trigger')),true);
 const box=await minimal().boundingBox();assert.equal(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('#xpls-preferences'),{x:box.x+box.width/2,y:box.y+box.height/2}),true);
 await minimal().click();await page.waitForFunction(()=>document.documentElement.dataset.xplsMinimal==='true');assert.equal(await page.evaluate(()=>window.accountClicks),0);assert.equal(await page.evaluate(()=>window.accountPointerDowns),0);assert.equal(await page.locator('#account-menu').count(),0);
 });
 await check('keyboard switches do not trigger the account menu and the account button still works',async()=>{
 await minimal().focus();await page.keyboard.press('Space');await page.waitForFunction(()=>!document.documentElement.dataset.xplsMinimal);await page.keyboard.press('Space');await page.waitForFunction(()=>document.documentElement.dataset.xplsMinimal==='true');assert.equal(await page.evaluate(()=>window.accountClicks),0);
 await page.locator('[data-testid=SideNav_AccountSwitcher_Button]').click();assert.equal(await page.locator('#account-menu').count(),1);await page.locator('[data-testid=SideNav_AccountSwitcher_Button]').click();assert.equal(await page.locator('#account-menu').count(),0);
 });
 await check('the single Minimal UI switch hides every non-search module, including siblings in shared wrappers',async()=>{
 assert.equal(await page.getByRole('switch').count(),1);await page.waitForFunction(()=>document.querySelector('[data-xpls-right-hidden]'));
 for(const name of ['search-ad','trends','who-to-follow','subscribe','profile-media','right-footer'])assert.equal(await page.locator('#'+name).isVisible(),false,name);
 assert.equal(await page.getByRole('search').isVisible(),true);assert.equal(await page.getByRole('button',{name:'Clear search'}).isVisible(),true);assert.equal(await page.locator('article').first().isVisible(),true);
 });
 await check('search input, clear action, suggestions and recent searches remain usable',async()=>{
 await page.getByRole('textbox',{name:'Search',exact:true}).fill('linux');await page.getByRole('listbox').waitFor();assert.equal(await page.getByRole('listbox').getByRole('option').isVisible(),true);await page.getByRole('button',{name:'Clear search'}).click();assert.equal(await page.getByRole('textbox',{name:'Search',exact:true}).inputValue(),'');assert.equal(await page.getByText('Recent searches',{exact:true}).isVisible(),true);
 });
 await check('new sidebar modules are hidden while search portals remain visible',async()=>{
 await page.evaluate(()=>{const module=document.createElement('section');module.id='late-module';module.textContent='New recommendation';document.querySelector('[data-testid=sidebarColumn]').append(module);const portal=document.createElement('div');portal.id='search-portal';portal.setAttribute('role','listbox');portal.textContent='Search portal results';document.body.append(portal);});await page.waitForFunction(()=>document.querySelector('#late-module').hasAttribute('data-xpls-right-hidden'));assert.equal(await page.locator('#search-portal').isVisible(),true);
 });
 await check('turning Minimal UI off restores both post controls and sidebar extras without changing the feed',async()=>{
 await minimal().click();await page.waitForFunction(()=>!document.querySelector('[data-xpls-right-hidden]'));assert.equal(await page.locator('#trends').isVisible(),true);assert.equal(await page.locator('.tweet-box').isVisible(),true);assert.equal(await page.locator('[data-testid=SideNav_NewTweet_Button]').isVisible(),true);await label('Computer science');await minimal().click();
 });
 await check('Home defaults survive clearing site storage and an actual browser-profile restart',async()=>{
 await page.evaluate(()=>localStorage.clear());await context.close();await launch();await page.goto('https://x.com/');await label('Computer science');assert.equal(await minimal().isChecked(),true);assert.equal(await page.locator('#account-menu').count(),0);
 });
 await check('the same default and UI flags are restored on twitter.com after restart',async()=>{
 await context.close();await launch();await page.goto('https://twitter.com/');await label('Computer science');assert.equal(await minimal().isChecked(),true);
 });
 await check('an ID-based Home list starts before account and pinned-catalog discovery',async()=>{
 await page.waitForFunction(()=>document.querySelector('#xpls-home-view')?.options.length===6);const value=await select().locator('option').filter({hasText:'AI experimentation'}).getAttribute('value');await select().selectOption(value);await page.locator('header nav a[href="/home"]').click();await page.waitForURL('https://twitter.com/i/lists/111');await prefs().waitFor();await page.evaluate(()=>localStorage.clear());await context.close();await launch();await page.goto('https://x.com/');await page.waitForURL('https://x.com/i/lists/111');await prefs().waitFor();assert.equal((await stored()).home.href,'/i/lists/111');
 });
 await check('Following defaults are also shared across origins and fresh browser sessions',async()=>{
 await select().selectOption('following:recent');await context.close();await launch();await page.goto('https://twitter.com/');await label('Following · Recent');assert.equal(await select().inputValue(),'following:recent');
 });
 await check('another signed-in account cannot inherit a stored Home list or UI flags',async()=>{
 await context.addCookies([{name:'twid',value:'u%3D88',domain:'twitter.com',path:'/'}]);await page.reload();await prefs().waitFor();await label('For you');assert.equal(await minimal().isChecked(),false);await context.addCookies([{name:'twid',value:'u%3D99',domain:'twitter.com',path:'/'}]);await page.goto('https://twitter.com/home');await label('Following · Recent');assert.equal(await minimal().isChecked(),true);
 });
 await check('disabling restores both sidebars and preserves search state',async()=>{
 await page.getByRole('textbox',{name:'Search',exact:true}).fill('saved search');const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await popup.locator('#enabled:not([disabled])').waitFor();await popup.locator('#enabled').uncheck();await page.waitForFunction(()=>!document.querySelector('[data-xpls-right-hidden], [data-xpls-minimal-hidden]'));assert.equal(await page.locator('#trends').isVisible(),true);assert.equal(await page.getByRole('textbox',{name:'Search',exact:true}).inputValue(),'saved search');await popup.locator('#enabled').check();await prefs().waitFor();await page.waitForFunction(()=>document.querySelector('[data-xpls-right-hidden]'));await popup.close();
 });
 await check('no browser runtime errors across restarts',async()=>assert.deepEqual(errors,[]));
 await page.locator('#xpls-sidebar .xpls-item').first().waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('#xpls-sidebar .xpls-item').length===3);
 await page.mouse.move(1400,1080);await page.screenshot({path:join(root, 'screenshots', 'search-only-sidebar-preview.png')});
 console.log(count+' startup/account/search regression checks passed');
}finally{await context?.close();await rm(temp,{recursive:true,force:true});}
