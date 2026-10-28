# Perms

**English** | [Русский](README.ru.md)

Permissions and groups for an amxts server, in place of AMX Mod X's `admin.amxx`:
permission nodes with wildcards and negation, groups with inheritance and
weights, temporary grants, a file or MySQL, AMX Mod X's admin flags for Pawn
plugins - and a web editor the server opens with one command.

```ts
perms.declare({
	"myplugin.kick": { description: "Kick players" },
	"myplugin.help": { description: "Use /help", everyone: true },
});

server.addCommand<KickArgs>("/kick <target>", ({ player, target }) => {
	if (!perms.has(player, "myplugin.kick")) return player.print("You may not kick");

	target.kick("Kicked");
});
```

## Install

```sh
npx amxts module add perms
```

`perms` is a global in your plugins, as the core's API is - no import line.

## Permissions

A permission is a **node**: dotted words, the plugin's name first -
`myplugin.kick`, `shop.discount`, `kz.admin.wipe`.

- `kz.admin.*` gives every node under `kz.admin`; `*` gives everything.
- `-kz.admin.wipe` takes a node away: a negation.
- The most specific grant wins: `kz.admin.*` with `-kz.admin.wipe` gives all of
  `kz.admin` but `wipe`. Of a node granted and negated in one place, the
  negation wins.
- A node nothing grants is what its plugin declared: `everyone: true` gives it
  to every player, otherwise nobody has it.

## Groups

A group has its permissions, the groups it `inherits`, and a `weight`.
Every player is in `default`, without being written in.

A player's answer for a node comes from the first of these that names it:

1. his own permissions;
2. his groups, the highest weight first - each group before what it inherits;
3. `default`.

His **primary group** is his group of the highest weight - `perms.groupOf(player)`,
for a chat tag or a scoreboard.

A group or a permission may be **temporary**: it stops counting the moment it
ends, and the file drops it on its next save.

## Players

A player is found by his SteamID, then by his IP, then by his name with a
password - as `users.ini` finds him:

| Entry | Who it is |
| --- | --- |
| `STEAM_0:1:12345` | the player with that SteamID |
| `ip:1.2.3.4` | a player from that address - for a game without Steam |
| `name:Bob` | a player named `Bob` whose `setinfo _pw` is the entry's password |

## The file

`perms.yaml` (or `perms.json`) in the configs folder, `addons/amxmodx/configs/` -
or `configs/<baseDir>/` when the project sets config-core's `baseDir`, as other
configs are. The commands and the web editor write it, and it is edited by hand
too; the server console says at start which file it read:

```yaml
groups:
  default:
    permissions: [kz.top]
  vip:
    weight: 10
    permissions: [amxx.reservation, shop.discount]
  admin:
    weight: 50
    inherits: [vip]
    permissions: [amxx.kick, amxx.ban, "kz.admin.*", "-kz.admin.wipe"]
users:
  - id: "STEAM_0:1:12345"
    name: Bob
    groups: [admin]
    permissions: [kz.admin.wipe]
  - id: "STEAM_0:0:777"
    groups:
      - { group: vip, until: 2026-12-01T00:00:00Z }
```

A permission or a group with an end, or for one server, is an object:
`{ node: kz.vip, until: 2026-12-01T00:00:00Z, server: kz1 }`. Times are UTC.

::: warning
A file with an error is said in the server console with its line, and the
permissions read before it stay - a typo never leaves the server without admins.
:::

## MySQL

Several servers share one set of permissions in MySQL. Give the database's
address in the server's `addons/amxts/.env`:

```ini
PERMS_DB=mysql://perms:secret@127.0.0.1:3306/perms
PERMS_SERVER=kz1
```

The module makes its tables (`perms_groups`, `perms_grants`, `perms_users`,
`perms_members`, `perms_revision`) on its first start. A change on one server
reaches the others within five seconds.

`PERMS_SERVER` names this server: a group or a permission given with
`server: kz1` counts on it alone.

## In code

