import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const extension = join(root, "extension");
const fixture = await readFile(new URL("fixture.html", import.meta.url), "utf8");
const profile = await mkdtemp(join(tmpdir(), "xpls-test-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, viewport: { width: 1000, height: 1050 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
const page = await context.newPage();
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const sidebar = page.locator("#xpls-sidebar");
const items = sidebar.locator(".xpls-item");
const native = page.locator('main [role="tab"]');
try {
  const serveFixture = route => {
    const path = new URL(route.request().url()).pathname;
    const unrelatedTabs = '<nav><div role="tablist" aria-label="Other view"><div><a role="tab" href="#posts"><span>Posts</span></a></div><div><a role="tab" href="#replies"><span>Replies</span></a></div><div><a role="tab" href="#media"><span>Media</span></a></div><div><a role="tab" href="#likes"><span>Likes</span></a></div></div></nav>';
    const body = path === '/home' ? fixture : fixture.replace(/<nav><div role="tablist"[\s\S]*?<\/div><\/nav>/, unrelatedTabs);
    return route.fulfill({ contentType: 'text/html', body });
  };
  await context.route("https://x.com/**", serveFixture);
  await context.route("https://twitter.com/**", serveFixture);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await check("a first visit outside Home never treats unrelated tabs as pins", async () => {
    await page.goto('https://x.com/notifications');
    await page.waitForTimeout(250);
    assert.equal(await sidebar.count(), 0);
    assert.equal(await page.locator('[data-xpls-hidden]').count(), 0);
  });
  await page.goto("https://x.com/home");
  await sidebar.waitFor();
  await check("actual Manifest V3 content script loads; only lists are moved", async () => {
    assert.equal(await items.count(), 3);
    assert.equal(await native.nth(0).isVisible(), true);
    assert.equal(await native.nth(1).isVisible(), true);
    assert.equal(await native.nth(2).isVisible(), false);
    const listBox = await sidebar.boundingBox();
    const composeBox = await page.locator(".compose").boundingBox();
    assert.ok(composeBox.y >= listBox.y + listBox.height);
    assert.ok(listBox.x < (await page.locator("main").boundingBox()).x);
  });
  await check("native list click and active state update", async () => {
    await items.nth(0).click();
    await page.waitForFunction(() => document.querySelector('.xpls-item[aria-current="page"]')?.textContent === "AI experimentation");
    assert.equal(await page.locator("#selection").textContent(), "AI experimentation");
    const line = await sidebar.locator('[aria-current="page"]').evaluate(element => {
      const style = getComputedStyle(element, '::after');
      return [style.height, style.bottom, style.backgroundColor, getComputedStyle(element.querySelector('.xpls-label')).textDecorationLine];
    });
    assert.equal(line[0], '1px'); assert.equal(line[1], '0px');
    assert.match(line[2], /0\.8/); assert.equal(line[3], 'none');
    await native.nth(1).click();
    await page.waitForFunction(() => !document.querySelector('.xpls-item[aria-current="page"]'));
  });
  await check("keyboard operation and original compose action", async () => {
    await items.nth(1).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("#selection").textContent === "Artificial intelligence");
    await page.locator(".compose a").click();
    assert.equal(await page.locator("#selection").textContent(), "Compose opened");
  });
  await check("CPFT extra tab stays at top and isn't mistaken for a list", async () => {
    await page.evaluate(() => {
      const slot = document.createElement("div");
      slot.id = "cpftSeparatedTweetsTab";
      slot.innerHTML = '<a role="tab" href="/home"><span>Retweets</span></a>';
      document.querySelector('[role="tablist"]').children[1].after(slot);
    });
    await page.waitForTimeout(250);
    assert.equal(await items.count(), 3);
    assert.equal(await page.locator("#cpftSeparatedTweetsTab").isVisible(), true);
  });
  await check("CPFT hidden For you doesn't shift list detection", async () => {
    await page.addStyleTag({ content: 'main [role="tablist"] > div:first-child { display:none }' });
    await page.waitForTimeout(1700);
    assert.equal(await items.count(), 3);
    assert.equal(await native.filter({ hasText: "Following" }).isVisible(), true);
  });
  await check("X replacing the whole tab strip preserves functionality", async () => {
    await page.evaluate(() => {
      const tabs = document.querySelector('main [role="tablist"]');
      const replacement = tabs.cloneNode(true);
      replacement.querySelectorAll('[data-xpls-hidden]').forEach(element => element.removeAttribute('data-xpls-hidden'));
      tabs.replaceWith(replacement);
    });
    await page.waitForTimeout(250);
    await items.nth(2).click();
    await page.waitForFunction(() => document.querySelector("#selection").textContent === "Computer science");
  });
  await check("pin changes and safe rendering of list names", async () => {
    await page.evaluate(() => {
      const slot = document.createElement("div");
      const tab = document.createElement("a");
      tab.setAttribute("role", "tab");
      tab.href = "/home";
      tab.textContent = '<img src=x onerror=alert(1)> long list name';
      slot.append(tab);
      document.querySelector('main [role="tablist"]').append(slot);
    });
    await page.waitForFunction(() => document.querySelectorAll(".xpls-item").length === 4);
    assert.equal(await sidebar.locator("img").count(), 0);
    await page.evaluate(() => document.querySelector('main [role="tablist"]').lastElementChild.remove());
    await page.waitForFunction(() => document.querySelectorAll(".xpls-item").length === 3);
  });
  await check("rows inherit the visible native label style, with aligned icons", async () => {
    // X styles an inner text span; the outer link can have browser defaults.
    await page.addStyleTag({ content: 'header nav a { color: purple; font-family: Georgia; } header nav span { color: #e7e9ea; font: 15px Arial; }' });
    await page.waitForTimeout(1700);
    const styles = await page.evaluate(() => {
      const native = document.querySelector('header nav a span');
      const custom = document.querySelector('.xpls-label');
      return [native, custom].map(element => {
        const style = getComputedStyle(element);
        return [style.color, style.fontFamily, style.fontSize, element.getBoundingClientRect().left];
      });
    });
    assert.deepEqual(styles[0], styles[1]);
    const row = await items.first().evaluate(element => ({ height: element.clientHeight, radius: getComputedStyle(element).borderRadius }));
    assert.ok(row.height <= 36);
    assert.equal(row.radius, '9999px');
  });
  await check("real drag and drop saves order without navigating", async () => {
    const selected = await page.locator('#selection').textContent();
    await items.nth(0).dragTo(items.nth(2), { targetPosition: { x: 100, y: 32 } });
    assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
    assert.equal(await page.locator('#selection').textContent(), selected);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('xpls:pinned-list-order:v1:/fixtureuser')));
    assert.equal(saved.length, 3);
    assert.ok(saved[0].includes('Artificial intelligence'));
    assert.equal(await sidebar.locator('[data-drop], .xpls-dragging').count(), 0);
  });
  await check("order survives reload and native pin insertion/removal", async () => {
    await page.reload();
    await sidebar.waitFor();
    assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
    await page.evaluate(() => {
      const slot = document.createElement('div');
      slot.innerHTML = '<a role="tab" href="/home"><span>New pin</span></a>';
      document.querySelector('main [role="tablist"]').children[2].before(slot);
    });
    await page.waitForFunction(() => document.querySelectorAll('.xpls-item').length === 4);
    assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation', 'New pin']);
    await page.evaluate(() => document.querySelector('main [role="tablist"]').children[2].remove());
    await page.waitForFunction(() => document.querySelectorAll('.xpls-item').length === 3);
    await items.first().click();
    assert.equal(await page.locator('#selection').textContent(), 'Artificial intelligence');
  });
  await check("keyboard reordering retains focus and persists", async () => {
    await items.first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    assert.deepEqual(await items.allTextContents(), ['Computer science', 'Artificial intelligence', 'AI experimentation']);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Artificial intelligence');
    await page.keyboard.press('Alt+ArrowUp');
    assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
    assert.match(await sidebar.locator('.xpls-status').textContent(), /position 1 of 3/);
  });
  await check("native tab replacement retains saved ordering", async () => {
    await page.evaluate(() => {
      const tabs = document.querySelector('main [role="tablist"]');
      const clone = tabs.cloneNode(true);
      clone.querySelectorAll('[data-xpls-hidden]').forEach(element => element.removeAttribute('data-xpls-hidden'));
      tabs.replaceWith(clone);
    });
    await page.waitForTimeout(250);
    assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
    await items.last().click();
    assert.equal(await page.locator('#selection').textContent(), 'AI experimentation');
  });
  await check("collapsed sidebar restores all native list tabs", async () => {
    await page.setViewportSize({ width: 660, height: 1050 });
    await sidebar.waitFor({ state: "detached" });
    assert.equal(await native.filter({ hasText: "AI experimentation" }).isVisible(), true);
    await page.setViewportSize({ width: 1000, height: 1050 });
    await sidebar.waitFor();
  });
  await check("the sidebar remains during SPA navigation without hiding other tabs", async () => {
    await page.evaluate(() => history.pushState({}, "", "/fixtureuser"));
    await page.waitForFunction(() => document.querySelectorAll('[data-xpls-hidden]').length === 0);
    assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
    assert.equal(await sidebar.locator('[aria-current]').count(), 0);
    await page.evaluate(() => history.pushState({}, "", "/home"));
    await page.waitForFunction(() => document.querySelectorAll('[data-xpls-hidden]').length === 3);
  });
  await check("pins persist on direct profile, search, notifications, messages, and compose visits", async () => {
    for (const path of ['/fixtureuser', '/search?q=lists', '/notifications', '/messages', '/compose/tweet']) {
      await page.goto(`https://x.com${path}`);
      await sidebar.waitFor();
      assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
      assert.equal(await page.locator('[data-xpls-hidden]').count(), 0);
      for (const tab of await native.all()) assert.equal(await tab.isVisible(), true);
    }
    await page.reload();
    await sidebar.waitFor();
    assert.equal(await items.count(), 3);
    await page.goto('https://x.com/home');
    await sidebar.waitFor();
  });
  await check("a Home route transition cannot cache stale tabs from another view", async () => {
    await page.goto('https://x.com/notifications');
    await sidebar.waitFor();
    await page.evaluate(() => history.pushState({}, '', '/home'));
    await page.waitForTimeout(1700);
    assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
    assert.equal(await page.locator('[data-xpls-hidden]').count(), 0);
    await page.evaluate(html => {
      document.querySelector('main').innerHTML = new DOMParser().parseFromString(html, 'text/html').querySelector('main').innerHTML;
    }, fixture);
    await page.waitForFunction(() => document.querySelectorAll('[data-xpls-hidden]').length === 3);
  });
  await check("a cached list without an ID returns to Home and selects its native tab", async () => {
    await page.goto('https://x.com/notifications');
    await sidebar.waitFor();
    await items.filter({ hasText: 'AI experimentation' }).click();
    await page.waitForURL('https://x.com/home');
    await page.waitForFunction(() => document.querySelector('#selection').textContent === 'AI experimentation');
    await page.waitForFunction(() => document.querySelector('.xpls-item[aria-current="page"]')?.textContent === 'AI experimentation');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('xpls:open-pinned-list:v1')), null);
  });
  await check("all ten pins fit without a scrollbar at a shorter desktop height", async () => {
    await page.evaluate(() => {
      const tabs = document.querySelector('main [role="tablist"]');
      for (let i = 0; i < 7; i++) {
        const slot = document.createElement("div");
        const tab = document.createElement("a");
        tab.setAttribute("role", "tab");
        tab.textContent = `Extra list ${i + 1}`;
        slot.append(tab); tabs.append(slot);
      }
    });
    await page.waitForFunction(() => document.querySelectorAll(".xpls-item").length === 10);
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.waitForTimeout(250);
    const layout = await page.locator('.xpls-items').evaluate(element => ({
      overflow: getComputedStyle(element).overflowY, height: element.clientHeight, scrollHeight: element.scrollHeight
    }));
    assert.equal(layout.overflow, 'visible');
    assert.equal(layout.height, layout.scrollHeight);
    for (const item of await items.all()) {
      const box = await item.boundingBox();
      assert.ok(box.y + box.height <= 900);
    }
    const composeBox = await page.locator('.compose a').boundingBox();
    assert.ok(composeBox.y + composeBox.height <= 900);
    await page.setViewportSize({ width: 1000, height: 1050 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(root, 'screenshots', 'preview.png') });
  });
  // Chromium assigns unpacked extensions an ID derived from their absolute path.
  const id = createHash("sha256").update(extension).digest("hex").slice(0, 32).replace(/[0-9a-f]/g, hex => String.fromCharCode(97 + parseInt(hex, 16)));
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.locator("#enabled:not([disabled])").waitFor();
  await check("real extension popup disables and immediately restores layout", async () => {
    await popup.locator("#enabled").uncheck();
    await sidebar.waitFor({ state: "detached" });
    assert.equal(await page.locator("[data-xpls-hidden]").count(), 0);
  });
  await check("settings persist across reload and can be re-enabled", async () => {
    await page.reload();
    await page.waitForTimeout(250);
    assert.equal(await sidebar.count(), 0);
    await popup.reload();
    await popup.locator("#enabled:not([disabled])").waitFor();
    assert.equal(await popup.locator("#enabled").isChecked(), false);
    await popup.locator("#enabled").check();
    await sidebar.waitFor();
    assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
  });
  await check("saved ordering syncs between open tabs", async () => {
    const other = await context.newPage();
    try {
      await other.goto('https://x.com/home');
      const otherItems = other.locator('.xpls-item');
      await otherItems.first().waitFor();
      assert.deepEqual(await otherItems.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
      await otherItems.first().focus();
      await other.keyboard.press('Alt+ArrowDown');
      await page.waitForFunction(() => document.querySelector('.xpls-item').textContent === 'Computer science');
      await otherItems.nth(1).focus();
      await other.keyboard.press('Alt+ArrowUp');
      await page.waitForFunction(() => document.querySelector('.xpls-item').textContent === 'Artificial intelligence');
    } finally { await other.close(); }
  });
  await check("account switching keeps separate saved orders", async () => {
    await page.evaluate(() => document.querySelector('[data-testid="AppTabBar_Profile_Link"]').setAttribute('href', '/seconduser'));
    await page.waitForFunction(() => document.querySelector('.xpls-item').textContent === 'AI experimentation');
    await items.first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'AI experimentation', 'Computer science']);
    await page.evaluate(() => document.querySelector('[data-testid="AppTabBar_Profile_Link"]').setAttribute('href', '/fixtureuser'));
    await page.waitForFunction(() => document.querySelectorAll('.xpls-item')[1].textContent === 'Computer science');
    assert.deepEqual(await items.allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
  });
  await check("malformed localStorage safely falls back to native order", async () => {
    await page.evaluate(() => localStorage.setItem('xpls:pinned-list-order:v1:/fixtureuser', 'broken JSON'));
    await page.reload();
    await sidebar.waitFor();
    assert.deepEqual(await items.allTextContents(), ['AI experimentation', 'Artificial intelligence', 'Computer science']);
    await items.first().click();
    assert.equal(await page.locator('#selection').textContent(), 'AI experimentation');
  });
  await check("list IDs distinguish identical names and survive renaming", async () => {
    await page.evaluate(() => {
      const pins = [...document.querySelectorAll('main [role="tab"]')].slice(2);
      pins[0].setAttribute('href', '/i/lists/111');
      pins[1].setAttribute('href', '/i/lists/222');
      pins[0].querySelector('span').textContent = 'Same name';
      pins[1].querySelector('span').textContent = 'Same name';
    });
    await page.waitForFunction(() => document.querySelector('.xpls-item').textContent === 'Same name');
    const originalKeys = await items.evaluateAll(buttons => buttons.map(button => button.dataset.key));
    assert.notEqual(originalKeys[0], originalKeys[1]);
    await items.first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    await page.evaluate(() => {
      const tabs = document.querySelector('main [role="tablist"]');
      tabs.querySelector('a[href="/i/lists/111"] span').textContent = 'Renamed list';
      const slot = tabs.querySelector('a[href="/i/lists/222"]').parentElement;
      tabs.append(slot);
    });
    await page.waitForFunction(() => document.querySelectorAll('.xpls-item')[1].textContent === 'Renamed list');
    assert.deepEqual(await items.allTextContents(), ['Same name', 'Renamed list', 'Computer science']);
    assert.equal(await items.first().getAttribute('data-key'), originalKeys[1]);
  });
  await check("a cached list ID navigates directly and highlights the destination", async () => {
    await page.goto('https://x.com/notifications');
    await sidebar.waitFor();
    assert.deepEqual(await items.allTextContents(), ['Same name', 'Renamed list', 'Computer science']);
    await items.first().click();
    await page.waitForURL('https://x.com/i/lists/222');
    await sidebar.waitFor();
    assert.equal(await sidebar.locator('[aria-current="page"]').textContent(), 'Same name');
    assert.equal(await page.locator('[data-xpls-hidden]').count(), 0);
    await page.evaluate(() => localStorage.removeItem('xpls:pinned-list-order:v1:/fixtureuser'));
    await page.goto('https://x.com/home');
    await sidebar.waitFor();
  });
  await check("emoji search, selection, and localStorage save work without opening a list", async () => {
    const selection = await page.locator('#selection').textContent();
    await page.getByRole('button', { name: 'Choose emoji for AI experimentation', exact: true }).click();
    const picker = page.locator('#xpls-emoji-picker');
    await picker.getByRole('searchbox').fill('rocket');
    assert.equal(await picker.locator('.xpls-emoji-option').count(), 1);
    await picker.getByRole('button', { name: 'rocket launch', exact: true }).click();
    assert.equal(await picker.count(), 0);
    assert.equal(await items.first().locator('.xpls-icon').textContent(), '🚀');
    assert.equal(await page.locator('#selection').textContent(), selection);
    const key = await items.first().getAttribute('data-key');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem('xpls:pinned-list-emojis:v1:/fixtureuser'))[key], key), '🚀');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Choose emoji for AI experimentation');
  });
  await check("emoji choices survive reloads and cached views, including reordering", async () => {
    await page.goto('https://x.com/notifications');
    await sidebar.waitFor();
    await page.reload();
    await sidebar.waitFor();
    assert.equal(await items.first().locator('.xpls-icon').textContent(), '🚀');
    await items.first().dragTo(items.last(), { targetPosition: { x: 100, y: 32 } });
    assert.deepEqual(await sidebar.locator('.xpls-label').allTextContents(), ['Artificial intelligence', 'Computer science', 'AI experimentation']);
    assert.equal(await items.last().locator('.xpls-icon').textContent(), '🚀');
    await page.reload();
    await sidebar.waitFor();
    assert.equal(await items.last().locator('.xpls-icon').textContent(), '🚀');
  });
  await check("unknown accounts cannot inherit another account's cached pins or emoji", async () => {
    await page.evaluate(() => document.querySelector('[data-testid="AppTabBar_Profile_Link"]').setAttribute('href', '/thirduser'));
    await sidebar.waitFor({ state: 'detached' });
    await page.evaluate(() => document.querySelector('[data-testid="AppTabBar_Profile_Link"]').setAttribute('href', '/fixtureuser'));
    await sidebar.waitFor();
    assert.equal(await items.last().locator('.xpls-icon').textContent(), '🚀');
  });
  await check("emoji updates sync across open non-Home tabs", async () => {
    const other = await context.newPage();
    try {
      await other.goto('https://x.com/search');
      await other.locator('#xpls-sidebar').waitFor();
      await other.getByRole('button', { name: 'Choose emoji for AI experimentation', exact: true }).click();
      await other.locator('#xpls-emoji-picker').getByRole('searchbox').fill('brain');
      await other.getByRole('button', { name: 'brain intelligence', exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('.xpls-item')].find(item => item.querySelector('.xpls-label').textContent === 'AI experimentation').querySelector('.xpls-icon').textContent === '🧠');
    } finally { await other.close(); }
  });
  await check("the picker handles empty search, Escape, outside clicks, and reset", async () => {
    const edit = page.getByRole('button', { name: 'Choose emoji for AI experimentation', exact: true });
    await edit.focus();
    await page.keyboard.press('Enter');
    const picker = page.locator('#xpls-emoji-picker');
    await picker.getByRole('searchbox').fill('no-such-emoji');
    assert.equal(await picker.locator('.xpls-emoji-option').count(), 0);
    assert.match(await picker.textContent(), /No emoji found/);
    await picker.getByRole('searchbox').fill('');
    await page.screenshot({ path: join(root, 'screenshots', 'emoji-picker-preview.png') });
    await page.keyboard.press('Escape');
    assert.equal(await picker.count(), 0);
    assert.equal(await edit.evaluate(element => element === document.activeElement), true);
    await edit.click();
    await page.locator('#selection').click();
    assert.equal(await picker.count(), 0);
    await edit.click();
    await picker.getByRole('button', { name: 'Use default list icon', exact: true }).click();
    assert.equal(await items.last().locator('.xpls-icon svg').count(), 1);
    await page.reload();
    await sidebar.waitFor();
    assert.equal(await items.last().locator('.xpls-icon svg').count(), 1);
  });
  await check("the cached picker choice also works through Home fallback navigation", async () => {
    await page.getByRole('button', { name: 'Choose emoji for AI experimentation', exact: true }).click();
    await page.locator('#xpls-emoji-picker').getByRole('searchbox').fill('robot');
    await page.getByRole('button', { name: 'robot ai', exact: true }).click();
    await items.filter({ hasText: 'AI experimentation' }).click();
    await page.waitForURL('https://x.com/home');
    await page.waitForFunction(() => document.querySelector('#selection').textContent === 'AI experimentation');
    assert.equal(await items.last().locator('.xpls-icon').textContent(), '🤖');
  });
  await check("legacy twitter.com also injects", async () => {
    await page.goto("https://twitter.com/home");
    await sidebar.waitFor();
    assert.equal(await items.count(), 3);
  });
  await check("no pins cleanly restores layout", async () => {
    await page.evaluate(() => [...document.querySelectorAll('main [role="tablist"] > div')].slice(2).forEach(element => element.remove()));
    await sidebar.waitFor({ state: "detached" });
    assert.equal(await page.locator("[data-xpls-hidden]").count(), 0);
    await page.goto('https://twitter.com/notifications');
    await page.waitForTimeout(250);
    assert.equal(await sidebar.count(), 0);
  });
  await check("no browser script errors", async () => assert.deepEqual(errors, []));
  console.log(`\n${checks} checks passed. Preview: ${join(root, "screenshots", "preview.png")}`);
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
