# Perms для Pawn-плагинов

[English](PAWN.md) | [Русский](PAWN.ru.md)

Pawn-плагину ничего не нужно от Perms, чтобы работать: модуль ставит каждому
игроку флаги AMX Mod X из его узлов `amxx.*`, поэтому `get_user_flags`,
`access`, `cmd_access` и `register_concmd` с флагами ведут себя так же, как с
`admin.amxx`.

Чтобы проверять свои узлы прав, плагин пишет `#include <perms>`; пакет
поставляет `include/perms.inc`:

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
	// права игрока изменились: он зашёл, их изменила команда или редактор
}
```

| Натив | Что делает |
| --- | --- |
| `bool:perms_has(id, const node[])` | есть ли у игрока узел |
| `perms_declare(const node[], const description[], bool:byDefault = false)` | объявляет узел для веб-редактора; `byDefault` даёт его всем игрокам |
| `perms_get_group(id, out[], len)` | основная группа игрока |
| `bool:perms_in_group(id, const group[])` | состоит ли игрок в группе |
| `perms_add_group(id, const group[], seconds = 0)` | добавляет его в группу на `seconds` секунд или навсегда |
| `perms_remove_group(id, const group[])` | убирает его из группы |

`public perms_changed(id)` вызывается, когда права игрока меняются.