# Web Shell

The Web Shell module changes how you move around the web client. After you log
in you land on the **home menu**, a grid of your applications. The top bar and
the phone navigation are adapted to it, and you can choose a Theme in your
preferences. It adds no menu and no setting page of its own.

Technical reference:
[`addons/web_enterprise/README.md`](../../addons/web_enterprise/README.md).

## The home menu

The home menu shows one tile for each application you may use. It is the first
screen after login, and it is also what you see when the address is just the
web client root or points to something that no longer exists.

![The home menu on a desktop screen](../assets/web_shell/01-home-menu.png)

![The home menu on a phone](../assets/web_shell/01-home-menu.mobile.png)

Click or tap a tile to open the application. You can also middle-click it, or
use "open in a new tab", because every tile is a link.

## Going to the home menu and back

Inside an application, the grid button at the left of the top bar opens the
home menu over it. The application stays open behind it.

![An application with the grid button, the application icon and its name](../assets/web_shell/04-app-navbar.png)

While the home menu covers an application, the grid button becomes a back
arrow (tooltip "Previous view"). Click it, or press Escape, to return to the
application exactly as you left it: same screen, filters, record and scroll
position. If you had unsaved changes in a form, they are saved first, without
a question.

![The home menu over an application: the button is now a back arrow](../assets/web_shell/05-home-over-app.png)

![The application is back as it was](../assets/web_shell/06-back-to-app.png)

Opening a tile from the home menu starts the application afresh: the trail of
screens (breadcrumbs) is emptied. When the home menu is the only thing open,
there is nothing to go back to and the button is hidden.

## On a phone

On a small screen the top bar shows a three-line button. Inside an application
it opens the side panel with the application's menus and an **All Apps**
button, which shows the home menu.

![The side panel inside an application, with All Apps](../assets/web_shell/07-mobile-app-menu.mobile.png)

![The home menu over an application on a phone](../assets/web_shell/05-home-over-app.mobile.png)

![The application top bar on a phone](../assets/web_shell/04-app-navbar.mobile.png)

The user menu opens from your avatar at the top right. On the home menu it
lists no application entries.

![The user menu on the home menu, on a phone](../assets/web_shell/08-burger-on-home.mobile.png)

![The user menu inside an application, on a phone](../assets/web_shell/20-burger-in-app.mobile.png)

## Reordering the tiles

Press and hold a tile for half a second without moving, then drag it to its
new place and let go. The new order is saved at once and belongs only to you.
It works with a mouse and with a finger.

![A home menu in a custom order](../assets/web_shell/09-home-reordered.png)

![A custom order on a phone](../assets/web_shell/09-home-reordered.mobile.png)

Applications that are not in your saved order (for example a newly installed
one) appear first, then your own order follows.

## Searching

Start typing on the home menu: the search opens and lists matching
applications first, then matching menu entries. Choose one to go there. On a
phone a search field is visible at the top of the page; tap it. The tip at the
bottom reminds you that Control+K (Command+K on a Mac) opens the search from
anywhere.

![The search over the home menu](../assets/web_shell/03-home-search-palette.png)

![The search on a phone](../assets/web_shell/03-home-search-palette.mobile.png)

## Using the keyboard

On a screen at least 768 px wide:

- The arrow keys, and Tab or Shift+Tab, move the highlight between tiles. The
  first press highlights the first tile.
- Enter opens the highlighted tile.
- Escape returns to the application behind the home menu.
- Any other key starts a search. If a menu or a text field has the focus, keys
  stay there.

![A tile highlighted with the keyboard](../assets/web_shell/02-home-keyboard-focus.png)

## The administrator message

An administrator can show a notice above the tiles, for example to announce a
maintenance. It is stored in the system parameter `sysadmin.message`: open
Settings, Technical, System Parameters (developer mode) and create or edit the
key. The value is a small piece of JSON with the text and the audience:

```json
{"message": "<p><b>Maintenance:</b> the platform goes offline tonight from 11 pm.</p>", "warning_type": "user"}
```

- `"warning_type": "user"` shows it to every internal user.
- `"warning_type": "admin"` shows it to administrators only.
- Portal users and visitors never see it.
- The message stays until you remove the parameter or empty the message. If
  the value is not valid JSON, no message is shown and an error is logged on
  the server.

![The administrator message above the tiles](../assets/web_shell/10-home-admin-message.png)

![The administrator message on a phone](../assets/web_shell/10-home-admin-message.mobile.png)

## Theme preference

Every internal user chooses a **Theme**: **System** (follow the device),
**Light** or **Dark**. Open the user menu, then My Preferences. Saving
reloads the web client so that the change shows at once.

![The Theme field in My Preferences](../assets/web_shell/11-preferences-theme.png)

![The Theme field on a phone](../assets/web_shell/11-preferences-theme.mobile.png)

An administrator can set the Theme of any user on the user form, in Settings,
Users, tab Preferences.

![The Theme field on the user form](../assets/web_shell/12-user-form-theme.png)

![The Theme field on the user form, on a phone](../assets/web_shell/12-user-form-theme.mobile.png)

With System, a device that asks for dark mode gets Dark. The browser may
reload the page once when it detects that, so that the right look is used from
the start.

The dark look and the visual theme come in a later slice. Today Dark only
switches to the dark stylesheet that Community provides.

In the four pictures below Dark is selected and Community's dark stylesheet is
loaded, but the page looks the same as with Light: Community's dark bundle
barely changes these screens, and the visible dark look arrives with the visual
theme slice. That the switch itself works is proved by tests A57 and A61.

![The home menu with Dark chosen (looks like Light for now)](../assets/web_shell/13-home-dark.png)

![An application with Dark chosen (looks like Light for now)](../assets/web_shell/14-app-dark.png)

![The home menu with Dark chosen, on a phone (looks like Light for now)](../assets/web_shell/13-home-dark.mobile.png)

![An application with Dark chosen, on a phone (looks like Light for now)](../assets/web_shell/14-app-dark.mobile.png)

## Behaviour of views

- **View switcher.** The buttons that switch between kanban, list, pivot and
  so on are one group. The module marks which view is active and which one you
  came from, so that the highlight can slide between them once the visual theme
  slice styles it.

  ![The view switcher](../assets/web_shell/15-view-switcher-list.png)

  ![The view switcher on a phone](../assets/web_shell/19-view-switcher-mobile.mobile.png)

- **Kanban column headers.** In a grouped kanban view, the headers of the open
  columns stay at the top while you scroll down. Once the page has scrolled
  they gain a little more space below and a frosted backdrop, so the cards
  that pass underneath stay readable. Folded columns never get this look.

  ![Column headers at the top](../assets/web_shell/16-kanban-header-top.png)

  ![Column headers while scrolled](../assets/web_shell/17-kanban-header-sticky.png)

  ![Column headers at the top, on a phone](../assets/web_shell/16-kanban-header-top.mobile.png)

  ![Column headers while scrolled, on a phone](../assets/web_shell/17-kanban-header-sticky.mobile.png)

- **Pivot on a phone.** The pivot table shows no hover tooltips on small
  screens, so a tap never opens one.

  ![A pivot table on a phone](../assets/web_shell/18-pivot-mobile.mobile.png)
