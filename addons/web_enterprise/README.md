# Web Shell (`web_enterprise`)

Gives the Community web client a home menu, a top bar adapted to it, mobile
navigation, an administrator message, a per-user colour scheme preference and
three view behaviours. User guide:
[docs/modules/web_shell.md](../../docs/modules/web_shell.md).

The module name `web_enterprise` is the original module name, kept so that
existing databases and modules that depend on it keep working (see
[docs/module-authoring.md](../../docs/module-authoring.md#naming)). It depends
on `web` and `base_setup`, installs itself automatically (`auto_install`) and
adds no menu and no setting to the general settings page.

Slice 001a is the behaviour of the shell. Slice 001b is its look: the theme,
described in the "Theme" section below. User guide of the theme:
[docs/modules/web_theme.md](../../docs/modules/web_theme.md).

## What it provides

| Part | Technical name | Purpose |
|---|---|---|
| Tile order | field `res.users.settings.homemenu_config` | JSON text: the list of application identifiers (menu xml ids) in the order the user chose. Read-only in forms; the browser writes it through the user settings. An empty, missing or unreadable value means the default order. |
| Colour scheme setting | field `res.users.settings.color_scheme` | Selection `system`, `light`, `dark`. Required, default `system`. Writing an empty value is ignored (the stored value stays). |
| Colour scheme on users | field `res.users.color_scheme` | Related to the setting above, labelled "Color Scheme", writable by the user themself (`user_writeable`). Shown as "Theme" on the preferences dialog and on the user form (Preferences tab). |
| Administrator message | system parameter `sysadmin.message` | JSON object `{"message": "<p>...</p>", "warning_type": "user" or "admin"}`. `message` is rich text; `warning_type` is the audience: `user` = every internal user, `admin` = administrators only. Set by an administrator or the hosting operator; nothing in this module writes it. |
| Session key | `sysadmin_message` in the session info | `{message, warning_type}` with the message sanitized (`html_sanitize`). Sent to internal users only. Only a two-part value reaches the browser: a JSON object whose `message` is text and whose `warning_type` is `user` or `admin`. Any other value (not JSON, not an object, a missing part, another audience) is logged as an error and skipped; the session still starts. |
| Colour scheme cookie | cookie `color_scheme` | `light` or `dark`. Written by the server on every successful answer of the web client route (`/web`, `/odoo`, `/odoo/...`, `/scoped_app/...`), with a lifetime of one year, and by the browser when its decision differs. Deleted at logout. |
| Server decision | `ir.http.color_scheme()` | The scheme a page is rendered with. Public user: `light`. Setting `light` or `dark`: that value. Otherwise the cookie, if it is `light` or `dark`. Otherwise `light`. |
| Browser colour | `ir.http._cws_browser_chrome_colour(scheme)` and the `theme-color` meta tag | The colour mobile browsers paint their toolbar with: one value for light, one for dark. |
| Home menu action | client action `menu` | The home menu as a screen of the action stack. Browser tab title "Home". Asking for it while it is shown changes nothing. |
| Home menu service | service `home_menu` | `hasHomeMenu` (the home menu is shown), `hasBackgroundAction` (an application is open behind it), `toggle(show?)` (without argument: the opposite of the current state; requests run one at a time and each waits one browser tick). |
| Colour scheme service | service `color_scheme` | `activeScheme`: `"light"` or `"dark"`, the scheme this page load works with. Also does the browser check and the reload described below. |
| Bus events | `HOME-MENU:TOGGLED`, `HOME-MENU:APPS-UPDATED` | On the environment bus. `HOME-MENU:TOGGLED` carries `true` or `false` when the home menu is shown or hidden. `HOME-MENU:APPS-UPDATED` carries `{ apps }`, the ordered application list after the home menu is built or reordered; each entry is the application record plus `href` (its address without the debug parameter) and `label` (its name). |
| Body class | `o_home_menu_background` | On `<body>` while the home menu is shown. |
| Burger menu | systray entry `burger_menu` | Replaces the Community entry (same name, sequence 0). While the home menu is shown it behaves as if no application were open. |
| Page hooks | classes `o_home_menu`, `o_home_menu_search_input`, `o_apps`, `o_app`, `o_menuitem`, `o_app_icon`, `o_caption`, `o_draggable`, `o_focused`, `o_dragged_app`, `o_disabled_offline`, `o_menu_toggle`, `o_menu_toggle_back`, `o_menu_brand`, `o_menu_brand_icon`, `o_menu_sections`, `o_hidden`; attribute `data-menu-xmlid` on a tile; ids `result_app_<index>` | The compatibility names listed in `model.md` ("Page hooks"), kept on the equivalent elements so that tours, tests and other modules find them. |
| JS extension points | `WebClient._loadDefaultApp` and the top bar `NavBar` | `_loadDefaultApp` opens the home menu (empty address, unknown action, back from the first screen). The top bar gets the grid button, the back chevron, the hidden application chrome and the mobile sidebar behaviour. |
| View extension points | `data-cws-views`, `data-cws-active`, `data-cws-from`, CSS variables `--cws-switch-from`, `--cws-switch-to` | On the control panel view switcher: number of views, active position, position the highlight starts from (all counted from 0). Slice 001b styles the slide. |
| Stuck header | class `o_cws_stuck` | On a kanban column header of an unfolded column while the scroll container is scrolled down by more than 0 px. The module itself adds the extra bottom padding and the frosted backdrop; slice 001b may restyle it. |

Own CSS classes start with `o_cws_`; the classes `o_home_menu`, `o_app`,
`o_caption` and `o_draggable` are the compatibility names that `model.md`
requires, so that tours and other modules can find the tiles.

## Rules in short

- **Landing page.** The home menu is the default screen: empty address, an
  action that no longer exists (with nothing behind it), or back on the first
  screen. Its address is `/odoo`. An address that names an action opens that
  action, not the home menu.
- **Tiles.** One tile per top-level menu that the user may see and that has an
  action, in menu order, with the Community icon rules (uploaded image, else
  glyph with its colour and background, else the default image). A tile is a
  link, so "open in a new tab" works. 6 tiles per row from 768 px wide, 4 below.
- **Opening a tile** starts a new action stack (breadcrumbs emptied, the
  background application dropped) and adds one browser history entry.
- **Toggling.** In an application the top bar button is one button: the grid,
  the application icon and the application name together. Clicking any of them
  (the name too) toggles the home menu. The button shows the home menu over the
  open application and brings the application back exactly as it was. Pending
  edits of an open form are saved first, with no confirmation. Escape and the
  back chevron do the same as the button. On the home menu with nothing behind
  it the button is hidden. On small screens the button opens the Community
  sidebar; its "All Apps" entry shows the home menu.
- **Order.** Press and hold a tile for 0.5 s. A move of 10 px or more before the
  hold ends cancels the press. After the hold, a move of 10 px or more from the
  held position starts the drag. The new full order is saved at once to the
  user's own settings. When the menu is built, applications missing from the
  saved list come first in their default order, then the listed ones in the
  saved order; unknown identifiers are ignored.
- **Keyboard** (window 768 px or wider when the home menu opens). Arrow keys and
  Tab move between tiles, Enter opens the focused tile, Escape goes back. The row
  length for the arrows is the one currently shown (6 or 4), also after a resize.
- **Type to search.** Typing opens the command palette in menu-search mode
  (query starts with `/`). Its footer tip names Control+K (Command on Apple
  computers). Closing the palette gives the focus back to the search field. Keys
  stay where they are when a dropdown, an overlay or a text entry has the focus.
  On touch devices the search field is visible at the top of the page.
- **Colour scheme.** See the next section.
- **Administrator message.** Shown above the tiles to internal users when
  `warning_type` is `user`, or `admin` and the viewer is in the settings group.
  There is no expiry. An empty message shows nothing.
- **View behaviours.** The view switcher reports its positions (the highlight
  starts from the previous view when the user switches inside the same action
  and window, otherwise from the active one). Unfolded kanban columns get
  `o_cws_stuck` while scrolled (extra padding and a frosted backdrop). The class
  is set from JavaScript on the live header, so copies of the header template in
  other modules (for example the CRM pipeline) get it too. On small screens
  (decided once when the pivot is created) the pivot removes its hover tooltips
  again after each render.

### How the colour scheme is decided

1. **Server cookie.** Every successful answer of the web client route sets the
   cookie `color_scheme` to the server decision (`ir.http.color_scheme()`). It
   lasts one year (`Max-Age` 31536000). On a first visit the
   browser therefore already finds a value, written by the server. The same
   decision picks the colour of the `theme-color` meta tag.
2. **Browser check.** When the web client starts, the service `color_scheme`
   works out the effective scheme: a setting of `light` or `dark` wins; with
   `system` the operating system's dark-mode request decides. It compares it with
   the cookie.
3. **Single reload.** If they are equal nothing happens. If they differ, the
   browser writes the new value into the cookie and reloads the page when a value
   was remembered before, or when the new value is `dark`. The web client is not
   drawn before that reload, so the wrong scheme never flashes. A guard in
   `sessionStorage` (`cws_scheme_reloaded`) allows one reload per scheme, so a
   cookie that cannot be written never causes a reload loop. Example: a user
   with `system` on a dark operating system first gets `light` from the server;
   the browser corrects the cookie to `dark` and reloads once.
4. **Why a reload.** Other modules read the remembered value once, when their
   code loads, and the server chooses the stylesheet. A change takes full effect
   only on a fresh page load. Saving the preferences dialog reloads the web
   client for that reason.
5. **Logout** expires the cookie at once.

## Administrator message

Open Settings, Technical, System Parameters (developer mode) and create or edit
the key `sysadmin.message`. Example value:

```json
{"message": "<p><b>Maintenance:</b> the platform goes offline tonight from 11 pm.</p>", "warning_type": "user"}
```

Use `"admin"` instead of `"user"` to show it to administrators only. Remove the
parameter (or empty the message) to hide it.

## Decisions

- **D1. No expiry.** The message is shown whenever its audience rule allows it;
  Complete has no subscription expiry to tie it to.
- **D2. Help link.** The help entry of the user menu keeps its Community
  target.
- **D3. Row length after a resize.** Arrow keys use the row length currently
  shown (6 or 4) and re-check it on resize.
- **D4. Pivot indentation.** No compact indentation on phones; the Community one
  (5 px plus 30 px per level) stays.
- **D5. Typing in dropdowns and rich text.** A key pressed while a dropdown or a
  text entry has the focus stays there; it does not jump to the home menu search.
- **D6. Unreadable saved order.** A saved order that is not valid JSON, or not a
  list, is ignored and the default order shows.
- **D7. One top bar button.** The grid, the application icon and the
  application name are one button; the name never reopens the application.
- **D8. Scheme cookie lifetime.** The server writes the colour scheme cookie
  with a lifetime of one year, so it outlives the browser session.
- **D12. Early move cancels.** A move of 10 px or more before the hold ends
  cancels that press; the Community behaviour of ignoring it is not kept.
- **D13. Malformed administrator message.** A value that is not the two-part
  message is skipped and logged; it never reaches the browser.
- **D14. Palette tip.** The footer of the command palette is worded by Complete,
  with the same meaning and the key names in bold.

## Not included

- Studio promotion: the Studio button in the system tray, the extra "Add Custom
  Field" entry in the optional columns menu, the "Automations" kanban entry
  when the Community automation module is missing. Complete builds no vendor
  licensing or promotion.
- Phone app promotion: the dialog on phone numbers that advertises a separate
  application. The Community phone link stays.
- Subscription and licensing (slice 001d): expiration and registration panels,
  expiration details in the session, edition and licence text in settings.
- Map features (slice 005): map token setting, geolocation helper, partner
  coordinates.
- Studio-only look settings (a custom home menu background image).
- Mobile app bridge (slice 001c): see
  [`addons/web_mobile/README.md`](../web_mobile/README.md). Only the
  one-row-per-app tile layout inside the iOS app is part of this module (next
  section).

## iOS application list

Inside the iOS app (the browser identification carries the marker `OdooMobile (iOS)`),
below 768 px wide, the home menu is one row per application instead of the grid.
The marker alone decides; capabilities of the app are not consulted. The values
below are the measured ones (the class is `o_cws_ios_list`, in `home_menu.scss`).

| Part | Value |
|---|---|
| List | one column, no gap, 4 px above, 8 px side padding, base font 20 px, rows 16 px apart |
| Row | icon and name side by side, centred vertically, padding 16 px / 24 px, no border, radius 12 px, background white at 10 % opacity in both schemes, no shadow, 84.5 px high |
| Icon | 52.5 px square, 24 px to its right, radius 8 px |
| Name | 20 px, weight 500, line height 30 px, left-aligned, body text colour of the scheme; it keeps the 8 px caption margin of the grid, so it sits 4 px below the row middle |
| First row | 65 px from the top of the page in light, 67 px in dark |

Wider windows keep the grid (column tile, 8 px padding, transparent background, 14
px name, weight 500, centred). On a phone outside the iOS app the grid stays with
13 px names at weight 500; there the name box is 8 px wider than the tile content
(`margin-inline: -4px`) so that names such as "Point of Sale" are not cut. Tests:
`tests/test_ios_list.py`.

The event `HOME-MENU:APPS-UPDATED` carries `{ apps }`: the applications in the order
the home menu shows them (user order applied). Each entry is the application
record (`xmlid`, `name`, `webIconData`, ...) plus `href` (its address without the
debug parameter) and `label` (its name). `web_mobile` uses it to tell the native
app which applications exist.

## Theme

Slice 001b gives the back end its look, in the light and in the dark scheme. It
adds no menu, setting, model or text.

### What it provides

- **Colour roles**, each with a light and a dark value (base colours, surfaces,
  text, lines, states), plus type, radii, shadows, blur and motion. The default
  values are in `static/src/theme/roles_light.scss` and `roles_dark.scss`.
- **A complete dark stylesheet**: the whole back end is built a second time with
  the dark roles; it is not a filter over the light page. Dark-only rules of
  other modules join the same stylesheet.
- **Restyled shell**: top bar, grid button and back chevron, home menu
  background, tiles, tray counters, touch search field, browser chrome colour.
- **Components and views**: buttons, badges, tags, dropdowns, popovers,
  dialogs, notebooks, switchers, status bar, inputs, control panel, kanban,
  list, pivot, graph, calendar, form, settings, search panel, command palette,
  mobile bottom sheet and the login page background.

Owner decisions, in one line each:

- **D1.** Releasing a tile after an early move (which cancels the drag) no
  longer opens the application.
- **D2.** While the home menu is shown, the Community apps-menu tour step leaves
  it alone, so the next step finds the tile (helper `showAppsMenuItem`).
- **D3.** The back chevron is primary at rest in light and white in dark; black
  only under the pointer.
- **D4.** The login card has the rounded corners of about 6 px that are drawn,
  not square ones.
- **D5.** The touch search field is 39 px high in dark and 37 px in light.
- **D6.** Native controls follow the scheme (see "Declared colour scheme").
- **D7.** Where the measured look of the original differed from the first
  specification, the measured look holds. This round: tooltip as a black pill
  label (grey label in dark), tray entries with 4 px padding and a transparent
  border, a 36 px avatar entry, the application name in the black role in dark,
  the 12 px radius on the focused tile, check boxes and radios on the view
  background, and a 1 px transparent border on switcher buttons with a hover
  state (no fill in light, the text turns black).
- **D8.** A tour that meets that step while the home menu is shown skips it, in
  automatic and in interactive tours (also when it is started from the home
  menu or when the home menu opens right after the step began), and goes on
  with its next step. The helper adds a condition to the step so that it only
  applies outside the home menu. The helper also marks that step; the
  interactive runner patch moves on past a current step that has become
  inactive only when the step carries the mark (D10 narrows the first form).
- **D9.** More of the original's measured look holds. A switcher group of one
  to four buttons with no active button shows the pill under its first button
  (more than four: no pill); ribbon bands carry the 25 % gloss tone; the
  pressed slider thumb carries the control gloss over its fill; searchable
  selection lists have a grey 100 background in light; in dark the hover text
  of an inactive switcher button stays grey 900 and the active text is the
  black role; the home menu scrolls at full width, so its thin scroll bar runs
  along the window edge while the tiles stay in the 850 px column. The list
  of matching records under a record field (salesperson, tags) is grey 100 in
  light with its own lighter shadow; the control-panel search suggestions stay
  white. On a phone the language options open in a bottom sheet with a shadow
  and an action-coloured border on the chosen option. The calendar's
  unscheduled drop zone sits flush with the top and sides of the panel column
  and takes its fill and border from the action colour of the active scheme.
- **D10.** D8 is the only change Complete makes to how tours run. The
  interactive runner patch acts only on the marked apps-menu step: for every
  other step, including one that becomes inactive, it calls the Community
  method, so those steps run as on a Community database.

Verifier findings fixed in the rework round: F1 kanban title row 25.2 px and
column header 74.2 px (80.2 px on a phone), F2 to F6 card badges and tags at 10
to 11 px with weight 600, a white list area, transparent breadcrumbs, the
chatter beside the form at the height of the header buttons, a 33 px settings
search field and 8 px calendar filter spacing, F7 the dark switcher hover fill,
F8 notebook tabs keep the surrounding text colour on hover. Round 2: F9 plain
badges in cards keep their size when the card footer has a larger font, and F10
an open tray entry over the home menu has no ring (border transparent, no fill,
only the hover wash).

### How it is built

Files are in `static/src/theme/` unless noted.

| Part | Where |
|---|---|
| Light roles | `roles_light.scss`, inserted **before** `web/static/src/scss/primary_variables.scss` in `web.assets_backend` and `web.assets_backend_lazy`, so Community variables take our values |
| Dark roles | `roles_dark.scss`, put in the bundle `web.dark_mode_variables` before the light file. Both dark bundles, `web.assets_web_dark` and `web.assets_backend_lazy_dark`, include that bundle |
| Component rules | one file per area (`buttons`, `badges_tags`, `inputs`, `overlays`, `notebook_statusbar`, `switchers`, `control_panel`, `kanban`, `list`, `calendar`, `form`, `settings`, `search_panel`, `graph_pivot`) written with role variables only; raw colour values exist only in the two role files |
| Dark-only rules | files named `*.dark.scss` anywhere under `static/src/` (the glob `web_enterprise/static/src/**/*.dark.scss`; today: home menu, navbar, inputs, kanban, overlays, search panel, misc). They are removed from `web.assets_backend` and added to `web.assets_web_dark` with the same glob |
| Graph and pivot | `graph_pivot.scss`, `views/graph_fill_patch.js` and `views/pivot_renderer_patch.js` go in the lazy bundle with the views |
| Login page | `login_page.frontend.scss`, in `web.assets_frontend` (public pages have no roles and are always light) |
| Role custom properties | `role_properties.scss` publishes the base roles as `--o-cws-*` (for example `--o-cws-primary`, `--o-cws-page-bg`, `--o-cws-view-bg`, `--o-cws-border`, `--o-cws-dark-chrome`) for scripts and for the few rules that cannot take a Sass value. The values come from whichever role files the bundle was built with, so they follow the scheme |

### Overriding roles

Another module or theme changes a colour by shipping its own role file:

- dark scheme: add the file to `web.dark_mode_variables` with `('before',
  'web_enterprise/static/src/theme/roles_dark.scss', '<your file>')`, so your
  plain assignments placed first win over the `!default` values of our file;
- light scheme: add the file to `web.assets_backend` (and the lazy bundle)
  `('before', 'web_enterprise/static/src/theme/roles_light.scss', '<your file>')`.

Derived roles (hover and pressed states, gloss, mixes) are computed from the base
roles, so changing a base role such as the primary colour keeps them consistent
(spec rule R3). The dark base colours are a fixed list and are not recomputed
from the light ones.

### Declared colour scheme and browser colour

- The page declares its scheme twice: the meta tag `color-scheme`
  (`dark` in the dark scheme, otherwise `light`) and the CSS property
  `color-scheme` set from the role file on `:root`. Scroll bars, native date and
  time inputs and native select pop-ups therefore follow the scheme (R46, D6).
  Public pages such as the login page declare `light`; so do the public pages built
  on the Community layout, website included (R46).
- The `theme-color` meta tag carries the primary colour in the light scheme and
  the *dark chrome* role (`#242733`) in the dark scheme (R9). It replaces the
  interim rule of 001a, via `ir.http._cws_browser_chrome_colour(scheme)`.

### Theme tests

| Layer | What it checks | Where |
|---|---|---|
| Probe harness | loads a real back-end page in Chrome (light or dark, desktop or phone), and reads computed styles, sizes and states | `tests/theme_probe.py` (`ThemeProbeCase`), fixtures in `tests/theme_fixtures.py` |
| Bundles | where each role and component file lands in each bundle and in which order | `tests/test_theme_bundles.py` |
| Roles, components, views | colours, sizes and states per area (including the D7 corrections: tooltip A128, tray and avatar A129 to A131, switchers A132; the D9 looks: pill A134, selection lists A135), no light surface in dark, native scheme, role usage, RTL, switcher widths | `tests/test_theme_shell.py`, `test_theme_components.py`, `test_theme_views.py`, `test_theme_http.py` |
| Decisions | D1 tile release, D2 and D8 apps-menu step (including a tour started by hand from the home menu), D10 other steps run as on Community (A136: section menu and CRM Sales menu tours, plus a Hoot test of the runner patch) and the expenses tour | `tests/test_theme_decisions.py` |
| Screenshots | the screens in `docs/assets/web_theme/`, on demand | class `ThemeScreens` in `tests/test_screens.py` (tag `web_theme_screens`) |

Run them like the 001a tests (command below; the whole module is
`--test-tags /web_enterprise`, one class is `/web_enterprise:ClassName`). Two
groups need an optional module and skip themselves without it: the activity view
checks need `mail`, and the expenses tour needs `hr_expense`. To run them, install
the module with the database, for example `-i web_enterprise,mail,hr_expense`.

Theme screenshots use the same container recipe as the 001a ones, with
`--test-tags web_theme_screens` and a database with demo data and the CRM,
Contacts, Calendar, Project and Sales applications. The files are written to
`<screenshots dir>/web_theme/`.

## Provenance

Written in a clean room from the spec packages of slices `001a-web-shell` and
`001b-web-theme`. See
[docs/process.md](../../docs/process.md).

## Tests

| Layer | What it checks | Where |
|---|---|---|
| Python | install, session key and message audience data, the server colour decision and cookie, the user setting and its rules | `tests/test_install.py`, `tests/test_user_settings.py`, `tests/test_http.py` |
| Hoot (browser unit tests) | tile order, tile navigation, keyboard, reordering, home menu and services, navbar, colour scheme service, view behaviours | `static/tests/*.test.js`, run by `tests/test_js.py` (class `TestWebShellHootSuite`) |
| Tours | end-to-end flows against the real server (landing page, toggling, saved order, message audience, Theme field, dark reload) | `static/tests/tours/web_shell_tours.js`, run by `tests/test_tours.py` |
| Screenshots | the screens in `docs/assets/web_shell/`, taken on demand, not part of the normal run | `tests/test_screens.py` (tag `web_shell_screens`) |

Everything except the screenshots, in a container (use a fresh database name, or
add `-u web_enterprise` to reuse one):

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <db> -i web_enterprise --test-tags /web_enterprise --stop-after-init
```

Only the Hoot suite:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <db> -i web_enterprise --test-tags /web_enterprise:TestWebShellHootSuite --stop-after-init
```

Screenshots (needs a database with demo data and the Contacts, CRM, Sales,
Calendar and Project applications). Container output must never land in the
module or in any tracked directory. Send it to the repository's git-ignored
`.cache/web_shell_screens/` with an explicit bind mount, and run the container
as root so that the files belong to your host user and can be deleted. Create
the host directory first (`mkdir -p .cache/web_shell_screens`), then, with the
absolute path of your checkout:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm --user root -v /path/to/complete/.cache/web_shell_screens:/mnt/cws_shots odoo odoo -d <db> -i web_enterprise,contacts,crm,sale_management,calendar,project --with-demo --screenshots /mnt/cws_shots --test-tags web_shell_screens --stop-after-init
```

Moving the pictures you keep into `docs/assets/web_shell/` is a plain `mv`.

From the owner's shell the Makefile does the module run:

```
make test MODULES=web_enterprise
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers) instead of `make test`.
