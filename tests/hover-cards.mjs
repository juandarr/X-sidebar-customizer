import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),extension=join(root,'extension'),temp=await mkdtemp(join(tmpdir(),'xpls-hover-'));
const context=await chromium.launchPersistentContext(temp,{channel:'chromium',headless:true,viewport:{width:1100,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
const base=await readFile(join(root,'tests/fixture.html'),'utf8');
const fixture=base.replace('</body>',`<style>#username{position:fixed;left:380px;top:180px;z-index:4;color:#1d9bf0;}[data-testid=HoverCard]{position:fixed;left:380px;top:240px;width:300px;height:270px;z-index:10;background:#202327;border-radius:16px;padding:16px;}[data-testid=HoverCard] a{color:inherit;}#follow-area{display:flex;justify-content:space-between;}#follow-area button{height:36px;}#bio{margin-top:50px;}#outside{position:fixed;right:10px;bottom:10px;}</style><a id="username" href="/alice">Alice · @alice</a><button id="outside">Outside</button><script>
const username=document.getElementById('username');window.nativeClicks=0;
window.showCard=()=>{
 document.querySelector('[data-testid=HoverCard]')?.remove();
 const card=document.createElement('div');card.dataset.testid='HoverCard';card.innerHTML='<div id="follow-area"><a href="/alice" id="avatar"><div data-testid="UserAvatar-Container-alice">Avatar</div></a><button data-testid="123-unfollow">Following</button></div><div data-testid="User-Name"><a href="/alice">@alice</a></div><p id="bio">Bio with <a id="bio-link" href="/alice">a profile link</a></p><span id="stats">123 Following · 456 Followers</span>';
 const owner={state:{isCardHovered:false,isAnchorActive:true},setState(value){Object.assign(this.state,value);if(!this.state.isCardHovered&&!this.state.isAnchorActive)card.remove();},_clearAnchorTimers(){clearTimeout(this.anchorTimer);},_clearCardTimers(){clearTimeout(this.cardTimer);},_clearHover(){this.setState({isCardHovered:false});},_handleDismiss(){this.setState({isCardHovered:false,isAnchorActive:false});},_handleCardHoverOut(){this.cardTimer=setTimeout(()=>this._clearHover(),60);}};
 owner.originalClear=owner._clearHover;owner.originalDismiss=owner._handleDismiss;
 card.__reactFiber$fixture={stateNode:null,return:{stateNode:owner}};window.owner=owner;
 card.addEventListener('mouseover',()=>owner.setState({isCardHovered:true}));
 // Reproduce a portal/controller regression: leaving any child schedules close.
 card.addEventListener('mouseout',()=>owner._handleCardHoverOut());
 card.querySelector('[data-testid="123-unfollow"]').onclick=()=>window.nativeClicks++;
 card.querySelector('#bio-link').onclick=event=>{event.preventDefault();window.nativeClicks++;history.pushState({},'','/alice');owner._handleDismiss();};
 document.body.append(card);
};
username.addEventListener('mouseover',()=>{if(!document.querySelector('[data-testid=HoverCard]'))window.showCard();else{window.owner._clearAnchorTimers();window.owner.setState({isAnchorActive:true});}});
username.addEventListener('mouseout',()=>{const owner=window.owner;if(owner){const close=owner._clearHover;owner.anchorTimer=setTimeout(()=>{owner.setState({isAnchorActive:false});close.call(owner);},160);}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')window.owner?._handleDismiss();});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('[data-testid=HoverCard],#username,#xpls-list-picker'))window.owner?._handleDismiss();});
</script></body>`);
let count=0;const check=async(name,run)=>{await run();console.log('PASS '+name);count++;};
try{
 await context.addCookies([{name:'twid',value:'u%3D99',domain:'x.com',path:'/'}]);
 await context.route('https://x.com/**',route=>route.fulfill({contentType:'text/html',body:fixture}));
 const page=await context.newPage();await page.goto('https://x.com/home');await page.waitForFunction(()=>document.documentElement.dataset.xplsHoverEnabled==='true');
 const card=page.locator('[data-testid=HoverCard]');
 const enter=async()=>{await page.locator('#username').hover();await card.waitFor();await page.mouse.move(400,220);await page.waitForTimeout(15);await page.mouse.move(450,430);};
 await check('entering the card survives an already pending username-leave timer',async()=>{await enter();await page.waitForTimeout(240);assert.equal(await card.isVisible(),true);assert.equal(await card.getAttribute('data-xpls-card-pinned'),null);assert.equal(await page.locator('#xpls-list-picker').count(),0);});
 await check('moving through avatar, Follow, bio, stats and the list action keeps the real card open',async()=>{for(const selector of ['#avatar','[data-testid="123-unfollow"]','#bio-link','#stats','.xpls-manage-link']){await card.locator(selector).hover();await page.waitForTimeout(150);assert.equal(await card.isVisible(),true,selector);}});
 await check('native Follow actions remain clickable',async()=>{await card.locator('[data-testid="123-unfollow"]').click();assert.equal(await page.evaluate(()=>window.nativeClicks),1);});
 await check('profile links can navigate and dismiss through the native controller',async()=>{await card.locator('#bio-link').click();assert.equal(await page.evaluate(()=>window.nativeClicks),2);await card.waitFor({state:'detached'});assert.equal(new URL(page.url()).pathname,'/alice');await page.goBack();await page.waitForURL('https://x.com/home');await enter();});
 await check('a stale native dismiss callback cannot close a card under the pointer',async()=>{await page.evaluate(()=>window.owner._handleDismiss());await page.waitForTimeout(100);assert.equal(await card.isVisible(),true);});
 await check('leaving both username and card dismisses normally and restores native methods',async()=>{await page.mouse.move(1000,900);await card.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.owner._clearHover===window.owner.originalClear&&window.owner._handleDismiss===window.owner.originalDismiss),true);});
 await check('returning from the card to the username preserves its native grace period',async()=>{await enter();await page.locator('#username').hover();await page.waitForTimeout(220);assert.equal(await card.isVisible(),true);await page.mouse.move(450,430);await page.waitForTimeout(150);assert.equal(await card.isVisible(),true);});
 await check('Escape still reaches the native dismissal handler while the card is hovered',async()=>{await page.keyboard.press('Escape');await card.waitFor({state:'detached'});});
 await check('an outside click still dismisses through the native handler',async()=>{await enter();await page.locator('#outside').click();await card.waitFor({state:'detached'});});
 await check('window focus loss restores native dismissal',async()=>{await enter();await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.owner._handleDismiss();});await card.waitFor({state:'detached'});});
 await check('removing a card restores its old controller without touching the replacement',async()=>{await enter();await page.evaluate(()=>{window.oldOwner=window.owner;window.showCard();});await page.mouse.move(460,440);await page.waitForTimeout(160);assert.equal(await page.evaluate(()=>window.oldOwner._clearHover===window.oldOwner.originalClear),true);assert.equal(await card.isVisible(),true);});
 await check('disabling restores native methods and removes hover protection',async()=>{const id=createHash('sha256').update(extension).digest('hex').slice(0,32).replace(/[0-9a-f]/g,value=>String.fromCharCode(97+parseInt(value,16)));const popup=await context.newPage();await popup.goto('chrome-extension://'+id+'/popup.html');await popup.locator('#enabled:not([disabled])').waitFor();await popup.locator('#enabled').uncheck();await page.waitForFunction(()=>!document.documentElement.dataset.xplsHoverEnabled);assert.equal(await page.evaluate(()=>window.owner._clearHover===window.owner.originalClear),true);await page.evaluate(()=>window.owner._handleDismiss());await card.waitFor({state:'detached'});await popup.locator('#enabled').check();await page.waitForFunction(()=>document.documentElement.dataset.xplsHoverEnabled==='true');await popup.close();await enter();await page.waitForTimeout(220);assert.equal(await card.isVisible(),true);});
 await check('normal profile hover also works on twitter.com',async()=>{await context.route('https://twitter.com/**',route=>route.fulfill({contentType:'text/html',body:fixture}));await context.addCookies([{name:'twid',value:'u%3D99',domain:'twitter.com',path:'/'}]);await page.goto('https://twitter.com/home');await page.waitForFunction(()=>document.documentElement.dataset.xplsHoverEnabled==='true');await enter();await page.waitForTimeout(220);assert.equal(await card.isVisible(),true);});
 await check('the fix creates no copied cards, browser errors, navigation or list mutation',async()=>{assert.deepEqual(errors,[]);assert.equal(await card.count(),1);assert.equal(new URL(page.url()).pathname,'/home');assert.equal(await page.locator('#xpls-list-picker').count(),0);});
 console.log(count+' hover lifecycle checks passed');
}finally{await context.close();await rm(temp,{recursive:true,force:true});}
