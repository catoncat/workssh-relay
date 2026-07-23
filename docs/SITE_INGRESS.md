# ChatGPT Site ingress

Use this optional path only when the Work sandbox cannot reach your
`workers.dev` hostname but your local computer can.

The sandbox must still be allowed to reach the deployed `chatgpt.site`
hostname. This ingress cannot help when the execution policy blocks both
hostnames. Test `/health` from the same process environment that will run the
Agent before treating the Site as usable.

```text
Mac SSH client ───────────────► Cloudflare Worker
Work sandbox Agent ─► Site ───► Cloudflare Worker
```

The Site is a narrow HTTPS reverse proxy. Sites production dispatch may reject
programmatic WebSocket upgrades, so the sandbox Agent uses bounded HTTP
polling through the Site. The Cloudflare Durable Object joins those frames to
the local client's normal WebSocket. SSH encryption remains end to end. The
Site does not decode or persist SSH payloads.

## Deploy

Ask a Work Agent with the Sites capability to:

1. Create or edit a buildless Worker Site using
   [`site-ingress/worker.js`](../site-ingress/worker.js).
2. Set `UPSTREAM_RELAY_URL` to the HTTPS base URL of your Cloudflare Worker.
3. Set `RELAY_TOKEN` as a secret to the same high-entropy value used by the
   Worker.
4. Deploy the Site and verify `/health` reports
   `service: "workssh-site-ingress"` and `protocol: 1`.
5. Verify that same `/health` URL from the target sandbox, not only from a
   desktop browser.
6. If the Site is workspace-protected, retrieve its bypass bearer and store it
   only in the sandbox Agent configuration.

Do not commit the Site project ID, relay token, bypass bearer, account slug, or
deployed URLs to a public repository.

## Configure endpoints

The local client continues to use the Worker:

```bash
export WORKSSH_WORKER_URL="https://YOUR_WORKER.workers.dev"
export WORKSSH_RELAY_TOKEN="YOUR_RELAY_TOKEN"
export WORKSSH_TUNNEL_ID="SAME_TUNNEL_ID"
./scripts/install-client.sh
```

The sandbox Agent uses the Site:

```bash
export WORKSSH_WORKER_URL="https://YOUR_SITE.chatgpt.site"
export WORKSSH_RELAY_TOKEN="YOUR_RELAY_TOKEN"
export WORKSSH_TUNNEL_ID="SAME_TUNNEL_ID"
export WORKSSH_PUBLIC_KEY_FILE="/path/to/id_ed25519.pub"
export WORKSSH_SITE_BEARER_TOKEN="YOUR_SITE_BYPASS_BEARER"
export WORKSSH_TRANSPORT="http-poll"
./scripts/install-agent.sh
./scripts/start-agent.sh
```

Omit `WORKSSH_SITE_BEARER_TOKEN` when the Site is public. The ingress still
requires `RELAY_TOKEN`.

## Security boundary

- The ingress accepts only `GET /poll/recv` and `POST /poll/send`.
- It verifies `x-relay-token` before proxying.
- It strips `Authorization`, cookies, and the incoming Host header.
- It strips `OAI-Sites-Authorization` before forwarding.
- It forwards the relay token and protocol frame only to the configured
  upstream Worker.
- The Cloudflare Worker remains the authoritative tunnel router.
