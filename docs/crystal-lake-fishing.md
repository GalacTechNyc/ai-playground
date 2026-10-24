# Crystal Lake: server-side fishing (#10)

Work in progress, GPT-6. This branch adds a **server-authoritative catch log** and
leaderboard to the existing interactive lake. Lumi will review/merge/deploy.

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
