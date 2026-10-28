/**
 * The permission model: groups, players, their grants, and the answer to
 * "does this player have this node". Every change - a command, a plugin's
 * call, the web editor, the database's - is a `Change`, applied here.
 */

/** A permission given (`value` true) or taken away (false) - `node` may end in `*`. */
export interface Grant {
	node: string;
	value: boolean;
	/** When it ends, ms since 1970; 0 never. */
	until: number;
	/** The server it counts on; "" every server. */
	server: string;
}

/** A player's place in a group. */
export interface Membership {
	group: string;
	until: number;
	server: string;
}

export interface Group {
	name: string;
	weight: number;
	inherits: string[];
	grants: Grant[];
}

/** A player as he is recognised: `STEAM_0:1:5`, `ip:1.2.3.4` or `name:Bob`. */
export interface User {
	id: string;
	name: string;
	/** A `name:` entry's password, `sha256:<hex>`; "" for none. */
	password: string;
	groups: Membership[];
	grants: Grant[];
}

export type ChangeOp
	= | "grant" | "revoke"
		| "groupCreate" | "groupDelete" | "groupWeight" | "parentAdd" | "parentRemove"
		| "memberAdd" | "memberRemove" | "userCreate";

/** One change, the editor's contract in one shape: the fields an op does not use stay empty. */
export interface Change {
	op: ChangeOp;
	/** The group a grant is for, or the group a player joins. */
	group: string;
	/** The player a grant or a membership is for. */
	user: string;
	node: string;
	value: boolean;
	until: number;
	server: string;
	weight: number;
	parent: string;
	name: string;
}

/** Why a change was skipped, as the editor's contract names it; "" when it was applied. */
export type SkipCode = "" | "groupMissing" | "groupExists" | "userMissing" | "parentMissing" | "cycle" | "defaultGroup" | "invalid";

export interface Declared {
	node: string;
	description: string;
	byDefault: boolean;
	/** Declared by a Pawn plugin, through perms_declare. */
	pawn: boolean;
}

export const DEFAULT_GROUP = "default";

let groups: Group[] = [];
let users: User[] = [];
const declared: Declared[] = [];
let thisServer = "";

/** A blank change of an op, to fill. */
export function changeOf(op: ChangeOp) {
	const change: Change = { op, group: "", user: "", node: "", value: true, until: 0, server: "", weight: 0, parent: "", name: "" };
	return change;
}

/** Replaces every group and player, as a store read them; `default` is made when missing. */
export function replaceAll(newGroups: Group[], newUsers: User[]) {
	groups = newGroups;
	users = newUsers;
	if (groupNamed(DEFAULT_GROUP) == null) groups.unshift({ name: DEFAULT_GROUP, weight: 0, inherits: [], grants: [] });
}

export function allGroups() {
	return groups;
}

export function allUsers() {
	return users;
}

export function setThisServer(name: string) {
	thisServer = name;
}

export function serverName() {
	return thisServer;
}

export function groupNamed(name: string) {
	return groups.find(group => group.name == name) ?? null;
}

/** A player's entry; `name:` ids match in any case. */
export function userWith(id: string) {
	const wanted = normalId(id);
	return users.find(user => user.id == wanted) ?? null;
}

/** `name:` ids are kept in lower case, the rest as written. */
export function normalId(id: string) {
	return id.startsWith("name:") ? id.toLowerCase() : id;
}

// ---------------------------------------------------------------- declared nodes

/** Declares a node; `false` when another plugin declared it first. */
export function declare(node: string, description: string, byDefault: boolean, pawn: boolean) {
	if (declared.some(each => each.node == node)) return false;

	declared.push({ node, description, byDefault, pawn });
	return true;
}

export function declaredNodes() {
	return declared;
}

// ---------------------------------------------------------------- answers

function counts(until: number, server: string, now: number) {
	return (until == 0 || until > now) && (server == "" || server == thisServer);
}

/** A group's own grants that count now, as node -> value; a negation wins over a grant of the same node. */
function grantsOf(list: Grant[], now: number) {
	const map = new Map<string, boolean>();
	for (const grant of list) {
		if (!counts(grant.until, grant.server, now)) continue;
		if (map.has(grant.node) && !map.get(grant.node)) continue;
		map.set(grant.node, grant.value);
	}
	return map;
}

