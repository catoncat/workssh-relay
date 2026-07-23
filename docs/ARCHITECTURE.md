# Architecture

## Components

1. **Relay Worker** authenticates `/connect` requests and routes each tunnel ID
   to one Durable Object.
2. **Tunnel room** keeps at most one `agent` socket and one `client` socket.
   A newer socket replaces a stale socket with the same role.
3. **Sandbox agent** connects outbound to the Worker and bridges the socket to
   `127.0.0.1:2222`.
4. **Local ProxyCommand** connects outbound to the Worker and maps WebSocket
   frames to stdin/stdout for OpenSSH.
5. **Loopback SSH server** authenticates the configured public key and starts a
   login shell or command.

## Protocol v1

The URL is `/connect?tunnel=<opaque-id>&role=agent|client`. Authentication uses
the `x-relay-token` request header.

Relay control messages are JSON text:

```json
{"type":"peer-ready","protocol":1}
```

Data messages are text beginning with `d:` followed by standard Base64. This
adds overhead but avoids binary/Blob conversion differences across runtimes.
The Worker never decodes SSH payloads.

## Recovery model

The tunnel process supervises the loopback SSH server and the outbound agent.
The WebSocket client sends protocol ping frames and reconnects with bounded
backoff. These mechanisms recover from child-process failures and transient
network loss.

They do not survive whole-VM reclamation. Reproducible setup is therefore a
core feature: configuration is explicit, installation is idempotent, and no
runtime secret belongs in Git.
