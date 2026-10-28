import type { Player } from "@amxts/core";

/** The module's options in `amxts.config.ts`, under `perms`. */
export interface PermsOptions {
	/** The file under `configs/` the permissions are kept in, without its extension; `"perms"` reads `perms.yaml` (or `.json`). */
	file: string;
	/** The editor's store; `PERMS_EDITOR_URL` in `.env` overrides it. */
	editor: string;
}

/** A permission a plugin declares, for the web editor and `perms nodes`. */
export interface PermissionInfo {
	/** What it lets a player do, as the editor shows it: `"Kick players"`. */
	description: string;
	/** Whether a player no group or grant says anything about has it; `false` by default. */
	everyone?: boolean;
}

/** How long a grant or a group lasts, and where. */
export interface GrantOptions {
	/** Seconds from now; left out, it is permanent. */
	for?: number;
	/** The server it counts on (`PERMS_SERVER`); left out, every server. */
	server?: string;
}

/** A player's permissions changed: he joined, a command or the editor changed them, or one expired. */
export interface PermsChangeEvent {
	player: Player;
}

declare module "@amxts/core" {
	interface ModuleOptions {
		perms?: Partial<PermsOptions>;
	}
}
