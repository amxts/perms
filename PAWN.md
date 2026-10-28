# Perms for Pawn plugins

[English](PAWN.md) | [Русский](PAWN.ru.md)

A Pawn plugin needs nothing from Perms to keep working: the module gives each
player AMX Mod X's flags from his `amxx.*` nodes, so `get_user_flags`,
`access`, `cmd_access` and `register_concmd` with flags behave as they do with
`admin.amxx`.

To check permission nodes of its own, a plugin writes `#include <perms>`; the
package ships `include/perms.inc`:

```pawn
#include <amxmodx>
#include <perms>

public plugin_init()
{
	register_plugin("My plugin", "1.0", "you");
	perms_declare("myplugin.trail", "A trail behind the player");
	register_clcmd("say /trail", "CmdTrail");
}

public CmdTrail(id)
{
	if (!perms_has(id, "myplugin.trail"))
	{
		client_print(id, print_chat, "You have no trail");
		return PLUGIN_HANDLED;
	}

	new group[32];
	perms_get_group(id, group, charsmax(group));
	client_print(id, print_chat, "Your trail, %s", group);
	return PLUGIN_HANDLED;
}

public perms_changed(id)
{
	// the player's permissions changed: he joined, a command or the editor changed them
}
```

| Native | What it does |
| --- | --- |
| `bool:perms_has(id, const node[])` | whether the player has the node |
| `perms_declare(const node[], const description[], bool:byDefault = false)` | declares a node for the web editor; `byDefault` gives it to every player |
| `perms_get_group(id, out[], len)` | the player's primary group |
| `bool:perms_in_group(id, const group[])` | whether the player is in a group |
| `perms_add_group(id, const group[], seconds = 0)` | puts him into a group, for `seconds` or for good |
| `perms_remove_group(id, const group[])` | takes him out of it |

`public perms_changed(id)` is called when a player's permissions change.