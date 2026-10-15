import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const extension = join(root, 'extension');
const base = await readFile(new URL('fixture.html', import.meta.url), 'utf8');
// Optional local factory extracted from X's public main bundle, for checking
// the real middleware interface without making signed-in account requests.
const publicHoverModule = process.env.XPLS_NATIVE_HOVER_MODULE ? await readFile(process.env.XPLS_NATIVE_HOVER_MODULE, 'utf8') : null;
const publicModule = process.env.XPLS_NATIVE_MODULE ? await readFile(process.env.XPLS_NATIVE_MODULE, 'utf8') : null;
const publicApiModule = process.env.XPLS_NATIVE_API_MODULE ? await readFile(process.env.XPLS_NATIVE_API_MODULE, 'utf8') : null;
const profile = await mkdtemp(join(tmpdir(), 'xpls-manage-test-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 1100, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const styles = `<style>
.profile-cover { height:180px; background:linear-gradient(120deg,#254256,#4d6b7d); }
.profile-actions { display:flex; align-items:center; justify-content:flex-end; padding:12px 16px; gap:8px; }
.profile-actions button:not([data-xpls-manage]) { background:transparent; color:#e7e9ea; border:1px solid #536471; border-radius:999px; min-height:36px; padding:6px 12px; font:700 14px Arial; }
.profile-actions button[data-testid$="-unfollow"], .profile-actions button[data-testid$="-follow"] { background:#eff3f4; color:#0f1419; }
.profile-info { padding:16px; } .profile-info h1 { margin:0; font-size:22px; }
.profile-info p { color:#71767b; margin:6px 0 16px; }
[data-testid="HoverCard"] { position:fixed; left:390px; top:260px; width:300px; z-index:20; background:#202327; color:#e7e9ea; border-radius:16px; box-shadow:0 4px 20px #ffffff1a; }
.hover-content { padding:16px; } .hover-top { display:flex; justify-content:space-between; align-items:center; }
.avatar { display:flex; align-items:center; justify-content:center; width:64px; height:64px; border-radius:50%; background:#365d73; color:white; font:bold 24px Arial; }
.hover-top button { padding:10px 16px; border:0; border-radius:999px; font-weight:bold; }
[data-testid="HoverCard"] a { color:inherit; text-decoration:none; } [data-testid="HoverCard"] p { margin:10px 0; }
.native-menu { position:fixed; right:280px; top:260px; z-index:30; padding:12px; background:#202327; box-shadow:0 4px 20px #ffffff2a; border-radius:12px; }
.native-menu a,.native-menu button { display:block; padding:12px; color:#e7e9ea; border:0; background:none; text-decoration:none; font:15px Arial; }
[role="dialog"] { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:420px; max-width:95vw; padding:24px; z-index:40; border:1px solid #536471; border-radius:16px; background:#15202b; color:#e7e9ea; }
[role="dialog"] h2 { font:700 20px Arial; margin:0 0 20px; }
[role="dialog"] button { color:inherit; font:15px Arial; cursor:pointer; }
[role="dialog"] [role="checkbox"] { display:flex; align-items:center; justify-content:space-between; width:100%; padding:16px 8px; border:0; border-bottom:1px solid #536471; background:none; text-align:left; }
[role="dialog"] [role="checkbox"]::after { content:'□'; font-size:24px; }
[role="dialog"] [role="checkbox"][aria-checked="true"]::after { content:'☑'; color:#1d9bf0; }
.native-dialog-footer { display:flex; gap:12px; justify-content:flex-end; margin-top:20px; }
.native-dialog-footer button { padding:10px 20px; border:0; border-radius:999px; background:#1d9bf0; color:white; }
</style>`;
const db = new Map([['101', new Set(['111'])], ['102', new Set()], ['103', new Set(['111'])]]);
const requests = [];
let failLoad = false;
let failMutation = null;
let empty = false;
let legacy = false;
let nativeSigning = true;
let nativeClient = false;
let rejectTimeline = false;
let rejectMutation = false;
let denyMembership = false;
let rejectAuthentication = false;
let ownerlessTimeline = false;
const site = `<script>
  ${publicHoverModule ? `
  const hoverFactory=({${publicHoverModule}})[210617], hoverExports={};
  const react={Component:class {constructor(props){this.props=props;}setState(state){Object.assign(this.state,state);this.onStateChange?.();}}};
  const hoverRequire=id=>id===722155?react:id===646162?{A:()=>function(){}}:id===871965?{g:{interactive:'interactive',forceVisible:'visible',forceHidden:'hidden'},e:{hover:'hover'}}:id===947032?{bN:80,Xi:1,y0:1}:{A:()=>{}};
  hoverRequire.d=(exports,values)=>{for(const [name,get]of Object.entries(values))Object.defineProperty(exports,name,{get});};
  hoverFactory({},hoverExports,hoverRequire);window.NativeHover=hoverExports.A;
  ` : ''}
  window.nativeEvents = [];
  window.showCard = function(handle) {
    document.querySelector('[data-testid="HoverCard"]')?.remove();
    const card=document.createElement('div'); card.dataset.testid='HoverCard';
    card.innerHTML='<div class="hover-content"><div class="hover-top"><a href="/'+handle+'"><div data-testid="UserAvatar-Container-'+handle+'" class="avatar">JD</div></a><button data-testid="123-unfollow">Following</button></div><div data-testid="User-Name"><a href="/'+handle+'"><strong>'+handle+'</strong></a><br><a href="/'+handle+'">@'+handle+'</a></div><p>Software, science, and interesting ideas.</p><p>190 Following · 69.1K Followers</p></div>';
    document.body.append(card);
    // Model X's React hover controller, including timers scheduled before the
    // cursor moves into the selector and its separate outside-dismiss path.
    let owner={state:{isCardHovered:true,isAnchorActive:false},
      setState(next){Object.assign(this.state,next);if(!this.state.isCardHovered&&!this.state.isAnchorActive)card.remove();},
      _clearAnchorTimers(){clearTimeout(this.anchorTimer);},_clearCardTimers(){clearTimeout(this.cardTimer);},
      _clearHover(){this.setState({isCardHovered:false});},
      _handleDismiss(){this.setState({isCardHovered:false,isAnchorActive:false});},
      leave(){this.cardTimer=setTimeout(()=>this._clearHover(),80);}
    };
    if(window.NativeHover){
      owner=new window.NativeHover({hoverDelay:'short'},{});
      owner.onStateChange=()=>{if(!owner.state.isCardHovered&&!owner.state.isAnchorActive)card.remove();};
      owner.setState({isCardHovered:true});owner.leave=()=>owner._handleCardHoverOut();
    }
    card.__reactFiber$fixture={stateNode:null,return:{stateNode:owner}};
    card.addEventListener('mouseout',()=>owner.leave());
    window.cardOwner=owner;
  };
  const loader=function(id) {
    if([1,2,3,4].includes(Number(id)))return loader.m[id]?.();
    if (String(id)==='6') {
      const module={exports:{}};
      loader.m[6](module,module.exports,loader);
      return module.exports;
    }
    return { default:async()=>async(path,method)=>{
      if(window.breakSigning)throw new Error('fixture signing unavailable');
      return 'fixture-sign:'+method+':'+path;
    } };
  };
  loader.m={
    1: function(){return {queryId:'fixture-user',operationName:'UserByScreenName',operationType:'query',metadata:{featureSwitches:['native_feature']}};},
    2: function(){return {queryId:'fixture-owned',operationName:'ListsManagementPageTimeline',operationType:'query',metadata:{featureSwitches:['native_feature']}};},
    3: function(){return {queryId:'fixture-add',operationName:'ListAddMember',operationType:'mutation',metadata:{featureSwitches:[]}};},
    4: function(){return {queryId:'fixture-remove',operationName:'ListRemoveMember',operationType:'mutation',metadata:{featureSwitches:[]}};},
    5: function(r){const name='x-client-transaction-id';return r.e( 59924 ).then(r.bind( r, 208932 ));},
    6: function(module,exports,r) {
      // X's native header-plugin interface; the lazy helper lives elsewhere.
      // Deliberately no .e(...).then(...) next to the header name.
      exports.rotatingExportName=function(featureSwitches) {
        return async(request,next)=>{
          const signed={...request,headers:{...request.headers}};
          if(featureSwitches.isTrue('rweb_client_transaction_id_enabled')) {
            const sign=await (await r(208932).default());
            try { signed.headers['x-client-transaction-id']=await sign(request.path,request.method); }
            catch(error) { signed.headers['x-client-transaction-id']=btoa('e:'+error); }
          }
          return next(signed);
        };
      };
    }
  };
  delete loader.m[5];
  loader.u=function(e){return {59924:'ondemand.s',70000:'bundle.AddToList'}[e];};
  loader.e=async()=>{};
  window.webpackChunk_twitter_responsive_web=[];
  window.webpackChunk_twitter_responsive_web.push=function(entry){entry[2]?.(loader);return 1;};
  window.__INITIAL_STATE__={entities:{users:{entities:{99:{id_str:'99',screen_name:'fixtureuser'},101:{id_str:'101',screen_name:'alice'},102:{id_str:'102',screen_name:'bob'},103:{id_str:'103',screen_name:'notfollowing'}}}},featureSwitch:{features:{native_feature:{value:true}}}};
  window.installNativeClient=function(){
    window.nativeCalls=[];
    const dispatch=async request=>{
      window.nativeCalls.push({path:request.path,method:request.method});
      const path='/i/api'+request.path;
      const json=request.data && request.path.startsWith('/graphql/');
      const result=await fetch(path+(request.method==='GET'?'?'+new URLSearchParams(request.params):''),{
        method:request.method,signal:request.signal,
        headers:{authorization:'Bearer fixture-public-app-token','x-csrf-token':'fixture-csrf','x-native-session-binding':'native-only',
          'x-client-transaction-id':'fixture-sign:'+request.method+':'+path,
          ...(request.data?{'content-type':json?'application/json':'application/x-www-form-urlencoded'}:{})},
        ...(request.data?{body:json?JSON.stringify(request.data):new URLSearchParams(request.data).toString()}:{})
      });
      const data=await result.json();
      if(!result.ok||data.errors?.length)throw {status:result.status,errors:data.errors,graphqlErrors:data.errors};
      return data;
    };
    const api={apiClient:{dispatch,graphQLFullResponse:(definition,variables,isFatal,options)=>{
      const features=Object.fromEntries((definition.metadata.featureSwitches||[]).map(name=>[name,true]));
      const payload={variables,features,fieldToggles:options.fieldToggles};
      return dispatch({path:'/graphql/'+definition.queryId+'/'+definition.operationName,method:definition.operationType==='mutation'?'POST':'GET',
        ...(definition.operationType==='mutation'?{data:{...payload,queryId:definition.queryId}}:{params:Object.fromEntries(Object.entries(payload).map(([key,value])=>[key,JSON.stringify(value)]))})});
    }}};
    // PUBLIC_API_FACTORY
    const store={dispatch:thunk=>thunk(null,()=>window.__INITIAL_STATE__,{api}),getState:()=>window.__INITIAL_STATE__};
    document.querySelector('main').__reactFiber$fixture={return:{memoizedProps:{value:{store}}}};
  };
  // Represents X's own authenticated request, intercepted by the actual bridge.
  fetch('/i/api/session/ping',{headers:{authorization:'Bearer fixture-public-app-token','x-csrf-token':'fixture-csrf'}});
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-testid="userActions"]')) window.nativeEvents.push('more');
    if(event.target.closest('[data-testid$="-follow"], [data-testid$="-unfollow"]')) window.nativeEvents.push('follow');
  });
</script>`;
function fixture(path) {
  const handle=path.split('/')[1] || 'home';
  const isProfile=!['home','search','notifications','i'].includes(handle);
  let html=base.replace('</head>',styles+'</head>');
  if(isProfile) html=html.replace(/<main[\s\S]*?<\/main>/, `<main role="main" data-testid="primaryColumn">
    <div data-testid="UserCell" hidden><button data-testid="900-follow">Suggestion Follow</button></div>
    <div class="profile-cover"></div><div class="profile-actions"><button data-testid="userActions">···</button><button>Chat</button><button>♧</button><div class="follow-branch"><div><button data-testid="123-${handle==='notfollowing'?'follow':'unfollow'}">${handle==='notfollowing'?'Follow':'Following'}</button></div></div></div>
    <div class="profile-info"><div data-testid="UserName"><h1><span>${handle}</span></h1><p><span>@${handle}</span></p></div><div>Software, science, and interesting ideas.</div><p>190 Following · 69.1K Followers</p></div>
    <article data-testid="tweet"><button data-testid="userActions">Tweet More</button><h2>Recent posts</h2><p>The original profile content stays in place.</p></article></main>`);
  let script=legacy?site.replace(/    [234]: function\(\)\{[^\n]+\n/g,''):site;
  if(publicModule && nativeSigning) script=script.replace('delete loader.m[5];', `loader.d=(exports,getters)=>{for(const [key,get] of Object.entries(getters))Object.defineProperty(exports,key,{enumerable:true,get});};loader.m[6]=Object.values({${publicModule}})[0];delete loader.m[5];`);
  if(publicApiModule)script=script.replace('// PUBLIC_API_FACTORY', `
    const nativeModule={exports:{}};
    class ApiError extends Error {constructor(url,status,headers,errors,requestHeaders,graphqlErrors){super('native API error');Object.assign(this,{status,errors,graphqlErrors});}}
    class HttpClient {host=()=>location.origin;async dispatch(request){
      try{return {body:JSON.stringify(await dispatch(request)),headers:{},status:200};}
      catch(error){if(error.status===200)return {body:JSON.stringify({errors:error.errors}),headers:{},status:200};throw new ApiError('',error.status,{},error.errors);}
    }}
    const imports={345315:{Ay:HttpClient},80709:{default:()=>{}},14460:{uD:value=>value},873076:{A:ApiError},480367:{A:{}},910850:{Ay:{},WY:()=>''},768023:{A:response=>JSON.parse(response.body)}};
    const requireApi=id=>imports[id]||{};
    requireApi.d=(exports,getters)=>{for(const [key,get]of Object.entries(getters))Object.defineProperty(exports,key,{enumerable:true,get});};
    Object.values({${publicApiModule}})[0](nativeModule,nativeModule.exports,requireApi);
    api.apiClient=new nativeModule.exports.Ay({getValueWithoutScribeImpression:()=>true});
  `);
  if(!nativeSigning) script=script.replace('delete loader.m[5];','delete loader.m[6];');
  if(nativeClient)script=script.replace("  // Represents X's own", "  window.installNativeClient();\n  // Represents X's own");
  return html.replace('</body>',script+'</body>');
}
const owned = [
  {id_str:'111',name:'AI experimentation',mode:'Public',user_results:{result:{rest_id:'99',legacy:{screen_name:'fixtureuser'}}}},
  {id_str:'222',name:'Private research (unpinned)',mode:'Private',user_results:{result:{rest_id:'99',legacy:{screen_name:'fixtureuser'}}}},
  {id_str:'333',name:'Public reading (unpinned)',mode:'Public',user_results:{result:{rest_id:'99',legacy:{screen_name:'fixtureuser'}}}},
  {id_str:'444',name:'Followed list owned by someone else',mode:'Public',user_results:{result:{rest_id:'88',legacy:{screen_name:'another'}}}}
];
try {
  await context.addCookies([{name:'ct0',value:'fixture-csrf',domain:'x.com',path:'/'},{name:'twid',value:'u%3D99',domain:'x.com',path:'/'}]);
  await context.route('https://x.com/**',async route=>{
    const req=route.request(), url=new URL(req.url());
    if(!url.pathname.startsWith('/i/api/')) return route.fulfill({contentType:'text/html',body:fixture(url.pathname)});
    if(url.pathname==='/i/api/session/ping') return route.fulfill({json:{ok:true}});
    const form=req.method()==='POST'&&req.headers()['content-type']?.includes('application/x-www-form-urlencoded')?Object.fromEntries(new URLSearchParams(req.postData())):null;
    const body=req.method()==='POST'&&!form?req.postDataJSON():null;
    const variables=form || body?.variables || JSON.parse(url.searchParams.get('variables') || '{}');
    const operation=url.pathname.split('/').at(-1);
    requests.push({operation,method:req.method(),variables,query:url.searchParams,headers:req.headers()});
    // Reject unsigned requests and incorrect sessions to exercise real wiring.
    if(req.headers()['x-client-transaction-id']!=='fixture-sign:'+req.method()+':'+url.pathname || req.headers()['authorization']!=='Bearer fixture-public-app-token' || req.headers()['x-csrf-token']!=='fixture-csrf') return route.fulfill({status:403,json:{errors:[{}]}});
    if(nativeClient && req.headers()['x-native-session-binding']!=='native-only')return route.fulfill({json:{errors:[{code:32,message:'Session binding required'}]}});
    if(failLoad && req.method()==='GET') return route.fulfill({status:429,json:{errors:[{}]}});
    if(operation==='UserByScreenName') {
      const ids={fixtureuser:'99',alice:'101',bob:'102',notfollowing:'103'};
      return route.fulfill({json:{data:{user:{result:{rest_id:ids[variables.screen_name],legacy:{screen_name:variables.screen_name}}}}}});
    }
    if(operation==='ListsManagementPageTimeline') {
      if(rejectTimeline)return route.fulfill({json:{errors:[{code:336,message:'Required feature settings missing'}]}});
      const lists=empty||variables.cursor==='end-owned'?[]:(variables.cursor?owned.slice(2):owned.slice(0,2));
      const cursor=empty?'':(variables.cursor?'end-owned':'next-owned');
      const entries=[{content:{items:lists.map(list=>({item:{itemContent:{list:ownerlessTimeline?{id_str:list.id_str,name:list.name,mode:list.mode}:list}}}))}},{content:{cursorType:'Bottom',value:cursor}}];
      return route.fulfill({json:{data:{viewer:{list_management_timeline:{timeline:{instructions:[{entries}]}}}}}});
    }
    if(operation==='ownerships.json') return route.fulfill({json:{lists:owned.slice(0,3).map(list=>({...list,user:{id_str:'99',screen_name:'fixtureuser'},mode:list.mode.toLowerCase()})),next_cursor_str:'0'}});
    if(operation==='create.json'||operation==='destroy.json') {
      const members=db.get(variables.user_id);
      if(operation==='create.json')members.add(variables.list_id);else members.delete(variables.list_id);
      return route.fulfill({json:{id_str:variables.list_id}});
    }
    if(operation==='memberships.json') {
      if(denyMembership)return route.fulfill({status:403,json:{errors:[{code:87,message:'Client is not permitted to access memberships'}]}});
      const id=url.searchParams.get('user_id');
      return route.fulfill({json:{lists:[...(db.get(id)||[])].map(id_str=>({id_str})),next_cursor_str:'0'}});
    }
    if(operation==='ListAddMember'||operation==='ListRemoveMember') {
      if(rejectAuthentication)return route.fulfill({status:400,json:{errors:[{code:353,message:'CSRF validation failed'}]}});
      if(rejectMutation)return route.fulfill({json:{errors:[{code:336,message:'Mutation variables rejected before execution'}]}});
      if(failMutation===variables.listId) { failMutation=null;return route.fulfill({status:500,json:{errors:[{}]}}); }
      const members=db.get(variables.userId);
      if(!members||!owned.slice(0,3).some(list=>list.id_str===variables.listId)) return route.fulfill({status:403,json:{errors:[{}]}});
      if(operation==='ListAddMember')members.add(variables.listId);else members.delete(variables.listId);
      return route.fulfill({json:{data:{list:{id_str:variables.listId}}}});
    }
    return route.fulfill({status:404,json:{errors:[{}]}});
  });
  const page=await context.newPage();
  await page.goto('https://x.com/home');
  await page.evaluate(()=>window.showCard('alice'));
  const card=page.locator('[data-testid="HoverCard"]');
  const link=card.getByRole('button',{name:'Add/remove @alice from lists',exact:true});
  const panel=page.locator('#xpls-list-picker');
  const changes=()=>requests.filter(request=>request.method==='POST');
  const open=async()=>{if(!await card.count())await page.evaluate(()=>window.showCard('alice'));await link.click();await panel.getByRole('checkbox').first().waitFor();};
  await check('hover-card action is subtle text directly below Following',async()=>{
    await link.waitFor();
    assert.equal(await link.textContent(),'Add/remove from list');
    const followBox=await card.getByRole('button',{name:'Following',exact:true}).boundingBox();
    const linkBox=await link.boundingBox();
    assert.ok(linkBox.y>=followBox.y+followBox.height);
    assert.ok(Math.abs(linkBox.x+linkBox.width-followBox.x-followBox.width)<2);
    const style=await link.evaluate(element=>{const s=getComputedStyle(element);return [s.fontSize,s.borderTopWidth,s.fontWeight];});
    assert.deepEqual(style,['11px','0px','400']);
    await link.hover();
    assert.equal(await link.evaluate(element=>getComputedStyle(element).textDecorationLine),'underline');
    assert.equal(await card.locator('[data-xpls-manage="hover"]').count(),1);
    await page.screenshot({path:join(root, 'screenshots', 'manage-lists-hover-preview.png')});
  });
  await check('inline selector loads owned private and unpinned lists without navigation or a new tab',async()=>{
    const url=page.url(), count=context.pages().length;
    await open();
    assert.equal(page.url(),url);
    assert.equal(context.pages().length,count);
    assert.equal(await panel.getByRole('checkbox').count(),3);
    assert.equal(await panel.locator('input[data-xpls-list-id="111"]').isChecked(),true);
    assert.equal(await panel.locator('input[data-xpls-list-id="222"]').isChecked(),false);
    assert.equal(await panel.getByText('Followed list owned by someone else').count(),0);
    assert.equal(await panel.getByText('Private',{exact:true}).count(),1);
    assert.deepEqual(await page.evaluate(()=>window.nativeEvents),[]);
    assert.equal(changes().length,0);
    const popupBox=await panel.boundingBox();
    const anchorBox=await link.boundingBox();
    assert.ok(popupBox.x>=8 && popupBox.x+popupBox.width<=1092);
    assert.ok(popupBox.y>=8 && popupBox.y+popupBox.height<=992);
    assert.ok(Math.abs(popupBox.x+popupBox.width-anchorBox.x-anchorBox.width)<2, JSON.stringify({popupBox,anchorBox}));
    assert.ok(requests.some(request=>request.operation==='ListsManagementPageTimeline'&&request.variables.cursor==='next-owned'));
    assert.ok(requests.some(request=>request.operation==='ListsManagementPageTimeline'&&request.variables.cursor==='end-owned'));
    await page.screenshot({path:join(root, 'screenshots', 'manage-lists-dialog-preview.png')});
  });
  await check('membership, saved pin order, then other lists affect presentation only',async()=>{
    await panel.getByRole('button',{name:'Close list selector'}).click();
    const original=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
    await page.evaluate(()=>{
      const keys=[JSON.stringify(['id:111',0]),JSON.stringify(['id:333',0])];
      localStorage.setItem('xpls:pinned-lists:v1:/fixtureuser',JSON.stringify([{key:keys[0],label:'AI experimentation',href:'/i/lists/111'},{key:keys[1],label:'Public reading (unpinned)',href:'/i/lists/333'}]));
      localStorage.setItem('xpls:pinned-list-order:v1:/fixtureuser',JSON.stringify([keys[1],keys[0]]));
      localStorage.setItem('xpls:pinned-list-emojis:v1:/fixtureuser',JSON.stringify({[keys[1]]:'📚'}));
    });
    const configuration=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),before=changes().length;
    await open();
    const rowIds=()=>panel.locator('input[data-xpls-list-id]').evaluateAll(inputs=>inputs.map(input=>input.dataset.xplsListId));
    assert.deepEqual(await rowIds(),['111','333','222']);
    await panel.locator('input[data-xpls-list-id="333"]').check();
    assert.deepEqual(await rowIds(),['111','333','222']);
    await panel.getByRole('searchbox').fill('private');await panel.getByRole('searchbox').fill('');
    assert.equal(await panel.locator('input[data-xpls-list-id="333"]').isChecked(),true);
    await panel.getByRole('button',{name:'Close list selector'}).click();
    assert.equal(changes().length,before);assert.deepEqual([...db.get('101')],['111']);
    assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),configuration);
    // With no membership, both pins follow the saved sidebar order.
    db.set('101',new Set());await open();assert.deepEqual(await rowIds(),['333','111','222']);
    await panel.getByRole('button',{name:'Close list selector'}).click();db.set('101',new Set(['111']));
    await page.evaluate(original=>{for(const key of Object.keys(localStorage))if(key.startsWith('xpls:'))localStorage.removeItem(key);for(const[key,value]of Object.entries(original))localStorage.setItem(key,value);},original);
    await open();
  });
  await check('name-only pins never merge distinct lists sharing a name',async()=>{
    await panel.getByRole('button',{name:'Close list selector'}).click();
    owned.push({id_str:'555',name:'AI experimentation',mode:'Public',user_results:{result:{rest_id:'99',legacy:{screen_name:'fixtureuser'}}}});
    await open();
    assert.deepEqual(await panel.locator('input[data-xpls-list-id]').evaluateAll(inputs=>inputs.map(input=>input.dataset.xplsListId)),['111','222','333','555']);
    assert.equal(changes().length,0);
    await panel.getByRole('button',{name:'Close list selector'}).click();owned.pop();await open();
  });
  await check('opening the selector pins the real card through leave timers and outside dismissals',async()=>{
    if(!await panel.count())await open();
    const anchor=await link.boundingBox(), before=await panel.boundingBox();
    await page.evaluate(()=>{window.cardOwner.leave();setTimeout(()=>window.cardOwner._handleDismiss(),100);});
    await page.mouse.move(1050,950);await page.waitForTimeout(250);
    assert.equal(await card.isVisible(),true);
    assert.equal(await card.getAttribute('data-xpls-card-pinned'),'true');
    const after=await panel.boundingBox();
    assert.ok(Math.abs(after.y-anchor.y-anchor.height-8)<2);
    assert.deepEqual(after,before);
    assert.equal(await card.getByRole('button',{name:'Following',exact:true}).isEnabled(),true);
    await page.screenshot({path:join(root, 'screenshots', 'manage-lists-dialog-preview.png')});
  });
  await check('keyboard reopening keeps the focused card visible with the pointer outside it',async()=>{
    await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});
    await page.waitForFunction(()=>!document.querySelector('[data-xpls-card-pinned]'));
    await page.mouse.move(1050,950);await page.keyboard.press('Enter');
    await panel.getByRole('checkbox').first().waitFor();await page.waitForTimeout(200);
    assert.equal(await card.isVisible(),true);
    assert.equal(await card.getAttribute('data-xpls-card-pinned'),'true');
  });
  await check('the close icon is centered in a padded 32px hit area',async()=>{
    const close=panel.getByRole('button',{name:'Close list selector'}), svg=close.locator('svg');
    const hit=await close.boundingBox(), icon=await svg.boundingBox();
    assert.deepEqual([hit.width,hit.height],[32,32]);
    assert.deepEqual([icon.width,icon.height],[18,18]);
    assert.ok(Math.abs(icon.x+9-hit.x-16)<1&&Math.abs(icon.y+9-hit.y-16)<1);
    await close.click();await panel.waitFor({state:'detached'});
    await page.waitForFunction(()=>!document.querySelector('[data-xpls-card-pinned]'));
    await page.mouse.move(1050,950);await page.evaluate(()=>window.cardOwner.leave());await card.waitFor({state:'detached'});
    await page.evaluate(()=>window.showCard('alice'));await link.waitFor();
  });
  await check('the selector retains the action anchor if X replaces its card',async()=>{
    await open();const before=await panel.boundingBox();
    await page.evaluate(()=>document.querySelector('[data-testid="HoverCard"]').remove());
    await page.setViewportSize({width:1099,height:1000});await page.setViewportSize({width:1100,height:1000});
    await page.waitForTimeout(200);
    const after=await panel.boundingBox();assert.equal(after.y,before.y);assert.equal(after.x,before.x);
    await panel.getByRole('button',{name:'Close list selector'}).click();
    await page.evaluate(()=>window.showCard('alice'));await link.waitFor();
  });
  await check('search preserves hidden selections and staging does not write to X',async()=>{
    await open();
    await panel.getByRole('searchbox').fill('private');
    assert.equal(await panel.locator('.xpls-list-choice:visible').count(),1);
    await panel.getByRole('checkbox',{name:'Private research (unpinned) Private'}).check();
    await panel.getByRole('searchbox').fill('no match');
    assert.equal(await panel.locator('.xpls-list-choice:visible').count(),0);
    await panel.getByRole('searchbox').fill('');
    assert.equal(await panel.locator('input[data-xpls-list-id="222"]').isChecked(),true);
    assert.equal(changes().length,0);
  });
  await check('Save removes an existing member and adds a private unpinned membership in place',async()=>{
    await panel.locator('input[data-xpls-list-id="111"]').uncheck();
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await panel.waitFor({state:'detached'});
    assert.equal(page.url(),'https://x.com/home');
    assert.deepEqual([...db.get('101')],['222']);
    assert.deepEqual(changes().map(request=>[request.operation,request.variables]),[
      ['ListRemoveMember',{listId:'111',userId:'101'}],['ListAddMember',{listId:'222',userId:'101'}]
    ]);
    assert.deepEqual(await page.evaluate(()=>window.nativeEvents),[]);
  });
  await check('reopening reads saved server membership and remains usable after hover-card removal',async()=>{
    await open();
    assert.equal(await panel.locator('input[data-xpls-list-id="222"]').isChecked(),true);
    await page.evaluate(()=>document.querySelector('[data-testid="HoverCard"]').remove());
    await panel.locator('input[data-xpls-list-id="333"]').check();
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await panel.waitFor({state:'detached'});
    assert.deepEqual([...db.get('101')],['222','333']);
    await page.evaluate(()=>window.showCard('alice'));
    await link.waitFor();
  });
  await check('Escape and clicking outside discard staged choices without a mutation',async()=>{
    await open();
    const before=changes().length;
    await panel.locator('input[data-xpls-list-id="111"]').check();
    await page.keyboard.press('Escape');
    await panel.waitFor({state:'detached'});
    assert.equal(changes().length,before);
    assert.equal(await link.evaluate(element=>element===document.activeElement),true);
    await open();
    assert.equal(await panel.locator('input[data-xpls-list-id="111"]').isChecked(),false);
    await page.locator('#selection').click();
    await panel.waitFor({state:'detached'});
    assert.equal(changes().length,before);
  });
  await check('partial save errors preserve confirmed changes and retry only the remaining change',async()=>{
    await open();
    await panel.locator('input[data-xpls-list-id="222"]').uncheck();
    await panel.locator('input[data-xpls-list-id="111"]').check();
    // Add 111 succeeds, removal of 222 fails: the retry must not add 111 again.
    failMutation='222';
    const before=changes().length;
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await panel.getByRole('button',{name:'Retry save',exact:true}).waitFor();
    assert.equal(await panel.getByRole('button',{name:'Retry save',exact:true}).isEnabled(),true);
    assert.ok(db.get('101').has('111'));
    assert.ok(db.get('101').has('222'));
    await panel.getByRole('button',{name:'Retry save',exact:true}).click();
    await panel.waitFor({state:'detached'});
    assert.deepEqual(changes().slice(before).map(request=>request.variables.listId),['111','222','222']);
    assert.deepEqual([...db.get('101')].sort(),['111','333']);
  });
  await check('load failures show an inline retry and never guess unchecked memberships',async()=>{
    failLoad=true;
    await link.click();
    await panel.getByRole('button',{name:'Retry',exact:true}).waitFor();
    assert.equal(await panel.getByRole('checkbox').count(),0);
    assert.equal(await panel.getByRole('button',{name:'Save',exact:true}).isDisabled(),true);
    assert.equal(page.url(),'https://x.com/home');
    failLoad=false;
    await panel.getByRole('button',{name:'Retry',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    await panel.getByRole('button',{name:'Close list selector',exact:true}).click();
  });
  await check('recycled hover cards resolve the new user at click time',async()=>{
    await page.evaluate(()=>{
      const card=document.querySelector('[data-testid="HoverCard"]');
      card.querySelectorAll('a').forEach(link=>{link.href='/bob';if(link.textContent.includes('alice'))link.textContent=link.textContent.replace('alice','bob');});
    });
    await card.getByRole('button',{name:'Add/remove @bob from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    assert.equal(await panel.locator('input[data-xpls-list-id="111"]').isChecked(),false);
    assert.match(await panel.locator('strong').textContent(),/@bob/);
    await page.keyboard.press('Escape');
  });
  await check('profile pages use the same quiet link below Following and the same inline picker',async()=>{
    await page.goto('https://x.com/alice');
    const profileLink=page.getByRole('button',{name:'Add/remove @alice from lists',exact:true});
    await profileLink.waitFor();
    const nativeBox=await page.getByRole('button',{name:'Following',exact:true}).boundingBox();
    const box=await profileLink.boundingBox();
    assert.ok(box.y>=nativeBox.y+nativeBox.height);
    assert.ok(Math.abs(box.x+box.width-nativeBox.x-nativeBox.width)<2);
    await page.screenshot({path:join(root, 'screenshots', 'manage-lists-profile-preview.png')});
    await profileLink.click();
    await panel.getByRole('checkbox').first().waitFor();
    assert.equal(page.url(),'https://x.com/alice');
    assert.equal(await panel.locator('input[data-xpls-list-id="111"]').isChecked(),true);
    assert.deepEqual(await page.evaluate(()=>window.nativeEvents),[]);
    await page.keyboard.press('Escape');
  });
  await check('profile subviews and Follow buttons retain the action',async()=>{
    await page.goto('https://x.com/notfollowing/media');
    await page.getByRole('button',{name:'Add/remove @notfollowing from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    assert.equal(page.url(),'https://x.com/notfollowing/media');
    assert.equal(await page.getByRole('button',{name:'Follow',exact:true}).count(),1);
    await page.keyboard.press('Escape');
  });
  await check('hover cards keep the exact profile-link font despite native card button styles',async()=>{
    await page.goto('https://x.com/alice');
    const profileLink=page.locator('[data-xpls-manage="profile"] button');
    await profileLink.waitFor();
    const typography=element=>{const s=getComputedStyle(element);return [s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight];};
    const profileFont=await profileLink.evaluate(typography);
    await page.addStyleTag({content:'[data-testid="HoverCard"] {font-family:Georgia;} [data-testid="HoverCard"] button {font-size:17px;font-weight:700;line-height:22px;}'});
    await page.evaluate(()=>window.showCard('bob'));
    const hoverLink=page.locator('[data-xpls-manage="hover"] button');
    await hoverLink.waitFor();
    assert.deepEqual(await hoverLink.evaluate(typography),profileFont);
    assert.deepEqual(profileFont.slice(1),['11px','400','14px']);
    await page.evaluate(()=>document.querySelector('[data-testid="HoverCard"]').remove());
  });
  await check('older native signing loaders accept whitespace and resolve IDs dynamically',async()=>{
    nativeSigning=false;
    await page.goto('https://x.com/alice');
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    assert.equal(await panel.getByRole('checkbox').count(),3);
    await page.keyboard.press('Escape');
    nativeSigning=true;
  });
  await check('native signing failures block requests instead of sending an error as a signature',async()=>{
    await page.goto('https://x.com/alice');
    await page.evaluate(()=>window.breakSigning=true);
    const before=requests.length;
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('button',{name:'Retry',exact:true}).waitFor();
    assert.match(await panel.getByRole('status').textContent(),/initialize request signing/);
    assert.equal(requests.length,before);
    assert.equal(await panel.getByRole('checkbox').count(),0);
    await page.evaluate(()=>window.breakSigning=false);
    await panel.getByRole('button',{name:'Retry',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    await page.keyboard.press('Escape');
  });
  await check('account changes invalidate an open selector before any save',async()=>{
    await page.goto('https://x.com/alice');
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    const before=changes().length;
    await panel.locator('input[data-xpls-list-id="222"]').check();
    await page.evaluate(()=>document.cookie='ct0=changed-session; path=/');
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await panel.getByRole('button',{name:'Retry save',exact:true}).waitFor();
    assert.match(await panel.getByRole('status').textContent(),/Account changed/);
    assert.equal(changes().length,before);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>document.cookie='ct0=fixture-csrf; path=/');
  });
  await check('the session owner must match the account whose lists are requested',async()=>{
    await page.evaluate(()=>document.cookie='twid=u%3D88; path=/');
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('button',{name:'Retry',exact:true}).waitFor();
    assert.match(await panel.getByRole('status').textContent(),/Account changed/);
    assert.equal(await panel.getByRole('checkbox').count(),0);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>document.cookie='twid=u%3D99; path=/');
  });
  await check('no owned lists is handled without offering followed lists or mutations',async()=>{
    empty=true;
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByText('You haven’t created any lists yet.').waitFor();
    assert.equal(await panel.getByRole('checkbox').count(),0);
    assert.equal(await panel.getByRole('button',{name:'Save',exact:true}).isDisabled(),true);
    empty=false;
    await page.keyboard.press('Escape');
  });
  await check('programmatic clicks and forged save messages cannot perform writes',async()=>{
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    const before=changes().length;
    await panel.locator('input[data-xpls-list-id="222"]').check();
    await page.evaluate(()=>{
      const root=document.getElementById('xpls-list-picker');
      root.querySelector('[data-xpls-save]').click();
      postMessage({channel:'xpls-list-picker-v2',direction:'request',type:'save',id:root.dataset.requestId},location.origin);
    });
    await page.waitForTimeout(200);
    assert.equal(changes().length,before);
    assert.equal(await panel.getByRole('button',{name:'Save',exact:true}).isEnabled(),true);
    await page.keyboard.press('Escape');
  });
  await check('frontends without list-query modules use signed REST reads and writes in place',async()=>{
    legacy=true;
    await page.goto('https://x.com/alice');
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    assert.equal(await panel.getByRole('checkbox').count(),3);
    assert.equal(await panel.locator('input[data-xpls-list-id="111"]').isChecked(),true);
    await panel.locator('input[data-xpls-list-id="111"]').uncheck();
    await panel.locator('input[data-xpls-list-id="222"]').check();
    const before=changes().length;
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await panel.waitFor({state:'detached'});
    assert.deepEqual(changes().slice(before).map(request=>request.operation),['destroy.json','create.json']);
    assert.deepEqual([...db.get('101')].sort(),['222','333']);
    assert.equal(page.url(),'https://x.com/alice');
    legacy=false;
  });
  await check('profile and hover selector modals have identical typography throughout',async()=>{
    await page.goto('https://x.com/alice');
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    const typography=root=>[root,root.querySelector('strong'),root.querySelector('input[type="search"]'),root.querySelector('[role="status"]'),root.querySelector('[data-xpls-save]')].map(element=>{const style=getComputedStyle(element);return [style.fontFamily,style.fontSize,style.fontWeight,style.lineHeight];});
    const profileType=await panel.evaluate(typography);
    await page.keyboard.press('Escape');
    await page.addStyleTag({content:'[data-testid="HoverCard"] {font-family:"Times New Roman";font-size:20px;}'});
    await page.evaluate(()=>window.showCard('bob'));
    await page.locator('[data-xpls-manage="hover"] button').click();
    await panel.getByRole('checkbox').first().waitFor();
    assert.deepEqual(await panel.evaluate(typography),profileType);
    await page.keyboard.press('Escape');
  });
  await check('a rejected GraphQL timeline falls back to complete owned REST lists and writes',async()=>{
    rejectTimeline=true;
    await page.goto('https://x.com/alice');
    const before=requests.length;
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    assert.equal(await panel.getByRole('checkbox').count(),3);
    assert.ok(requests.slice(before).some(request=>request.operation==='ownerships.json'));
    assert.equal(requests.slice(before).filter(request=>request.operation==='UserByScreenName').length,0);
    await panel.locator('input[data-xpls-list-id="111"]').check();
    await panel.locator('input[data-xpls-list-id="222"]').uncheck();
    const writes=changes().length;
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await panel.waitFor({state:'detached'});
    assert.deepEqual(changes().slice(writes).map(request=>request.operation),['create.json','destroy.json']);
    rejectTimeline=false;
  });
  await check('ownerless timeline items use verified ownerships instead of an empty or uneditable list',async()=>{
    ownerlessTimeline=true;
    const before=requests.length;
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    assert.equal(await panel.getByRole('checkbox').count(),3);
    assert.ok(requests.slice(before).some(request=>request.operation==='ownerships.json'));
    await page.keyboard.press('Escape');
    ownerlessTimeline=false;
  });
  await check('native Redux client supplies binding, features, signing and member mutations',async()=>{
    nativeClient=true;
    await page.goto('https://x.com/alice');
    await page.evaluate(()=>window.__INITIAL_STATE__.featureSwitch.features.native_feature.value=false);
    const before=requests.length;
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    const reads=requests.slice(before);
    assert.ok(reads.every(request=>request.headers['x-native-session-binding']==='native-only'));
    const timeline=reads.find(request=>request.operation==='ListsManagementPageTimeline');
    assert.equal(JSON.parse(timeline.query.get('features')).native_feature,true);
    assert.ok((await page.evaluate(()=>window.nativeCalls)).some(call=>call.path==='/1.1/lists/memberships.json'));
    await panel.locator('input[data-xpls-list-id="222"]').check();
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await panel.waitFor({state:'detached'});
    assert.equal(changes().at(-1).operation,'ListAddMember');
    assert.deepEqual([...db.get('101')].sort(),['111','222','333']);
  });
  await check('explicitly rejected mutations can use REST without repeating an applied change',async()=>{
    rejectMutation=true;
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    await panel.locator('input[data-xpls-list-id="333"]').uncheck();
    const before=changes().length;
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await panel.waitFor({state:'detached'});
    assert.deepEqual(changes().slice(before).map(request=>request.operation),['ListRemoveMember','destroy.json']);
    assert.deepEqual([...db.get('101')].sort(),['111','222']);
    rejectMutation=false;
  });
  await check('API permission errors identify the endpoint and code without guessing membership',async()=>{
    denyMembership=true;
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('button',{name:'Retry',exact:true}).waitFor();
    assert.match(await panel.getByRole('status').textContent(),/memberships.json.*code 87/);
    assert.equal(await panel.getByRole('checkbox').count(),0);
    assert.equal(await panel.getByRole('button',{name:'Save',exact:true}).isDisabled(),true);
    await page.keyboard.press('Escape');
    denyMembership=false;
    nativeClient=false;
  });
  await check('an authentication rejection never retries a mutation through another endpoint',async()=>{
    rejectAuthentication=true;
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    await panel.locator('input[data-xpls-list-id="333"]').check();
    const before=changes().length;
    await panel.getByRole('button',{name:'Save',exact:true}).click();
    await panel.getByRole('button',{name:'Retry save',exact:true}).waitFor();
    assert.match(await panel.getByRole('status').textContent(),/code 353/);
    assert.deepEqual(changes().slice(before).map(request=>request.operation),['ListAddMember']);
    assert.deepEqual([...db.get('101')].sort(),['111','222']);
    await page.keyboard.press('Escape');
    rejectAuthentication=false;
  });
  const id=createHash('sha256').update(extension).digest('hex').slice(0,32).replace(/[0-9a-f]/g,hex=>String.fromCharCode(97+parseInt(hex,16)));
  const popup=await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.locator('#enabled:not([disabled])').waitFor();
  await check('disable removes links and the open selector without modifying native Follow',async()=>{
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).click();
    await panel.getByRole('checkbox').first().waitFor();
    await popup.locator('#enabled').uncheck();
    await panel.waitFor({state:'detached'});
    await page.locator('[data-xpls-manage]').waitFor({state:'detached'});
    assert.equal(await page.getByRole('button',{name:'Following',exact:true}).count(),1);
    await popup.locator('#enabled').check();
    await page.getByRole('button',{name:'Add/remove @alice from lists',exact:true}).waitFor();
  });
  await check('no browser script errors',async()=>assert.deepEqual(errors,[]));
  console.log(`\n${checks} inline list-management checks passed.`);
} finally { await context.close();await rm(profile,{recursive:true,force:true}); }
