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
- Optional Site bypass bearer: `<SITE_BYPASS_BEARER>` (blank for a public Site
  or when the Agent will create the Site)
- Relay token: `<RELAY_TOKEN>`
- Tunnel ID: `<TUNNEL_ID>` (generate a random 128-bit value if blank)
- Allowed SSH public key: `<SSH_PUBLIC_KEY>`

Complete the work without asking me to run sandbox-side commands:

1. Clone the repository and inspect its README, SECURITY.md, and scripts before
   executing anything.
2. Verify the repository contains no real credentials and that the supplied
   URL is HTTPS.
3. Test the Worker `/health` endpoint from the sandbox. If it is reachable,
   install the Agent with the Worker URL. If the platform proxy times out:
   - use the supplied Site ingress and bypass bearer; or
   - when no ingress was supplied and the Sites capability is available,
     deploy `site-ingress/worker.js`, set `UPSTREAM_RELAY_URL` and the matching
     secret `RELAY_TOKEN`, retrieve the Site bypass bearer, and use that Site
     URL for the sandbox Agent with `WORKSSH_TRANSPORT=http-poll`.
   Before installing, verify the Site `/health` endpoint from the sandbox. If
   platform policy blocks both the Worker and Site hostnames, stop and report
   the egress-policy blocker; do not claim the tunnel is connected.
   Store both runtime secrets only in configuration mode `0600`; never print
   the bearer, Site project ID, or hosted environment values.
4. Bind the SSH server only to `127.0.0.1`, use public-key authentication only,
   and do not enable TCP, dynamic, reverse, or agent forwarding.
5. Start the supervisor, verify both children are running, and confirm the
   outbound WebSocket or Site HTTP polling transport is connected. Run it in a
   persistent managed execution session, not as an ordinary background process
   that dies with one command. Verify a PID belongs to the expected supervisor
   command before trusting a PID file.
6. Read the SSH server banner from `127.0.0.1:2222` in the same network
   namespace. It must be exactly `SSH-2.0-WorkSSH\r\n`; `ssh2` automatically
   supplies the `SSH-2.0-` prefix, so its `ident` option must contain only the
   software identifier.
7. Run the local protocol tests and report the exact local SSH alias/setup
   values I need, but redact the relay token and Site bypass bearer. The local
   client must keep using the Cloudflare Worker URL, not a protected Site URL.
   Confirm the current client prints `[workssh]`, not the legacy
   `[relay-proxy]` prefix.
8. Complete two consecutive end-to-end SSH connections. A health response,
   `relay connected`, a stale status file, or one successful banner is not
   sufficient. The second connection must get a fresh SSH stream and complete
   key exchange without `invalid format` or `Bad packet length`.
9. Ensure only one live Agent uses the Tunnel ID. A second Agent with the same
   ID replaces the first at the relay. Do not diagnose a process or listening
   socket from a different isolated PID/network namespace.
10. Delete temporary test keys and temporary logs containing sensitive data.
11. State clearly that process heartbeats cannot prevent the platform from
   reclaiming the entire VM, and identify which files require persistent
   backup.

Do not:

- request or store my SSH private key;
- request a Cloudflare API token;
- expose the SSH service on `0.0.0.0`;
- commit or print a Site project ID, bypass bearer, deployed URL, or environment
  values;
- send the Site bypass bearer to the Cloudflare Worker or local client;
- disable SSH host-key checking;
- commit runtime configuration or secrets;
- use CPU busy loops as a keepalive;
- claim that the VM or tunnel will remain online permanently.
- claim a stale `status.json` value proves connectivity after the Agent process
  has exited.
- treat `kill -0` alone as proof that a PID is the WorkSSH supervisor;
- run two Agents with the same Tunnel ID during testing;
- declare success before two consecutive full SSH handshakes complete.

At the end, provide:

- health/status output with secrets redacted;
- the tunnel ID;
- the local install command;
- the final `ssh workssh-sandbox` command;
- recovery steps for a reclaimed sandbox.

---
