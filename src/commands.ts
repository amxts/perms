/**
 * `perms ...` in the server console, over rcon, and in a player's console or
 * chat (`/perms`) for a player with `perms.edit` (`perms.editor` for the web
 * editor):
 *
 *     perms user <player|id> info
 *     perms user <player|id> group add|remove <group> [30d]
 *     perms user <player|id> permission set|unset <node> [true|false] [30d]
 *     perms group <group> info|create [weight]|delete
 *     perms group <group> permission set|unset <node> [true|false] [30d]
 *     perms group <group> parent add|remove <group>
 *     perms group <group> weight <n>
 *     perms groups | check <player|id> <node> | nodes [plugin] | editor [close] | reload | import [users.ini]
 */
import { Player, server } from "@amxts/core";
import type { Change } from "./model";
import { DEFAULT_GROUP, allGroups, answer, changeOf, declaredNodes, explain, groupNamed, groupsOf, normalId, sourcesOf, userWith } from "./model";
import { closeEditor, openEditor } from "./editor";
import { importUsers } from "./import";
import { has, idOf, userOf } from "./players";
import { commit, reload, writeEverything } from "./state";
import { durationSeconds, leftOf } from "./time";

const USAGE = "perms user|group|groups|check|nodes|editor|reload|import - see the module's README";

type Print = (line: string) => void;

function word(words: string[], at: number) {
	return at < words.length ? words[at] : "";
}

/** A player online by `#userid` or a part of his name, or an id as entries write it. */
function targetId(text: string) {
	if (text.startsWith("STEAM_") || text.startsWith("ip:") || text.startsWith("name:")) return normalId(text);

	const wanted = text.toLowerCase();
	const found = server.players.find(player => `#${player.userId}` == text || player.name.toLowerCase().includes(wanted));
	return found != null ? idOf(found) : "";
}

function onlineWith(id: string) {
	return server.players.find(player => idOf(player) == id) ?? null;
}

/** The moment `30d` from now ends, 0 for none; -1 for a word that is no duration. */
function untilOf(text: string) {
	if (text == "") return 0;

	const seconds = durationSeconds(text);
	return seconds < 0 ? -1 : Date.now() + seconds * 1000;
}

/** Commits changes and prints what was skipped once the store has them. */
function apply(changes: Change[], print: Print) {
	commit(changes).then((committed) => {
		committed.skipped.forEach(skip => print(`[perms] ${skip.reason}`));
		if (committed.done.length > 0) print("[perms] Done");
	});
}

export async function run(player: Player | null, words: string[], print: Print) {
	const what = word(words, 0);
	if (player != null && what == "editor" && !has(player, "perms.editor")) {
		print("[perms] You need perms.editor");
		return;
	}
	if (player != null && what != "editor" && !has(player, "perms.edit")) {
		print("[perms] You need perms.edit");
		return;
	}

	if (what == "user") userCommand(words, print);
	else if (what == "group") groupCommand(words, print);
	else if (what == "groups") listGroups(print);
	else if (what == "check") checkCommand(words, print);
	else if (what == "nodes") nodesCommand(word(words, 1), print);
	else if (what == "editor") print(word(words, 1) == "close" ? await closed() : await openEditor());
	else if (what == "reload") await reloaded(print);
	else if (what == "import") await importCommand(word(words, 1), print);
	else print(USAGE);
}

function listGroups(print: Print) {
	const groups = allGroups().slice().sort((a, b) => b.weight - a.weight);
	groups.forEach(group => print(`${group.name} (${group.weight})${group.inherits.length > 0 ? ` < ${group.inherits.join(", ")}` : ""}`));
}

async function reloaded(print: Print) {
	await reload();
	print("[perms] Reloaded");
}

async function closed() {
	await closeEditor();
	return "[perms] The editor is closed";
}

function userCommand(words: string[], print: Print) {
	const id = targetId(word(words, 1));
	if (id == "") return print(`[perms] No player "${word(words, 1)}" on the server; give his SteamID`);

	const action = word(words, 2);
	if (action == "info" || action == "") return userInfo(id, print);

	const change = changeOf("grant");
	change.user = id;
	const sub = word(words, 3);

	if (action == "group" && (sub == "add" || sub == "remove")) {
		change.op = sub == "add" ? "memberAdd" : "memberRemove";
		change.group = word(words, 4);
		change.until = untilOf(word(words, 5));
		if (change.until < 0) return print(`[perms] "${word(words, 5)}" is no duration: 30d, 12h, 90m`);
		return apply([change], print);
	}

	if (action == "permission" && (sub == "set" || sub == "unset")) return permissionCommand(change, words, print);
	print("[perms] perms user <player|id> info | group add|remove <group> [30d] | permission set|unset <node> [true|false] [30d]");
}