/** The groups a player is in now, highest weight first, `default` last. */
export function groupsOf(user: User | null, now: number) {
	const list: Group[] = [];
	if (user != null) {
		for (const membership of user.groups) {
			const group = groupNamed(membership.group);
			if (group != null && group.name != DEFAULT_GROUP && counts(membership.until, membership.server, now) && !list.includes(group)) list.push(group);
		}
	}
	list.sort((a, b) => b.weight - a.weight);
	list.push(groupNamed(DEFAULT_GROUP)!);
	return list;
}

/** A group and what it inherits, depth first, each once; a cycle stops where it closes. */
function withParents(group: Group, into: Group[]) {
	if (into.includes(group)) return;

	into.push(group);
	for (const name of group.inherits) {
		const parent = groupNamed(name);
		if (parent != null) withParents(parent, into);
	}
}

/**
 * Where a player's answers come from, first first: his own grants, then each
 * of his groups with what it inherits. A node is answered by the first source
 * that says anything about it.
 */
export function sourcesOf(user: User | null, now: number) {
	const sources: Map<string, boolean>[] = [];
	if (user != null) sources.push(grantsOf(user.grants, now));

	const chain: Group[] = [];
	for (const group of groupsOf(user, now)) withParents(group, chain);
	for (const group of chain) sources.push(grantsOf(group.grants, now));
	return sources;
}

/** The source's answer for a node: the node itself, then `a.b.*`, `a.*`, `*`; -1 when it says nothing. */
function lookup(source: Map<string, boolean>, node: string) {
	if (source.has(node)) return source.get(node) ? 1 : 0;

	let prefix = node;
	while (true) {
		const dot = prefix.lastIndexOf(".");
		if (dot < 0) break;

		prefix = prefix.substring(0, dot);
		const wildcard = `${prefix}.*`;
		if (source.has(wildcard)) return source.get(wildcard) ? 1 : 0;
	}
	if (source.has("*")) return source.get("*") ? 1 : 0;
	return -1;
}

/** Whether the sources give the node; a node none of them names is its declared default. */
export function answer(sources: Map<string, boolean>[], node: string) {
	for (const source of sources) {
		const found = lookup(source, node);
		if (found >= 0) return found == 1;
	}
	const known = declared.find(each => each.node == node);
	return known != null && known.byDefault;
}

/** The grant that answers a node for `perms check`: "<source>: <node>", or "the default". */
export function explain(user: User | null, node: string, now: number) {
	const names: string[] = [];
	if (user != null) names.push(`player ${user.id}`);

	const chain: Group[] = [];
	for (const group of groupsOf(user, now)) withParents(group, chain);
	for (const group of chain) names.push(`group ${group.name}`);

	const sources = sourcesOf(user, now);
	for (let i = 0; i < sources.length; i++) {
		if (lookup(sources[i], node) >= 0) return names[i];
	}
	return "the default";
}

/** The player's primary group: the active one of the highest weight. */
export function primaryGroup(user: User | null, now: number) {
	return groupsOf(user, now)[0].name;
}

/** The nearest moment a grant or a membership of these players, or of any group, ends; 0 for none. */
export function nextExpiry(online: User[], now: number) {
	const ends: number[] = [];
	for (const group of groups) group.grants.forEach(grant => ends.push(grant.until));
	for (const user of online) {
		user.grants.forEach(grant => ends.push(grant.until));
		user.groups.forEach(membership => ends.push(membership.until));
	}
	return ends.filter(until => until > now).reduce((next, until) => (next == 0 || until < next ? until : next), 0);
}

// ---------------------------------------------------------------- changes

/** The player's entry, made when he has none yet. */
function userOrNew(id: string, name: string) {
	const found = userWith(id);
	if (found != null) return found;

	const user: User = { id: normalId(id), name, password: "", groups: [], grants: [] };
	users.push(user);
	return user;
}

function grantsOfOwner(change: Change) {
	if (change.user != "") return userOrNew(change.user, "").grants;
	return groupNamed(change.group)!.grants;
}

function setGrant(list: Grant[], change: Change) {
	const kept = list.filter(grant => !(grant.node == change.node && grant.server == change.server));
	if (change.op == "grant") kept.push({ node: change.node, value: change.value, until: change.until, server: change.server });
	list.length = 0;
	for (const grant of kept) list.push(grant);
}

