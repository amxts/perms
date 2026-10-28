/**
 * The permissions in a config file, `perms.yaml` by default (or `.json`),
 * read and written whole through config-core:
 *
 *     groups:
 *       admin:
 *         weight: 50
 *         inherits: [vip]
 *         permissions: [amxx.kick, "kz.admin.*", "-kz.admin.wipe", { node: kz.vip, until: 2026-12-01T00:00:00Z }]
 *     users:
 *       - id: "STEAM_0:1:12345"
 *         name: Bob
 *         groups: [admin, { group: vip, until: 2026-12-01T00:00:00Z, server: kz1 }]
 *         permissions: [kz.admin.wipe]
 */
import * as fs from "@amxts/core/fs";
import * as configs from "@amxts/config-core";
import type { ConfigNode } from "@amxts/config-core";
import type { Grant, Group, Membership, User } from "./model";
import { allGroups, allUsers, normalId, replaceAll } from "./model";
import { momentOf, textOf } from "./time";

let fileName = "perms";

export function setFile(name: string) {
	fileName = name;
}

/** The file's path, for the console. */
export function filePath() {
	return configs.resolve(fileName);
}

function grantOf(item: ConfigNode): Grant {
	if (item.kind == "object") {
		const node = item.getString("node");
		const negated = node.startsWith("-");
		return { node: negated ? node.substring(1) : node, value: !negated && item.getBoolean("value", true), until: momentOf(item.getString("until")), server: item.getString("server") };
	}
	const text = item.getString();
	const negated = text.startsWith("-");
	return { node: negated ? text.substring(1) : text, value: !negated, until: 0, server: "" };
}

function membershipOf(item: ConfigNode): Membership {
	if (item.kind == "object") return { group: item.getString("group"), until: momentOf(item.getString("until")), server: item.getString("server") };
	return { group: item.getString(), until: 0, server: "" };
}

function grantsAt(node: ConfigNode, path: string) {
	return node.values(path).map<Grant>(grantOf).filter(grant => grant.node != "");
}

/** Reads the file into the model; `false`, with the model untouched, when it could not be read. */
export function readFile() {
	const root = configs.read(fileName);
	if (root.kind != "object") return false;
	if (root.keys().length == 0 && hasContent(root.file)) return false;

	const groups: Group[] = [];
	for (const name of root.keys("groups")) {
		const group = root.get(`groups.${name}`)!;
		groups.push({ name, weight: group.getNumber("weight"), inherits: group.getStrings("inherits"), grants: grantsAt(group, "permissions") });
	}

	const users: User[] = [];
	for (const entry of root.values("users")) {
		const id = entry.getString("id");
		if (id == "") continue;

		users.push({
			id: normalId(id),
			name: entry.getString("name"),
			password: entry.getString("password"),
			groups: entry.values("groups").map<Membership>(membershipOf).filter(membership => membership.group != ""),
			grants: grantsAt(entry, "permissions"),
		});
	}

	replaceAll(groups, users);
	return true;
}

/** Whether a file has more than comments: one that does and reads as empty failed to read, and config-core said where. */
function hasContent(path: string) {
	const text = fs.readFileSync(path) ?? "";
	return text.split("\n").some(line => line.trim() != "" && !line.trim().startsWith("#") && !line.trim().startsWith("//"));
}

/** A plain grant as text (`node`, `-node`), one with an expiry or a server as an object. */
function writeGrant(root: ConfigNode, path: string, grant: Grant) {
	const text = grant.value ? grant.node : `-${grant.node}`;
	if (grant.until == 0 && grant.server == "") return root.set(path, text);

	root.set(`${path}.node`, text);
	if (grant.until != 0) root.set(`${path}.until`, textOf(grant.until));
	if (grant.server != "") root.set(`${path}.server`, grant.server);
	return true;
}

function writeMembership(root: ConfigNode, path: string, membership: Membership) {
	if (membership.until == 0 && membership.server == "") return root.set(path, membership.group);

	root.set(`${path}.group`, membership.group);
	if (membership.until != 0) root.set(`${path}.until`, textOf(membership.until));
	if (membership.server != "") root.set(`${path}.server`, membership.server);
	return true;
}

/** Writes the model into the file, keeping its comments on lines of their own. */
export function writeFile() {
	const root = configs.read(fileName);
	root.remove("groups");
	root.remove("users");

	for (const group of allGroups()) {
		const at = `groups.${group.name}`;
		root.setNumber(`${at}.weight`, group.weight);
		if (group.inherits.length > 0) root.setStrings(`${at}.inherits`, group.inherits);
		group.grants.forEach((grant, i) => writeGrant(root, `${at}.permissions[${i}]`, grant));
	}

	allUsers().forEach((user, i) => {
		const at = `users[${i}]`;
		root.set(`${at}.id`, user.id);
		if (user.name != "") root.set(`${at}.name`, user.name);
		if (user.password != "") root.set(`${at}.password`, user.password);
		user.groups.forEach((membership, j) => writeMembership(root, `${at}.groups[${j}]`, membership));
		user.grants.forEach((grant, j) => writeGrant(root, `${at}.permissions[${j}]`, grant));
	});

	return root.save();
}
