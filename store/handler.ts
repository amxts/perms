/**
 * The perms editor's store: a game server uploads a session, the web editor
 * reads it and posts changes, the server polls for them and says what it
 * applied. One handler for the Cloudflare Worker (worker.ts) and the local
 * store (dev.ts); only where the records live differs.
 */

/** Where sessions are kept: D1 in the Worker, a Map locally and in tests. */
export interface Sessions {
	get: (id: string) => Promise<SessionRecord | null>;
	put: (id: string, record: SessionRecord) => Promise<void>;
	delete: (id: string) => Promise<void>;
}

/** A session as the store keeps it. */
export interface SessionRecord {
	key: string;
	/** The session the server uploaded, as it sent it. */
	data: Record<string, unknown>;
	expiresAt: number;
	revisions: { revision: number; changes: unknown[] }[];
	applied: unknown[];
}

const LIFETIME = 60 * 60 * 1000;
const MAX_BODY = 256 * 1024;
const MAX_CHANGES = 1000;
const ID_LETTERS = "abcdefghijklmnopqrstuvwxyz0123456789";
const PAGE = "https://amxts.github.io/modules/perms/editor";

const CORS = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
	"access-control-allow-headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });
}

function error(status: number, message: string) {
	return json({ error: message }, status);
}

/** A random id of `length` letters and digits: the session's 10 (~51 bits) a person may type, the key's 32. */
function randomId(length: number) {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(bytes, byte => ID_LETTERS[byte % ID_LETTERS.length]).join("");
}

async function readBody(request: Request) {
	const text = await request.text();
	if (text.length > MAX_BODY) return null;

	try {
		const body: unknown = JSON.parse(text);
		return typeof body == "object" && body != null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function revisionOf(record: SessionRecord) {
	return record.revisions.length;
}

export async function handle(request: Request, sessions: Sessions, now = Date.now()) {
	if (request.method == "OPTIONS") return new Response(null, { status: 204, headers: CORS });

	const url = new URL(request.url);
	const [, root, id, action] = url.pathname.split("/");
	// The store's own link to the editor: the browser keeps the #session through the redirect.
	if (root == "editor" && id == null) return Response.redirect(`${PAGE}?store=${encodeURIComponent(url.origin)}`, 302);
	if (root != "session") return error(404, "Not found");

	if (id == null || id == "") {
		if (request.method != "POST") return error(405, "Method not allowed");
		return create(request, sessions, now);
	}

	const record = await sessions.get(id);
	if (record == null || record.expiresAt <= now) {
		if (record != null) await sessions.delete(id);
		return error(404, "The session has expired or does not exist");
	}

	const authorized = request.headers.get("authorization") == `Bearer ${record.key}`;
	const route = `${request.method} ${action ?? ""}`;

	if (route == "GET ") return json({ ...record.data, revision: revisionOf(record) });
	if (route == "GET status") return json({ revision: revisionOf(record), expiresAt: new Date(record.expiresAt).toISOString(), applied: record.applied });
	if (route == "POST changes") return postChanges(request, id, record, sessions);
	if (!authorized) return error(401, "The server's key is required");

	if (route == "GET changes") {
		const after = Number(url.searchParams.get("after") ?? "0");
		return json(record.revisions.filter(entry => entry.revision > after));
	}

	if (route == "POST applied") {
		const body = await readBody(request);
		if (body == null) return error(400, "The body is not a JSON object");

		record.applied.push(body);
		await sessions.put(id, record);
		return json({ ok: true });
	}

	if (route == "DELETE ") {
		await sessions.delete(id);
		return json({ ok: true });
	}

	return error(405, "Method not allowed");
}

async function create(request: Request, sessions: Sessions, now: number) {
	const data = await readBody(request);
	if (data == null) return error(400, "The session is not a JSON object or is larger than 256 KB");

	const id = randomId(10);
	const key = randomId(32);
	await sessions.put(id, { key, data, expiresAt: now + LIFETIME, revisions: [], applied: [] });
	return json({ id, key }, 201);
}

async function postChanges(request: Request, id: string, record: SessionRecord, sessions: Sessions) {
	const body = await readBody(request);
	const changes = body?.changes;
	if (!Array.isArray(changes) || changes.length == 0 || changes.length > MAX_CHANGES) return error(400, "Expected { base, changes: [...] } with 1 to 1000 changes");

	const revision = revisionOf(record) + 1;
	record.revisions.push({ revision, changes });
	await sessions.put(id, record);
	return json({ revision });
}

/** Sessions in memory: the local store and the tests. */
export function memorySessions(): Sessions {
	const records = new Map<string, string>();
	return {
		get: async (id) => {
			const text = records.get(id);
			return text == null ? null : (JSON.parse(text) as SessionRecord);
		},
		put: async (id, record) => {
			records.set(id, JSON.stringify(record));
		},
		delete: async (id) => {
			records.delete(id);
		},
	};
}
