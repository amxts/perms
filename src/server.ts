/**
 * The module on the server: the store opened with the project's options and
 * `.env`, players worked out as they join and rename, the commands, and
 * admin.amxx's commands for the configs and plugins that use them.
 */
import { Cvar, env, game, server } from "@amxts/core";
import type { PermsOptions } from "./types";
import { declare, setContext, setContexts, setThisServer } from "./model";
import { DEFAULT_STORE, setStore } from "./editor";
import { run } from "./commands";
import { forget, refresh, refreshAll, writesFlags } from "./players";
import { open, reload } from "./state";

/** The mode the server plays now, set by its config (`perms_context kz`); never written to the file. */
const context = new Cvar("perms_context", "");

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
	setContexts(env("PERMS_CONTEXTS", "").split(",").map<string>(name => name.trim()).filter(name => name != ""));
	const editor = env("PERMS_EDITOR_URL", "");
	setStore(editor != "" ? editor : options.editor != "" ? options.editor : DEFAULT_STORE);
	declare("perms.view", "See groups and permissions with the perms commands in the game", false, false);

	server.addEventListener("init", () => {
		// The engine keeps the first handler a command's name gets, and on the
		// first map this plugin loads before the Pawn plugins: taken here, after
		// their plugin_init, and only without admin.amxx, amx_reloadadmins stays
		// admin.amxx's while it runs.
		if (writesFlags()) {
			server.addServerCommand("amx_reloadadmins", () => {
				reload();
			});
		}

		setContext(context.value.trim());
		open(options.file, env("PERMS_DB", ""));
	});
	context.addEventListener("change", (event) => {
		setContext(event.value.trim());
		refreshAll();
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
	server.addEventListener("configsExecuted", () => refreshAll());
}
