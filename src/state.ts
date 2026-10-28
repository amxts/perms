/**
 * Where the permissions live - the file or MySQL - and the one way they
 * change: `commit(changes)` applies them to the model, writes them to the
 * store and works the online players out again.
 */
import { setInterval } from "@amxts/core";
import type { Change, SkipCode } from "./model";
import { apply, dropExpired, reasonOf } from "./model";
import * as database from "./db-store";
import { filePath, readFile, setFile, writeFile } from "./file-store";
import { refreshAll } from "./players";

/** A change the model refused, and why. */
export interface Skipped {
	change: Change;
	code: SkipCode;
	reason: string;
}

export interface Committed {
	done: Change[];
	skipped: Skipped[];
}

const POLL_MS = 5000;

/** Starts the store: MySQL when `url` is given, else the file; reads it. */
export async function open(file: string, url: string) {
	setFile(file);
	if (url == "") {
		reloadFromFile();
		return;
	}

	database.useDatabase(url);
	try {
		await database.createTables();
		await database.readDatabase();
		console.log("[perms] permissions read from MySQL");
	} catch (error) {
		console.error(`[perms] MySQL: ${error.message} - trying again every ${POLL_MS / 1000} s`);
	}
	refreshAll();
	setInterval(() => pollDatabase(), POLL_MS);
}

function reloadFromFile() {
	if (!readFile()) {
		console.error(`[perms] ${filePath()} could not be read - the permissions read before stay`);
		return;
	}
	refreshAll();
}

async function pollDatabase() {
	try {
		if (!(await database.changedElsewhere())) return;
		await database.readDatabase();
		refreshAll();
	} catch (error) {
		console.error(`[perms] MySQL: ${error.message}`);
	}
}

/** Reads the store again: `perms reload`, `amx_reloadadmins`. */
export async function reload() {
	if (!database.usesDatabase()) {
		reloadFromFile();
		return;
	}

	await database.readDatabase();
	refreshAll();
}

/** Applies changes in order, writes those that applied, and works the players out again. */
export async function commit(changes: Change[]) {
	const committed: Committed = { done: [], skipped: [] };
	for (const change of changes) {
		const code = apply(change);
		if (code == "") committed.done.push(change);
		else committed.skipped.push({ change, code, reason: reasonOf(code, change) });
	}
	if (committed.done.length == 0) return committed;

	dropExpired(Date.now());
	if (database.usesDatabase()) await database.writeChanges(committed.done);
	else writeFile();
	refreshAll();
	return committed;
}

/** Writes the whole model to the store, after an import. */
export async function writeEverything() {
	if (database.usesDatabase()) await database.writeAll();
	else writeFile();
	refreshAll();
}

export function storageName() {
	return database.usesDatabase() ? "mysql" : "file";
}
