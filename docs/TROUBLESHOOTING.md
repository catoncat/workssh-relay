# Troubleshooting

## `ssh workssh-sandbox` prints `connected` and appears stuck

Run `./scripts/status.sh` in the sandbox. Both `ssh-server` and `relay-agent`
must be running. Confirm that the local and sandbox configurations use the
same token and tunnel ID. Their URLs intentionally differ when the sandbox uses
a Site ingress.

If the Worker was just redeployed, both WebSockets were disconnected. The
agent reconnects automatically; retry the SSH command.

## `Connection closed by UNKNOWN port 65535`

First check the local proxy log prefix:

```text
[workssh] relay connected; waiting for sandbox
[workssh] sandbox connected
```

If it instead prints `[relay-proxy] connected`, the SSH alias still invokes a
legacy proxy that sends raw WebSocket payloads. Protocol 1 requires every SSH
data message to be a Base64 text frame beginning with `d:`. Re-run the latest
`scripts/install-client.sh` and test the generated `ssh workssh-sandbox` alias.

Inspect the effective alias rather than assuming a config block was replaced:

```bash
ssh -G workssh-sandbox | grep -Ei '^(hostname|identityfile|proxycommand) '
```

## `banner exchange: invalid format`

Read the local SSH server's first line from the same network namespace as the
Agent. It must be exactly:

```text
SSH-2.0-WorkSSH\r\n
```

The `ssh2` package automatically prepends `SSH-2.0-` to its `ident` setting.
Passing `SSH-2.0-WorkSSH` as `ident` produces the invalid doubled banner
`SSH-2.0-SSH-2.0-WorkSSH`.

If the first line is correct but OpenSSH still reports `invalid format`, test a
second connection and inspect whether the relay reused an SSH stream whose
banner was already consumed. Each newly paired client must get a fresh local
connection to `127.0.0.1:2222`.

## `Bad packet length 1397966893`

`1397966893` is hexadecimal `0x5353482d`, the ASCII bytes `SSH-`. Seeing it as a
packet length means the client received a second SSH banner after the first
banner was already accepted.

When a stale relay client is replaced, the Worker may emit several
`peer-ready` controls close together. The Agent must coalesce that burst into
one fresh local SSH stream. Verify with two consecutive full connections:

```bash
ssh workssh-sandbox 'printf "FIRST_OK\n"'
ssh workssh-sandbox 'printf "SECOND_OK\n"'
```

Checking only `/health` or the first banner does not cover this failure.

## PID file says running but the PID is unrelated

PID values can be reused. `kill -0 PID` proves only that some process with that
number exists. Current lifecycle scripts also compare `/proc/PID/cmdline`
against the expected `supervisor.mjs --config ...` command.

In managed sandboxes, separate execution calls may use different PID and
network namespaces. A PID that appears to be `sites-preview` elsewhere, or a
connection refusal from another namespace, does not prove that a supervisor in
the persistent Agent session died. Run process, socket, and log checks inside
the same persistent session that owns the supervisor.

If `scripts/status.sh` marks `status.json` stale, do not use its old
`connected` value as evidence. The current Agent refreshes connected status
every 30 seconds, and the script requires a matching live Agent process and a
recent timestamp.

## Two Agents use the same Tunnel ID

The relay accepts one Agent role per Tunnel ID. A new Agent replaces the old
one. Use a different random Tunnel ID for every simultaneously active sandbox,
or stop the other Agent before testing. Two supervisors that share the same
state directory also compete for port `127.0.0.1:2222` and overwrite runtime
files.

## `401 Unauthorized`

The Worker secret and local configuration do not match. Rotate or set it:

```bash
cd relay
npx wrangler secret put RELAY_TOKEN
```

Then rerun both setup scripts with the same new value.

## `Permission denied (publickey)`

The sandbox was configured with a different public key. Re-run
`scripts/install-agent.sh` with `WORKSSH_PUBLIC_KEY_FILE` pointing to the
matching `.pub` file. Never copy the private key into the sandbox.

## Host-key warning after a sandbox rebuild

A new sandbox generates a new SSH host key. First confirm that you intentionally
rebuilt it, then remove only the old alias entry:

```bash
ssh-keygen -R workssh-sandbox
```

Reconnect and review the new fingerprint.

## The tunnel disappeared after inactivity

The hosting platform likely reclaimed the whole VM. Ping/pong cannot prevent
that. Create or reopen a Work sandbox and rerun the agent installation. Restore
important files from persistent storage or Git.

## Proxy-restricted networks

The Node clients honor `HTTPS_PROXY`, `HTTP_PROXY`, and `ALL_PROXY`. Set one of
those variables before starting the agent or SSH client.

If the local client reaches the Worker but the sandbox reports `connecting`,
test `/health` from both environments. A proxy CONNECT timeout to
`workers.dev` requires the optional [Site ingress](SITE_INGRESS.md); changing
the tunnel ID or relay token will not fix an egress policy block.

If the Agent briefly reports `connected` and is then terminated with a policy
error for `chatgpt.site:443`, the Site hostname is also blocked. Treat any
remaining status file as stale. Stop retrying until one relay endpoint is
allowed by the execution environment.

With a Site ingress, confirm:

- the local client uses the Cloudflare Worker URL;
- the sandbox Agent uses the Site URL;
- the sandbox Agent configuration uses `transport: "http-poll"`;
- both use the same relay token and tunnel ID;
- a workspace-protected Site bearer is configured only on the Agent.
