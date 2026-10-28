# Perms

[English](README.md) | **Русский**

Права и группы для сервера на amxts вместо `admin.amxx` из AMX Mod X: узлы прав
с масками и запретом, группы с наследованием и весом, временные права, файл или
MySQL, флаги AMX Mod X для Pawn-плагинов - и веб-редактор, который сервер
открывает одной командой.

```ts
perms.declare({
	"myplugin.kick": { description: "Кикать игроков" },
	"myplugin.help": { description: "Пользоваться /help", everyone: true },
});

server.addCommand<KickArgs>("/kick <target>", ({ player, target }) => {
	if (!perms.has(player, "myplugin.kick")) return player.print("Тебе нельзя кикать");

	target.kick("Kicked");
});
```

## Установка

```sh
npx amxts module add perms
```

`perms` в плагинах - глобальное имя, как API ядра: строка импорта не нужна.

## Права

Право - это **узел**: слова через точку, первым - имя плагина: `myplugin.kick`,
`shop.discount`, `kz.admin.wipe`.

- `kz.admin.*` даёт все узлы под `kz.admin`; `*` даёт всё.
- `-kz.admin.wipe` отнимает узел: запрет.
- Побеждает самое точное право: `kz.admin.*` вместе с `-kz.admin.wipe` даёт весь
  `kz.admin`, кроме `wipe`. Если в одном месте узел и выдан, и запрещён,
  побеждает запрет.
- Узел, который никто не выдал, - такой, каким его объявил плагин:
  `everyone: true` даёт его всем игрокам, иначе он ни у кого.

## Группы

У группы есть её права, группы, которые она наследует (`inherits`), и вес
(`weight`). Каждый игрок состоит в `default`, даже если нигде не записан.

Ответ про узел для игрока берётся из первого, что этот узел называет:

1. его личные права;
2. его группы, начиная с самой тяжёлой, - каждая раньше того, что она наследует;
3. `default`.

**Основная группа** игрока - его группа с самым большим весом:
`perms.groupOf(player)`, для тега в чате или таблицы счёта.

Группа или право могут быть **временными**: они перестают действовать в момент
окончания, а файл убирает их при следующем сохранении.

## Игроки

Игрок находится по SteamID, затем по IP, затем по нику с паролем - так же, как
его находит `users.ini`:

| Запись | Кто это |
| --- | --- |
| `STEAM_0:1:12345` | игрок с этим SteamID |
| `ip:1.2.3.4` | игрок с этого адреса - для игры без Steam |
| `name:Bob` | игрок с ником `Bob`, у которого `setinfo _pw` - пароль записи |

## Файл

`perms.yaml` (или `perms.json`) в папке конфигов, `addons/amxmodx/configs/` -
или `configs/<baseDir>/`, если проект задал `baseDir` у config-core, как и для
остальных конфигов. Его пишут команды и веб-редактор, его можно править руками;
какой файл прочитан, сервер пишет в консоль при старте:

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

Право или группа со сроком или для одного сервера записываются объектом:
`{ node: kz.vip, until: 2026-12-01T00:00:00Z, server: kz1 }`. Время - UTC.

::: warning
Ошибку в файле сервер называет в консоли со строкой, а права, прочитанные до
неё, остаются: из-за опечатки сервер не останется без админов.
:::

## MySQL

Несколько серверов делят один набор прав в MySQL. Адрес базы пишется в
`addons/amxts/.env` сервера:

```ini
PERMS_DB=mysql://perms:secret@127.0.0.1:3306/perms
PERMS_SERVER=kz1
```

Модуль создаёт свои таблицы (`perms_groups`, `perms_grants`, `perms_users`,
`perms_members`, `perms_revision`) при первом запуске. Изменение на одном
сервере доходит до остальных за пять секунд.

`PERMS_SERVER` - имя этого сервера: группа или право, выданные с `server: kz1`,
действуют только на нём.

## В коде

