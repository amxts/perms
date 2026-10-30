// Perms on the fake server: a perms.yaml, players joining, the answers Pawn
// plugins get through the natives, AMX Mod X's flags, the commands, users.ini,
// and the web editor's round trip against the store running in this process.
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setup } from "@amxts/core/test-utils";
import { startStore } from "../store/dev.ts";
import { permsOf } from "../testing/index.ts";

const CONFIGS = "addons/amxmodx/configs";

const PERMS = `
groups:
  default:
    permissions: [kz.top]
  vip:
    weight: 10
    permissions: [amxx.reservation, shop.discount]
  admin:
    weight: 50
    inherits: [vip]
    permissions: [amxx.kick, amxx.ban, "kz.admin.*", "-kz.admin.wipe", perms.view]
  owner:
    weight: 100
    permissions: ["*"]
users:
  - id: "STEAM_0:1:100"
    name: Bob
    groups: [admin]
  - id: "STEAM_0:1:200"
    groups:
      - { group: vip, until: 2001-01-01T00:00:00Z }
  - id: "STEAM_0:1:300"
    groups: [admin]
    permissions: [kz.admin.wipe, "-amxx.ban"]
  - id: "ip:10.0.0.7"
    groups: [owner]
`;

// AMX Mod X's flag bits: users.ini's letters a, b, c, d, z.
const IMMUNITY = 1 << 0;
const RESERVATION = 1 << 1;
const KICK = 1 << 2;
const BAN = 1 << 3;
const USER = 1 << 25;

async function boot(files: Record<string, string> = { [`${CONFIGS}/perms.yaml`]: PERMS }) {
	return setup({ files, env: { PERMS_SERVER: "kz1" } });
}

function has(server: Awaited<ReturnType<typeof boot>>, id: number, node: string) {
	return server.native("perms_has", id, node);
}

describe("the model", () => {
	it("groups, inheritance, wildcards and negation", async () => {
		const server = await boot();
		const bob = server.join("Bob", { steamId: "STEAM_0:1:100" });

		expect(has(server, bob.id, "kz.admin.kick")).toBe(true);
		expect(has(server, bob.id, "kz.admin.wipe")).toBe(false);
		expect(has(server, bob.id, "shop.discount")).toBe(true);
		expect(has(server, bob.id, "kz.top")).toBe(true);
		expect(has(server, bob.id, "shop.buy")).toBe(false);
		expect(server.native("perms_get_group", bob.id)).toBe("admin");
		expect(server.native("perms_in_group", bob.id, "vip")).toBe(false);
	}, 180_000);

	it("a player's own grants come first, a negation included", async () => {
		const server = await boot();
		const carl = server.join("Carl", { steamId: "STEAM_0:1:300" });

		expect(has(server, carl.id, "kz.admin.wipe")).toBe(true);
		expect(carl.flags & BAN).toBe(0);
		expect(carl.flags & KICK).toBe(KICK);
	}, 120_000);

	it("an expired group no longer counts; a stranger has the default", async () => {
		const server = await boot();
		const dave = server.join("Dave", { steamId: "STEAM_0:1:200" });
		const eve = server.join("Eve", { steamId: "STEAM_0:1:999" });

		expect(has(server, dave.id, "shop.discount")).toBe(false);
		expect(server.native("perms_get_group", dave.id)).toBe("default");
		expect(has(server, eve.id, "kz.top")).toBe(true);
		expect(eve.flags).toBe(USER);
	}, 120_000);

	it("an IP entry, and * for everything", async () => {
		const server = await boot();
		const root = server.join("Root", { steamId: "STEAM_ID_LAN", ip: "10.0.0.7" });

		expect(has(server, root.id, "anything.at.all")).toBe(true);
		expect(root.flags & IMMUNITY).toBe(IMMUNITY);
	}, 120_000);

	it("a name entry counts with its password only", async () => {
		const hash = createHash("sha256").update("secret").digest("hex");
		const server = await boot({ [`${CONFIGS}/perms.yaml`]: `${PERMS}  - id: "name:Alice"\n    password: "sha256:${hash}"\n    groups: [admin]\n` });
		const alice = server.join("Alice", { steamId: "STEAM_0:1:777" });
		expect(has(server, alice.id, "kz.admin.kick")).toBe(false);
		expect(alice.console).toContain("Wrong password for your entry");

		alice.info.set("_pw", "secret");
		server.serverCommand("perms reload");
		await server.responses();
		expect(has(server, alice.id, "kz.admin.kick")).toBe(true);
	}, 120_000);

	it("a SteamID entry with a password from the console counts with it only", async () => {
		const server = await boot();
		const bob = server.join("Bob", { steamId: "STEAM_0:1:100" });
		expect(has(server, bob.id, "kz.admin.kick")).toBe(true);

		server.serverCommand("perms user STEAM_0:1:100 password secret");
		await server.responses();
		expect(has(server, bob.id, "kz.admin.kick")).toBe(false);
		expect(bob.console).toContain("Wrong password for your entry");

		bob.info.set("_pw", "secret");
		server.serverCommand("perms reload");
		await server.responses();
		expect(has(server, bob.id, "kz.admin.kick")).toBe(true);
	}, 120_000);

	it("the flags of AMX Mod X from the amxx nodes, and its admin list", async () => {
		const server = await boot();
		const bob = server.join("Bob", { steamId: "STEAM_0:1:100" });

		expect(bob.flags).toBe(RESERVATION | KICK | BAN);
		expect(permsOf(server).admins.find(admin => admin.auth == "STEAM_0:1:100")?.access).toBe(RESERVATION | KICK | BAN);
	}, 120_000);
});

