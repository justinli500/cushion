/** Runs a route's work and turns any failure into a 502 with a plain message, never a stack trace. */
export async function respond<T>(work: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await work(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "That data is unavailable right now." }, { status: 502 });
  }
}

export const badRequest = (message: string) => Response.json({ error: message }, { status: 400 });
