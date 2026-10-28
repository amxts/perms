/**
 * Perms - permissions and groups for the server, in place of AMX Mod X's
 * admin.amxx: permission nodes with wildcards and negation, groups with
 * inheritance and weights, temporary grants, a file or MySQL, AMX Mod X's
 * flags for Pawn plugins, and a web editor. How to use it: README.md.
 */
import { Player } from "@amxts/core";
import { callingPlugin, onPluginStop } from "@amxts/core/kit";
import type { GrantOptions, PermissionInfo, PermsChangeEvent, PermsOptions } from "./types";
import { changeOf, declare as declareNode, primaryGroup, groupsOf as groupsOfUser } from "./model";
import * as players from "./players";
import { commit } from "./state";
import { start } from "./server";

export * from "./types";

export default defineModule<PermsOptions>({
	meta: { name: "perms", configKey: "perms" },
	requires: ["@amxts/config-core"],
	imports: [{ from: "@amxts/perms", as: "perms" }],
	defaults: { file: "perms", editor: "" },
	setup(options) {
		start(options);
	},
});

/**
 * Declares the plugin's permissions, so the web editor lists them with their
 * descriptions and `perms nodes` prints them:
 *
 *     perms.declare({
 *         "myplugin.kick": { description: "Kick players" },
 *         "myplugin.help": { description: "Use /help", everyone: true },
 *     });
 */
export function declare(permissions: Record<string, PermissionInfo>) {
	const nodes = Object.keys(permissions);
	for (const node of nodes) {
		const info = permissions[node]!;
		if (!declareNode(node, info.description, info.everyone ?? false, false)) console.error(`[perms] "${node}" is declared twice - the first declaration stays`);
	}
	players.refreshAll();
}

/** Whether the player has a permission: `perms.has(player, "myplugin.kick")`. */
export function has(player: Player, node: string) {
	return players.has(player, node);
}

/** The player's primary group: his group of the highest weight, `"default"` when he has none. */
export function groupOf(player: Player) {
	return primaryGroup(players.userOf(player), Date.now());
}

/** The player's groups, highest weight first, `"default"` last. */
export function groupsOf(player: Player) {
	return groupsOfUser(players.userOf(player), Date.now()).map<string>(group => group.name);
}

function forPlayer(player: Player, op: "memberAdd" | "memberRemove" | "grant" | "revoke", options: GrantDetails) {
	const change = changeOf(op);
	change.user = players.idOf(player);
	change.until = options.seconds > 0 ? Date.now() + options.seconds * 1000 : 0;
	change.server = options.server;
	return change;
}

interface GrantDetails {
	seconds: number;
	server: string;
}

/** Puts the player into a group: `perms.addGroup(player, "vip", { for: 30 * 86400 })`; permanent without `for`. */
export function addGroup(player: Player, group: string, options: GrantOptions = {}) {
	const change = forPlayer(player, "memberAdd", { seconds: options.for ?? 0, server: options.server ?? "" });
	change.group = group;
	commit([change]);
}

/** Takes the player out of a group. */
export function removeGroup(player: Player, group: string, options: GrantOptions = {}) {
	const change = forPlayer(player, "memberRemove", { seconds: 0, server: options.server ?? "" });
	change.group = group;
	commit([change]);
}

/** Gives the player a permission of his own, or takes it away with `false`: `perms.set(player, "myplugin.trail", true, { for: 3600 })`. */
export function set(player: Player, node: string, value: boolean, options: GrantOptions = {}) {
	const change = forPlayer(player, "grant", { seconds: options.for ?? 0, server: options.server ?? "" });
	change.node = node;
	change.value = value;
	commit([change]);
}

/** Removes a permission of the player's own, so his groups decide again. */
export function unset(player: Player, node: string, options: GrantOptions = {}) {
	const change = forPlayer(player, "revoke", { seconds: 0, server: options.server ?? "" });
	change.node = node;
	commit([change]);
}

/**
 * Hears a player's permissions change - he joined, a command or the editor
 * changed them, or one ran out:
 *
 *     perms.addEventListener("change", ({ player }) => {
 *         if (perms.has(player, "myplugin.trail")) startTrail(player);
 *     });
 */
export function addEventListener(_type: "change", listener: (event: PermsChangeEvent) => void) {
	listeners.push({ listener, from: callingPlugin() });
}

interface Listener {
	listener: (event: PermsChangeEvent) => void;
	from: number;
}

let listeners: Listener[] = [];

players.onChange((player) => {
	listeners.forEach(each => each.listener({ player }));
});

onPluginStop((plugin) => {
	listeners = listeners.filter(each => each.from != plugin);
});
