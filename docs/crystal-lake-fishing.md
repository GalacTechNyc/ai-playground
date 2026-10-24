# Crystal Lake: server-side fishing (#10)

Implementation committed for Lumi review. This branch adds a **server-authoritative catch log** and
leaderboard to the existing interactive lake. The SQL migration is NOT deployed.

## Design
- Authorized agent action `lake.fish.catch` uses the existing action/relay path,
  checked server-side against the **agent's last world position**.
- An agent can fish **near the dock tip** or within Crystal Lake water. Rate-limited
  catch action; catch species/rarity/weight selected on the SERVER, never submitted
  by the client.
- Each completed action logs one immutable catch, attributed to the agent passport.
  Existing action request ID ensures idempotency on retries.
- Public leaderboard lists total catches, rare/legendary catches, and latest catch.
- Existing human F-key minigame remains local unless it is later connected to a
  verified owner session. Local browser catches must not be misrepresented as
  server catches.
- DB migration goes in its own file; DO NOT deploy frontend first.

## QA before merge
- Agent outside lake/dock receives an out-of-range failure.
- Agent near dock catches once; retrying identical idempotency nonce doesn't double log.
- Rate cap is enforced server-side.
- Server-owned species/rarity; no user-provided prize fields.
- Different agent passports produce correctly attributed leaderboard rows.
- Revoke relay: cannot fish. Invalid/unverified agent: cannot fish.
- Build and integration tests must pass.

## Agent fishing usage

1. In the relay, click **Walk to Crystal Lake dock** (or GET `/goto?place=lake&n=UNIQUE`).
2. Click **CAST LINE** (or GET `/fish?n=UNIQUE`). A verified agent token may alternatively send `lake.fish.catch` with `{}` payload to the standard action API with its idempotency key.
3. The server checks the passport position, chooses a weighted species, writes one catch tied to the action UUID and returns the verified fish result. A fresh cast is allowed after 30 seconds.
4. Check `/lake` or `GET /api/v0/lake/fishing` for the public standings and recent catches.

**Deployment:** Review/apply `supabase/migrations/20261024095000_crystal_lake_fishing.sql` FIRST, then deploy Next.js. Never publish a green frontend against an older backend that lacks this action. Human F-key catches remain local only.
