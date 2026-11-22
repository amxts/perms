/**
 * `perms import users.ini`: AMX Mod X's admins, each line a player with his
 * flags as `amxx.*` grants of his own, added to his entry when he has one.
 *
 *     "STEAM_0:0:123456" "" "abcdefghijklmnopqrstu" "ce"
 *     "Bob"              "secret" "abc"               "a"
 */
import * as fs from "@amxts/core/fs";
import { server } from "@amxts/core";
import type { Grant, User } from "./model";
import { allUsers, normalId } from "./model";
import { FLAGS, sha256 } from "./players";

/** The quoted words of a line, or the plain ones between spaces. */
function wordsOf(line: string) {
	const words: string[] = [];
	let rest = line.trim();
	while (rest != "") {
		const quoted = rest.startsWith("\"");
		const end = quoted ? rest.indexOf("\"", 1) : rest.indexOf(" ");
		const stop = end < 0 ? rest.length : end;
		words.push(rest.substring(quoted ? 1 : 0, stop));
		rest = rest.substring(Math.min(rest.length, stop + 1)).trim();
	}
	return words;
}

function userOfLine(words: string[]) {
	const auth = words[0];
	const password = words.length > 1 ? words[1] : "";
	const access = words.length > 2 ? words[2] : "";
	const account = words.length > 3 ? words[3] : "";

	const id = account.includes("c") ? auth : account.includes("d") ? `ip:${auth}` : `name:${auth}`;
	const grants = FLAGS.filter(flag => access.includes(flag.letter)).map<Grant>(flag => ({ node: `amxx.${flag.name}`, value: true, until: 0, server: "" }));
	const user: User = {
		id: normalId(id),
		name: id.startsWith("name:") ? auth : "",
		password: !account.includes("e") && password != "" ? sha256(password) : "",
		groups: [],
		grants,
	};
	return user;
}

/** An imported line on a player perms has already: his flags are added, his name, groups and other permissions stay. */
function merge(known: User, imported: User) {
	for (const grant of imported.grants) {
		if (!known.grants.some(each => each.node == grant.node && each.server == "")) known.grants.push(grant);
	}
	if (known.name == "") known.name = imported.name;
	if (known.password == "") known.password = imported.password;
}

/** Reads `users.ini` (or another file of the configs folder) into the model; how many players it held, -1 when there is no file. */
export function importUsers(file: string) {
	const text = fs.readFileSync(`${server.configsDir}/${file}`);
	if (text == null) return -1;

	const lines = text.split("\n").map<string>(line => line.trim()).filter(line => line != "" && !line.startsWith(";") && !line.startsWith("//"));
	const users = allUsers();
	for (const line of lines) {
		const words = wordsOf(line);
		if (words.length < 3 || words[0] == "") continue;

		const user = userOfLine(words);
		const known = users.find(each => each.id == user.id);
		if (known == null) users.push(user);
		else merge(known, user);
	}
	return lines.length;
}
