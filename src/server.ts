/**
 * The module on the server: the store opened with the project's options and
 * `.env`, players worked out as they join and rename, the commands, and
 * admin.amxx's commands for the configs and plugins that use them.
 */
import { env, game, server } from "@amxts/core";
import { find_plugin_byfile } from "@amxts/core/natives";
import type { PermsOptions } from "./types";
import { declare, setThisServer } from "./model";
import { DEFAULT_STORE, setStore } from "./editor";
import { run } from "./commands";
import { forget, refresh, refreshAll, setWritesFlags } from "./players";
import { open, reload } from "./state";

/** Plugins that write the players' flags themselves. */
const ADMIN_PLUGINS = ["admin.amxx", "admin_sql.amxx"];

/** A player who joined the game; one only connecting is worked out when he joins. */
function refreshSlot(id: number) {
	const player = server.players.find(each => each.id == id);
	if (player != null) refresh(player);
}

/** The words of a command; the engine splits a line at `:`, so `STEAM_0 : 1 : 5` is put back into `STEAM_0:1:5`. */
function splitWords(text: string) {
	return text.replace(/\s*:\s*/g, ":").trim().split(" ").filter(each => each != "");
}

export function start(options: PermsOptions) {
	setThisServer(env("PERMS_SERVER", ""));
	const editor = env("PERMS_EDITOR_URL", "");
	setStore(editor != "" ? editor : options.editor != "" ? options.editor : DEFAULT_STORE);
	declare("perms.edit", "Change permissions with the perms commands", false, false);
	declare("perms.editor", "Open the web editor with perms editor", false, false);

	server.addEventListener("init", () => {
		const running = ADMIN_PLUGINS.filter(file => find_plugin_byfile(file) >= 0);
		if (running.length > 0) {
			setWritesFlags(false);
			console.error(`[perms] ${running.join(", ")} is running and gives the players' flags itself - perms does not; comment it out in plugins.ini`);
		}
		open(options.file, env("PERMS_DB", ""));
	});

	server.addEventListener("authorized", event => refreshSlot(event.player.id));
	server.addEventListener("putInServer", event => refreshSlot(event.player.id));
	server.addEventListener("disconnected", event => forget(event.player.id));
	game.addEventListener("changeName", event => refresh(event.player), true);

	server.addServerCommand("perms [args]", ({ args }) => {
		run(null, splitWords(args ?? ""), line => console.log(line));
	});
	server.addCommand("perms [args]", ({ player, args }) => {
		run(player, splitWords(args ?? ""), line => player.print(line, "console"));
	});
	server.addCommand("/perms [args]", ({ player, args }) => {
		run(player, splitWords(args ?? ""), line => player.print(line, "console"));
	});
	server.addServerCommand("amx_reloadadmins", () => {
		reload();
	});
	server.addEventListener("configsExecuted", () => refreshAll());
}
