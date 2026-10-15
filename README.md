# X Pinned Lists Sidebar — install in about a minute

The extension puts your pinned lists in the left sidebar, below More and above the existing Tweet/Post button, across every view with the full desktop sidebar. For you and Following stay at the top. It is designed to coexist with Control Panel for Twitter.

## Install directly from this workspace

1. In Chrome, type `chrome://extensions` into the address bar.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder:

   `/home/overcode/Work/Codex/List X extension/extension`

   Select the folder itself, which contains `manifest.json`.

4. Refresh your existing X/Twitter tab and visit **Home** once. The extension learns your pinned lists and keeps them available on other views and future visits.

These are Chrome's [official unpacked-extension installation steps](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Install from the ZIP on another computer

Extract `x-pinned-sidebar.zip` to a permanent folder. Follow the same steps, choosing the extracted **x-pinned-sidebar** folder that contains `manifest.json`. Chrome loads a folder, so extract the ZIP first. Keep the folder in place afterward.

No npm commands, build process, X API key, server, or Chrome Web Store account are needed.

## Manage a user’s list memberships

- Profile hover cards remain open while the pointer moves from a username through the real card’s avatar, buttons, bio, statistics and list action. Pending native close timers are held only while the card is hovered or its list selector is open. Leaving both card and username restores native hover behavior, and Escape, outside clicks, profile-link navigation, focus loss and disabling remain native. No copy of the card is created.
- A small **Add/remove from list** text link appears below **Follow/Following** on hover cards and profile pages. It highlights and underlines on hover.
- Clicking opens the extension’s compact selector over your current view. It does not open a profile, another tab, or X’s official modal, and it preserves the current URL and timeline position.
- Lists appear in three groups: existing memberships first, then pinned lists in your saved sidebar order, then the rest. This sorts only the display; rows stay in place while staging changes. Reopening regroups by current server membership. List IDs, saved pin order, emoji, and membership data are preserved, and writes still require Save.
- Search the lists you own, including private and unpinned lists. Existing memberships are checked. Choose your changes, then click **Save**. Only the changed memberships are sent to X.
- Close the selector, click outside it, or press Escape to discard unsaved selections. The hover card stays open while its selector is open. The selector is anchored below the text action, independent of mouse position, with a padded close icon. Closing releases the card’s normal hover behavior; keyboard focus remains usable.
- If loading fails, the selector displays an error and offers Retry. It does not guess membership status. Partial saves retain confirmed changes and allow retrying the remaining changes.

Both selector modals share the same typography, including the heading, search field, list names, status message, and buttons.

The inline integration uses X’s existing authenticated app client when available, including its CSRF protection, request signing, session binding, and account feature settings. It reads the user ID from X’s loaded user data or the native Follow button and validates list ownership against the signed-in account. A rejected GraphQL list read can fall back to the owned-lists REST endpoint, including private and unpinned lists. A write can use the alternative REST endpoint only after an explicit rejection before execution; timeouts, authentication errors, and rate limits do not trigger another write. The selector reports the failing endpoint and X’s error code instead of hiding them behind a generic error. No API key or additional account permissions are needed to manage lists you own. The integration tests use simulated service responses; a signed-in account check is still needed after updating.

## Home view and Minimal UI

Version 1.8.3 includes compact controls directly above the account item whenever the full left sidebar is visible. The controls sit outside the entire account click target, so pointer and keyboard interactions cannot open the account menu.

