import { agentFromToken, worldNearbyFor } from "@/lib/backend";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/v0/world/nearby
 * Authorization: Bearer <agent token>
 *
 * Listens from the agent's server-trusted world position. Caller-supplied
 * coordinates or agent IDs are intentionally not accepted.
 */
export async function GET(req: Request) {
  try {
    const agent = await agentFromToken(req.headers.get("authorization"));
    if (!agent) return json({
      error: { code: "UNAUTHORIZED", message: "Agent bearer token required", retryable: false },
    }, 401);
    const nearby = await worldNearbyFor(agent);
    if (nearby.httpStatus !== 200) return json({
      error: { code: "UNAUTHORIZED", message: "Nearby feed unavailable", retryable: false },
    }, nearby.httpStatus === 401 ? 401 : 403);
    return json({
      version: "v0",
      agentId: agent.id,
      radius: nearby.radius ?? 12,
      messages: nearby.messages ?? [],
    });
  } catch {
    return json({
      error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read nearby speech", retryable: true },
    }, 503);
  }
}
