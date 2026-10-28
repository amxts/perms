/**
 * The store on this machine, sessions in memory: `node store/dev.ts [port]`
 * (8787 by default). For the editor page and the module's tests.
 */
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import process from "node:process";
import { handle, memorySessions } from "./handler.ts";

const sessions = memorySessions();

async function serve(incoming: IncomingMessage, outgoing: ServerResponse) {
	const chunks: Buffer[] = [];
	for await (const chunk of incoming) chunks.push(chunk as Buffer);

	const hasBody = incoming.method != "GET" && incoming.method != "HEAD" && chunks.length > 0;
	const request = new Request(`http://${incoming.headers.host}${incoming.url}`, {
		method: incoming.method,
		headers: incoming.headers as Record<string, string>,
		body: hasBody ? Buffer.concat(chunks) : undefined,
	});
	const response = await handle(request, sessions);
	outgoing.writeHead(response.status, Object.fromEntries(response.headers));
	outgoing.end(Buffer.from(await response.arrayBuffer()));
}

/** Starts the store on `port` (0 for any free one); resolves to the server, listening. */
export function startStore(port = 8787) {
	const server = createServer((incoming, outgoing) => {
		serve(incoming, outgoing).catch((reason) => {
			outgoing.writeHead(500);
			outgoing.end(String(reason));
		});
	});
	return new Promise<typeof server>(resolve => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.main) {
	const port = Number(process.argv[2] ?? "8787");
	startStore(port).then(() => console.log(`perms store on http://127.0.0.1:${port}`));
}