- **Home view** offers **For you**, **Following: popular**, **Following: recent**, and all currently pinned lists in their saved sidebar order. The initial default is For you. Selecting a default saves it for the next fresh app entry or Home click, without leaving or resetting the current feed.
- The chosen Home view applies only on fresh domain/Home entry and explicit clicks on the sidebar Home icon, including X's internal navigation. Refresh/F5 keeps the current native view, sort and URL. Thread Back, browser Back/Forward, Alt+Left and restored history pages keep native feed and scroll restoration. Deep links stay on their own page. ID-based Home lists open their own list URL; older name-only pins use their native Home tab. A list default replaces a newly created native Home waypoint so it adds no extra Back step.
- Following defaults use X's own tab and sorting menu. There is no custom Following menu, request-ranking override, forced feed reload, or fixed wait before sorting. Manual tab/list/sort changes take priority until fresh app entry or an explicit Home click. A late automatic tab restoration can be corrected twice; conflicting extensions cannot cause an endless navigation loop.
- A saved list URL can open before the sidebar catalog mounts. Older name-only choices wait for their native tabs to load, including on cold startup; a temporarily empty catalog never replaces your choice with For you or reports it as unpinned. The saved choice remains available in the selector. If native controls take a long time to load, an inline waiting message appears; manual navigation cancels the pending default.
- **Minimal UI** hides the sidebar Tweet/Post button, the new-post composer on Home/list timelines, and non-search right-sidebar modules. It leaves account controls, pinned lists, navigation, profile content, and reply/compose pages available. Existing composer draft nodes remain in place and reappear when the switch is turned off.
- Right-sidebar cleanup is part of the same **Minimal UI** switch. Search, clear actions, suggestions, recent searches and search popups stay available. Modules that appear later are also hidden, and turning Minimal UI off restores their original DOM.
- Home view and Minimal UI are saved in extension local storage per signed-in account, shared across X/Twitter origins, and survive browser restarts and clearing website storage. Existing site-only preferences migrate automatically, without changing pin order, emoji or memberships. A profile-handle alias supports startup before the account ID is available. Changes synchronize across open tabs without navigating any current feed. Resizing, account-control remounts, UI visibility changes and re-enabling the extension also keep the current view. A collapsed icon sidebar hides these controls; expanding it restores them.
- Disabling the extension restores the native controls and layout. Re-enabling it retains the saved preferences. Like X itself, native view changes still depend on network and rendering time.

## Timeline controls

The extension keeps X's native Following behavior and adds consistent view labels, passive sorting information, and membership-first list presentation.

- Click X's own Following sorting control to open its native **Sort by** menu. The extension creates no Following dropdown and does not open menus on hover.
- Ordinary Following clicks, keyboard handling, sorting and caching remain native. The Home preference applies through native controls on Home entry; it never rewrites ranking requests or reloads the feed.
- The existing native chevron is positioned next to the Following text when its separate native control can be identified safely. Its native state, direction and event handlers are preserved. No replacement icon is inserted.
- For you and Following retain the native blue selection line without an added white text underline. The extra right arrow is hidden. The selected custom list uses a subtle 1px blue line along the bottom of its sidebar button. The text and current-view label have no underline.
- All current-view labels use the same 12px typography. Following includes **Popular** or **Recent**, read passively from X's native request variables or checked sort-menu option. The label omits the sort until X exposes it, rather than guessing from old extension preferences. Observing it creates no menu, sorting override, extra request, wait, or reload.
- Previous extension sorting preferences and remount markers are ignored. Sidebar ordering, emoji and list-management preferences remain available.
- Disabling the extension restores the original header geometry. X's own network and rendering time still applies; these changes remove the extension's additional delay, not server latency.

## With Control Panel for Twitter

Keep that extension installed. This extension uses its own namespaced styles and the native X list-tab click handlers. It leaves Control Panel's additional Retweets/Quotes tab at the top.

For this layout, keep Control Panel's **Hide the Compose Tweet button** setting off. If you want both For you and Following visible, also keep its **Hide the For you timeline** setting off. This extension respects any tabs that Control Panel already hides. Keep its **Sort Following** setting at **Do nothing** if you want the Home view selector to choose that sort through the native menu.

## Turn it off

Open Chrome's puzzle-piece menu → **X Pinned Lists Sidebar**. Uncheck **Enable extension features**. Open X tabs restore the original layout automatically, and your preference is saved locally. You can also disable/remove the extension on `chrome://extensions`; refresh X afterward.

## What is supported

