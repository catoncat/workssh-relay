# Security

## Supported use

Use WorkSSH only on accounts and systems you own or are explicitly authorized
to access. Do not use it to bypass organizational policy, access controls, or
platform restrictions.

## Threat model

The Cloudflare Worker authenticates both WebSocket peers with a shared relay
token and groups them by an opaque tunnel ID. It forwards an SSH byte stream;
SSH provides end-to-end encryption and server/client authentication.

The relay token is not a substitute for SSH authentication. Treat it as a
secret anyway: anyone who has both the token and tunnel ID can join the byte
channel and attempt an SSH connection.

## Required practices

- Generate the relay token with at least 256 bits of randomness.
- Use a random tunnel ID and a dedicated SSH key.
- Verify the SSH host-key prompt on first connection.
- Never commit `.env`, `config.json`, private keys, live Worker URLs, or logs.
- Rotate the relay token after accidental disclosure:
  `npx wrangler secret put RELAY_TOKEN`.
- Review your Cloudflare Worker logs and delete unused Workers.

## Deliberate restrictions

The bundled SSH server:

- listens only on `127.0.0.1`;
- rejects password authentication;
- accepts only one configured public key;
- rejects TCP forwarding and agent forwarding;
- supports shell and exec channels only.

## Reporting a vulnerability

Do not open a public issue containing credentials, exploit details against a
live deployment, or personal data. Contact the repository owner privately
through the security-reporting method configured on the hosting platform.
