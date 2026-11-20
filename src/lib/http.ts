/**
 * Runs a route's work and turns any failure into a 502 with a plain message, never a stack trace.
 *
 * `edgeSeconds` is for a route whose upstream takes tens of seconds: the CDN keeps the answer that long, then
 * goes on serving it for up to an hour while it fetches a fresh one in the background, so no visitor waits on
 * the upstream. Only for data that is harmless a little old; a price someone buys at must stay uncached.
 */
export async function respond<T>(work: () => Promise<T>, edgeSeconds = 0): Promise<Response> {
  const cache = edgeSeconds > 0 ? `public, max-age=0, s-maxage=${edgeSeconds}, stale-while-revalidate=3600` : "no-store";
  try {
    return Response.json(await work(), { headers: { "Cache-Control": cache } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "That data is unavailable right now." }, { status: 502 });
  }
}

export const badRequest = (message: string) => Response.json({ error: message }, { status: 400 });
