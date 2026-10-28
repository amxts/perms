/**
 * Perms for Pawn plugins: the permission check, the groups, and the
 * `perms_changed(id)` forward. AMX Mod X's flags come from the `amxx.*`
 * nodes, so `access` and `cmd_access` work without this include.
 */
import { Forward, Player, plugin } from "@amxts/core";
import * as perms from "./index";
import { declare } from "./model";
import { onChange, refreshAll } from "./players";

plugin({ name: "Perms", version: "0.1.1", author: "kukson777", description: "Permissions and groups in place of admin.amxx" });

const changed = new Forward<Player>("perms_changed");
onChange(player => changed.emit(player));

/** Whether the player has a permission node, e.g. "myplugin.kick". */
export function perms_has(player: Player, node: string) {
	return perms.has(player, node);
}

/** Declares a node the plugin checks, for the web editor; byDefault gives it to every player no grant says otherwise for. */
export function perms_declare(node: string, description: string, byDefault = false) {
	declare(node, description, byDefault, true);
	refreshAll();
}

/** The player's primary group: his group of the highest weight, "default" when he has none. */
export function perms_get_group(player: Player) {
	return perms.groupOf(player);
}

/** Whether the player is in a group now. */
export function perms_in_group(player: Player, group: string) {
	return perms.groupsOf(player).includes(group);
}

/** Puts the player into a group, for seconds (0 - for good). */
export function perms_add_group(player: Player, group: string, seconds = 0) {
	if (seconds > 0) perms.addGroup(player, group, { for: seconds });
	else perms.addGroup(player, group);
}

/** Takes the player out of a group. */
export function perms_remove_group(player: Player, group: string) {
	perms.removeGroup(player, group);
}
