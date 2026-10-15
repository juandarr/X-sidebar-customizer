// Cosmetic header adjustments only. X owns every Following interaction.
(() => {
  'use strict';
  let enabled = false, pending = null, checkedMenu = null;
  const home = () => /^\/home\/?$/.test(location.pathname);
  const primary = () => document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
  const tabs = () => home() ? [...(primary()?.querySelectorAll('nav [role="tab"]') || [])] : [];
  const labelOf = tab => (tab.querySelector('[data-xpls-tab-label]')?.textContent || tab.textContent).trim();
  function viewerId() {
    try { return decodeURIComponent(document.cookie.split('; ').find(value => value.startsWith('twid='))?.slice(5) || '').match(/^u=(\d+)$/)?.[1] || null; } catch { return null; }
  }
  function nativeSortItems() {
    for (const root of document.querySelectorAll('[role="menu"], [data-testid="sheetDialog"]')) {
      if (!root.getClientRects().length) continue;
      const items = [...root.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')];
      const popular = items.find(item => /^(?:most\s+)?popular\b/i.test(item.textContent.trim()));
      const recent = items.find(item => /^(?:most\s+)?recent\b|^latest\b/i.test(item.textContent.trim()));
      if (popular && recent) return { popular, recent };
    }
    return null;
  }
  function recordNativeSort(value) {
    const viewer = viewerId();
    if (!viewer) return;
    const root = document.documentElement;
    if (root.dataset.xplsNativeSortViewer !== viewer) root.dataset.xplsNativeSortViewer = viewer;
    if (root.dataset.xplsNativeSort !== value) root.dataset.xplsNativeSort = value;
  }
  function observedSort() {
    const root = document.documentElement;
    if (!viewerId() || root.dataset.xplsNativeSortViewer !== viewerId()) return null;
    return ['popular', 'recent'].includes(root.dataset.xplsNativeSort) ? root.dataset.xplsNativeSort : null;
  }
  function viewTextStyle(column) {
    // Every view uses the same reference; Following's own text can be inside
    // a native button with a different font or an unstyled wrapper.
    const nav = document.querySelector('header nav');
    const leaf = nav && [...nav.querySelectorAll('span')].find(span => span.textContent.trim() && !span.querySelector('span') && span.getClientRects().length);
    return getComputedStyle(leaf || document.querySelector('#xpls-sidebar .xpls-label') || column);
  }

  function composerAnchor(column) {
    const editor = column.querySelector('[data-testid="tweetTextarea_0"]');
    if (editor) {
      let node = editor.parentElement;
      for (let depth = 0; node && node !== column && depth < 14; depth++, node = node.parentElement) {
        if (node.querySelector('[data-testid="toolBar"], [data-testid="tweetButtonInline"]') && !node.querySelector('nav [role="tablist"]')) return node;
      }
    }
    return column.querySelector('.tweet-box') || column.querySelector('nav');
  }
  const arrowShapes = new WeakMap();
  function rightArrow(path) {
    const shape = path.getAttribute('d') || '';
    if (/M12\.04 3\.97|M4 12h16|M5 12h14|M11 11V4h2v7h7/.test(shape)) return true;
    const cached = arrowShapes.get(path);
    if (cached?.shape === shape) return cached.result;
    let result = false, measurable = false;
    try {
      // Identify a right-facing arrow by its centered tip and wider head.
      // This also handles new icon paths without hiding search/back buttons.
      const box = path.getBBox(), length = path.getTotalLength();
      if (box.width > 0 && box.height > 0 && length > 0) {
        measurable = true;
        const points = Array.from({ length: 65 }, (_, i) => path.getPointAtLength(length * i / 64));
        const tip = points.filter(point => point.x >= box.x + box.width * .95);
        const left = points.filter(point => point.x <= box.x + box.width * .35);
        const right = points.filter(point => point.x >= box.x + box.width * .55);
        const height = group => group.length ? Math.max(...group.map(point => point.y)) - Math.min(...group.map(point => point.y)) : 0;
        result = tip.length > 0 && tip.every(point => Math.abs(point.y - box.y - box.height / 2) < box.height * .2) && height(right) > height(left) + box.height * .3;
      }
    } catch { /* Hidden or unsupported SVG geometry; named controls still match. */ }
    if (measurable) arrowShapes.set(path, { shape, result });
    return result;
  }

  const marks = ['data-xpls-tab-label', 'data-xpls-following-tab', 'data-xpls-next-arrow', 'data-xpls-inline-sort'];
  function cleanup() {
    document.getElementById('xpls-timeline-label')?.remove();
    for (const name of marks) document.querySelectorAll(`[${name}]`).forEach(node => {
      node.removeAttribute(name);
      if (name === 'data-xpls-inline-sort') {
        node.style.removeProperty('--xpls-sort-left'); node.style.removeProperty('--xpls-sort-top');
      }
    });
  }
  function alignNativeChevron(tab, label) {
    // Keep the actual native Pressable and its React handlers in place. Use
    // text bounds rather than its full-width wrapper to locate the icon.
    const icon = [...tab.querySelectorAll('svg')].find(svg => !svg.closest('[aria-hidden="true"][data-testid]'));
    if (!icon || !label) return;
    let trigger = icon.closest('button, [role="button"], [aria-haspopup="menu"]');
    if (!trigger || trigger === tab || !tab.contains(trigger)) trigger = icon.parentElement;
    if (!trigger || trigger === tab || trigger.textContent.trim()) return;
    const range = document.createRange(); range.selectNodeContents(label);
    const text = range.getBoundingClientRect(), box = tab.getBoundingClientRect();
    if (!text.width || !box.width) return;
    trigger.setAttribute('data-xpls-inline-sort', 'true');
    trigger.style.setProperty('--xpls-sort-left', `${Math.min(text.right - box.left + 4, box.width - 28)}px`);
    trigger.style.setProperty('--xpls-sort-top', `${text.top - box.top + text.height / 2 - 12}px`);
  }
  function update() {
    pending = null;
    const column = primary();
    if (!enabled || !column || (!home() && !/^\/i\/lists\/\d+\/?$/.test(location.pathname))) { cleanup(); return; }
    const items = home() && nativeSortItems();
    if (!items) checkedMenu = null;
    if (items && checkedMenu !== items.popular) {
      checkedMenu = items.popular;
      for (const [value, item] of Object.entries(items)) {
        if (item.getAttribute('aria-checked') === 'true' || (item.getAttribute('aria-checked') === null && item.querySelector('svg'))) recordNativeSort(value);
      }
    }
    const all = tabs();
    const native = all.filter(tab => !tab.closest('[id^="cpft"]'));
    const following = native[1];
    for (const tab of all) {
      const label = [...tab.querySelectorAll('span')].find(span => span.textContent.trim() && !span.querySelector('span, svg'));
      label?.setAttribute('data-xpls-tab-label', 'true');
      if (tab === following) {
        tab.setAttribute('data-xpls-following-tab', 'true');
        alignNativeChevron(tab, label);
      }
    }
    const selected = all.find(tab => tab.getAttribute('aria-selected') === 'true' && (!document.body.classList.contains('SeparatedTweets') || tab.closest('[id^="cpft"]')));
    if (home()) {
      const bounds = native[0]?.closest('nav')?.getBoundingClientRect();
      for (const node of column.querySelectorAll('[data-testid="ScrollSnap-nextButton"], [aria-label="Scroll right"], .ManageTimelines, [aria-label="Manage timelines"], button, [role="button"], a:has(svg)')) {
        if (node.closest('[role="tab"], [data-testid="tweet"], [data-testid="toolBar"]')) continue;
        const box = node.getBoundingClientRect();
        if (!bounds || box.bottom < bounds.top || box.top > bounds.bottom) continue;
        if ([...node.querySelectorAll('path')].some(rightArrow) || node.matches('[data-testid="ScrollSnap-nextButton"], [aria-label="Scroll right"], .ManageTimelines, [aria-label="Manage timelines"]')) node.setAttribute('data-xpls-next-arrow', 'true');
      }
    }
    // Never infer a sort from an extension preference or rewrite native state.
    let name = home() ? selected && labelOf(selected) : document.querySelector('#xpls-sidebar [aria-current="page"]')?.title || column.querySelector('h2')?.textContent.trim();
    if (!name) { document.getElementById('xpls-timeline-label')?.remove(); return; }
    if (selected === following && home() && observedSort()) name += ` · ${observedSort() === 'popular' ? 'Popular' : 'Recent'}`;
    let label = document.getElementById('xpls-timeline-label');
    if (!label) { label = document.createElement('div'); label.id = 'xpls-timeline-label'; label.setAttribute('role', 'status'); }
    if (label.textContent !== name) label.textContent = name;
    const style = viewTextStyle(column);
    label.style.font = `400 12px/1.4 ${style.fontFamily}`; label.style.color = style.color;
    const anchor = composerAnchor(column);
    if (anchor && label.previousElementSibling !== anchor) anchor.after(label);
    else if (!anchor && label.parentElement !== column) column.prepend(label);
  }
  function schedule() { if (!pending) pending = requestAnimationFrame(update); }
  // Observe native choices without canceling, replaying or opening anything.
  document.addEventListener('click', event => {
    if (!enabled || !home()) return;
    const items = nativeSortItems();
    const value = items && Object.keys(items).find(value => items[value].contains(event.target));
    if (value) {
      const viewer = viewerId(), read = document.documentElement.dataset.xplsNativeSortRead;
      queueMicrotask(() => {
        // A request reflects the effective ranking even if another extension
        // overrides the clicked choice. Cached native selections issue no read.
        if (enabled && viewerId() === viewer && document.documentElement.dataset.xplsNativeSortRead === read) recordNativeSort(value);
        schedule();
      });
    }
  }, { capture: true, passive: true });
  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => !(mutation.target instanceof Element && mutation.target.closest('#xpls-timeline-label')))) schedule();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['aria-selected', 'aria-checked', 'class', 'href', 'data-xpls-native-sort', 'data-xpls-native-sort-viewer'] });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('popstate', schedule); addEventListener('pageshow', schedule);
  chrome.storage.local.get({ enabled: true }, settings => { enabled = settings.enabled !== false; schedule(); });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.enabled) { enabled = changes.enabled.newValue !== false; schedule(); } });
})();
