(() => {
  'use strict';
  const channel = 'xpls-list-picker-v2';
  const owned = '[data-xpls-manage], #xpls-list-picker';
  const reserved = new Set(['home', 'explore', 'search', 'notifications', 'messages', 'i', 'settings', 'compose', 'login', 'logout', 'signup', 'tos', 'privacy']);
  let enabled = false;
  let scheduled = null;
  let picker = null;
  const post = (type, data = {}) => window.postMessage({ channel, direction: 'request', id: picker?.id, type, ...data }, location.origin);

  function profileHandle(href) {
    if (typeof href !== 'string' || !href) return null;
    try {
      const url = new URL(href, location.href);
      const handle = url.origin === location.origin && url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i)?.[1];
      return handle && !reserved.has(handle.toLowerCase()) ? handle : null;
    } catch { return null; }
  }
  function profileRouteHandle() {
    const handle = location.pathname.match(/^\/([a-z0-9_]{1,15})(?:\/(?:with_replies|highlights|media|likes|articles))?\/?$/i)?.[1];
    return handle ? profileHandle(`/${handle}`) : null;
  }
  const viewer = () => profileHandle(document.querySelector('header [data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href'));
  const visible = element => element && getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length > 0;
  const followButton = root => [...root.querySelectorAll('[data-testid$="-follow"], [data-testid$="-unfollow"]')].find(visible);
  function cardHandle(card) {
    const avatar = card.querySelector('[data-testid^="UserAvatar-Container"]');
    const avatarLink = avatar?.closest('a[href]') || avatar?.querySelector('a[href]');
    const names = [...card.querySelectorAll('[data-testid="User-Name"] a[href], [data-testid="UserName"] a[href]')];
    const handles = [...card.querySelectorAll('a[href]')].filter(link => link.textContent.trim().startsWith('@'));
    return [avatarLink, ...names, ...handles].map(link => link && profileHandle(link.getAttribute('href'))).find(Boolean) || null;
  }
  function textStyle(context) {
    const leaf = [...context.querySelectorAll('span')].find(span => span.textContent.trim() && !span.querySelector('span') && !span.closest('button, [role="button"]') && visible(span)) || context;
    return getComputedStyle(leaf);
  }
  const nativeTextStyle = () => textStyle(document.querySelector('header nav') || document.querySelector('main [data-testid="UserName"]') || document.body);
  function position() {
    if (!picker) return;
    const { root, anchor } = picker;
    // Keep the clicked action as the anchor, even if X replaces its portal.
    if (anchor.isConnected) picker.anchorBox = anchor.getBoundingClientRect();
    const box = picker.anchorBox;
    const below = box.bottom + 8;
    root.style.maxHeight = `${Math.max(180, innerHeight - below - 8)}px`;
    const panel = root.getBoundingClientRect();
    root.style.left = `${Math.max(8, Math.min(box.right - panel.width, innerWidth - panel.width - 8))}px`;
    root.style.top = `${Math.max(8, Math.min(box.bottom + 8, innerHeight - panel.height - 8))}px`;
  }
  function closePicker(restore = true, force = false) {
    if (!picker || (picker.saving && !force)) return;
    const { root, anchor, card } = picker;
    post('cancel');
    card?.removeAttribute('data-xpls-card-pinned');
    root.remove();
    anchor.setAttribute('aria-expanded', 'false');
    picker = null;
    if (restore && anchor.isConnected) anchor.focus({ preventScroll: true });
  }
  function load() {
    if (!picker) return;
    picker.ready = false;
    picker.lists = [];
    picker.rows.replaceChildren();
    picker.save.disabled = true;
    picker.search.disabled = true;
    picker.retry.hidden = true;
    picker.message.textContent = 'Loading your lists…';
    picker.root.setAttribute('aria-busy', 'true');
    post('load', { handle: picker.handle, account: picker.account });
  }
  function dirty() {
    if (!picker) return;
    picker.save.disabled = picker.saving || !picker.ready || !picker.lists.some(list => picker.inputs.get(list.id)?.checked !== list.member);
  }
  function filter() {
    const query = picker.search.value.trim().toLowerCase();
    for (const row of picker.rows.children) row.hidden = !row.dataset.name.includes(query);
    picker.empty.hidden = [...picker.rows.children].some(row => !row.hidden);
    picker.empty.textContent = picker.lists.length ? 'No matching lists.' : 'You haven’t created any lists yet.';
  }
  function pinnedRanks(lists) {
    const ranks = new Map();
    const account = document.querySelector('header [data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href');
    if (!account || profileHandle(account) !== picker.account) return ranks;
    let pins = [], order = [];
    try {
      const cached = JSON.parse(localStorage.getItem(`xpls:pinned-lists:v1:${account}`) || '[]');
      const saved = JSON.parse(localStorage.getItem(`xpls:pinned-list-order:v1:${account}`) || '[]');
      if (Array.isArray(cached)) pins = cached.filter(pin => pin && typeof pin.key === 'string' && typeof pin.label === 'string');
      if (Array.isArray(saved)) order = saved.filter(key => typeof key === 'string');
    } catch { /* The visible sidebar still works if site storage is unavailable. */ }
    const live = [...document.querySelectorAll('#xpls-sidebar .xpls-item')].map(item => ({ key: item.dataset.key, label: item.title }));
    // Prefer the current displayed order when its keys belong to this account.
    if (live.length && (!pins.length || live.every(item => pins.some(pin => pin.key === item.key)))) pins = live;
    else {
      const positions = new Map(order.map((key, index) => [key, index]));
      pins = [...pins].sort((a, b) => (positions.get(a.key) ?? Infinity) - (positions.get(b.key) ?? Infinity));
    }
    for (const [index, pin] of pins.entries()) {
      let id = typeof pin.href === 'string' ? pin.href.match(/^\/i\/lists\/(\d+)$/)?.[1] : null;
      try { id ||= JSON.parse(pin.key)?.[0]?.match(/^id:(\d+)$/)?.[1]; } catch { /* Legacy name-only pins are matched below. */ }
      // Never infer a membership or conflate lists that share a name.
      if (!id) {
        const matches = lists.filter(list => list.name === pin.label);
        if (matches.length === 1) id = matches[0].id;
      }
      if (id && !ranks.has(id)) ranks.set(id, index);
    }
    return ranks;
  }
  function renderLists(lists) {
    picker.lists = lists;
    picker.inputs = new Map();
    picker.rows.replaceChildren();
    const pins = pinnedRanks(lists);
    const group = list => list.member ? 0 : pins.has(list.id) ? 1 : 2;
    const displayed = [...lists].sort((a, b) => group(a) - group(b) || (group(a) === 1 ? pins.get(a.id) - pins.get(b.id) : 0));
    // Sort only presentation. Keep IDs, memberships and staged values intact;
    // rows stay put while checking boxes, and regroup on the next open.
    for (const list of displayed) {
      const row = document.createElement('label');
      row.className = 'xpls-list-choice';
      row.dataset.name = list.name.toLowerCase();
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.xplsListId = list.id;
      input.checked = list.member;
      input.addEventListener('change', dirty);
      const name = document.createElement('span');
      name.className = 'xpls-list-name';
      name.textContent = list.name;
      row.append(input, name);
      if (list.private) {
        const badge = document.createElement('span');
        badge.className = 'xpls-private-label';
        badge.textContent = 'Private';
        row.append(badge);
      }
      picker.inputs.set(list.id, input);
      picker.rows.append(row);
    }
    filter();
    dirty();
    position();
  }
  function openPicker(anchor, handle, context) {
    if (!handle || picker?.saving) return;
    closePicker(false);
    const root = document.createElement('div');
    const id = crypto.randomUUID();
    root.id = 'xpls-list-picker';
    root.dataset.requestId = id;
    root.dataset.handle = handle;
    const follow = anchor.parentElement.parentElement.querySelector('[data-testid$="-follow"], [data-testid$="-unfollow"]');
    const userId = follow?.getAttribute('data-testid')?.match(/^(\d+)-(?:un)?follow$/)?.[1];
    if (userId) root.dataset.userId = userId;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-labelledby', 'xpls-list-picker-title');
    const style = nativeTextStyle();
    root.style.color = style.color;
    root.style.font = `400 14px/1.4 ${style.fontFamily}`;
    const rgb = style.color.match(/\d+/g)?.map(Number) || [15, 20, 25];
    root.style.background = rgb[0] + rgb[1] + rgb[2] > 400 ? '#15202b' : '#fff';
    const header = document.createElement('div');
    header.className = 'xpls-list-picker-header';
    const title = document.createElement('strong');
    title.id = 'xpls-list-picker-title';
    title.textContent = `Lists for @${handle}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    close.setAttribute('aria-label', 'Close list selector');
    close.addEventListener('click', () => closePicker());
    header.append(title, close);
    const search = document.createElement('input');
    search.type = 'search'; search.placeholder = 'Search your lists';
    search.setAttribute('aria-label', 'Search your lists');
    search.addEventListener('input', filter);
    const rows = document.createElement('div');
    rows.className = 'xpls-list-choices';
    const empty = document.createElement('p'); empty.hidden = true;
    const message = document.createElement('p');
    message.className = 'xpls-list-picker-message';
    message.setAttribute('role', 'status');
    const footer = document.createElement('div');
    footer.className = 'xpls-list-picker-footer';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = 'Retry'; retry.hidden = true;
    retry.addEventListener('click', load);
    const save = document.createElement('button');
    save.type = 'button'; save.textContent = 'Save'; save.dataset.xplsSave = 'true'; save.disabled = true;
    // The page-world bridge requires a real user click before sending mutations.
    save.addEventListener('click', event => { if (event.isTrusted && picker && !picker.save.disabled) { picker.saving = true; setSaving(true); } });
    footer.append(retry, save);
    root.append(header, search, rows, empty, message, footer);
    document.body.append(root);
    picker = { id, root, anchor, anchorBox: anchor.getBoundingClientRect(), card: anchor.closest('[data-testid="HoverCard"]'), handle, account: viewer(), path: location.pathname, search, rows, empty, message, retry, save, close, lists: [], inputs: new Map(), ready: false, saving: false };
    anchor.setAttribute('aria-expanded', 'true');
    if (picker.card) {
      picker.card.setAttribute('data-xpls-card-pinned', 'true');
      post('pin-card');
    }
    position();
    if (!picker.account) { message.textContent = 'Your signed-in account is still loading. Retry in a moment.'; retry.hidden = false; }
    else load();
    root.tabIndex = -1;
    root.focus({ preventScroll: true });
  }
  function setSaving(saving) {
    picker.root.setAttribute('aria-busy', String(saving));
    picker.close.disabled = saving;
    picker.search.disabled = saving;
    for (const input of picker.inputs.values()) input.disabled = saving;
    if (saving) { picker.save.disabled = true; picker.message.textContent = 'Saving…'; picker.retry.hidden = true; }
    else dirty();
  }
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || data?.channel !== channel || data.direction !== 'result' || data.id !== picker?.id) return;
    if (data.type === 'loaded') {
      if (!Array.isArray(data.lists) || data.lists.some(list => typeof list.id !== 'string' || typeof list.name !== 'string' || typeof list.member !== 'boolean')) return;
      picker.ready = true;
      picker.root.removeAttribute('aria-busy');
      picker.search.disabled = false;
      picker.message.textContent = 'Choose lists, then save.';
      renderLists(data.lists);
    } else if (data.type === 'saving') {
      picker.saving = true;
      setSaving(true);
    } else if (data.type === 'confirmed') {
      const list = picker.lists.find(list => list.id === data.listId);
      if (list) list.member = data.member;
    } else if (data.type === 'saved') {
      picker.saving = false;
      closePicker();
    } else if (data.type === 'error') {
      picker.saving = false;
      setSaving(false);
      picker.message.textContent = typeof data.message === 'string' ? data.message : 'The list request failed. Retry.';
      picker.retry.hidden = picker.ready;
      picker.save.textContent = picker.ready ? 'Retry save' : 'Save';
    }
  });

  function inject(follow, scope, handle, context) {
    const parent = follow.parentElement;
    let wrapper = parent.querySelector(`:scope > [data-xpls-manage="${scope}"]`);
    if (!wrapper) {
      wrapper = document.createElement('span');
      wrapper.dataset.xplsManage = scope;
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'xpls-manage-link';
      link.textContent = 'Add/remove from list';
      link.setAttribute('aria-haspopup', 'dialog');
      link.setAttribute('aria-expanded', 'false');
      link.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        const current = scope === 'hover' ? cardHandle(link.closest('[data-testid="HoverCard"]')) : profileRouteHandle();
        if (current) openPicker(link, current, context);
      });
      wrapper.append(link);
      parent.append(wrapper);
    }
    wrapper.dataset.handle = handle;
    const link = wrapper.querySelector('button');
    link.setAttribute('aria-label', `Add/remove @${handle} from lists`);
    const style = textStyle(context);
    link.style.color = style.color;
    // Both surfaces use the profile's small action typography, independent of
    // typography rules on X's hover-card buttons or display names.
    link.style.font = `400 11px/14px ${nativeTextStyle().fontFamily}`;
    parent.setAttribute('data-xpls-manage-anchor', 'true');
    const box = follow.getBoundingClientRect();
    const base = parent.getBoundingClientRect();
    wrapper.style.top = `${box.bottom - base.top + 4}px`;
    wrapper.style.right = `${base.right - box.right}px`;
  }
  function remove(element) {
    const parent = element.parentElement;
    element.remove();
    if (!parent?.querySelector(':scope > [data-xpls-manage]')) parent?.removeAttribute('data-xpls-manage-anchor');
  }
  function update() {
    scheduled = null;
    if (!enabled) {
      delete document.documentElement.dataset.xplsHoverEnabled;
      closePicker(false, true);
      document.querySelectorAll('[data-xpls-manage]').forEach(remove);
      return;
    }
    if (document.documentElement.dataset.xplsHoverEnabled !== 'true') document.documentElement.dataset.xplsHoverEnabled = 'true';
    if (picker && (viewer()?.toLowerCase() !== picker.account?.toLowerCase() || location.pathname !== picker.path)) closePicker(false, true);
    for (const card of document.querySelectorAll('[data-testid="HoverCard"]')) {
      const handle = cardHandle(card);
      const follow = followButton(card);
      const old = card.querySelector('[data-xpls-manage="hover"]');
      if (!handle || !follow) { if (old) remove(old); continue; }
      if (old && old.parentElement !== follow.parentElement) remove(old);
      inject(follow, 'hover', handle, card.querySelector('[data-testid="User-Name"], [data-testid="UserName"]') || card);
    }
    const handle = profileRouteHandle();
    const column = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
    const follow = handle && [...(column?.querySelectorAll('[data-testid$="-follow"], [data-testid$="-unfollow"]') || [])].find(button => visible(button) && !button.closest('[data-testid="tweet"], [data-testid="UserCell"], [data-testid="HoverCard"], aside'));
    for (const old of document.querySelectorAll('[data-xpls-manage="profile"]')) if (!follow || old.parentElement !== follow.parentElement) remove(old);
    if (follow) inject(follow, 'profile', handle, column.querySelector('[data-testid="UserName"], [data-testid="User-Name"]') || column);
  }
  function schedule() { if (scheduled === null) scheduled = setTimeout(update, 60); }
  new MutationObserver(mutations => {
    if (mutations.some(mutation => {
      const element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (element?.closest(owned)) return false;
      return !(mutation.type === 'childList' && [...mutation.addedNodes, ...mutation.removedNodes].every(node => node instanceof Element && node.matches(owned)));
    })) schedule();
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'data-testid', 'aria-hidden', 'style'] });
  for (const type of ['mouseout', 'mouseleave', 'pointerout', 'pointerleave', 'focusout']) {
    window.addEventListener(type, event => {
      if (picker?.card?.contains(event.target)) event.stopImmediatePropagation();
    }, true);
  }
  document.addEventListener('pointerdown', event => {
    if (picker && !picker.root.contains(event.target) && !picker.card?.contains(event.target) && !event.target.closest('.xpls-manage-link')) closePicker(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && picker) { event.preventDefault(); event.stopPropagation(); closePicker(); }
  }, true);
  addEventListener('resize', () => { position(); schedule(); }, { passive: true });
  addEventListener('popstate', schedule);
  addEventListener('pageshow', schedule);
  setInterval(() => { if (!document.hidden) schedule(); }, 1500);
  chrome.storage.local.get({ enabled: true }, value => { enabled = value.enabled !== false; schedule(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) { enabled = changes.enabled.newValue !== false; schedule(); }
  });
})();
