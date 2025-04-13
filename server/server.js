import { serve } from "https://deno.land/std/http/server.ts";

async function handler(req) {
		if (req.method !== "POST")
				return new Response("Method Not Allowed", { status: 405 });
		let body;
		try {
				body = await req.json();
		} catch {
				return new Response(
						JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parseerror" }, id: null }),
						{ headers: { "Content-Type": "application/json" } }
				);
		}
		let result, error;
		switch (body.method) {
				case "sys.info":
						result = {
								hostname: await Deno.hostname(),
								os: Deno.build.os,
								arch: Deno.build.arch,
								deno: Deno.version.deno
						};
						break;
				case "ping":
						result = "pong";
						break;
				default:
						error = { code: -32601, message: "Method not found" };
		}
		const resBody = { jsonrpc: "2.0", id: body.id, ...(error ? { error } : {result }) };
		return new Response(JSON.stringify(resBody), { headers: { "Content-Type":"application/json" } });
}

serve(handler, { port: 8000 });
