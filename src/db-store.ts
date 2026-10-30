/**
 * The permissions in MySQL, for servers that share one set: the tables are
 * made on the first start, every change is written as it happens and bumps
 * `perms_revision`, and each server reads everything again when the
 * revision it polls has moved.
 */
import { Database } from "@amxts/core";
import type { Change, Grant, Group, Membership, User } from "./model";
import { allGroups, allUsers, groupNamed, replaceAll, userWith } from "./model";

interface GroupRow {
	name: string;
	weight: number;
	inherits: string;
}

interface GrantRow {
	owner: string;
	node: string;
	value: number;
	until: number;
	server: string;
}

interface UserRow {
	id: string;
	name: string;
	password: string;
}

interface MemberRow {
	user: string;
	grp: string;
	until: number;
	server: string;
}

interface RevisionRow {
	revision: number;
}

const TABLES = [
	"CREATE TABLE IF NOT EXISTS perms_groups (name VARCHAR(64) PRIMARY KEY, weight INT NOT NULL DEFAULT 0, inherits TEXT NOT NULL)",
	"CREATE TABLE IF NOT EXISTS perms_grants (owner VARCHAR(96) NOT NULL, node VARCHAR(128) NOT NULL, value BOOLEAN NOT NULL, until BIGINT NOT NULL DEFAULT 0, server VARCHAR(64) NOT NULL DEFAULT '', PRIMARY KEY (owner, node, server))",
	"CREATE TABLE IF NOT EXISTS perms_users (id VARCHAR(96) PRIMARY KEY, name VARCHAR(64) NOT NULL DEFAULT '', password VARCHAR(80) NOT NULL DEFAULT '')",
	"CREATE TABLE IF NOT EXISTS perms_members (user VARCHAR(96) NOT NULL, grp VARCHAR(64) NOT NULL, until BIGINT NOT NULL DEFAULT 0, server VARCHAR(64) NOT NULL DEFAULT '', PRIMARY KEY (user, grp, server))",
	"CREATE TABLE IF NOT EXISTS perms_revision (id INT PRIMARY KEY, revision INT NOT NULL)",
	"INSERT IGNORE INTO perms_revision (id, revision) VALUES (1, 0)",
];

let db: Database | null = null;
let revision = -1;

export function useDatabase(url: string) {
	db = new Database(url);
}

export function usesDatabase() {
	return db != null;
}

export async function createTables() {
	for (const sql of TABLES) await db!.execute(sql, []);
}

function grantFrom(row: GrantRow): Grant {
	return { node: row.node, value: row.value != 0, until: row.until, server: row.server };
}

/** Reads every table into the model. */
export async function readDatabase() {
	const found = await db!.query<RevisionRow>("SELECT revision FROM perms_revision WHERE id = 1", []);
	const groupRows = await db!.query<GroupRow>("SELECT name, weight, inherits FROM perms_groups", []);
	const grantRows = await db!.query<GrantRow>("SELECT owner, node, value, until, server FROM perms_grants", []);
	const userRows = await db!.query<UserRow>("SELECT id, name, password FROM perms_users", []);
	const memberRows = await db!.query<MemberRow>("SELECT user, grp, until, server FROM perms_members", []);

	const groups = groupRows.map<Group>(row => ({
		name: row.name,
		weight: row.weight,
		inherits: row.inherits.split(",").filter(name => name != ""),
		grants: grantRows.filter(grant => grant.owner == `group:${row.name}`).map<Grant>(grantFrom),
	}));
	const users = userRows.map<User>(row => ({
		id: row.id,
		name: row.name,
		password: row.password,
		groups: memberRows.filter(member => member.user == row.id).map<Membership>(member => ({ group: member.grp, until: member.until, server: member.server })),
		grants: grantRows.filter(grant => grant.owner == `user:${row.id}`).map<Grant>(grantFrom),
	}));
	replaceAll(groups, users);
	revision = found.length > 0 ? found[0].revision : 0;
}

/** Whether another server changed the set since it was read. */
export async function changedElsewhere() {
	const found = await db!.query<RevisionRow>("SELECT revision FROM perms_revision WHERE id = 1", []);
	return found.length > 0 && found[0].revision != revision;
}

async function saveGroup(name: string) {
	const group = groupNamed(name);
	if (group == null) return;
	await db!.execute("INSERT INTO perms_groups (name, weight, inherits) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE weight = VALUES(weight), inherits = VALUES(inherits)", [group.name, group.weight, group.inherits.join(",")]);
}

async function saveUser(id: string) {
	const user = userWith(id);
	if (user == null) return;
	await db!.execute("INSERT INTO perms_users (id, name, password) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password)", [user.id, user.name, user.password]);
}

async function saveGrant(owner: string, grant: Grant) {
	await db!.execute("INSERT INTO perms_grants (owner, node, value, until, server) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), until = VALUES(until)", [owner, grant.node, grant.value, grant.until, grant.server]);
}

/** Writes one change that the model applied. */
async function writeChange(change: Change) {
	const owner = change.user != "" ? `user:${userWith(change.user)!.id}` : `group:${change.group}`;
	const op = change.op;

	if (op == "grant") {
		if (change.user != "") await saveUser(change.user);
		await saveGrant(owner, { node: change.node, value: change.value, until: change.until, server: change.server });
		return;
	}
	if (op == "revoke") {
		await db!.execute("DELETE FROM perms_grants WHERE owner = ? AND node = ? AND server = ?", [owner, change.node, change.server]);
		return;
	}
	if (op == "memberAdd") {
		await saveUser(change.user);
		await db!.execute("INSERT INTO perms_members (user, grp, until, server) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE until = VALUES(until)", [userWith(change.user)!.id, change.group, change.until, change.server]);
		return;
	}
	if (op == "memberRemove") {
		await db!.execute("DELETE FROM perms_members WHERE user = ? AND grp = ? AND server = ?", [userWith(change.user)!.id, change.group, change.server]);
		return;
	}
	if (op == "userCreate" || op == "userPassword") {
		await saveUser(change.user);
		return;
	}
	if (op == "groupDelete") {
		await db!.execute("DELETE FROM perms_groups WHERE name = ?", [change.group]);
		await db!.execute("DELETE FROM perms_grants WHERE owner = ?", [owner]);
		await db!.execute("DELETE FROM perms_members WHERE grp = ?", [change.group]);
		for (const group of allGroups()) await saveGroup(group.name);
		return;
	}
	await saveGroup(change.group);
}

/** Writes the changes the model applied and moves the revision, so the other servers read them. */
export async function writeChanges(changes: Change[]) {
	for (const change of changes) await writeChange(change);
	await db!.execute("UPDATE perms_revision SET revision = revision + 1 WHERE id = 1", []);
	const found = await db!.query<RevisionRow>("SELECT revision FROM perms_revision WHERE id = 1", []);
	if (found.length > 0) revision = found[0].revision;
}

/** Writes the whole model, for `perms import` into an empty database. */
export async function writeAll() {
	for (const group of allGroups()) {
		await saveGroup(group.name);
		for (const grant of group.grants) await saveGrant(`group:${group.name}`, grant);
	}
	for (const user of allUsers()) {
		await saveUser(user.id);
		for (const grant of user.grants) await saveGrant(`user:${user.id}`, grant);
		for (const membership of user.groups) await db!.execute("INSERT INTO perms_members (user, grp, until, server) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE until = VALUES(until)", [user.id, membership.group, membership.until, membership.server]);
	}
	await db!.execute("UPDATE perms_revision SET revision = revision + 1 WHERE id = 1", []);
}
