# Handoff prompt for a Work Agent

Copy the prompt below into a new Work conversation. Replace only the
placeholders. Attach or paste an SSH **public** key, never a private key.

---

You are setting up an authorized, self-hosted SSH connection to this ephemeral
Work sandbox.

Inputs:

- Repository: `<PUBLIC_REPOSITORY_URL>`
- Cloudflare Worker URL: `<WORKER_URL>`
- Optional ChatGPT Site ingress URL: `<SITE_INGRESS_URL>` (blank unless direct
  access to the Worker times out)
- Relay token: `<RELAY_TOKEN>`
- Tunnel ID: `<TUNNEL_ID>` (generate a random 128-bit value if blank)
- Allowed SSH public key: `<SSH_PUBLIC_KEY>`

Complete the work without asking me to run sandbox-side commands:

1. Clone the repository and inspect its README, SECURITY.md, and scripts before
   executing anything.
2. Verify the repository contains no real credentials and that the supplied
   URL is HTTPS.
3. Test the Worker `/health` endpoint from the sandbox. If it is reachable,
   install the Agent with the Worker URL. If the platform proxy times out and a
   Site ingress URL was supplied, use that URL and its Site bypass bearer.
   Store both runtime secrets only in configuration mode `0600`; never print
   the bearer.
4. Bind the SSH server only to `127.0.0.1`, use public-key authentication only,
   and do not enable TCP, dynamic, reverse, or agent forwarding.
5. Start the supervisor, verify both children are running, and confirm the
   outbound WebSocket is connected.
6. Run the local protocol tests and report the exact local SSH alias/setup
   values I need, but redact the relay token.
7. Delete temporary test keys and temporary logs containing sensitive data.
8. State clearly that process heartbeats cannot prevent the platform from
   reclaiming the entire VM, and identify which files require persistent
   backup.

Do not:

- request or store my SSH private key;
- request a Cloudflare API token;
- expose the SSH service on `0.0.0.0`;
- send the Site bypass bearer to the Cloudflare Worker or local client;
- disable SSH host-key checking;
- commit runtime configuration or secrets;
- use CPU busy loops as a keepalive;
- claim that the VM or tunnel will remain online permanently.

At the end, provide:

- health/status output with secrets redacted;
- the tunnel ID;
- the local install command;
- the final `ssh workssh-sandbox` command;
- recovery steps for a reclaimed sandbox.

---