- `x.com`, `www.x.com`, `twitter.com`, and `www.twitter.com`, over HTTPS.
- Every desktop view with the full-width left Tweet/Post button, including profiles, notifications, search, messages, list details, and compose.
- Automatic updates when X replaces its tabs or you pin/unpin lists.
- Compact list buttons match the native menu font, color, alignment, and pill hover style. All pins remain visible without an internal scrollbar; long names use ellipsis with the full name in a tooltip.
- Drag a list above or below another to reorder it. A line marks the drop position. Your order is saved in the page’s localStorage and restored on future visits. New pins appear after your saved lists.
- Click the icon at the left of a list to open a searchable emoji picker. Choose an emoji to replace the generic icon, or select **Use default list icon** to reset it. Choices are saved per account in localStorage and synced across open tabs.
- Keyboard-accessible navigation and reordering: focus a list and press **Alt + Up/Down** to move it. The active list is bold.
- Order is kept separately per account (using the sidebar profile link) and synced across open tabs on the same domain.
- Narrow/icon-only sidebars automatically use the original top tabs.

The extension learns pins from the tabs X renders on Home and saves their names and available list links in localStorage. Visit Home once after installing; after that, lists are available on other views, even when you open them directly or reload. Returning to Home refreshes the saved catalog when you pin or unpin lists. Other views’ own tabs remain visible.

From Home, list buttons use the native tab handlers. From other views, a known list link opens directly; if X exposes only a Home tab, the button returns to Home and selects that list automatically. The extension doesn’t discover or pin lists for you.

## If the lists don't appear

1. Refresh X after installation and open Home with at least one pinned list.
2. Widen the window until the Tweet/Post button has its full text label.
3. Verify this extension is enabled and Chrome permits it to run on X/Twitter.
4. Check that Control Panel isn't hiding the compose button or Home timeline.
5. If Chrome reports an extension error, copy its message from `chrome://extensions` → **Errors**.

If the browser is managed by your organization and Developer mode is blocked, installation needs your organization's approval or a Chrome Web Store distribution.

## Privacy and permissions

Only the `storage` extension permission is requested, to save the enabled/disabled preference and account-scoped Home/UI settings. Content-script access is limited to the four X/Twitter domains above. There is no telemetry, external service, or posting automation. The inline selector calls X’s internal web list services using your existing signed-in browser session, and sends membership changes only after you click Save. Existing session headers and CSRF/signing data stay in the page’s memory; they are never logged, stored, or sent to a third-party service. Only list metadata and operation results cross into the selector UI. The cached list catalog, display order, and selected emoji are saved in X/Twitter’s localStorage using list IDs when available, otherwise list names. They stay in your browser and are scoped to each domain/account. Pending sidebar Home-tab selection uses sessionStorage in the current tab only. The Home view choice and Minimal UI flag are saved separately in extension local storage, keyed by signed-in account ID with a verified profile-handle alias. A localStorage mirror keeps upgrades from the previous site-only format compatible. A selected Following Home sort is part of that Home preference; ordinary manual sorting is not forced or saved by the extension. List membership data is fetched when the inline selector opens and is not persisted in localStorage. Closing the selector discards its in-memory data. Clearing site data resets the site-cached list catalog, order and emoji, while Home/UI settings remain in extension storage. Home/UI settings survive reloads even if site storage is unavailable. Uninstalling the extension clears its stored settings.

## Verification and limits