describe("the commands", () => {
	it("a group given for a while, and taken away", async () => {
		const server = await boot();
		const eve = server.join("Eve", { steamId: "STEAM_0:1:999" });

		server.serverCommand("perms user Eve group add vip 30d");
		await server.responses();
		expect(has(server, eve.id, "shop.discount")).toBe(true);
		expect(eve.flags & RESERVATION).toBe(RESERVATION);
		expect(server.file(`${CONFIGS}/perms.yaml`)).toContain("STEAM_0:1:999");

		// The engine splits a console line at ':' - the words of a SteamID come apart.
		server.serverCommand("perms user STEAM_0 : 1 : 999 group remove vip");
		await server.responses();
		expect(has(server, eve.id, "shop.discount")).toBe(false);
	}, 120_000);

	it("groups and their permissions", async () => {
		const server = await boot();
		const bob = server.join("Bob", { steamId: "STEAM_0:1:100" });

		server.serverCommand("perms group moder create 30");
		server.serverCommand("perms group moder permission set kz.admin.wipe");
		server.serverCommand("perms user Bob group add moder");
		await server.responses();
		expect(has(server, bob.id, "kz.admin.wipe")).toBe(false);

		server.serverCommand("perms group moder weight 80");
		await server.responses();
		expect(has(server, bob.id, "kz.admin.wipe")).toBe(true);
		expect(server.native("perms_get_group", bob.id)).toBe("moder");
	}, 120_000);

	it("a cycle is refused, and default cannot go", async () => {
		const server = await boot();
		server.serverCommand("perms group vip parent add admin");
		server.serverCommand("perms group default delete");
		await server.responses();
		expect(server.log).toContain("\"vip\" would inherit itself through \"admin\"");
		expect(server.log).toContain("The group \"default\" cannot be deleted");
	}, 120_000);

	it("a player only looks: perms.view, and no changes from the game", async () => {
		const server = await boot();
		const eve = server.join("Eve", { steamId: "STEAM_0:1:999" });
		const bob = server.join("Bob", { steamId: "STEAM_0:1:100" });

		eve.say("/perms groups");
		expect(eve.console).toContain("You need perms.view");

		bob.say("/perms groups");
		expect(bob.console).toContain("admin (50)");
		bob.say("/perms user Bob group add owner");
		expect(bob.console).toContain("Permissions are changed in the editor");
		expect(server.native("perms_get_group", bob.id)).toBe("admin");
	}, 120_000);

	it("users.ini imports as amxx grants", async () => {
		const server = await boot({
			[`${CONFIGS}/users.ini`]: "; admins\n\"STEAM_0:0:42\" \"\" \"abcd\" \"ce\"\n\"10.1.1.1\" \"\" \"c\" \"de\"\n",
		});
		server.serverCommand("perms import");
		await server.responses();

		const admin = server.join("Admin", { steamId: "STEAM_0:0:42" });
		expect(admin.flags).toBe(IMMUNITY | RESERVATION | KICK | BAN);
		expect(server.file(`${CONFIGS}/perms.yaml`)).toContain("ip:10.1.1.1");
	}, 120_000);

	it("admin.amxx running: the flags are left to it", async () => {
		const server = await setup({ files: { [`${CONFIGS}/perms.yaml`]: PERMS }, start: false });
		permsOf(server).loadedPlugins.push("admin.amxx");
		server.start();

		const bob = server.join("Bob", { steamId: "STEAM_0:1:100", flags: "z" });
		expect(bob.flags).toBe(USER);
		expect(server.log).toContain("admin.amxx is running");
	}, 120_000);
});

