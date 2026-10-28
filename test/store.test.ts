// The editor's store on its own: the routes of the contract, the key, expiry.
import { describe, expect, it } from "vitest";
import { handle, memorySessions } from "../store/handler.ts";

const BASE = "http://store";

function call(sessions: ReturnType<typeof memorySessions>, path: string, init: RequestInit = {}, now = 0) {
	return handle(new Request(`${BASE}${path}`, init), sessions, now);
}

function post(body: unknown, key = "") {
	return { method: "POST", body: JSON.stringify(body), headers: key == "" ? {} : { authorization: `Bearer ${key}` } };
}

describe("the store", () => {
	it("a session round trip", async () => {
		const sessions = memorySessions();
		const created = await (await call(sessions, "/session", post({ version: 1 }))).json();
		expect(created.id).toMatch(/^[a-z0-9]{10}$/);
		expect(created.key).toHaveLength(32);

		expect(await (await call(sessions, `/session/${created.id}`)).json()).toEqual({ version: 1, revision: 0 });
		expect(await (await call(sessions, `/session/${created.id}/changes`, post({ base: 0, changes: [{ op: "groupCreate", group: "a" }] }))).json()).toEqual({ revision: 1 });

		const polled = await (await call(sessions, `/session/${created.id}/changes?after=0`, { headers: { authorization: `Bearer ${created.key}` } })).json();
		expect(polled).toEqual([{ revision: 1, changes: [{ op: "groupCreate", group: "a" }] }]);

		await call(sessions, `/session/${created.id}/applied`, post({ revision: 1, done: [], skipped: [] }, created.key));
		const status = await (await call(sessions, `/session/${created.id}/status`)).json();
		expect(status.applied).toEqual([{ revision: 1, done: [], skipped: [] }]);
	});

	it("the server's routes need its key; an hour later the session is gone", async () => {
		const sessions = memorySessions();
		const { id } = await (await call(sessions, "/session", post({}))).json();

		expect((await call(sessions, `/session/${id}/changes?after=0`)).status).toBe(401);
		expect((await call(sessions, `/session/${id}`, {}, 60 * 60 * 1000)).status).toBe(404);
	});

	it("its /editor leads to the page with this store", async () => {
		const response = await call(memorySessions(), "/editor");
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("https://amxts.github.io/modules/perms/editor?store=http%3A%2F%2Fstore");
	});

	it("bad bodies are refused", async () => {
		const sessions = memorySessions();
		expect((await call(sessions, "/session", { method: "POST", body: "[]" })).status).toBe(400);
		expect((await call(sessions, "/session", { method: "POST", body: "x".repeat(300 * 1024) })).status).toBe(400);

		const { id } = await (await call(sessions, "/session", post({}))).json();
		expect((await call(sessions, `/session/${id}/changes`, post({ changes: [] }))).status).toBe(400);
	});
});
