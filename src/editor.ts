/**
 * The web editor: `perms editor` uploads the permissions to the store as a
 * session and prints the page's link; while the session lives, the module
 * polls it for the changes the page saved, commits them, and tells the page
 * what it did.
 */
import { Cvar, clearInterval, fetch, server, setInterval } from "@amxts/core";
import type { Change, ChangeOp, Grant, Membership } from "./model";
import { allGroups, allUsers, changeOf, declaredNodes, serverName, userWith } from "./model";
import { FLAGS, idOf } from "./players";
import { commit, storageName } from "./state";
import { momentOf, textOf } from "./time";

const PAGE = "https://amxts.github.io/modules/perms/editor";
export const DEFAULT_STORE = "https://perms-store.brokukaschannel.workers.dev";
const POLL_MS = 3000;
const LIFETIME_MS = 60 * 60 * 1000;

interface WireGrant {
	node: string;
	value: boolean;
	until: string | null;
	server: string | null;
}

interface WireMembership {
	group: string;
	until: string | null;
	server: string | null;
}

interface WireGroup {
	name: string;
	weight: number;
	inherits: string[];
	grants: WireGrant[];
}

interface WireUser {
	id: string;
	name: string;
	online: boolean;
	/** Whether the entry has a password; the password itself never leaves the server. */
	password: boolean;
	groups: WireMembership[];
	grants: WireGrant[];
}

interface WireNode {
	node: string;
	description: string;
	everyone: boolean;
	plugin: string;
	pawn: boolean;
	letter: string;
}

interface WireServer {
	name: string;
	address: string;
	storage: string;
	context: string;
}

interface Session {
	version: number;
	server: WireServer;
	createdAt: string;
	expiresAt: string;
	nodes: WireNode[];
	groups: WireGroup[];
	users: WireUser[];
}

interface Created {
	id: string;
	key: string;
}

interface WireOwner {
	group?: string;
	user?: string;
}

interface WireChange {
	op: string;
	owner?: WireOwner;
	node?: string;
	value?: boolean;
	until?: string | null;
	server?: string | null;
	group?: string;
	weight?: number;
	parent?: string;
	user?: string;
	name?: string;
}

interface WireRevision {
	revision: number;
	changes: WireChange[];
}

interface WireSkipped {
	change: WireChange;
	reason: string;
	code: string;
}

interface Applied {
	revision: number;
	done: WireChange[];
	skipped: WireSkipped[];
}

let store = DEFAULT_STORE;
let sessionId = "";
let sessionKey = "";
let expiresAt = 0;
let seen = 0;
let polling = 0;
let busy = false;

export function setStore(url: string) {
	store = url.endsWith("/") ? url.substring(0, url.length - 1) : url;
}

function nullable(text: string) {
	const value: string | null = text == "" ? null : text;
	return value;
}

function wireGrant(grant: Grant): WireGrant {
	return { node: grant.node, value: grant.value, until: nullable(textOf(grant.until)), server: nullable(grant.server) };
}

function wireMembership(membership: Membership): WireMembership {
	return { group: membership.group, until: nullable(textOf(membership.until)), server: nullable(membership.server) };
}

function sessionOf(now: number) {
	const nodes = declaredNodes().map<WireNode>(each => ({ node: each.node, description: each.description, everyone: each.byDefault, plugin: each.node.split(".")[0], pawn: each.pawn, letter: "" }));
	for (const flag of FLAGS) nodes.push({ node: `amxx.${flag.name}`, description: `AMX Mod X: ${flag.name} (${flag.letter})`, everyone: false, plugin: "amxx", pawn: true, letter: flag.letter });

	const users = allUsers().map<WireUser>(user => ({ id: user.id, name: user.name, online: false, password: user.password != "", groups: user.groups.map<WireMembership>(wireMembership), grants: user.grants.map<WireGrant>(wireGrant) }));
	for (const player of server.players.filter(each => !each.isBot)) {
		const id = idOf(player);
		const known = users.find(user => user.id == id);
		if (known != null) {
			known.online = true;
			known.name = player.name;
		} else {
			users.push({ id, name: player.name, online: true, password: false, groups: [], grants: [] });
		}
	}

	const session: Session = {
		version: 1,
		server: { name: new Cvar("hostname").value, address: new Cvar("net_address").value, storage: storageName(), context: serverName() },
		createdAt: textOf(now),
		expiresAt: textOf(now + LIFETIME_MS),
		nodes,
		groups: allGroups().map<WireGroup>(group => ({ name: group.name, weight: group.weight, inherits: group.inherits, grants: group.grants.map<WireGrant>(wireGrant) })),
		users,
	};
	return session;
}

