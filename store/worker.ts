/**
 * The store as a Cloudflare Worker: sessions in D1 (schema.sql), a request
 * limit per address, and a cron that drops expired sessions.
 */
import type { SessionRecord, Sessions } from "./handler.ts";
import { handle } from "./handler.ts";

interface D1Statement {
	bind: (...values: unknown[]) => D1Statement;
	first: <T>() => Promise<T | null>;
	run: () => Promise<unknown>;
}

interface Env {
	DB: { prepare: (sql: string) => D1Statement };
	LIMITER: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
}

function d1Sessions(env: Env): Sessions {
	return {
		get: async (id) => {
			const row = await env.DB.prepare("SELECT record FROM sessions WHERE id = ?").bind(id).first<{ record: string }>();
			return row == null ? null : (JSON.parse(row.record) as SessionRecord);
		},
		put: async (id, record) => {
			await env.DB.prepare("INSERT OR REPLACE INTO sessions (id, record, expires) VALUES (?, ?, ?)").bind(id, JSON.stringify(record), record.expiresAt).run();
		},
		delete: async (id) => {
			await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
		},
	};
}

export default {
	async fetch(request: Request, env: Env) {
		const address = request.headers.get("cf-connecting-ip") ?? "";
		const { success } = await env.LIMITER.limit({ key: address });
		if (!success) return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

		return handle(request, d1Sessions(env));
	},

	async scheduled(_event: unknown, env: Env) {
		await env.DB.prepare("DELETE FROM sessions WHERE expires < ?").bind(Date.now()).run();
	},
};
