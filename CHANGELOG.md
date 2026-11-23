# Changelog

## v0.2.4

> For amxts 0.3.7 and later.

### 👀 Highlights

#### 🔀 Permissions per mode

A server that switches modes sets the one it plays with the `perms_context` cvar, in each mode's config:

```ini
perms_context kz
```

A group or a permission given with `server: kz` counts only while the mode is `kz`. One without `server:` counts in every mode and on every server. When the cvar changes, the players' permissions and AMX Mod X flags are worked out again at once. The cvar is never written to `perms.yaml`.

The web editor offers every mode an entry names. To offer the others before any entry names them, list them in `addons/amxts/.env`:

```ini
PERMS_CONTEXTS=kz,classic,nhnse
```

### 🩹 Important fixes

- `perms import` replaced the entry of an admin perms already had, and his name, groups and other permissions were lost. The imported flags are added to his entry, and the rest of it stays ([9558680](https://github.com/amxts/perms/commit/9558680)).

### 👉 Changelog

[compare changes](https://github.com/amxts/perms/compare/v0.2.3...v0.2.4)

### 🚀 Enhancements

- `perms_context`, the mode entries count in ([4c15c2b](https://github.com/amxts/perms/commit/4c15c2b))
- `PERMS_CONTEXTS`, the modes the editor offers ([4ed85d6](https://github.com/amxts/perms/commit/4ed85d6))

### 🩹 Fixes

- **import:** Keep a known player's name and groups ([9558680](https://github.com/amxts/perms/commit/9558680))

### ❤️ Contributors

- Ernest Manukyan ([@kukson777](https://github.com/kukson777))

## v0.2.3

> For amxts 0.3.7 and later.

### 🩹 Important fixes

- With admin.amxx on the server, an admin from `users.ini` could lose his flags: perms wrote its own over admin.amxx's, and he was left with `amx_default_access`. While admin.amxx runs, perms leaves the flags to it ([72592ae](https://github.com/amxts/perms/commit/72592ae)).
- perms took `amx_reloadadmins` away from admin.amxx, so the command reloaded nothing of admin.amxx's. While admin.amxx runs, the command is admin.amxx's again; `perms reload` reloads perms. Restart the server once after updating: until then the old perms still holds the command ([72592ae](https://github.com/amxts/perms/commit/72592ae)).

### 👉 Changelog

[compare changes](https://github.com/amxts/perms/compare/v0.2.2...v0.2.3)

### 🩹 Fixes

- Leave `admin.amxx` its admins and `amx_reloadadmins` ([72592ae](https://github.com/amxts/perms/commit/72592ae))

### 📖 Documentation

- The `v0.2.2` changelog's npm note, shorter ([57ee91d](https://github.com/amxts/perms/commit/57ee91d))

### ❤️ Contributors

- Ernest Manukyan ([@kukson777](https://github.com/kukson777))

## v0.2.2

> For amxts 0.3.5 and later.

0.2.1 was published broken: `npm install` failed on it. 0.2.2 is the same code, published properly.

### 👉 Changelog

[compare changes](https://github.com/amxts/perms/compare/v0.2.1...v0.2.2)

### ❤️ Contributors

- Ernest Manukyan ([@kukson777](https://github.com/kukson777))

## v0.2.1

> For the 0.3 line of the core.

### 🩹 Important fixes

- A hot reload of a plugin that declares permissions printed "X is declared twice" for each of them, and a declaration that changed in the reload was not taken. A plugin's declarations now go with it when it stops ([6d3f491](https://github.com/amxts/perms/commit/6d3f491)).
- A plugin that asked for a permission while perms was being hot-reloaded, before perms had read its file, stopped perms with "Unexpected 'null'". The `default` group now exists from the start, so the answer is the default group's until the file is read ([6d9fd57](https://github.com/amxts/perms/commit/6d9fd57)).

### 👉 Changelog

[compare changes](https://github.com/amxts/perms/compare/v0.2.0...v0.2.1)

### 🩹 Fixes

- Forget a stopped plugin's declared nodes ([6d3f491](https://github.com/amxts/perms/commit/6d3f491))
- Guard against null user fields during a reload ([a70a008](https://github.com/amxts/perms/commit/a70a008))
- Default group exists before the config is read ([6d9fd57](https://github.com/amxts/perms/commit/6d9fd57))

### ❤️ Contributors

- Ernest Manukyan ([@kukson777](https://github.com/kukson777))

## v0.2.0

> For the 0.3 cores.

#### 🔑 A password on any entry

A SteamID can be faked on a server that lets players in without Steam, so I let any entry carry a password - a SteamID's and an IP's too, not only a name's. The player gives it with `setinfo _pw`; with a wrong one he plays as `default`. It is set and taken away from the server console, and the file keeps only its SHA-256:

```sh
perms user STEAM_0:1:12345 password secret
perms user STEAM_0:1:12345 password          # no password any more
```

`perms import` keeps `users.ini`'s passwords for SteamID and IP entries too.

The editor's page sees which entries have a password (`password: true`); the password itself never leaves the server.

### ⚠️ Breaking changes

- `perms import` keeps the password of a SteamID or IP entry of `users.ini` that has no `e` flag, as AMX Mod X does: such a player gives it with `setinfo _pw`, or plays as `default`. Before, the import dropped it and let him in by his SteamID alone.

### 👉 Changelog

[compare changes](https://github.com/amxts/perms/compare/v0.1.1...v0.2.0)

### 🚀 Enhancements

- A password on any entry, a SteamID's too ([9706c90](https://github.com/amxts/perms/commit/9706c90))
- **editor:** The page sees whether an entry has a password ([70be0bb](https://github.com/amxts/perms/commit/70be0bb))

### ❤️ Contributors

- Ernest Manukyan ([@kukson777](https://github.com/kukson777))

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