166 automated checks passed in Chromium with the actual unpacked Manifest V3 extension: 35 sidebar checks, 34 inline list-management checks, 23 native timeline checks, 21 sidebar-preferences checks, 15 startup/account/search regressions, 24 navigation/history checks, and 14 hover-lifecycle checks. They cover sidebar ordering and emoji, cross-view navigation, account isolation, authenticated list reads/writes, private and unpinned lists, failures and retries, pinned hover cards, matching modal typography, selector anchoring and close-button geometry, membership-first/pinned-first grouping, unchanged configuration and memberships during staging, and duplicate list names. Save and partial-retry checks also verify that presentation order does not change mutation order. Timeline checks verify that the custom menu and sorting code are gone, only the native menu opens, the native chevron aligns with the text, labels match across views, native sorting labels stay isolated per account and reflect effective request ranking, both sort choices render different posts, GET/XHR, fetch and Request bodies pass through unchanged, old sorting preferences are ignored, cached choices cause no extension refresh, drafts survive, and keyboard/resize/tab replacement/disabling remain functional. The fixture confirms native sort callbacks start requests immediately without an extension timer or reload. Preference checks cover every Home choice, native refresh preservation and fresh domain entry, native SPA Home navigation, late automatic tab restoration, manual navigation priority, draft preservation, Minimal UI across views and refreshes, responsive controls, account isolation, malformed settings, cross-tab synchronization, and disabling/re-enabling. The new regression suite reproduces a nested native account Pressable, exercises actual pointer and keyboard clicks, delays pin hydration, closes and reopens a persistent Chromium profile several times, switches between X and Twitter, clears site storage, migrates old settings, and verifies search-only modules, suggestions, clear actions, late widgets, portals and account isolation. Navigation checks reproduce thread Back, browser Back/Forward, document history restoration, exact feed scroll positions, refresh of Home/sort/list/thread views, late metadata, preference editing and cross-tab sync, resizing, re-enabling, and Home-to-list history entry counts. The Alt+Left action is modeled by the fixture because headless Chromium does not execute browser keyboard accelerators; no production keyboard handler is installed. The extension does not modify history state or scroll restoration. Hover lifecycle checks use real pointer movements against a controller fixture with pending username-leave timers and child-leave timers; they cover native Follow/profile-link actions, stale dismiss callbacks, pointer exit and return to the username, Escape, outside clicks, focus loss, replaced cards, disabling and Twitter compatibility.

In version 1.8.2, the list-management suite was also exercised with the actual native hover-controller, API-client and header-middleware factories extracted from X’s public main bundle (`main.7de7adccd6c7c8f0a.js`). These validate the native request interfaces used by version 1.8.2. API responses, session credentials, and the Redux provider in these tests remain simulated; this does not verify your signed-in account.

The included preview images are illustrative test-page screenshots, not screenshots of your signed-in account. The list-selector preview shows the extension’s UI using simulated list data. Compatibility with your exact X + Control Panel configuration still needs a live check after installation; X can change its page structure.

## For future updates

Replace the files in the installed folder, click the extension's reload icon on `chrome://extensions`, then refresh X.

For developers, run from this workspace with Playwright installed (or the adjacent Emoji App’s dependency):

```sh
NODE_PATH="../Emoji App/node_modules" node tests/verify.mjs
NODE_PATH="../Emoji App/node_modules" node tests/manage-lists.mjs
NODE_PATH="../Emoji App/node_modules" node tests/timeline.mjs
NODE_PATH="../Emoji App/node_modules" node tests/preferences.mjs
NODE_PATH="../Emoji App/node_modules" node tests/preferences-regressions.mjs
NODE_PATH="../Emoji App/node_modules" node tests/navigation.mjs
NODE_PATH="../Emoji App/node_modules" node tests/hover-cards.mjs
```

To exercise locally extracted native module factories, set `XPLS_NATIVE_MODULE` (header middleware), `XPLS_NATIVE_API_MODULE` (API client), and optionally `XPLS_NATIVE_HOVER_MODULE` (hover controller) to their file paths when running `tests/manage-lists.mjs`. Each file should contain the factory’s object-method source as returned by `String(factory)`; it is used only in the test fixture.

The tests use Playwright and a temporary browser profile. They intercept X/Twitter with local fixtures and don't access an account. Development screenshots are saved in `screenshots/`. The source is contained in `extension/`; there is no compilation step for the extension.

## Packaging a new version

Run `python3 build/package.py` from the repository root after updating the source and checking the affected behavior. The script packages `extension/`, this installation guide, and previews from `screenshots/` into `build/x-pinned-sidebar.zip`, then checks the ZIP's integrity. It requires only Python's standard library. The script resolves its paths from its own location, so it can also be invoked by its full path from another directory. Loading `extension/` directly in Chrome does not require running this script.
