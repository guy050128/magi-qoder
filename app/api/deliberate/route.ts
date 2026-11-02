import { deliberateMelchior, deliberateBalthasar, deliberateCasper } from "@/app/actions";
import { createDeliberationStream, DeliberationInputError, readDeliberationTopic } from "@/lib/deliberation-stream";
import type { MagiId } from "@/types/magi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

const ACTIONS = { MELCHIOR: deliberateMelchior, BALTHASAR: deliberateBalthasar, CASPER: deliberateCasper };

export async function POST(request: Request) {
  try {
    const topic = await readDeliberationTopic(request);
    // These calls run inside one server handler, outside the browser action queue.
    return new Response(createDeliberationStream(topic, (id: MagiId, fullTopic) => ACTIONS[id](fullTopic)), {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const status = error instanceof DeliberationInputError ? error.status : 400;
    return Response.json({ error: error instanceof DeliberationInputError ? error.message : "Invalid request" }, { status });
  }
}
