/**
 * The players on the server: who each one is in the permissions, what he
 * may do, and AMX Mod X's flags written from his `amxx.*` nodes, so Pawn
 * plugins' `access` and `cmd_access` keep working.
 */
import { Cvar, Player, clearTimeout, server, setTimeout } from "@amxts/core";
import { Hash_Sha256 } from "@amxts/core/constants";
import { admins_flush, admins_push, hash_string, read_flags, remove_user_flags, set_user_flags } from "@amxts/core/natives";
import type { User } from "./model";
import { allUsers, answer, nextExpiry, primaryGroup, sourcesOf, userWith } from "./model";

/** AMX Mod X's admin flags: the `amxx.<name>` node and its letter in `users.ini`. */
export interface AdminFlag {
	name: string;
	letter: string;
}

export const FLAGS: AdminFlag[] = [
	{ name: "immunity", letter: "a" },
	{ name: "reservation", letter: "b" },
	{ name: "kick", letter: "c" },
	{ name: "ban", letter: "d" },
	{ name: "slay", letter: "e" },
	{ name: "map", letter: "f" },
	{ name: "cvar", letter: "g" },
	{ name: "cfg", letter: "h" },
	{ name: "chat", letter: "i" },
	{ name: "vote", letter: "j" },
	{ name: "password", letter: "k" },
	{ name: "rcon", letter: "l" },
	{ name: "levelA", letter: "m" },
	{ name: "levelB", letter: "n" },
	{ name: "levelC", letter: "o" },
	{ name: "levelD", letter: "p" },
	{ name: "levelE", letter: "q" },
	{ name: "levelF", letter: "r" },
	{ name: "levelG", letter: "s" },
	{ name: "levelH", letter: "t" },
	{ name: "menu", letter: "u" },
	{ name: "banTemp", letter: "v" },
	{ name: "admin", letter: "y" },
];

// The cvars admin.amxx registers, which server configs set.
const mode = new Cvar("amx_mode", "1");
export const passwordField = new Cvar("amx_password_field", "_pw");
const defaultAccess = new Cvar("amx_default_access", "z");

interface PlayerPerms {
	user: User | null;
	sources: Map<string, boolean>[];
	/** What the sources answered, for "change": the flags and the group; the nodes are asked fresh. */
	signature: string;
}

const online = new Map<number, PlayerPerms>();
const listeners: ((player: Player) => void)[] = [];
let writesFlags = true;
let expiry = 0;

export function onChange(listener: (player: Player) => void) {
	listeners.push(listener);
}

/** Whether the module writes the players' flags; not while admin.amxx does. */
export function setWritesFlags(on: boolean) {
	writesFlags = on;
}

export function sha256(text: string) {
	return `sha256:${hash_string(text, Hash_Sha256)}`;
}

/**
 * The player's entry: by SteamID, then IP, then name - and, when the entry has
 * a password, only with that password in his info. With `amx_mode 2`, as
 * admin.amxx does, a player without an entry - or with a wrong password - is
 * kicked; otherwise he plays with the default group's rights.
 */
function identify(player: Player) {
	const entry = entryOf(player);
	if (entry != null || mode.number != 2) return entry;

	player.kick("You have no entry on this server");
	return null;
}

function entryOf(player: Player) {
	const bySteam = player.steamId.startsWith("STEAM_") && !player.steamId.includes("LAN") ? userWith(player.steamId) : null;
	const entry = bySteam ?? userWith(`ip:${player.ip}`) ?? userWith(`name:${player.name}`);
	if (entry == null || entry.password == "" || sha256(player.info.get(passwordField.value)) == entry.password) return entry;

	player.print(`[perms] Wrong password for your entry: set it with setinfo ${passwordField.value} <password>`, "console");
	return null;
}

/** The letters of the player's `amxx.*` nodes; `amx_default_access` when he has none. */
function lettersOf(sources: Map<string, boolean>[]) {
	const letters = FLAGS.filter(flag => answer(sources, `amxx.${flag.name}`)).map<string>(flag => flag.letter).join("");
	return letters != "" ? letters : defaultAccess.value;
}

/** Works out a player's permissions again, writes his flags, and tells the listeners when anything changed. */
export function refresh(player: Player) {
	if (!player.isConnected) return;

	const now = Date.now();
	const user = mode.number == 0 ? null : identify(player);
	if (!player.isConnected) return;

	const sources = sourcesOf(user, now);
	const letters = lettersOf(sources);
	const signature = `${letters}|${primaryGroup(user, now)}|${JSON.stringify(sources.map<string[]>(source => sourceKeys(source)))}`;
	const before = online.get(player.id);
	online.set(player.id, { user, sources, signature });

	if (writesFlags) {
		remove_user_flags(player.id);
		set_user_flags(player.id, read_flags(letters));
	}
	if (before == null || before.signature != signature) listeners.forEach(listener => listener(player));
}

function sourceKeys(source: Map<string, boolean>) {
	const keys: string[] = [];
	source.forEach((value, node) => keys.push(value ? node : `-${node}`));
	return keys;
}

export function refreshAll() {
	server.players.forEach(refresh);
	fillAdminCache();
	scheduleExpiry();
}

export function forget(id: number) {
	online.delete(id);
}

export function has(player: Player, node: string) {
	const state = online.get(player.id);
	return answer(state != null ? state.sources : sourcesOf(null, Date.now()), node);
}

export function userOf(player: Player) {
	return online.get(player.id)?.user ?? null;
}

/** The player's entry id, or the id his entry would get: his SteamID, or his IP when he has none. */
export function idOf(player: Player) {
	const user = userOf(player);
	if (user != null) return user.id;
	return player.steamId.startsWith("STEAM_") && !player.steamId.includes("LAN") ? player.steamId : `ip:${player.ip}`;
}

/** AMX Mod X's own list of admins, as admin.amxx fills it, for plugins that read it with admins_lookup. */
function fillAdminCache() {
	if (!writesFlags) return;

	admins_flush();
	const now = Date.now();
	for (const user of allUsers()) {
		const letters = lettersOf(sourcesOf(user, now));
		const kind = user.id.startsWith("ip:") ? "d" : user.id.startsWith("name:") ? "" : "c";
		const auth = user.id.startsWith("STEAM_") ? user.id : user.id.substring(user.id.indexOf(":") + 1);
		admins_push(auth, user.password, read_flags(letters), read_flags(user.password == "" ? `${kind}e` : kind));
	}
}

/** Wakes up when the nearest grant of an online player or a group ends, and works it out then. */
function scheduleExpiry() {
	if (expiry != 0) clearTimeout(expiry);

	const users: User[] = [];
	online.forEach((state) => {
		if (state.user != null) users.push(state.user);
	});
	const next = nextExpiry(users, Date.now());
	expiry = next == 0 ? 0 : setTimeout(() => refreshAll(), Math.min(next - Date.now() + 50, 24 * 3600 * 1000));
}