```ts
perms.has(player, "myplugin.kick");                 // true или false
perms.groupOf(player);                              // "admin"
perms.groupsOf(player);                             // ["admin", "default"]
perms.addGroup(player, "vip", { for: 30 * 86400 }); // секунды; без for - навсегда
perms.removeGroup(player, "vip");
perms.set(player, "myplugin.trail", true, { for: 3600 });
perms.unset(player, "myplugin.trail");

perms.addEventListener("change", ({ player }) => {
	if (perms.has(player, "myplugin.trail")) startTrail(player);
});
```

`"change"` приходит, когда права игрока меняются: он зашёл, их изменила команда
или редактор, или какое-то право закончилось.

## Команды

В консоли сервера и через rcon:

```
perms user <игрок|id> info
perms user <игрок|id> group add <группа> [30d]
perms user <игрок|id> group remove <группа>
perms user <игрок|id> permission set <узел> [true|false] [30d]
perms user <игрок|id> permission unset <узел>
perms group <группа> create [вес]
perms group <группа> delete | info
perms group <группа> permission set <узел> [true|false] [30d]
perms group <группа> permission unset <узел>
perms group <группа> parent add|remove <группа>
perms group <группа> weight <n>
perms groups
perms check <игрок|id> <узел>
perms nodes [плагин]
perms editor [close]
perms reload
perms import [users.ini]
```

Игрок - это `#userid`, часть ника или id записи (`STEAM_0:1:12345`). Срок -
`45s`, `90m`, `12h`, `30d` или `2w`.

В игре игрок с правом `perms.view` выполняет команды, которые только показывают, -
`groups`, `check`, `nodes`, `user ... info` и `group ... info` - в своей
консоли или в чате (`/perms groups`); ответ приходит в его консоль. Права
меняются только из консоли сервера и в веб-редакторе.

## Веб-редактор

```
perms editor
[perms] Open the editor (an hour): https://amxts.github.io/modules/perms/editor#k3x9q2mw7a
```

Ссылка открывает права сервера в браузере: узлы каждого плагина с описаниями,
колонка на каждую группу, группы, игроки. **Сохранить** отправляет изменения
обратно; сервер применяет их за несколько секунд, без рестарта, а страница
показывает, что он сделал.

- Его открывает консоль сервера; из игры его не открыть.
- Редактировать может любой, у кого есть ссылка, пока сессия жива: час или до
  `perms editor close`. Храните её как пароль.
- В редактор уходят группы, права, SteamID и ники. Пароли и адрес базы никогда
  не покидают сервер.
- Сессия хранится час на сервисе amxts. Чтобы хранить их у себя, запустите
  хранилище из папки `store/` этого пакета (Cloudflare Worker) и укажите его
  адрес в `PERMS_EDITOR_URL` в `.env`.

## Вместо admin.amxx

1. `npx amxts module add perms`, сборка и выкладка.
2. Закомментируйте `admin.amxx` (или `admin_sql.amxx`) в `plugins.ini`. Пока
   один из них работает, модуль оставляет флаги игроков ему и пишет об этом в
   консоль.
3. В консоли сервера: `perms import users.ini`. Каждый админ становится записью,
   а его флаги - его личными правами `amxx.*`. Проверьте любого командой
   `perms user <ник> info`.

`users.ini` больше не читается; он остаётся, чтобы можно было вернуться.

Pawn-плагины работают без изменений: модуль ставит каждому игроку флаги AMX Mod X
из его узлов `amxx.*`, поэтому `get_user_flags`, `access`, `cmd_access`,
`is_user_admin` и `cmdaccess.ini` видят права каждого игрока.
Игрок без узлов `amxx.*` получает `amx_default_access` (`z`). Модуль держит и
`amx_mode`, `amx_password_field`, `amx_default_access` и `amx_reloadadmins`,
которыми пользуются конфиги сервера и плагины.

| Узел | Флаг |
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
`amx_mode 2` кикает игрока без записи, как `admin.amxx`: закрытый сервер.
`amx_mode 0` никому ничего не даёт.
:::

Pawn-плагины могут проверять узлы сами: [PAWN.ru.md](PAWN.ru.md).

## Настройки

```ts
export default defineConfig({
	modules: ["@amxts/perms"],
	perms: {
		file: "perms",   // configs/perms.yaml
		editor: "",      // хранилище редактора; PERMS_EDITOR_URL важнее
	},
});
```

## Лицензия

MIT