```ts
perms.has(player, "myplugin.kick");                 // true or false
perms.groupOf(player);                              // "admin"
perms.groupsOf(player);                             // ["admin", "default"]
perms.addGroup(player, "vip", { for: 30 * 86400 }); // seconds; permanent without for
perms.removeGroup(player, "vip");
perms.set(player, "myplugin.trail", true, { for: 3600 });
perms.unset(player, "myplugin.trail");

perms.addEventListener("change", ({ player }) => {
	if (perms.has(player, "myplugin.trail")) startTrail(player);
});
```

`"change"` comes when a player's permissions change: he joins, a command or
the editor changes them, or one ends.

## Commands

In the server console and over rcon, and in a player's console or chat
(`/perms ...`) for a player with `perms.edit`:

```
perms user <player|id> info
perms user <player|id> group add <group> [30d]
perms user <player|id> group remove <group>
perms user <player|id> permission set <node> [true|false] [30d]
perms user <player|id> permission unset <node>
perms group <group> create [weight]
perms group <group> delete | info
perms group <group> permission set <node> [true|false] [30d]
perms group <group> permission unset <node>
perms group <group> parent add|remove <group>
perms group <group> weight <n>
perms groups
perms check <player|id> <node>
perms nodes [plugin]
perms editor [close]
perms reload
perms import [users.ini]
```

A player is `#userid`, a part of his name, or an entry's id
(`STEAM_0:1:12345`). A duration is `45s`, `90m`, `12h`, `30d` or `2w`.

## The web editor

```
perms editor
[perms] Open the editor (an hour): https://amxts.github.io/perms#k3x9q2mw7a
```

The link opens the server's permissions in the browser: every plugin's nodes
with their descriptions, a column per group, the groups, the players. **Save**
sends the changes back; the server applies them within seconds, without a
restart, and the page says what it did.

- The command needs `perms.editor` in a player's chat; the server console can always run it.
- Whoever has the link can edit until the session ends: after an hour, or
  `perms editor close`. Share it like a password.
- What goes to the editor: groups, permissions, SteamIDs and names. Passwords and
  the database's address never leave the server.
- The editor keeps a session for an hour on amxts's service. To keep them on
  your own, run the store from this package's `store/` folder (a Cloudflare
  Worker) and give its address as `PERMS_EDITOR_URL` in `.env`.

## In place of admin.amxx

1. `npx amxts module add perms`, build and deploy.
2. Comment out `admin.amxx` (or `admin_sql.amxx`) in `plugins.ini`. While one
   of them runs, the module leaves the players' flags to it and says so in the
   console.
3. In the server console: `perms import users.ini`. Each admin becomes an entry
   with his flags as `amxx.*` permissions of his own. Check one with
   `perms user <name> info`.

`users.ini` is not read again; it stays for going back.

Pawn plugins work unchanged: the module gives each player AMX Mod X's flags from
his `amxx.*` nodes, so `get_user_flags`, `access`, `cmd_access`,
`is_user_admin` and `cmdaccess.ini` see each player's rights. A player with no `amxx.*`
node gets `amx_default_access` (`z`). The module also keeps `amx_mode`,
`amx_password_field`, `amx_default_access` and `amx_reloadadmins`, which server
configs and plugins use.

| Node | Flag |
| --- | --- |
| `amxx.immunity` | `a` |
| `amxx.reservation` | `b` |
| `amxx.kick` | `c` |
| `amxx.ban` | `d` |
| `amxx.slay` | `e` |
| `amxx.map` | `f` |
| `amxx.cvar` | `g` |
| `amxx.cfg` | `h` |
| `amxx.chat` | `i` |
| `amxx.vote` | `j` |
| `amxx.password` | `k` |
| `amxx.rcon` | `l` |
| `amxx.levelA` ... `amxx.levelH` | `m` ... `t` |
| `amxx.menu` | `u` |
| `amxx.banTemp` | `v` |
| `amxx.admin` | `y` |

::: warning amx_mode
`amx_mode 2` kicks a player without an entry, as `admin.amxx` does: a private
server. `amx_mode 0` gives nobody anything.
:::

Pawn plugins can check nodes themselves: [PAWN.md](PAWN.md).

## Options

```ts
export default defineConfig({
	modules: ["@amxts/perms"],
	perms: {
		file: "perms",   // configs/perms.yaml
		editor: "",      // the editor's store; PERMS_EDITOR_URL overrides it
	},
});
```

## License

MIT