/** `permission set|unset <node> [true|false] [30d]`, words from the sub-command on. */
function permissionCommand(change: Change, words: string[], print: Print) {
	change.op = word(words, 3) == "set" ? "grant" : "revoke";
	change.node = word(words, 4);

	const valueWord = word(words, 5);
	const isValue = valueWord == "true" || valueWord == "false";
	change.value = valueWord != "false";
	change.until = untilOf(word(words, isValue ? 6 : 5));
	if (change.until < 0) return print(`[perms] "${word(words, isValue ? 6 : 5)}" is no duration: 30d, 12h, 90m`);
	return apply([change], print);
}

function userInfo(id: string, print: Print) {
	const now = Date.now();
	const user = userWith(id);
	const player = onlineWith(id);
	print(`[perms] ${id}${user != null && user.name != "" ? ` (${user.name})` : ""}${player != null ? " - online" : ""}`);
	print(`  groups: ${groupsOf(user, now).map<string>(group => group.name).join(", ")}`);
	if (user == null) return;

	user.groups.forEach(membership => print(`  group ${membership.group}${membership.until != 0 ? `, ${leftOf(membership.until, now)} left` : ""}${membership.server != "" ? ` on ${membership.server}` : ""}`));
	user.grants.forEach(grant => print(`  ${grant.value ? "" : "-"}${grant.node}${grant.until != 0 ? `, ${leftOf(grant.until, now)} left` : ""}`));
	if (player != null) print(`  flags: ${player.access.join(", ")}`);
}

function groupCommand(words: string[], print: Print) {
	const name = word(words, 1);
	const action = word(words, 2);
	const change = changeOf("groupCreate");
	change.group = name;
	if (name == "") return print("[perms] perms group <group> info|create|delete|permission|parent|weight");

	if (action == "create") {
		if (!/^[a-z0-9_-]+$/.test(name)) return print("[perms] A group's name is lower-case letters, digits, - and _");

		change.weight = Number(word(words, 3) == "" ? "0" : word(words, 3));
		return apply([change], print);
	}
	if (action == "delete") {
		change.op = "groupDelete";
		return apply([change], print);
	}
	if (action == "weight") {
		change.op = "groupWeight";
		change.weight = Number(word(words, 3));
		return apply([change], print);
	}
	if (action == "parent" && (word(words, 3) == "add" || word(words, 3) == "remove")) {
		change.op = word(words, 3) == "add" ? "parentAdd" : "parentRemove";
		change.parent = word(words, 4);
		return apply([change], print);
	}
	if (action == "permission" && (word(words, 3) == "set" || word(words, 3) == "unset")) return permissionCommand(change, words, print);
	return groupInfo(name, print);
}

function groupInfo(name: string, print: Print) {
	const group = groupNamed(name);
	if (group == null) return print(`[perms] There is no group "${name}"`);

	const now = Date.now();
	print(`[perms] ${group.name}: weight ${group.weight}${group.inherits.length > 0 ? `, inherits ${group.inherits.join(", ")}` : ""}`);
	group.grants.forEach(grant => print(`  ${grant.value ? "" : "-"}${grant.node}${grant.until != 0 ? `, ${leftOf(grant.until, now)} left` : ""}${grant.server != "" ? ` on ${grant.server}` : ""}`));
}

function checkCommand(words: string[], print: Print) {
	const id = targetId(word(words, 1));
	const node = word(words, 2);
	if (id == "" || node == "") return print("[perms] perms check <player|id> <node>");

	const player = onlineWith(id);
	const user = player != null ? userOf(player) : userWith(id);
	const now = Date.now();
	const yes = player != null ? has(player, node) : answer(sourcesOf(user, now), node);
	print(`[perms] ${id} ${node}: ${yes ? "yes" : "no"} - from ${explain(user, node, now)}`);
}

function nodesCommand(plugin: string, print: Print) {
	declaredNodes().filter(each => plugin == "" || each.node.startsWith(`${plugin}.`)).forEach(each => print(`${each.node}${each.byDefault ? " (everyone)" : ""} - ${each.description}`));
}

async function importCommand(file: string, print: Print) {
	const count = importUsers(file == "" ? "users.ini" : file);
	if (count < 0) {
		print(`[perms] There is no ${file == "" ? "users.ini" : file} in the configs folder`);
		return;
	}

	await writeEverything();
	print(`[perms] Imported ${count} lines; ${DEFAULT_GROUP} and the other groups are as they were`);
}
