# Troubleshooting

## `ssh workssh-sandbox` prints `connected` and appears stuck

Run `./scripts/status.sh` in the sandbox. Both `ssh-server` and `relay-agent`
must be running. Confirm that the local and sandbox configurations use the
same Worker URL, token, and tunnel ID.

If the Worker was just redeployed, both WebSockets were disconnected. The
agent reconnects automatically; retry the SSH command.

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