describe("a TypeScript plugin", () => {
	it("declares its nodes, checks them, and hears a change", async () => {
		const server = await setup({ rootDir: "playground", files: { [`${CONFIGS}/perms.yaml`]: PERMS } });
		const bob = server.join("Bob", { steamId: "STEAM_0:1:100" });
		const eve = server.join("Eve", { steamId: "STEAM_0:1:999" });

		eve.say("/kick Bob");
		expect(eve.chat).toContain("You may not kick");
		eve.say("/help");
		expect(eve.chat).toContain("Your group: default");

		server.serverCommand("perms group admin permission set myplugin.kick");
		server.serverCommand("perms user Eve group add admin");
		await server.responses();
		expect(server.log).toContain("Eve is in admin, default");
		eve.say("/kick Bob");
		expect(bob.connected).toBe(false);

		server.serverCommand("perms nodes myplugin");
		expect(server.log).toContain("myplugin.help (everyone) - Use /help");
	}, 180_000);
});

describe("the permissions in MySQL", () => {
	const DB = "mysql://perms:secret@127.0.0.1/perms";

	it("the set is read from the tables; a change is written and moves the revision", async () => {
		const server = await setup({ env: { PERMS_DB: DB }, start: false });
		const db = server.database(DB)
			.answer(/^(CREATE|INSERT|UPDATE|DELETE)/, { insertId: 0, affectedRows: 1 })
			.answer("SELECT revision FROM perms_revision WHERE id = 1", [{ revision: 4 }])
			.answer("SELECT name, weight, inherits FROM perms_groups", [{ name: "admin", weight: 50, inherits: "vip" }, { name: "vip", weight: 10, inherits: "" }])
			.answer("SELECT owner, node, value, until, server FROM perms_grants", [
				{ owner: "group:admin", node: "amxx.kick", value: 1, until: 0, server: "" },
				{ owner: "group:vip", node: "shop.discount", value: 1, until: 0, server: "" },
				{ owner: "group:admin", node: "kz.admin.*", value: 1, until: 0, server: "kz2" },
			])
			.answer("SELECT id, name, password FROM perms_users", [{ id: "STEAM_0:1:100", name: "Bob", password: "" }])
			.answer("SELECT user, grp, until, server FROM perms_members", [{ user: "STEAM_0:1:100", grp: "admin", until: 0, server: "" }]);
		server.start();
		await server.responses();

		const bob = server.join("Bob", { steamId: "STEAM_0:1:100" });
		expect(bob.flags & KICK).toBe(KICK);
		expect(has(server, bob.id, "shop.discount")).toBe(true);
		expect(has(server, bob.id, "kz.admin.ban")).toBe(false);

		server.serverCommand("perms user Bob permission set kz.trail true 1h");
		await server.responses();
		const written = db.queries.map(query => query.sql);
		expect(written.some(sql => sql.startsWith("INSERT INTO perms_grants"))).toBe(true);
		expect(written).toContain("UPDATE perms_revision SET revision = revision + 1 WHERE id = 1");
		expect(has(server, bob.id, "kz.trail")).toBe(true);
	}, 120_000);
});

describe("the web editor", () => {
	let store: Server;
	let url = "";

	beforeAll(async () => {
		store = await startStore(0);
		url = `http://127.0.0.1:${(store.address() as AddressInfo).port}`;
	});

	afterAll(() => {
		store.close();
	});

	it("a session goes up, the page's changes come back and apply", async () => {
		const server = await setup({ files: { [`${CONFIGS}/perms.yaml`]: PERMS }, env: { PERMS_EDITOR_URL: url } });
		const eve = server.join("Eve", { steamId: "STEAM_0:1:999" });
		server.join("Record bot", { bot: true });

		server.serverCommand("perms editor");
		await server.responses();
		const id = /#([a-z0-9]{10})/.exec(server.log)?.[1] ?? "";
		expect(id).not.toBe("");

		const session = await (await fetch(`${url}/session/${id}`)).json();
		expect(session.version).toBe(1);
		expect(session.server.context).toBe("");
		expect(session.groups.map((group: { name: string }) => group.name)).toContain("admin");
		expect(session.users.find((user: { id: string }) => user.id == "STEAM_0:1:999")?.online).toBe(true);
		expect(session.users.find((user: { id: string }) => user.id == "STEAM_0:1:999")?.password).toBe(false);
		expect(session.users.some((user: { name: string }) => user.name == "Record bot")).toBe(false);
		expect(session.nodes.find((node: { node: string }) => node.node == "amxx.kick")?.letter).toBe("c");

		await fetch(`${url}/session/${id}/changes`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				base: 0,
				changes: [
					{ op: "memberAdd", user: "STEAM_0:1:999", group: "vip", until: null, server: null },
					{ op: "grant", owner: { group: "nobody" }, node: "x.y", value: true, until: null, server: null },
				],
			}),
		});
		server.advance(3100);
		await server.responses();
		await server.responses();

		expect(has(server, eve.id, "shop.discount")).toBe(true);
		const status = await (await fetch(`${url}/session/${id}/status`)).json();
		expect(status.applied).toHaveLength(1);
		expect(status.applied[0].done).toHaveLength(1);
		expect(status.applied[0].skipped[0].code).toBe("groupMissing");
	}, 120_000);
});