/** Whether `parent` already inherits `group`, so adding it as a parent would close a loop. */
function inherits(from: Group, wanted: string) {
	const chain: Group[] = [];
	withParents(from, chain);
	return chain.some(group => group.name == wanted);
}

/** Applies a change; what made it skip, or "" when it was applied. */
export function apply(change: Change): SkipCode {
	const op = change.op;
	if (op == "grant" || op == "revoke") return applyGrant(change);
	if (op == "memberAdd" || op == "memberRemove") return applyMembership(change);
	if (op == "userCreate") return applyUserCreate(change);
	return applyGroup(change);
}

function applyGrant(change: Change): SkipCode {
	if (change.node == "") return "invalid";
	if (change.user == "" && groupNamed(change.group) == null) return "groupMissing";
	if (change.op == "revoke" && change.user != "" && userWith(change.user) == null) return "userMissing";

	setGrant(grantsOfOwner(change), change);
	return "";
}

function applyMembership(change: Change): SkipCode {
	if (change.user == "" || change.group == "") return "invalid";
	if (change.op == "memberRemove" && userWith(change.user) == null) return "userMissing";
	if (groupNamed(change.group) == null) return "groupMissing";

	const user = userOrNew(change.user, "");
	user.groups = user.groups.filter(membership => !(membership.group == change.group && membership.server == change.server));
	if (change.op == "memberAdd") user.groups.push({ group: change.group, until: change.until, server: change.server });
	return "";
}

function applyUserCreate(change: Change): SkipCode {
	if (change.user == "") return "invalid";

	const user = userOrNew(change.user, change.name);
	if (change.name != "") user.name = change.name;
	return "";
}

function applyGroup(change: Change): SkipCode {
	const op = change.op;
	const group = groupNamed(change.group);
	if (change.group == "") return "invalid";

	if (op == "groupCreate") {
		if (group != null) return "groupExists";

		groups.push({ name: change.group, weight: change.weight, inherits: [], grants: [] });
		return "";
	}

	if (group == null) return "groupMissing";
	if (op == "groupDelete") return deleteGroup(group);
	if (op == "groupWeight") {
		group.weight = change.weight;
		return "";
	}

	const parent = groupNamed(change.parent);
	if (parent == null) return "parentMissing";
	group.inherits = group.inherits.filter(name => name != parent.name);
	if (op == "parentRemove") return "";

	if (parent == group || inherits(parent, group.name)) return "cycle";
	group.inherits.push(parent.name);
	return "";
}

function deleteGroup(group: Group): SkipCode {
	if (group.name == DEFAULT_GROUP) return "defaultGroup";

	groups = groups.filter(each => each != group);
	for (const each of groups) each.inherits = each.inherits.filter(name => name != group.name);
	for (const user of users) user.groups = user.groups.filter(membership => membership.group != group.name);
	return "";
}

/** A skip code in words, for the console and the editor's `reason`. */
export function reasonOf(code: SkipCode, change: Change) {
	if (code == "groupMissing") return `There is no group "${change.group}"`;
	if (code == "groupExists") return `The group "${change.group}" exists already`;
	if (code == "userMissing") return `There is no player "${change.user}"`;
	if (code == "parentMissing") return `There is no group "${change.parent}" to inherit`;
	if (code == "cycle") return `"${change.group}" would inherit itself through "${change.parent}"`;
	if (code == "defaultGroup") return `The group "default" cannot be deleted`;
	return `The change "${change.op}" is not complete`;
}

/** Drops grants and memberships that ended; whether any did, so the store writes them out. */
export function dropExpired(now: number) {
	const before = countEntries();
	for (const group of groups) group.grants = group.grants.filter(grant => grant.until == 0 || grant.until > now);
	for (const user of users) {
		user.grants = user.grants.filter(grant => grant.until == 0 || grant.until > now);
		user.groups = user.groups.filter(membership => membership.until == 0 || membership.until > now);
	}
	return countEntries() != before;
}

function countEntries() {
	let count = 0;
	for (const group of groups) count += group.grants.length;
	for (const user of users) count += user.grants.length + user.groups.length;
	return count;
}
