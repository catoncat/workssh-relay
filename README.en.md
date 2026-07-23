# WorkSSH Relay

Connect your local SSH client to an ephemeral Work sandbox through a
self-hosted Cloudflare Worker. Both endpoints make outbound WebSocket
connections; no public inbound port is required.

Some ChatGPT Work sandboxes cannot reach `workers.dev` through their egress
proxy. In that case, deploy the optional
[ChatGPT Site ingress](docs/SITE_INGRESS.md). The local client still connects
directly to your Worker; only the sandbox agent uses the Site URL.

This is an unofficial community project and is not affiliated with OpenAI,
ChatGPT, or Cloudflare. Use it only with systems you own or are authorized to
administer.

## Quick start

Requirements: a Cloudflare account, Node.js 22+, `git`, `ssh`, and
`ssh-keygen`.

1. Deploy the relay:

   ```bash
   git clone https://github.com/catoncat/workssh-relay.git
   cd workssh-relay/relay
   npm install
   npx wrangler login
   openssl rand -hex 32
   npx wrangler secret put RELAY_TOKEN
   npm run deploy
   ```

2. In the sandbox, clone the repository and set `WORKSSH_WORKER_URL`,
   `WORKSSH_RELAY_TOKEN`, `WORKSSH_TUNNEL_ID`, and
   `WORKSSH_PUBLIC_KEY_FILE`, then run:

   ```bash
   ./scripts/install-agent.sh
   ./scripts/start-agent.sh
   ```

   If `WORKSSH_WORKER_URL` is a workspace-protected Site ingress, also set
   `WORKSSH_SITE_BEARER_TOKEN`. Keep it private.

3. On macOS or Linux, clone the repository, set the first three variables to
   the same values, then run:

   ```bash
   ./scripts/install-client.sh
   ssh workssh-sandbox
   ```

The relay sees only SSH-encrypted bytes. The sandbox SSH server binds to
`127.0.0.1`, uses public-key authentication, and disables port forwarding.

## Important lifecycle limitation

Process supervision, WebSocket ping/pong, and reconnect logic handle process
crashes and network interruptions. They cannot prevent the hosting platform
from suspending, reclaiming, or replacing the entire VM. Persist valuable work
outside the ephemeral VM and redeploy when necessary.

See [Architecture](docs/ARCHITECTURE.md),
[Troubleshooting](docs/TROUBLESHOOTING.md), [Security](SECURITY.md), and the
[Work Agent handoff prompt](AGENT_TASK.md).
