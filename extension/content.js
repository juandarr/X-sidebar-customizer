(() => {
  "use strict";
  if (document.getElementById("xpls-sidebar")) return;

  const defaults = { enabled: true };
  let settings = defaults;
  let sidebar = null;
  let signature = "";
  let pending = null;
  const hidden = new Set();
  const entries = new Map();
  let orderKey = "";
  let savedOrder = [];
  let pinsKey = "";
  let savedPins = [];
  let emojisKey = "";
  let savedEmojis = Object.create(null);
  let picker = null;
  let pickerKey = null;
  let navigationIntent = null;
  const intentKey = "xpls:open-pinned-list:v1";
  const emojiGroups = [
    ["Faces", "😀 grinning happy|😃 smile happy|😄 laugh happy|😁 grin|😎 cool sunglasses|🤓 nerd smart|🧐 curious|🤔 thinking|🥳 party|😍 love|🤩 star eyes|😴 sleeping|🤖 robot ai|👽 alien|👻 ghost|💀 skull"],
    ["Nature", "🐶 dog|🐱 cat|🦊 fox|🐻 bear|🐼 panda|🐸 frog|🐧 penguin linux foss|🦉 owl|🐝 bee|🦋 butterfly|🐙 octopus|🐳 whale|🦄 unicorn|🌱 seedling plant|🌿 herb leaf|🌳 tree|🌵 cactus|🌸 flower|🌻 sunflower|🍄 mushroom|🌍 earth world|🌙 moon|☀️ sun|⭐ star|🌈 rainbow|🔥 fire|⚡ lightning energy|❄️ snowflake|🌊 wave water"],
    ["Things", "💻 laptop computer|🖥️ desktop computer|⌨️ keyboard|📱 phone|🔬 microscope science|🧪 test tube science|🧬 dna biology|🔭 telescope space|🛰️ satellite|🚀 rocket launch|🛸 ufo space|⚙️ gear tools|🔧 wrench tools|🛠️ hammer tools|🔒 lock security cyber|🔑 key|💡 light bulb idea|🧠 brain intelligence|📚 books reading|📖 book|📝 writing notes|📋 clipboard list|📁 folder|🗂️ files|📊 chart analytics|📈 growth chart|🎨 art palette|🎵 music|🎧 headphones|🎬 movie video|📷 camera|🎮 game controller|🧩 puzzle|🎲 dice|🏆 trophy|💎 gem|🧭 compass|⏰ clock|☕ coffee|🍕 pizza|⚽ soccer football|🏀 basketball|🚲 bicycle|✈️ airplane travel|🏠 home|🏗️ construction|💰 money|💳 credit card"],
    ["Symbols", "❤️ red heart love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|✅ check done|❌ cross|❓ question|❗ exclamation|💬 chat speech|💭 thought|📌 pin|📍 location|🎯 target goal|✨ sparkles|💫 dizzy star|💥 explosion|🔴 red circle|🟠 orange circle|🟡 yellow circle|🟢 green circle|🔵 blue circle|🟣 purple circle|⚫ black circle|⚪ white circle|🔷 blue diamond|🔶 orange diamond"]
  ].map(([category, values]) => [category, values.split("|").map(value => {
    const [emoji, ...keywords] = value.split(" ");
    return { emoji, name: keywords.join(" ") };
  })]);
  let draggedKey = null;
  let suppressClickUntil = 0;

  function loadAccountPreferences(banner) {
    const profile = banner.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    const account = profile?.getAttribute("href") || "default";
    const key = `xpls:pinned-list-order:v1:${account}`;
    if (key === orderKey) return;
    orderKey = key;
    pinsKey = `xpls:pinned-lists:v1:${account}`;
    emojisKey = `xpls:pinned-list-emojis:v1:${account}`;
    savedOrder = [];
    savedPins = [];
    savedEmojis = Object.create(null);
    closePicker(false);
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(value)) savedOrder = [...new Set(value.filter(item => typeof item === "string"))];
    } catch { /* A blocked store or malformed value must not break navigation. */ }
    try {
      const value = JSON.parse(localStorage.getItem(pinsKey) || "[]");
      if (Array.isArray(value)) savedPins = value.filter(item => item && typeof item.key === "string" && typeof item.label === "string" && item.label.trim()).map(({ key, label, href }) => ({
        key, label, href: /^\/i\/lists\/\d+$/.test(href) ? href : null
      }));
    } catch { /* Keep Home discovery available even if the cache is invalid. */ }
    try {
      const value = JSON.parse(localStorage.getItem(emojisKey) || "{}");
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [key, emoji] of Object.entries(value)) {
          if (typeof emoji === "string" && emoji.length <= 32 && /\p{Extended_Pictographic}/u.test(emoji)) savedEmojis[key] = emoji;
        }
      }
    } catch { /* Invalid emoji settings fall back to the list icon. */ }
  }

  function rememberPins(list) {
    const value = list.map(({ key, label, href }) => ({ key, label, href }));
    if (JSON.stringify(value) === JSON.stringify(savedPins)) return;
    savedPins = value;
    try { localStorage.setItem(pinsKey, JSON.stringify(value)); } catch { /* The in-memory cache still supports SPA navigation. */ }
  }

  function closePicker(restoreFocus = true) {
    const key = pickerKey;
    picker?.remove();
    picker = null;
    pickerKey = null;
    if (restoreFocus && key) [...(sidebar?.querySelectorAll('.xpls-emoji-edit') || [])].find(button => button.dataset.key === key)?.focus({ preventScroll: true });
  }

  function chooseEmoji(key, emoji) {
    if (emoji) savedEmojis[key] = emoji;
    else delete savedEmojis[key];
    try { localStorage.setItem(emojisKey, JSON.stringify(savedEmojis)); } catch { /* Keep the choice for this visit. */ }
    render(ordered([...entries.values()]));
    closePicker();
  }

  function openPicker(button) {
    closePicker(false);
    pickerKey = button.dataset.key;
    const key = pickerKey;
    picker = document.createElement("div");
    picker.id = "xpls-emoji-picker";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-labelledby", "xpls-emoji-title");
    picker.style.color = getComputedStyle(sidebar).color;
    picker.style.fontFamily = getComputedStyle(sidebar).fontFamily;
    const color = getComputedStyle(sidebar).color.match(/\d+/g)?.map(Number) || [15, 20, 25];
    picker.style.background = color[0] + color[1] + color[2] > 400 ? "#15202b" : "#fff";
    const header = document.createElement("div");
    header.className = "xpls-picker-header";
    const title = document.createElement("strong");
    title.id = "xpls-emoji-title";
    title.textContent = `Emoji for ${entries.get(key)?.label || "list"}`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close emoji picker");
    close.addEventListener("click", () => closePicker());
    header.append(title, close);
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search emoji";
    search.setAttribute("aria-label", "Search emoji");
    const choices = document.createElement("div");
    choices.className = "xpls-emoji-choices";
    const populate = () => {
      choices.replaceChildren();
      const query = search.value.trim().toLowerCase();
      for (const [category, emojis] of emojiGroups) {
        const matches = emojis.filter(({ emoji, name }) => `${category} ${name} ${emoji}`.toLowerCase().includes(query));
        if (!matches.length) continue;
        const heading = document.createElement("h3");
        heading.textContent = category;
        const grid = document.createElement("div");
        grid.className = "xpls-emoji-grid";
        for (const { emoji, name } of matches) {
          const option = document.createElement("button");
          option.type = "button";
          option.className = "xpls-emoji-option";
          option.textContent = emoji;
          option.title = name;
          option.setAttribute("aria-label", name);
          option.setAttribute("aria-pressed", String(savedEmojis[key] === emoji));
          option.addEventListener("click", () => chooseEmoji(key, emoji));
          grid.append(option);
        }
        choices.append(heading, grid);
      }
      if (!choices.children.length) choices.textContent = "No emoji found.";
    };
    search.addEventListener("input", populate);
    const resetIcon = document.createElement("button");
    resetIcon.type = "button";
    resetIcon.className = "xpls-reset-icon";
    resetIcon.textContent = "Use default list icon";
    resetIcon.addEventListener("click", () => chooseEmoji(key, null));
    picker.append(header, search, choices, resetIcon);
    picker.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePicker(); }
    });
    populate();
    document.body.append(picker);
    const box = button.getBoundingClientRect();
    const width = picker.getBoundingClientRect().width;
    const height = picker.getBoundingClientRect().height;
    picker.style.left = `${Math.max(8, Math.min(box.right + 8, innerWidth - width - 8))}px`;
    picker.style.top = `${Math.max(8, Math.min(box.top, innerHeight - height - 8))}px`;
    search.focus({ preventScroll: true });
  }

  function openList(entry) {
    if (/^\/home\/?$/.test(location.pathname) && entry.tab?.isConnected) {
      entry.tab.click();
    } else if (entry.href) {
      location.assign(entry.href);
    } else {
      navigationIntent = { account: orderKey, key: entry.key, time: Date.now() };
      try { sessionStorage.setItem(intentKey, JSON.stringify(navigationIntent)); } catch { /* SPA navigation works without session storage. */ }
      const home = document.querySelector('header nav a[href="/home"]');
      if (home) home.click();
      else location.assign("/home");
    }
    schedule();
  }

  function finishNavigation(list) {
    let intent = navigationIntent;
    if (!intent) { try { intent = JSON.parse(sessionStorage.getItem(intentKey)); } catch { return; } }
    if (!intent || intent.account !== orderKey) return;
    navigationIntent = null;
    try { sessionStorage.removeItem(intentKey); } catch { /* In-memory intent already cleared. */ }
    if (Date.now() - intent.time > 60000) return;
    list.find(entry => entry.key === intent.key)?.tab.click();
    schedule();
  }

  function ordered(list) {
    const ranks = new Map(savedOrder.map((key, index) => [key, index]));
    return [...list].sort((a, b) => (ranks.get(a.key) ?? Infinity) - (ranks.get(b.key) ?? Infinity));
  }

  function moveItem(key, targetKey, after) {
    const list = ordered([...entries.values()]);
    const source = list.findIndex(entry => entry.key === key);
    if (source < 0 || key === targetKey || !list.some(entry => entry.key === targetKey)) return;
    const [entry] = list.splice(source, 1);
    const target = list.findIndex(item => item.key === targetKey);
    list.splice(target + Number(after), 0, entry);
    const visible = new Set(list.map(item => item.key));
    savedOrder = [...visible, ...savedOrder.filter(item => !visible.has(item))];
    try { localStorage.setItem(orderKey, JSON.stringify(savedOrder)); } catch { /* Keep the order for this visit. */ }
    render(list);
    sidebar.querySelector('.xpls-status').textContent = `${entry.label} moved to position ${list.indexOf(entry) + 1} of ${list.length}`;
  }

  function clearDrag() {
    draggedKey = null;
    sidebar?.querySelectorAll('.xpls-item').forEach(button => {
      button.classList.remove('xpls-dragging');
      button.removeAttribute('data-drop');
    });
  }

  function clearHidden() {
    for (const element of hidden) element.removeAttribute("data-xpls-hidden");
    // X or another extension can clone a tab strip, including our markers.
    // Those clones aren't in the original set and must also be released.
    document.querySelectorAll('[data-xpls-hidden="true"]').forEach(element => element.removeAttribute('data-xpls-hidden'));
    hidden.clear();
  }

  function reset() {
    closePicker(false);
    clearDrag();
    clearHidden();
    sidebar?.remove();
    sidebar = null;
    signature = "";
    entries.clear();
  }

  function markHidden(element) {
    element.setAttribute("data-xpls-hidden", "true");
    hidden.add(element);
  }

  function available(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().width > 0;
  }

  function findTabs() {
    // Restrict discovery to Home. Search/profile/notification tabs aren't lists.
    if (!/^\/home\/?$/.test(location.pathname)) return null;
    const column = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector("main");
    const tablist = column?.querySelector('nav [role="tablist"]');
    if (!tablist) return null;

    // CPFT may insert a Retweets/Quotes tab, but native For you/Following remain
    // the first two *native* tabs, even when CPFT hides one of them.
    const tabs = [...tablist.querySelectorAll('[role="tab"]')].filter(tab => !tab.closest('[id^="cpft"]'));
    if (tabs.length < 2) return null; // Home is still loading; retain the cache.
    // A route can change before React replaces the previous view's tab strip.
    // Native Home links point at /home; don't cache a leftover profile/search strip.
    if (tabs.slice(0, 2).some(tab => {
      const href = tab.getAttribute("href");
      if (!href) return false;
      try { return href.startsWith("#") || !/^\/home\/?$/.test(new URL(href, location.href).pathname); }
      catch { return true; }
    })) return null;
    const occurrences = new Map();
    return tabs.slice(2).map(tab => {
      let slot = tab;
      while (slot.parentElement && slot.parentElement !== tablist) slot = slot.parentElement;
      const label = (tab.querySelector("span")?.textContent || tab.textContent || tab.getAttribute("aria-label") || "").trim();
      const listId = tab.getAttribute("href")?.match(/\/i\/lists\/(\d+)/)?.[1];
      const identity = listId ? `id:${listId}` : `label:${label}`;
      const occurrence = occurrences.get(identity) || 0;
      occurrences.set(identity, occurrence + 1);
      const key = JSON.stringify([identity, occurrence]);
      return { key, label, href: listId ? `/i/lists/${listId}` : null, tab, slot, active: tab.getAttribute("aria-selected") === "true" && !document.body.classList.contains("SeparatedTweets") };
    }).filter(entry => entry.label && !entry.tab.closest('[data-testid="toolBar"]'));
  }

  function findMount(nav, composer) {
    // Add our own sibling before the existing compose branch. X retains its
    // original React nodes and event handlers, as does Control Panel for Twitter.
    let branch = composer;
    while (branch?.parentElement && !branch.parentElement.contains(nav)) branch = branch.parentElement;
    if (!branch?.parentElement || branch.contains(nav)) return null;
    return { parent: branch.parentElement, before: branch };
  }

  function createSidebar(mount) {
    sidebar = document.createElement("section");
    sidebar.id = "xpls-sidebar";
    sidebar.setAttribute("aria-label", "Pinned lists");
    const heading = document.createElement("h2");
    heading.className = "xpls-heading";
    heading.textContent = "Pinned lists";
    const items = document.createElement("div");
    items.className = "xpls-items";
    const hint = document.createElement("span");
    hint.id = "xpls-reorder-hint";
    hint.className = "xpls-sr-only";
    hint.textContent = "Drag to reorder, or use Alt plus Up or Down arrow.";
    const status = document.createElement("span");
    status.className = "xpls-sr-only xpls-status";
    status.setAttribute("role", "status");
    sidebar.append(heading, items, hint, status);
    sidebar.addEventListener("click", event => {
      const edit = event.target.closest(".xpls-emoji-edit");
      if (edit) { event.preventDefault(); openPicker(edit); return; }
      if (Date.now() < suppressClickUntil) { event.preventDefault(); return; }
      const button = event.target.closest(".xpls-item");
      const entry = button && entries.get(button.dataset.key);
      if (entry) openList(entry);
    });
    sidebar.addEventListener("dragstart", event => {
      const button = event.target.closest(".xpls-item");
      if (!button || !event.dataTransfer) return;
      draggedKey = button.dataset.key;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedKey);
      button.classList.add("xpls-dragging");
    });
    sidebar.addEventListener("dragover", event => {
      const button = event.target.closest(".xpls-item");
      if (!draggedKey || !button) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      items.querySelectorAll('[data-drop]').forEach(item => item.removeAttribute('data-drop'));
      if (button.dataset.key !== draggedKey) {
        const box = button.getBoundingClientRect();
        button.dataset.drop = event.clientY >= box.top + box.height / 2 ? "after" : "before";
      }
    });
    sidebar.addEventListener("drop", event => {
      const button = event.target.closest(".xpls-item");
      if (!draggedKey || !button) return;
      event.preventDefault();
      const key = draggedKey;
      const target = button.dataset.key;
      const after = button.dataset.drop === "after";
      clearDrag();
      suppressClickUntil = Date.now() + 300;
      moveItem(key, target, after);
    });
    sidebar.addEventListener("dragend", () => { suppressClickUntil = Date.now() + 300; clearDrag(); });
    sidebar.addEventListener("keydown", event => {
      const button = event.target.closest(".xpls-item");
      if (!button || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const list = ordered([...entries.values()]);
      const index = list.findIndex(entry => entry.key === button.dataset.key);
      const next = index + (event.key === "ArrowUp" ? -1 : 1);
      if (list[next]) moveItem(button.dataset.key, list[next].key, next > index);
    });
    mount.parent.insertBefore(sidebar, mount.before);
  }

  function render(list) {
    entries.clear();
    for (const entry of list) entries.set(entry.key, entry);
    const nextSignature = JSON.stringify(list.map(({ key, label, active }) => ({ key, label, active, emoji: savedEmojis[key] })));
    if (nextSignature === signature) return;
    if (draggedKey) return; // Let native drag finish before replacing its DOM nodes.
    signature = nextSignature;
    const items = sidebar.querySelector(".xpls-items");
    const focused = sidebar.contains(document.activeElement) ? { key: document.activeElement.dataset.key, edit: document.activeElement.classList.contains('xpls-emoji-edit') } : null;
    const rows = list.map(entry => {
      const row = document.createElement("div");
      row.className = "xpls-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "xpls-item";
      button.dataset.key = entry.key;
      button.title = entry.label;
      button.draggable = true;
      button.setAttribute("aria-describedby", "xpls-reorder-hint");
      if (entry.active) button.setAttribute("aria-current", "page");
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(icon.namespaceURI, "path");
      path.setAttribute("d", "M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01");
      icon.append(path);
      const label = document.createElement("span");
      label.className = "xpls-label";
      label.textContent = entry.label;
      const visual = document.createElement("span");
      visual.className = "xpls-icon";
      visual.setAttribute("aria-hidden", "true");
      if (savedEmojis[entry.key]) visual.textContent = savedEmojis[entry.key];
      else visual.append(icon);
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "xpls-emoji-edit";
      edit.dataset.key = entry.key;
      edit.title = `Choose emoji for ${entry.label}`;
      edit.setAttribute("aria-label", edit.title);
      edit.setAttribute("aria-haspopup", "dialog");
      button.append(visual, label);
      row.append(button, edit);
      return row;
    });
    items.replaceChildren(...rows);
    if (focused) [...items.querySelectorAll(focused.edit ? '.xpls-emoji-edit' : '.xpls-item')].find(button => button.dataset.key === focused.key)?.focus({ preventScroll: true });
  }

  function update() {
    pending = null;
    // Release only our markers before discovery so we can measure native tabs.
    clearHidden();
    const banner = document.querySelector('header[role="banner"]') || document.querySelector("header");
    const nav = banner?.querySelector("nav");
    const composer = banner?.querySelector('[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"], a[href="/compose/tweet"]');
    if (banner) loadAccountPreferences(banner);
    const nativeList = settings.enabled ? findTabs() : null;
    if (nativeList !== null) rememberPins(nativeList.filter(entry => available(entry.tab)));
    const composeWidth = composer?.getBoundingClientRect().width || Number(composer?.dataset.xplsComposeWidth) || 0;
    const fullMinimal = document.documentElement.dataset.xplsMinimal === 'true' && banner?.getBoundingClientRect().width >= 160 && composeWidth >= 140 && [...(nav?.querySelectorAll('a[href="/home"] span') || [])].some(span => span.textContent.trim() && available(span));
    if (!settings.enabled || !available(nav) || (!available(composer) && !fullMinimal) || composeWidth < 140) {
      reset();
      return;
    }
    const mount = findMount(nav, composer);
    const list = nativeList !== null ? nativeList.filter(entry => available(entry.tab)) : savedPins.map(entry => ({ ...entry, active: entry.href === location.pathname }));
    if (!mount || !list.length) {
      reset();
      return;
    }
    if (sidebar && (!sidebar.isConnected || sidebar.parentElement !== mount.parent || sidebar.nextElementSibling !== mount.before)) reset();
    if (!sidebar) createSidebar(mount);

    const home = nav.querySelector('a[href="/home"]') || nav;
    const label = [...home.querySelectorAll("span")].find(span => span.textContent.trim() && !span.querySelector("span")) || home;
    const textStyle = getComputedStyle(label);
    const icon = home.querySelector("svg");
    sidebar.style.setProperty("--xpls-width", `${Math.round(composeWidth)}px`);
    sidebar.style.setProperty("--xpls-text", textStyle.color);
    sidebar.style.setProperty("--xpls-accent", "var(--cpft-theme, #1d9bf0)");
    sidebar.style.fontFamily = textStyle.fontFamily;
    sidebar.style.fontSize = textStyle.fontSize;
    sidebar.style.fontWeight = textStyle.fontWeight;
    const sidebarBox = sidebar.getBoundingClientRect();
    if (icon) {
      const iconBox = icon.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      sidebar.style.setProperty("--xpls-inset", `${Math.max(0, iconBox.left - sidebarBox.left)}px`);
      sidebar.style.setProperty("--xpls-icon", `${iconBox.width}px`);
      sidebar.style.setProperty("--xpls-gap", `${Math.max(8, labelBox.left - iconBox.right)}px`);
    }
    render(ordered(list));
    // Compact rows use the available space, with every pin in the normal flow.
    const account = banner.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    const accountHeight = account?.getBoundingClientRect().height || 70;
    const top = sidebar.getBoundingClientRect().top;
    const reserved = composer.getBoundingClientRect().height + accountHeight + (banner.querySelector("#xpls-preferences")?.getBoundingClientRect().height || 0) + 64;
    const headingHeight = sidebar.querySelector('.xpls-heading').getBoundingClientRect().height;
    const rowHeight = Math.max(24, Math.min(36, Math.floor((innerHeight - top - reserved - headingHeight) / list.length)));
    sidebar.style.setProperty("--xpls-row-height", `${rowHeight}px`);
    sidebar.style.setProperty("--xpls-row-icon", `${Math.min(24, rowHeight - 6)}px`);
    for (const entry of list) if (entry.slot) markHidden(entry.slot);
    if (nativeList !== null) finishNavigation(nativeList);
  }

  function schedule() {
    if (pending !== null) return;
    // Coalesce X/CPFT updates and ignore mutations created by our own rendering.
    pending = setTimeout(update, 80);
  }

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => {
      const element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (element?.closest("#xpls-sidebar, #xpls-emoji-picker")) return false;
      return !(mutation.type === "childList" && [...mutation.addedNodes, ...mutation.removedNodes].every(node => node instanceof Element && ["xpls-sidebar", "xpls-emoji-picker"].includes(node.id)));
    })) schedule();
  });
  observer.observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["aria-selected", "class", "href", "aria-label"]
  });
  addEventListener("resize", () => { closePicker(false); schedule(); }, { passive: true });
  document.addEventListener("pointerdown", event => {
    if (picker && !picker.contains(event.target) && !event.target.closest('.xpls-emoji-edit')) closePicker(false);
  });
  addEventListener("popstate", schedule);
  addEventListener("pageshow", schedule);
  addEventListener("storage", event => {
    if ([orderKey, pinsKey, emojisKey, null].includes(event.key)) { orderKey = ""; schedule(); }
  });
  // History.pushState doesn't emit popstate. This lightweight path check also
  // handles layout changes made by other extensions with inline styles.
  setInterval(() => { if (!document.hidden) schedule(); }, 1500);
  chrome.storage.local.get(defaults, value => { settings = value; schedule(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      settings.enabled = changes.enabled.newValue !== false;
      schedule();
    }
  });
})();
