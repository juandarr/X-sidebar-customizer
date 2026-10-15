// Account-scoped sidebar preferences. Defaults use X's own view controls.
(() => {
  'use strict';
  const storePrefix = 'xpls:sidebar-preferences:v1:';
  const sharedPrefix = 'xpls:sidebar-preferences:v2:';
  let shared = {}, storageReady = false, binding = '';
  let notices = '';
  let enabled = false, frame = null, panel = null, identity = '', settings = null;
  let path = location.pathname, defaultTask = null, taskTimer = null, homeIntent = false, homeFromHome = false, visitActive = false, repairs = 0;
  const home = () => /^\/(?:home\/?)?$/.test(location.pathname);
  // Only fresh app entry uses the Home preference. Reload and history entries
  // belong to X's router, including its selected timeline and scroll state.
  let entryDefault = home() && (performance.getEntriesByType('navigation')[0]?.type || 'navigate') === 'navigate';
  const banner = () => document.querySelector('header[role="banner"]') || document.querySelector('header');
  const profile = () => banner()?.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href');
  function account() {
    try {
      const id = decodeURIComponent(document.cookie.split('; ').find(value => value.startsWith('twid='))?.slice(5) || '').match(/^u=(\d+)$/)?.[1];
      return id || (profile() && `handle:${profile()}`) || '';
    } catch { return ''; }
  }
  function validHome(value) {
    if (value?.kind === 'for-you') return { kind: 'for-you' };
    if (value?.kind === 'following' && ['popular', 'recent'].includes(value.sort)) return { kind: 'following', sort: value.sort };
    if (value?.kind === 'list' && typeof value.key === 'string' && typeof value.label === 'string') {
      return { kind: 'list', key: value.key, label: value.label, href: typeof value.href === 'string' && /^\/i\/lists\/\d+$/.test(value.href) ? value.href : null };
    }
    return { kind: 'for-you' };
  }
  function handleKey() {
    const handle = profile()?.match(/^\/([a-z0-9_]{1,15})\/?$/i)?.[1];
    return handle ? `handle:${handle.toLowerCase()}` : '';
  }
  function normalized(value) {
    return { home: validHome(value?.home), minimal: value?.minimal === true };
  }
  function load() {
    const uid = /^\d+$/.test(identity) ? identity : null;
    const primary = shared[sharedPrefix + identity];
    const alias = shared[sharedPrefix + handleKey()];
    const eligible = [primary, alias].filter(record => record && (!uid || !record.uid || record.uid === uid));
    const record = eligible.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    let value = record, legacy = false;
    if (!value) {
      try {
        const raw = localStorage.getItem(storePrefix + identity);
        if (raw) { value = JSON.parse(raw); legacy = !!value && typeof value === 'object'; }
      } catch { /* Defaults work even when site storage is blocked. */ }
    }
    settings = normalized(value);
    // Upgrade site-only preferences and a verified handle alias to durable,
    // cross-origin extension storage without touching pins or memberships.
    if (legacy || record && uid && (!primary || record.updatedAt > primary.updatedAt || record.uid !== uid || handleKey() && record.handle !== handleKey())) persist(false);
  }
  function persist(report = true) {
    const record = { ...settings, uid: /^\d+$/.test(identity) ? identity : null, handle: handleKey(), updatedAt: Date.now() };
    const values = { [sharedPrefix + identity]: record };
    if (record.handle) values[sharedPrefix + record.handle] = record;
    Object.assign(shared, values);
    try { localStorage.setItem(storePrefix + identity, JSON.stringify(settings)); } catch { /* Extension storage remains durable. */ }
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError && report) status('Could not save across visits. Please try again.');
    });
  }
  function save() { persist(); }
  function status(message = '') {
    notices = message;
    const node = panel?.querySelector('[role="status"]');
    if (node) { node.textContent = message; node.hidden = !message; }
  }
  function pins() {
    let cached = [];
    try {
      const value = JSON.parse(localStorage.getItem(`xpls:pinned-lists:v1:${profile()}`) || '[]');
      if (Array.isArray(value)) cached = value.filter(item => typeof item?.key === 'string' && typeof item.label === 'string');
      const order = JSON.parse(localStorage.getItem(`xpls:pinned-list-order:v1:${profile()}`) || '[]');
      const ranks = new Map(Array.isArray(order) ? order.map((key, index) => [key, index]) : []);
      cached.sort((a, b) => (ranks.get(a.key) ?? Infinity) - (ranks.get(b.key) ?? Infinity));
    } catch { /* Live pins remain available. */ }
    const live = [...document.querySelectorAll('#xpls-sidebar .xpls-item')];
    return live.length ? live.map(item => {
      const saved = cached.find(pin => pin.key === item.dataset.key);
      let id;
      try { id = JSON.parse(item.dataset.key)?.[0]?.match(/^id:(\d+)$/)?.[1]; } catch { /* Older name-only pin. */ }
      return { key: item.dataset.key, label: item.title, href: id ? `/i/lists/${id}` : saved?.href || null };
    }) : cached.map(pin => ({ ...pin, href: typeof pin.href === 'string' && /^\/i\/lists\/\d+$/.test(pin.href) ? pin.href : null }));
  }
  const choiceKey = value => value.kind === 'list' ? `list:${value.key}` : value.kind === 'following' ? `following:${value.sort}` : 'for-you';
  function syncOptions() {
    if (!panel) return;
    const select = panel.querySelector('select');
    const choices = [
      [{ kind: 'for-you' }, 'For you'],
      [{ kind: 'following', sort: 'popular' }, 'Following: popular'],
      [{ kind: 'following', sort: 'recent' }, 'Following: recent'],
      ...pins().map(pin => [{ kind: 'list', ...pin }, pin.label])
    ];
    const selected = choiceKey(settings.home);
    if (!choices.some(([value]) => choiceKey(value) === selected)) choices.push([settings.home, settings.home.label]);
    const signature = JSON.stringify(choices);
    if (select.dataset.signature !== signature) {
      select.replaceChildren(...choices.map(([value, label, disabled]) => {
        const option = document.createElement('option'); option.value = choiceKey(value); option.textContent = label;
        option.dataset.choice = JSON.stringify(value); option.disabled = !!disabled; return option;
      }));
      select.dataset.signature = signature;
    }
    select.value = selected;
    panel.querySelector('[data-xpls-minimal-switch]').checked = settings.minimal;
  }
  function mount() {
    const root = banner(), nav = root?.querySelector('nav'), anchor = root?.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    const homeLink = nav?.querySelector('a[href="/home"]') || nav;
    const nativeLabel = homeLink && [...homeLink.querySelectorAll('span')].find(span => span.textContent.trim() && !span.querySelector('span') && span.getClientRects().length && getComputedStyle(span).display !== 'none');
    if (!anchor || !nav || !nativeLabel || root.getBoundingClientRect().width < 160) { panel?.remove(); panel = null; return; }
    let branch = anchor;
    while (branch.parentElement && branch.parentElement !== root && !branch.parentElement.contains(nav)) branch = branch.parentElement;
    if (panel && (!panel.isConnected || panel.nextElementSibling !== branch)) { panel.remove(); panel = null; }
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'xpls-preferences'; panel.setAttribute('aria-label', 'Sidebar preferences');
      const label = document.createElement('label'); label.className = 'xpls-pref-label'; label.htmlFor = 'xpls-home-view'; label.textContent = 'Home view';
      const wrap = document.createElement('div'); wrap.className = 'xpls-pref-select';
      const select = document.createElement('select'); select.id = 'xpls-home-view';
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 12 12'); icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
      wrap.append(select, icon);
      const minimal = document.createElement('label'); minimal.className = 'xpls-pref-switch';
      const name = document.createElement('span'); name.textContent = 'Minimal UI';
      const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', 'Minimal UI');
      toggle.dataset.xplsMinimalSwitch = ''; toggle.title = 'Hide post controls and right-sidebar extras; keep search'; minimal.append(name, toggle);
      const message = document.createElement('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite'); message.hidden = true;
      panel.append(label, wrap, minimal, message); branch.before(panel);
      // These controls are siblings of the entire account branch, never inside
      // its Pressable. Keep their events out of delegated native account actions.
      for (const name of ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown']) panel.addEventListener(name, event => event.stopPropagation());
      status(notices);
      select.addEventListener('change', () => {
        settings.home = validHome(JSON.parse(select.selectedOptions[0].dataset.choice));
        entryDefault = false; homeIntent = false; cancelDefault(); save(); schedule();
      });
      toggle.addEventListener('change', () => { settings.minimal = toggle.checked; status(); save(); schedule(); });
    }
    const leaf = nativeLabel;
    const style = getComputedStyle(leaf); panel.style.font = `400 ${Math.min(15, parseFloat(style.fontSize) || 15)}px/1.4 ${style.fontFamily}`; panel.style.color = style.color;
    const rgb = style.color.match(/\d+/g)?.map(Number); panel.style.colorScheme = rgb && rgb.slice(0, 3).reduce((sum, value) => sum + value, 0) > 400 ? 'dark' : 'light';
    syncOptions();
  }
  function clearMinimal() {
    delete document.documentElement?.dataset.xplsMinimal;
    document.querySelectorAll('[data-xpls-minimal-hidden]').forEach(node => node.removeAttribute('data-xpls-minimal-hidden'));
  }
  function minimalUI() {
    if (!settings.minimal) { clearMinimal(); return; }
    document.documentElement.dataset.xplsMinimal = 'true';
    const root = banner(), nav = root?.querySelector('nav');
    const button = root?.querySelector('[data-testid="SideNav_NewTweet_Button"], a[href="/compose/tweet"], a[href="/compose/post"]');
    const hidden = new Set();
    if (button) {
      const width = button.getBoundingClientRect().width;
      if (width > 0) button.dataset.xplsComposeWidth = String(width);
      let branch = button;
      while (branch.parentElement && !branch.parentElement.contains(nav)) branch = branch.parentElement;
      hidden.add(branch.contains(root.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')) ? button : branch);
    }
    if (home() || /^\/i\/lists\/\d+\/?$/.test(location.pathname)) {
      const column = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
      const editor = column?.querySelector('[data-testid="tweetTextarea_0"]:not([data-xpls-ignore])');
      let composer = column?.querySelector('.tweet-box');
      if (editor && !editor.closest('[role="dialog"], [data-testid="tweet"]')) {
        for (let node = editor.parentElement, depth = 0; node && node !== column && depth < 14; node = node.parentElement, depth++) {
          if (node.querySelector('[data-testid="toolBar"], [data-testid="tweetButtonInline"]') && !node.querySelector('nav [role="tablist"]')) { composer = node; break; }
        }
      }
      if (composer) hidden.add(composer);
    }
    document.querySelectorAll('[data-xpls-minimal-hidden]').forEach(node => { if (!hidden.has(node)) node.removeAttribute('data-xpls-minimal-hidden'); });
    for (const node of hidden) if (!node.hasAttribute('data-xpls-minimal-hidden')) node.setAttribute('data-xpls-minimal-hidden', 'true');
  }
  function clearRight() {
    document.querySelectorAll('[data-xpls-right-hidden]').forEach(node => node.removeAttribute('data-xpls-right-hidden'));
  }
  function rightSidebar() {
    if (!settings.minimal) { clearRight(); return; }
    const hidden = new Set();
    for (const column of document.querySelectorAll('[data-testid="sidebarColumn"]')) {
      const roots = new Set(column.querySelectorAll('[role="search"], [data-testid="typeaheadDropdown"], [data-testid="SearchBox"], [role="listbox"]'));
      const inputs = column.querySelectorAll('[data-testid="SearchBox_Search_Input"], input[type="search"], input[aria-label*="Search" i]');
      for (const input of inputs) {
        let root = input.closest('form, [role="search"], [data-testid="SearchBox"]') || input.parentElement?.parentElement || input;
        if (root === column || !column.contains(root)) root = input.parentElement || input;
        roots.add(root);
        for (const id of (input.getAttribute('aria-controls') || input.getAttribute('aria-owns') || '').split(/\s+/)) {
          const popup = id && document.getElementById(id);
          if (popup && column.contains(popup)) roots.add(popup);
        }
      }
      for (const node of column.querySelectorAll('[data-testid]')) if (/searchbox|typeahead/i.test(node.dataset.testid)) roots.add(node);
      function prune(node) {
        if ([...roots].some(root => root === node || root.contains(node))) return;
        if (![...roots].some(root => node.contains(root))) { hidden.add(node); return; }
        for (const child of node.children) prune(child);
      }
      for (const child of column.children) prune(child);
    }
    document.querySelectorAll('[data-xpls-right-hidden]').forEach(node => { if (!hidden.has(node)) node.removeAttribute('data-xpls-right-hidden'); });
    for (const node of hidden) if (!node.hasAttribute('data-xpls-right-hidden')) node.setAttribute('data-xpls-right-hidden', 'true');
  }
  function matchingList(choice, candidates) {
    const exact = candidates.find(pin => pin.key === choice.key || choice.href && pin.href === choice.href);
    if (exact) return exact;
    const names = candidates.filter(pin => pin.label === choice.label);
    return names.length === 1 ? names[0] : null;
  }
  function nativePins(tabs) {
    const occurrences = new Map();
    return tabs.slice(2).map(tab => {
      const label = (tab.querySelector('span')?.textContent || tab.textContent).trim();
      const id = tab.getAttribute('href')?.match(/^\/i\/lists\/(\d+)$/)?.[1];
      const value = id ? `id:${id}` : `label:${label}`;
      const count = occurrences.get(value) || 0; occurrences.set(value, count + 1);
      return { key: JSON.stringify([value, count]), label, href: id ? `/i/lists/${id}` : null, tab };
    });
  }
  function finishDefault() { defaultTask = null; clearTimeout(taskTimer); }
  function cancelDefault() { finishDefault(); visitActive = false; status(); }
  function beginDefault(repair = false) {
    finishDefault();
    if (!enabled || !home() || !identity) return;
    visitActive = true; if (!repair) repairs = 0;
    // A sidebar list with no direct URL uses Home as a navigation waypoint.
    try {
      const intent = JSON.parse(sessionStorage.getItem('xpls:open-pinned-list:v1') || 'null');
      if (intent?.account === `xpls:pinned-list-order:v1:${profile()}` && Date.now() - intent.time < 60000) { visitActive = false; return; }
    } catch { /* Default navigation does not depend on session storage. */ }
    // A native Home navigation already added its history entry. Replace that
    // waypoint with the list URL instead of adding a second Back step.
    defaultTask = { choice: settings.home, identity, stage: 'start', pushList: homeIntent && homeFromHome };
    homeIntent = false;
    taskTimer = setTimeout(() => {
      if (defaultTask) status('Waiting for your saved Home view…');
    }, 15000);
  }
  function sortItems() {
    for (const root of document.querySelectorAll('[role="menu"], [data-testid="sheetDialog"]')) {
      const items = [...root.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')];
      const popular = items.find(item => /^(?:most\s+)?popular\b/i.test(item.textContent.trim()));
      const recent = items.find(item => /^(?:most\s+)?recent\b|^latest\b/i.test(item.textContent.trim()));
      if (popular && recent && root.getClientRects().length) return { popular, recent };
    }
    return null;
  }
  function applyDefault() {
    const task = defaultTask;
    if (!task || task.identity !== identity || !home()) return;
    // A saved native list URL remains a valid Home destination even before
    // account metadata or the pin catalog has mounted on a cold launch.
    if (task.choice.kind === 'list' && task.choice.href) {
      const href = task.choice.href; const pushList = task.pushList;
      cancelDefault(); status(); if (pushList) location.assign(href); else location.replace(href); return;
    }
    if (location.pathname === '/') { cancelDefault(); location.replace('/home'); return; }
    const column = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
    const tabs = [...(column?.querySelectorAll('nav [role="tab"]') || [])].filter(tab => !tab.closest('[id^="cpft"]'));
    if (tabs.length < 2) return;
    if (task.choice.kind === 'list') {
      const native = matchingList(task.choice, nativePins(tabs));
      const pin = native || matchingList(task.choice, pins());
      // Missing on the first frame means loading, not unpinned. Keep the saved
      // choice and wait for native tabs; do not replace it with For you.
      if (!pin) return;
      if (pin.href) { cancelDefault(); status(); if (task.pushList) location.assign(pin.href); else location.replace(pin.href); return; }
      if (native?.tab) { cancelDefault(); status(); native.tab.click(); return; }
      const button = [...document.querySelectorAll('#xpls-sidebar .xpls-item')].find(item => item.dataset.key === pin.key);
      if (button) { cancelDefault(); status(); button.click(); }
      return;
    }
    const tab = tabs[task.choice.kind === 'for-you' ? 0 : 1];
    if (task.stage === 'start') {
      task.stage = 'view';
      if (tab.getAttribute('aria-selected') !== 'true') { tab.click(); return; }
    }
    if (task.stage === 'view' && tab.getAttribute('aria-selected') === 'true') {
      if (task.choice.kind === 'for-you') { finishDefault(); status(); return; }
      const items = sortItems();
      task.stage = 'menu';
      if (!items) {
        const trigger = tab.querySelector('[aria-haspopup="menu"], button, [role="button"]') || tab.querySelector('svg')?.parentElement || tab;
        trigger.click(); return;
      }
    }
    if (task.stage === 'menu') {
      const items = sortItems();
      if (!items) return;
      // Call the native choice once. No ranking rewrite, polling delay or reload.
      finishDefault(); status(); items[task.choice.sort].click();
    }
  }
  function update() {
    frame = null;
    if (!storageReady) return;
    if (!enabled) { panel?.remove(); panel = null; clearMinimal(); clearRight(); cancelDefault(); identity = ''; binding = ''; return; }
    const current = account();
    const currentBinding = `${current}|${handleKey()}`;
    if (current !== identity || currentBinding !== binding) {
      const sameAccount = current === identity;
      const previous = settings && choiceKey(settings.home);
      identity = current; binding = currentBinding;
      if (!sameAccount) cancelDefault();
      panel?.remove(); panel = null;
      if (identity) {
        load();
        // Late profile metadata must neither cancel a pending fresh-entry
        // default nor create a new default during history restoration.
        if (sameAccount && previous !== choiceKey(settings.home)) cancelDefault();
      }
    }
    if (!identity) return;
    if (path !== location.pathname) {
      path = location.pathname; cancelDefault();
      if (!home()) entryDefault = false;
    }
    if (home() && (entryDefault || homeIntent)) { entryDefault = false; beginDefault(); }
    mount(); minimalUI(); rightSidebar();
    if (visitActive && !defaultTask && home() && settings.home.kind !== 'list') {
      const column = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
      const tabs = [...(column?.querySelectorAll('nav [role="tab"]') || [])].filter(tab => !tab.closest('[id^="cpft"]'));
      const target = tabs[settings.home.kind === 'for-you' ? 0 : 1];
      // Some clients restore their own tab after initial mount. Reapply the
      // Home preference at most twice; a user's manual choice always releases it.
      if (target && target.getAttribute('aria-selected') !== 'true') {
        if (repairs++ < 2) beginDefault(true);
        else { cancelDefault(); status('Another extension is controlling Home. Check its default-view settings.'); }
      }
    }
    applyDefault();
  }
  function schedule() { if (frame === null) frame = requestAnimationFrame(update); }
  document.addEventListener('click', event => {
    if (!enabled || !event.isTrusted || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('header nav a[href="/home"]');
    if (link) {
      homeFromHome = home();
      homeIntent = true;
      entryDefault = false; cancelDefault(); schedule();
    } else if (event.target.closest('[role="tab"], [role="menuitem"], [role="menuitemradio"], #xpls-sidebar .xpls-item')) {
      entryDefault = false; homeIntent = false; cancelDefault();
    }
  }, { capture: true, passive: true });
  new MutationObserver(mutations => {
    if (mutations.some(change => !(change.target instanceof Element && change.target.closest('#xpls-preferences')))) schedule();
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'aria-selected', 'class'] });
  function historyReturn() {
    entryDefault = false; homeIntent = false; cancelDefault(); schedule();
  }
  addEventListener('popstate', historyReturn);
  addEventListener('pageshow', event => { if (event.persisted) historyReturn(); else schedule(); });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('storage', event => { if (settings && (event.key === storePrefix + identity || event.key === null)) { const previous = choiceKey(settings.home); load(); if (previous !== choiceKey(settings.home)) { entryDefault = false; homeIntent = false; cancelDefault(); } schedule(); } else if (event.key?.startsWith('xpls:pinned-')) schedule(); });
  setInterval(() => { if (!document.hidden && path !== location.pathname) schedule(); }, 500);
  chrome.storage.local.get(null, values => {
    shared = values || {}; enabled = shared.enabled !== false; storageReady = true; schedule();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled) { enabled = changes.enabled.newValue !== false; entryDefault = false; homeIntent = false; cancelDefault(); schedule(); }
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith(sharedPrefix)) continue;
      if (change.newValue) shared[key] = change.newValue; else delete shared[key];
    }
    if (identity && (changes[sharedPrefix + identity] || changes[sharedPrefix + handleKey()])) {
      const previous = choiceKey(settings.home); load();
      if (previous !== choiceKey(settings.home)) { entryDefault = false; homeIntent = false; cancelDefault(); }
      schedule();
    }
  });
})();
