// Runs in X's page world. Session headers stay here and are never stored or posted.
(() => {
  'use strict';
  const channel = 'xpls-list-picker-v2';
  const nativeFetch = window.fetch.bind(window);
  let sessionHeaders = new Headers();
  let requireX = null;
  let signerPromise = null;
  const observed = new Map();
  const models = new Map();
  const featureValues = new Map();
  let featureAccount = '';
  let nativeSortRead = 0;
  const allowedOperations = new Set(['UserByScreenName', 'ListsManagementPageTimeline', 'ListAddMember', 'ListRemoveMember']);
  const cookie = name => {
    const value = document.cookie.split('; ').find(value => value.startsWith(name + '='))?.slice(name.length + 1);
    try { return value ? decodeURIComponent(value) : ''; } catch { return ''; }
  };
  const accountStamp = () => `${cookie('twid')}|${cookie('ct0')}`;
  const send = (id, type, data = {}) => window.postMessage({ channel, direction: 'result', id, type, ...data }, location.origin);
  const apiUrl = value => {
    try {
      const url = new URL(value, location.href);
      return (url.origin === location.origin && url.pathname.startsWith('/i/api/')) || /^https:\/\/api\.(x|twitter)\.com\//.test(url.href) ? url : null;
    } catch { return null; }
  };

  function observe(input, init = {}) {
    const url = apiUrl(input instanceof Request ? input.url : String(input));
    if (!url) return;
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    for (const name of ['authorization', 'x-csrf-token', 'x-twitter-auth-type', 'x-twitter-client-language']) {
      if (headers.has(name)) sessionHeaders.set(name, headers.get(name));
    }
    const operation = url.pathname.split('/').at(-1);
    // Read-only view metadata. Never change or delay the native request.
    if (operation === 'HomeLatestTimeline') {
      const stamp = cookie('twid');
      const publish = variables => {
        const viewer = stamp.match(/^u=(\d+)$/)?.[1];
        const root = document.documentElement;
        if (!root || !viewer || cookie('twid') !== stamp || typeof variables?.enableRanking !== 'boolean') return;
        root.dataset.xplsNativeSortRead = String(++nativeSortRead);
        root.dataset.xplsNativeSortViewer = viewer;
        root.dataset.xplsNativeSort = variables.enableRanking ? 'popular' : 'recent';
      };
      try {
        if (typeof init.body === 'string') publish(JSON.parse(init.body).variables);
        else if (input instanceof Request && input.method.toUpperCase() === 'POST') {
          input.clone().text().then(body => publish(JSON.parse(body).variables)).catch(() => {});
        } else publish(JSON.parse(url.searchParams.get('variables') || '{}'));
      } catch { /* An unknown native request shape has no inferred sort. */ }
    }

    let data = null;
    try { data = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch { /* GET metadata below. */ }
    try {
      const features = data?.features || JSON.parse(url.searchParams.get('features') || '{}');
      const fields = data?.fieldToggles || JSON.parse(url.searchParams.get('fieldToggles') || '{}');
      if (featureAccount !== accountStamp()) { featureAccount = accountStamp(); featureValues.clear(); observed.clear(); }
      for (const [name, value] of Object.entries(features)) if (typeof value === 'boolean') featureValues.set(name, value);
      if (allowedOperations.has(operation)) observed.set(operation, { queryId: url.pathname.split('/').at(-2), features, fields });
    } catch { /* Don't rely on incomplete native request metadata. */ }
  }
  // Observe authentication, list metadata and the native sort label. Timeline requests,
  // request bodies, responses, and sorting callbacks are left unchanged.
  window.fetch = function(input, init) {
    observe(input, init);
    return nativeFetch(input, init);
  };
  const openXHR = XMLHttpRequest.prototype.open;
  const headerXHR = XMLHttpRequest.prototype.setRequestHeader;
  const sendXHR = XMLHttpRequest.prototype.send;
  const xhrMeta = new WeakMap();
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    xhrMeta.set(this, { url, method, headers: new Headers() });
    return openXHR.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    xhrMeta.get(this)?.headers.append(name, value);
    return headerXHR.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function(body) {
    const meta = xhrMeta.get(this);
    if (meta) observe(meta.url, { ...meta, body });
    return sendXHR.call(this, body);
  };

  let pinnedCard = null;
  const hoverEnabled = () => document.documentElement?.dataset.xplsHoverEnabled === 'true';
  function releaseCard(force = false) {
    if (!pinnedCard) return;
    const held = pinnedCard;
    const { owner, originals, card, selector } = held;
    card.removeAttribute('data-xpls-card-pinned');
    // Closing the list selector should not drop the card under the pointer.
    if (!force && hoverEnabled() && card.isConnected && card.matches(':hover')) {
      held.selector = false;
      return;
    }
    pinnedCard = null;
    if (!owner) return;
    owner._clearCardTimers?.();
    if (selector) owner._clearAnchorTimers?.();
    for (const [name, fn] of Object.entries(originals)) owner[name] = fn;
    if (!card.isConnected || force) return;
    if (!selector) {
      // Give ordinary hover-out back to X, preserving its anchor grace period
      // when the pointer returns to the username instead of leaving both.
      if (typeof owner._handleCardHoverOut === 'function') owner._handleCardHoverOut();
      else if (typeof owner._clearHover === 'function') owner._clearHover();
      else owner.setState({ isCardHovered: false });
      return;
    }
    const dismiss = () => {
      if (!card.isConnected || pinnedCard?.owner === owner) return;
      if (!card.matches(':hover') && !card.contains(document.activeElement)) owner.setState({ isCardHovered: false, isAnchorActive: false });
    };
    dismiss();
    if (card.contains(document.activeElement)) card.addEventListener('focusout', () => queueMicrotask(dismiss), { once: true });
  }
  function pinCard(card, selector = true) {
    if (!card) return;
    if (pinnedCard?.card === card) {
      if (selector) {
        pinnedCard.selector = true;
        pinnedCard.owner?._clearCardTimers?.();
        card.setAttribute('data-xpls-card-pinned', 'true');
      }
      return;
    }
    // An open list selector owns its card until it is closed.
    if (pinnedCard?.selector && !selector) return;
    releaseCard(true);
    const key = Object.keys(card).find(key => /^__react(?:Fiber|InternalInstance)\$/.test(key));
    let fiber = key && card[key], owner = null;
    for (let depth = 0; fiber && depth < 120; depth++, fiber = fiber.return) {
      const instance = fiber.stateNode;
      if (instance?.state && typeof instance.state.isCardHovered === 'boolean' && typeof instance._clearCardTimers === 'function' && typeof instance.setState === 'function') { owner = instance; break; }
    }
    if (!owner && !selector) return;
    const originals = {};
    if (owner) {
      // A callback captured before the pointer crossed the portal gap cannot
      // be replaced by patching its method. Cancel that queued anchor close.
      owner._clearAnchorTimers?.();
      owner._clearCardTimers();
      for (const name of ['_clearHover', '_handleDismiss']) {
        if (typeof owner[name] === 'function') { originals[name] = owner[name]; owner[name] = () => {}; }
      }
      const state = { isCardHovered: true };
      if (typeof owner.state.isAnchorActive === 'boolean') state.isAnchorActive = false;
      if (!owner.state.isCardHovered || owner.state.isAnchorActive) owner.setState(state);
    }
    if (selector) card.setAttribute('data-xpls-card-pinned', 'true');
    pinnedCard = { owner, originals, card, selector };
  }
  // React's anchor and portal can receive separate leave events. Acquire the
  // real controller before those handlers run, including moves between children.
  for (const type of ['pointerover', 'mouseover', 'pointerout', 'mouseout']) {
    window.addEventListener(type, event => {
      if (!hoverEnabled() || event.pointerType === 'touch') return;
      const entering = type.endsWith('over');
      const target = entering ? event.target : event.relatedTarget;
      const card = target instanceof Element && target.closest('[data-testid="HoverCard"]');
      if (card) pinCard(card, false);
      else if (!entering && pinnedCard && !pinnedCard.selector && pinnedCard.card.contains(event.target)) {
        // Let native enter handlers update the username's state first.
        queueMicrotask(() => { if (pinnedCard && !pinnedCard.selector) releaseCard(); });
      }
    }, true);
  }
  // Explicit dismissal remains native even while ordinary hover is held.
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && pinnedCard && !pinnedCard.selector) releaseCard(true);
  }, true);
  window.addEventListener('pointerdown', event => {
    if (pinnedCard && !pinnedCard.selector && !pinnedCard.card.contains(event.target)) releaseCard(true);
  }, true);
  window.addEventListener('blur', () => { if (pinnedCard && !pinnedCard.selector) releaseCard(true); });
  window.addEventListener('click', event => {
    const action = event.target.closest?.('[data-xpls-manage="hover"] .xpls-manage-link');
    if (hoverEnabled() && event.isTrusted && action) pinCard(action.closest('[data-testid="HoverCard"]'));
    else if (pinnedCard && !pinnedCard.selector && pinnedCard.card.contains(event.target) && event.target.closest?.('a[href]')) releaseCard(true);
  }, true);
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || data?.channel !== channel || data.direction !== 'request') return;
    if (data.type === 'pin-card') {
      const root = document.getElementById('xpls-list-picker');
      const card = document.querySelector('[data-testid="HoverCard"][data-xpls-card-pinned]');
      if (hoverEnabled() && root?.dataset.requestId === data.id) pinCard(card);
    } else if (data.type === 'cancel' && pinnedCard?.selector && (!document.getElementById('xpls-list-picker') || document.getElementById('xpls-list-picker').dataset.requestId === data.id)) releaseCard();
  });
  new MutationObserver(() => {
    if (!pinnedCard) return;
    if (!hoverEnabled() || !pinnedCard.card.isConnected) releaseCard(true);
    else if (pinnedCard.selector && !document.getElementById('xpls-list-picker')) releaseCard();
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-xpls-hover-enabled'] });
  addEventListener('popstate', () => releaseCard(true));

  function runtime() {
    if (requireX) return requireX;
    const chunks = window.webpackChunk_twitter_responsive_web;
    if (!Array.isArray(chunks)) return null;
    chunks.push([[`xpls-${crypto.randomUUID()}`], {}, loader => { requireX = loader; }]);
    return requireX;
  }

  function nativeContext() {
    // Read the existing app client from its React/Redux providers. The thunk
    // only reads its extra argument; it does not dispatch a state change.
    const stores = new Set();
    const nodes = document.querySelectorAll('header, main, [data-testid="AppTabBar_Profile_Link"], [data-testid="primaryColumn"], [data-testid="HoverCard"]');
    for (const node of nodes) {
      const key = Object.keys(node).find(key => /^__react(?:Fiber|InternalInstance)\$/.test(key));
      let fiber = key && node[key];
      for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        for (const value of [props, props?.value]) {
          if (value?.api?.apiClient?.graphQLFullResponse && value.api.apiClient.dispatch) return { api: value.api, state: value.reduxStore?.getState?.() };
          for (const store of [value?.store, value?.reduxStore]) {
            if (!store?.dispatch || !store.getState || stores.has(store)) continue;
            stores.add(store);
            try {
              const api = store.dispatch((dispatch, getState, extra) => extra?.api);
              if (typeof api?.apiClient?.graphQLFullResponse === 'function' && typeof api.apiClient.dispatch === 'function') return { api, state: store.getState() };
            } catch { /* Other providers may not use X's thunk middleware. */ }
          }
        }
      }
    }
    return null;
  }

  function serviceError(path, status, errors = []) {
    const operation = new URL(path, location.origin).pathname.split('/').at(-1);
    const codes = errors.map(error => error.code ?? error.extensions?.code).filter(code => /^[\w-]{1,50}$/.test(String(code)));
    const detail = errors.map(error => error.message).find(message => typeof message === 'string');
    let message = `${operation}: X rejected the request${codes.length ? ` (code ${codes.join(', ')})` : status ? ` (HTTP ${status})` : ''}.`;
    if (status === 429 || codes.some(code => String(code) === '88')) message = `${operation}: X is rate limited. Wait a little and retry.`;
    else if (status === 401 || codes.some(code => ['32', '89', '215', '353'].includes(String(code)))) message += ' Refresh X to renew your session.';
    else if (detail) message += ' ' + detail.replace(/[\x00-\x1f]/g, ' ').slice(0, 180);
    const error = new Error(message);
    error.xplsService = true;
    error.status = status;
    error.codes = codes;
    // A read can use the alternate endpoint after an explicit API rejection.
    // Never fall back after a timeout, rate limit, account change or auth error.
    const blocked = [401, 429].includes(status) || codes.some(code => ['32', '89', '215', '353', '88', '326'].includes(String(code)));
    error.alternateRead = !blocked && [200, 400, 403, 404, 405, 410, 501].includes(status);
    error.alternateWrite = !blocked && ([400, 404, 405, 410, 501].includes(status) || (status === 200 && codes.length > 0 && codes.every(code => ['87', '336', '366'].includes(String(code)))));
    return error;
  }

  async function throughNative(model, path, run) {
    checkAccount(model);
    try {
      const result = await run();
      checkAccount(model);
      if (result?.errors?.length) throw serviceError(path, 200, result.errors);
      return result;
    } catch (error) {
      if (error.status !== undefined && !error.xplsService) throw serviceError(path, error.status, error.graphqlErrors?.length ? error.graphqlErrors : error.errors || []);
      throw error;
    }
  }

  function metadata(operation) {
    if (featureAccount !== accountStamp()) { featureAccount = accountStamp(); observed.clear(); featureValues.clear(); }
    if (observed.has(operation)) return observed.get(operation);
    const loader = runtime();
    if (!loader?.m) throw new Error('X’s list service is not ready. Refresh X and try again.');
    for (const [id, factory] of Object.entries(loader.m)) {
      const source = String(factory);
      // Read generated query metadata without evaluating or changing X's code.
      if (!new RegExp(`operationName:["']${operation}["']`).test(source)) continue;
      // Generated modules carry the exact query ID and required feature list.
      // Reading their exports avoids picking another query ID in a big factory.
      let definition;
      try {
        const module = loader(id);
        definition = module?.operationName === operation ? module : module?.default?.operationName === operation ? module.default : null;
      } catch { /* The source fallback below supports older runtimes. */ }
      const match = source.match(/queryId:["']([^"']+)["']/);
      if (!definition?.queryId && !match) continue;
      const switchNames = definition?.metadata?.featureSwitches || (source.match(/featureSwitches:\[([^\]]*)\]/)?.[1]?.match(/["'][^"']+["']/g) || []).map(value => value.slice(1, -1));
      const state = window.__INITIAL_STATE__?.featureSwitch || {};
      const defaults = { ...state.defaultConfig, ...state.features, ...state.user?.config, ...state.user?.features };
      const features = Object.fromEntries(switchNames.map(value => {
        const setting = defaults[value]?.value ?? defaults[value];
        return [value, featureValues.get(value) ?? (setting === true || setting === 'true')];
      }));
      const fields = operation === 'UserByScreenName' ? { withAuxiliaryUserLabels: true, withPayments: false } : {};
      const result = { queryId: definition?.queryId || match[1], features, fields, definition: definition || { queryId: match[1], operationName: operation, operationType: operation.startsWith('ListAdd') || operation.startsWith('ListRemove') ? 'mutation' : 'query', metadata: { featureSwitches: switchNames, fieldToggles: Object.keys(fields) } } };
      observed.set(operation, result);
      return result;
    }
    throw new Error('X’s list service changed. Refresh X and try again.');
  }

  async function loadListModules() {
    const loader = runtime();
    if (!loader?.u || !loader.e) return;
    const names = String(loader.u);
    const ids = [...names.matchAll(/(\d+):["']([^"']+)["']/g)].filter(match => /(?:AddToList|UserLists|ListManagement|bundle\.Lists|^api$)/.test(match[2])).map(match => Number(match[1]));
    await Promise.all([...new Set(ids)].map(id => loader.e(id)));
  }

  async function signer() {
    if (!signerPromise) signerPromise = (async () => {
      const loader = runtime();
      if (!loader?.m) throw new Error('X’s request service is not ready. Refresh X and try again.');
      // Use X's exported header middleware. Its own code resolves the signing
      // helper, even when that helper has moved to another module or chunk.
      for (const [id, factory] of Object.entries(loader.m)) {
        const source = String(factory);
        if (!source.includes('x-client-transaction-id') || !source.includes('rweb_client_transaction_id_enabled')) continue;
        const exports = loader(id);
        for (const candidate of Object.values(exports || {})) {
          if (typeof candidate !== 'function') continue;
          const code = String(candidate);
          if (!code.includes('x-client-transaction-id') || !code.includes('rweb_client_transaction_id_enabled')) continue;
          const middleware = candidate({ isTrue: name => name === 'rweb_client_transaction_id_enabled' });
          if (typeof middleware !== 'function') continue;
          return async (path, method) => {
            const request = { host: location.origin, path, method, headers: {} };
            const signed = await middleware(request, value => value);
            const value = signed?.headers?.['x-client-transaction-id'];
            // X's middleware encodes helper failures as e:<error> in base64.
            let failed = false;
            try { failed = typeof value === 'string' && atob(value).startsWith('e:'); } catch { /* Valid signatures need not use standard padding. */ }
            if (typeof value !== 'string' || !value || failed) throw new Error('X could not initialize request signing. Refresh X and retry.');
            return value;
          };
        }
      }
      // Compatibility with older frontends that expose only the lazy helper.
      for (const factory of Object.values(loader.m)) {
        const source = String(factory);
        if (!source.includes('x-client-transaction-id')) continue;
        const matches = [...source.matchAll(/\.e\(\s*(\d+)\s*\)\s*\.then\(\s*[\w$]+\.bind\(\s*[\w$]+\s*,\s*(\d+)\s*\)\s*\)/g)];
        for (const match of matches) {
          await loader.e(Number(match[1]));
          const module = loader(Number(match[2]));
          const factory = module?.default;
          if (typeof factory !== 'function') continue;
          const result = await factory();
          if (typeof result === 'function') return result;
        }
      }
      throw new Error('X’s request service changed. Refresh X and try again.');
    })().catch(error => { signerPromise = null; throw error; });
    return signerPromise;
  }

  function checkAccount(model) {
    model.controller.signal.throwIfAborted();
    if (model.stamp !== accountStamp()) throw new Error('Account changed. Close this selector and open it again.');
  }

  async function request(model, path, method = 'GET', body = null) {
    checkAccount(model);
    if (model.native?.api) {
      const url = new URL(path, location.origin);
      // Native dispatch applies CSRF, transaction signing, session binding,
      // account delegation and the /i/api rewrite just as X's own UI does.
      return throughNative(model, path, () => model.native.api.apiClient.dispatch({
        path: url.pathname.replace(/^\/i\/api/, ''), method, timeout: 15000,
        signal: model.controller.signal, params: Object.fromEntries(url.searchParams),
        ...(body ? { data: typeof body === 'string' ? Object.fromEntries(new URLSearchParams(body)) : body } : {})
      }));
    }
    if (!sessionHeaders.has('authorization') || !cookie('ct0')) throw new Error('X’s session is not ready. Refresh X and try again.');
    const headers = new Headers(sessionHeaders);
    headers.set('x-csrf-token', cookie('ct0'));
    headers.set('x-twitter-auth-type', 'OAuth2Session');
    headers.set('x-twitter-active-user', 'yes');
    const sign = await signer();
    const url = new URL(path, location.origin);
    headers.set('x-client-transaction-id', await sign(url.pathname, method));
    if (body) headers.set('content-type', typeof body === 'string' ? 'application/x-www-form-urlencoded;charset=UTF-8' : 'application/json');
    checkAccount(model);
    let response;
    try {
      response = await nativeFetch(url.href, { method, headers, credentials: 'include', signal: AbortSignal.any([model.controller.signal, AbortSignal.timeout(15000)]), ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error('X took too long to respond. Retry, or close the selector.');
      throw error;
    }
    let json;
    try { json = await response.json(); } catch { throw serviceError(path, response.status); }
    if (!response.ok || json.errors?.length) throw serviceError(path, response.status, json.errors || []);
    checkAccount(model);
    return json;
  }

  async function graphql(model, operation, variables, write = false) {
    const info = metadata(operation);
    const path = `/i/api/graphql/${encodeURIComponent(info.queryId)}/${operation}`;
    if (model.native?.api) {
      const definition = info.definition || { queryId: info.queryId, operationName: operation, operationType: write ? 'mutation' : 'query', metadata: { featureSwitches: Object.keys(info.features), fieldToggles: Object.keys(info.fields) } };
      return throughNative(model, path, () => model.native.api.apiClient.graphQLFullResponse(definition, variables, errors => errors.length > 0, { fieldToggles: info.fields, timeout: 15000 }));
    }
    const payload = { variables, features: info.features, ...(Object.keys(info.fields).length ? { fieldToggles: info.fields } : {}) };
    return request(model, write ? path : path + '?' + new URLSearchParams(Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, JSON.stringify(value)]))), write ? 'POST' : 'GET', write ? { ...payload, queryId: info.queryId } : null);
  }

  function walk(value, visit) {
    if (!value || typeof value !== 'object') return;
    visit(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, visit);
  }

  async function user(model, handle) {
    let result;
    try {
      const data = await graphql(model, 'UserByScreenName', { screen_name: handle, withSafetyModeUserFields: true, withGrokTranslatedBio: true });
      result = data.data?.user?.result;
    } catch (error) {
      if (!error.alternateRead) throw error;
      result = await request(model, '/i/api/1.1/users/show.json?' + new URLSearchParams({ screen_name: handle, skip_status: '1' }));
    }
    const id = result?.rest_id || result?.id_str;
    const name = result?.core?.screen_name || result?.legacy?.screen_name || result?.screen_name;
    if (!/^\d+$/.test(id || '') || name?.toLowerCase() !== handle.toLowerCase()) throw new Error('This user could not be found. Close the selector and retry.');
    return id;
  }

  function cachedUserId(model, handle) {
    for (const state of [model.native?.state, window.__INITIAL_STATE__]) {
      for (const user of Object.values(state?.entities?.users?.entities || {})) {
        const name = user.screen_name || user.core?.screen_name || user.legacy?.screen_name;
        const id = user.id_str || user.rest_id;
        if (name?.toLowerCase() === handle.toLowerCase() && /^\d+$/.test(id || '')) return id;
      }
    }
    return null;
  }

  async function load(model) {
    try { await loadListModules(); } catch { /* REST compatibility below doesn't need the list-specific bundle. */ }
    model.native = nativeContext();
    const cookieOwner = cookie('twid').replace(/^"|"$/g, '').match(/^(?:(?:u|id)=)?(\d+)$/)?.[1];
    const cachedOwner = cachedUserId(model, model.account);
    if (cookieOwner && cachedOwner && cookieOwner !== cachedOwner) throw new Error('Account changed. Close this selector and open it again.');
    const ownerId = cookieOwner || cachedOwner || await user(model, model.account);
    const targetId = cachedUserId(model, model.handle) || model.targetHint || await user(model, model.handle);
    model.userId = targetId;
    model.ownerId = ownerId;
    const lists = new Map();
    let hasTimeline = true;
    try { metadata('ListsManagementPageTimeline'); } catch { hasTimeline = false; }
    const visited = new Set();
    let cursor = hasTimeline ? null : '-1';
    do {
      if (!hasTimeline) {
        const data = await request(model, '/i/api/1.1/lists/ownerships.json?' + new URLSearchParams({ user_id: ownerId, count: '1000', cursor }));
        if (!Array.isArray(data.lists)) throw new Error('Your lists could not be loaded. Please retry.');
        for (const item of data.lists) {
          if (item.user?.id_str === ownerId && item.user?.screen_name && item.user.screen_name.toLowerCase() !== model.account.toLowerCase()) throw new Error('Account changed. Close this selector and open it again.');
          if (typeof item.id_str === 'string' && typeof item.name === 'string' && item.user?.id_str === ownerId) lists.set(item.id_str, { id: item.id_str, name: item.name, private: item.mode === 'private' });
        }
        const next = data.next_cursor_str ?? (data.next_cursor === 0 ? '0' : null);
        if (next === null || (next !== '0' && visited.has(next))) throw new Error('X returned incomplete list pagination. Please retry.');
        if (next !== '0') visited.add(next);
        cursor = next === '0' ? null : next;
        continue;
      }
      let data;
      try { data = await graphql(model, 'ListsManagementPageTimeline', { count: 100, ...(cursor ? { cursor } : {}) }); }
      catch (error) {
        if (!error.alternateRead) throw error;
        // Restart the read through ownerships, including private/unpinned lists.
        // A rejected timeline is not the same as an account with no lists.
        hasTimeline = false; cursor = '-1'; lists.clear(); visited.clear();
        continue;
      }
      let next = null;
      let pageLists = 0;
      let recognizedTimeline = false;
      let missingOwnership = false;
      walk(data.data, item => {
        if (Array.isArray(item.instructions) || Array.isArray(item.entries)) recognizedTimeline = true;
        const owner = item.user_results?.result || item.user || item.owner;
        const id = item.id_str || item.rest_id;
        if (typeof item.name === 'string' && /^\d+$/.test(id || '') && (owner || item.mode || item.__typename === 'List')) {
          pageLists++;
          const ownerId = (typeof owner === 'string' ? owner : owner?.rest_id || owner?.id_str) || item.owner_id_str;
          const ownerName = owner?.core?.screen_name || owner?.legacy?.screen_name || owner?.screen_name || item.owner_screen_name;
          if (!ownerId && !ownerName) missingOwnership = true;
          if (ownerId === model.ownerId && ownerName && ownerName.toLowerCase() !== model.account.toLowerCase()) throw new Error('Account changed. Close this selector and open it again.');
          if (ownerId === model.ownerId || (!ownerId && ownerName?.toLowerCase() === model.account.toLowerCase())) lists.set(id, { id, name: item.name, private: item.mode === 'Private' || item.mode === 'private' || item.is_private === true });
        }
        if (item.cursorType === 'Bottom' && typeof item.value === 'string') next = item.value;
      });
      if (!recognizedTimeline || missingOwnership) {
        hasTimeline = false; cursor = '-1'; lists.clear(); visited.clear();
        continue;
      }
      // Native timelines can end with an empty page that repeats its cursor.
      if (pageLists === 0) next = null;
      if (next && visited.has(next)) throw new Error('X returned a repeating list cursor. Please retry.');
      if (next) visited.add(next);
      cursor = next;
    } while (cursor);
    model.restLists = !hasTimeline;
    const members = new Set();
    const seen = new Set();
    cursor = '-1';
    do {
      const data = await request(model, '/i/api/1.1/lists/memberships.json?' + new URLSearchParams({ user_id: targetId, count: '1000', cursor, filter_to_owned_lists: 'true', skip_status: '1' }));
      if (!Array.isArray(data.lists)) throw new Error('Membership status could not be loaded. Please retry.');
      for (const item of data.lists) if (typeof item.id_str === 'string') members.add(item.id_str);
      const next = data.next_cursor_str ?? (data.next_cursor === 0 ? '0' : null);
      if (next === null || (next !== '0' && seen.has(next))) throw new Error('Membership status is incomplete. Please retry.');
      if (next !== '0') seen.add(next);
      cursor = next;
    } while (cursor !== '0');
    model.lists = lists;
    model.members = members;
    model.ready = true;
    send(model.id, 'loaded', { lists: [...lists.values()].map(list => ({ ...list, member: members.has(list.id) })) });
  }

  async function save(model, root) {
    if (!model.ready || model.saving) return;
    const inputs = [...root.querySelectorAll('input[data-xpls-list-id]')];
    // Values must be a complete, unique set of lists returned by this account.
    if (inputs.length !== model.lists.size || new Set(inputs.map(input => input.dataset.xplsListId)).size !== inputs.length || inputs.some(input => !model.lists.has(input.dataset.xplsListId))) return;
    const byId = new Map(inputs.map(input => [input.dataset.xplsListId, input]));
    // Display grouping must not change mutation order or how IDs are resolved.
    const changes = [...model.lists.keys()].map(id => ({ id, member: byId.get(id).checked })).filter(item => model.members.has(item.id) !== item.member);
    model.saving = true;
    send(model.id, 'saving');
    try {
      for (const change of changes) {
        const operation = change.member ? 'ListAddMember' : 'ListRemoveMember';
        let known = !model.restLists;
        try { metadata(operation); } catch { known = false; }
        const restChange = () => request(model, `/i/api/1.1/lists/members/${change.member ? 'create' : 'destroy'}.json`, 'POST', new URLSearchParams({ list_id: change.id, user_id: model.userId }).toString());
        let data;
        if (known) {
          try { data = await graphql(model, operation, { listId: change.id, userId: model.userId }, true); }
          catch (error) {
            if (!error.alternateWrite) throw error;
            known = false;
            data = await restChange();
          }
        } else data = await restChange();
        const confirmedId = known ? data.data?.list?.id_str || data.data?.list?.rest_id : data.id_str;
        if (confirmedId !== change.id) throw new Error('X did not confirm the change. Reopen the selector to check membership before retrying.');
        if (change.member) model.members.add(change.id); else model.members.delete(change.id);
        send(model.id, 'confirmed', { listId: change.id, member: change.member });
      }
      send(model.id, 'saved');
    } catch (error) {
      send(model.id, 'error', { message: error.name === 'AbortError' ? 'The request was interrupted. Reopen this selector to check membership.' : error.message });
    } finally { model.saving = false; }
  }

  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || data?.channel !== channel || data.direction !== 'request' || typeof data.id !== 'string') return;
    if (data.type === 'cancel') {
      const model = models.get(data.id);
      model?.controller.abort();
      models.delete(data.id);
      return;
    }
    if (data.type !== 'load' || !/^[a-z0-9_]{1,15}$/i.test(data.handle || '') || !/^[a-z0-9_]{1,15}$/i.test(data.account || '')) return;
    const root = document.getElementById('xpls-list-picker');
    if (root?.dataset.requestId !== data.id || root.dataset.handle !== data.handle) return;
    models.get(data.id)?.controller.abort();
    const model = { id: data.id, handle: data.handle, account: data.account, targetHint: /^\d+$/.test(root.dataset.userId || '') ? root.dataset.userId : null, stamp: accountStamp(), controller: new AbortController(), ready: false };
    models.set(data.id, model);
    load(model).catch(error => {
      if (models.get(model.id) === model) send(model.id, 'error', { message: error.name === 'AbortError' ? 'Loading was interrupted. Retry.' : error.message });
    });
  });
  // Only an actual click on Save can authorize mutations, never a page message.
  document.addEventListener('click', event => {
    if (!event.isTrusted || !event.target.closest('#xpls-list-picker [data-xpls-save]')) return;
    const root = document.getElementById('xpls-list-picker');
    const model = models.get(root?.dataset.requestId);
    if (model && root.dataset.handle === model.handle) save(model, root);
  }, true);
})();