/** The page's link for the open session. */
function link() {
	const page = store == DEFAULT_STORE ? PAGE : `${store}/editor`;
	return `${page}#${sessionId}`;
}

export function isOpen() {
	return sessionId != "" && Date.now() < expiresAt;
}

/** Opens a session, or gives the one that is open; the lines to print, or an error's. */
export async function openEditor() {
	if (isOpen()) return `[perms] The editor is open: ${link()}`;

	const now = Date.now();
	const response = await fetch(`${store}/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sessionOf(now)) });
	if (!response.ok) return `[perms] The editor's store answered ${response.status}: ${await response.text()}`;

	const created = await response.json<Created>();
	sessionId = created.id;
	sessionKey = created.key;
	expiresAt = now + LIFETIME_MS;
	seen = 0;
	if (polling == 0) polling = setInterval(() => poll(), POLL_MS);
	return `[perms] Open the editor (an hour): ${link()}`;
}

/** Closes the session: the store forgets it and the module stops polling. */
export async function closeEditor() {
	if (sessionId == "") return;

	const id = sessionId;
	stopPolling();
	await fetch(`${store}/session/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${sessionKey}` } });
}

function stopPolling() {
	sessionId = "";
	if (polling != 0) clearInterval(polling);
	polling = 0;
}

async function poll() {
	if (busy || sessionId == "") return;
	if (Date.now() >= expiresAt) {
		stopPolling();
		return;
	}

	busy = true;
	try {
		const response = await fetch(`${store}/session/${sessionId}/changes?after=${seen}`, { headers: { Authorization: `Bearer ${sessionKey}` } });
		if (response.status == 404) stopPolling();
		if (response.ok) await applyRevisions(await response.json<WireRevision[]>());
	} catch (error) {
		console.error(`[perms] editor: ${error.message}`);
	}
	busy = false;
}

/** Applies what the page saved, revision by revision, applies it and says so to the store. */
export async function applyRevisions(revisions: WireRevision[]) {
	for (const entry of revisions) {
		const committed = await commit(entry.changes.map<Change>(changeFrom));
		seen = entry.revision;
		const applied: Applied = {
			revision: entry.revision,
			done: committed.done.map<WireChange>(wireChange),
			skipped: committed.skipped.map<WireSkipped>(skip => ({ change: wireChange(skip.change), reason: skip.reason, code: skip.code })),
		};
		console.log(`[perms] the editor's changes: ${applied.done.length} applied${applied.skipped.length > 0 ? `, ${applied.skipped.length} skipped` : ""}`);
		applied.skipped.forEach(skip => console.log(`[perms]   skipped: ${skip.reason}`));
		await fetch(`${store}/session/${sessionId}/applied`, { method: "POST", headers: { "Authorization": `Bearer ${sessionKey}`, "Content-Type": "application/json" }, body: JSON.stringify(applied) });
	}
}

const OPS = ["grant", "revoke", "groupCreate", "groupDelete", "groupWeight", "parentAdd", "parentRemove", "memberAdd", "memberRemove", "userCreate"];

/** A change as the page wrote it; an op the module does not know becomes a grant of no node, which is skipped as invalid. */
function changeFrom(wire: WireChange) {
	const known = OPS.includes(wire.op);
	const change = changeOf(known ? (wire.op as ChangeOp) : "grant");
	const owner = wire.owner;
	change.group = owner != null ? (owner.group ?? "") : (wire.group ?? "");
	change.user = owner != null ? (owner.user ?? "") : (wire.user ?? "");
	change.node = known ? (wire.node ?? "") : "";
	change.value = wire.value ?? true;
	change.until = momentOf(wire.until ?? "");
	change.server = wire.server ?? "";
	change.weight = wire.weight ?? 0;
	change.parent = wire.parent ?? "";
	change.name = wire.name ?? "";
	if (userWith(change.user) != null) change.user = userWith(change.user)!.id;
	return change;
}

function wireChange(change: Change) {
	const usesOwner = change.op == "grant" || change.op == "revoke";
	const wire: WireChange = { op: change.op };
	if (usesOwner) wire.owner = change.user != "" ? { user: change.user } : { group: change.group };
	if (!usesOwner && change.group != "") wire.group = change.group;
	if (!usesOwner && change.user != "") wire.user = change.user;
	if (change.node != "") wire.node = change.node;
	if (change.op == "grant") wire.value = change.value;
	if (change.until != 0) wire.until = textOf(change.until);
	if (change.server != "") wire.server = change.server;
	if (change.op == "groupCreate" || change.op == "groupWeight") wire.weight = change.weight;
	if (change.parent != "") wire.parent = change.parent;
	if (change.name != "") wire.name = change.name;
	return wire;
}
