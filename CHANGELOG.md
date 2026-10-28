# Changelog

## v0.1.1

> For cores of the 0.3 line from 0.3.2.

A server that runs the editor's store of its own gets its own link. With `PERMS_EDITOR_URL` in `.env`,
`perms editor` prints the store's address, and the store sends the browser on to the editor page
with that store:

```
PERMS_EDITOR_URL=https://perms.myserver.com
```
```
[perms] Open the editor (an hour): https://perms.myserver.com/editor#k3x9q2mw7a
```

### 👉 Changelog

[compare changes](https://github.com/amxts/perms/compare/v0.1.0...v0.1.1)

### 🚀 Enhancements

- **editor:** A store of your own gives its own link ([3f384fc](https://github.com/amxts/perms/commit/3f384fc))

### ❤️ Contributors

- Ernest Manukyan ([@kukson777](https://github.com/kukson777))

## v0.1.0

> The first release of Perms, for cores of the 0.3 line from 0.3.2.

Perms is a permissions module for amxts servers: it replaces AMX Mod X's `admin.amxx` with
permission nodes, groups and a web editor, the way LuckPerms does for Minecraft servers.
Pawn plugins keep working unchanged, because the module gives every player AMX Mod X's flags
from his `amxx.*` nodes.

### 👀 Highlights

#### 🔑 Nodes, groups, weights

A permission is a node, `kz.admin.kick`. `kz.admin.*` gives everything under it, and
`-kz.admin.wipe` takes one away. Groups inherit from each other and have a weight; every player
is in `default`; and a player's own grants come before his groups. A grant or a group can last
`30d` and then go by itself, and on a shared database it can count on one server only.

```ts
perms.declare({
	"myplugin.kick": { description: "Kick players" },
	"myplugin.help": { description: "Use /help", everyone: true },
});

server.addCommand<KickArgs>("/kick <target>", ({ player, target }) => {
	if (!perms.has(player, "myplugin.kick")) return player.print("You may not kick");

	target.kick("Kicked");
});

perms.addGroup(player, "vip", { for: 30 * 86400 });
perms.addEventListener("change", ({ player }) => refreshTag(player));
```

#### 🌐 A web editor

`perms editor` in the server console prints a link. The page shows every plugin's permissions
with their descriptions, a column per group, and the groups and players. Saving sends the changes
back, and the server applies them within seconds, without a restart. Passwords and the database's
address never leave the server.

#### 🗄️ A file or MySQL

The permissions live in `perms.yaml`, which you can edit by hand. Or, with `PERMS_DB` in `.env`,
they live in MySQL, shared by several servers, and a change on one reaches the others within five
seconds.

#### 🧰 In place of admin.amxx

`perms import users.ini` turns AMX Mod X's admins into entries, with their flags as `amxx.*`
permissions. `access`, `cmd_access`, `amx_mode`, `amx_password_field`, `amx_default_access` and
`amx_reloadadmins` keep working. Pawn plugins can check nodes themselves through `perms.inc`:
`perms_has`, the groups, and the `perms_changed` forward.

Permissions change from the server console and in the editor. In the game, a player with
`perms.view` can look them up.

### 👉 Changelog

[commits](https://github.com/amxts/perms/commits/v0.1.0)

### 🚀 Enhancements

- Perms, permissions and groups for amxts servers ([87bd13f](https://github.com/amxts/perms/commit/87bd13f))
- Permissions change from the server console and the editor only ([59bdf72](https://github.com/amxts/perms/commit/59bdf72))
- The editor's store at perms-store.brokukaschannel.workers.dev ([69dd613](https://github.com/amxts/perms/commit/69dd613))
- **editor:** The page is amxts.github.io/modules/perms/editor ([9fba515](https://github.com/amxts/perms/commit/9fba515))

### 🩹 Fixes

- SteamIDs from the console, and say which file is read ([5da51ef](https://github.com/amxts/perms/commit/5da51ef))
- **editor:** Bots are not players ([cc0b0e3](https://github.com/amxts/perms/commit/cc0b0e3))

### ❤️ Contributors

- Ernest Manukyan ([@kukson777](https://github.com/kukson777))
