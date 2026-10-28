// Perms' test kit: the AMX Mod X natives the module calls that the fake
// server leaves out - a player's flags written, AMX Mod X's admin list,
// hash_string, find_plugin_byfile - and what a test reads back:
//
//   import { setup } from "@amxts/core/test-utils";
//   import { permsOf } from "@amxts/perms/testing";
//
//   const server = await setup({ files: { "addons/amxmodx/configs/perms.yaml": "..." } });
//   const bob = server.join("Bob", { steamId: "STEAM_0:1:5" });
//   bob.flags;                                  // what set_user_flags wrote
//   permsOf(server).admins;                     // what admins_push gave AMX Mod X
import type { FakeServer } from "@amxts/core/test-utils";
import { createHash } from "node:crypto";
import { defineTestKit } from "@amxts/core/test-utils";

/** An entry of AMX Mod X's admin list, as admins_push gave it. */
export interface PushedAdmin {
	auth: string;
	password: string;
	access: number;
	flags: number;
}

export interface PermsKit {
	/** AMX Mod X's admin list. */
	admins: PushedAdmin[];
	/** The plugin files find_plugin_byfile finds, as if they were loaded: `["admin.amxx"]`. */
	loadedPlugins: string[];
}

const HASH_SHA256 = 3;

const kits = new WeakMap<FakeServer, PermsKit>();

function install(server: FakeServer): PermsKit {
	const kit: PermsKit = { admins: [], loadedPlugins: [] };
	kits.set(server, kit);

	server.defineNative("set_user_flags", (call, [id, flags]) => {
		const player = call.server.player(id);
		if (player) player.flags |= flags;
		return 0;
	});
	server.defineNative("remove_user_flags", (call, [id, flags]) => {
		const player = call.server.player(id);
		if (player) player.flags &= ~flags;
		return 0;
	});
	server.defineNative("admins_flush", () => {
		kit.admins.length = 0;
		return 0;
	});
	server.defineNative("admins_push", (call, [auth, password, access, flags]) => {
		kit.admins.push({ auth: call.memory.text(auth), password: call.memory.text(password), access, flags });
		return 0;
	});
	server.defineNative("hash_string", (call, [text, type, out, length]) => {
		if (type !== HASH_SHA256) throw new Error(`hash_string: the test kit hashes SHA-256 only, not type ${type}`);
		return call.memory.setText(out, length, createHash("sha256").update(call.memory.text(text)).digest("hex"));
	});
	server.defineNative("find_plugin_byfile", (call, [file]) => kit.loadedPlugins.indexOf(call.memory.text(file)));
	return kit;
}

export default defineTestKit({ install });

/** The kit of a server Perms runs on. */
export function permsOf(server: FakeServer) {
	const kit = kits.get(server);
	if (!kit) throw new Error("Perms' test kit is not on this server: load @amxts/perms (or call setup()) first");
	return kit;
}
