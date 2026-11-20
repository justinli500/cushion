import { getLadders } from "@/domains/markets/gemini";
import { respond } from "@/lib/http";

export const GET = () => respond(async () => ({ ladders: await getLadders() }));
