# GitHub publishing handoff

Use this prompt in a new conversation after connecting the GitHub plugin. Attach
or mention the persisted `workssh-relay-source.zip` file.

---

I have attached a release-ready source archive named
`workssh-relay-source.zip`. Publish it as a new **public** GitHub repository.

Target repository name: `workssh-relay`

Instructions:

1. Materialize and extract the archive into a clean directory. Do not reuse any
   unrelated repository or Git history.
2. Read `README.md`, `SECURITY.md`, `AGENT_TASK.md`, and this handoff before
   making changes.
3. Confirm the connected GitHub owner with a read-only call. If
   `workssh-relay` already exists, do not overwrite it; use
   `workssh-relay-community` and report the changed name.
4. Replace `REPOSITORY_URL` in `README.md` and `README.en.md` with the final
   public clone URL. Make no other branding changes.
5. Run:
   - `npm ci --prefix tunnel`
   - `npm ci --prefix relay`
   - `npm run check`
   - `./scripts/e2e-local.sh`
   - `node scripts/e2e-relay.cjs`
   - `npm run secret-scan`
6. Perform an additional full-tree scan before committing. Reject any live
   Worker URL, relay token, Cloudflare/API credential, SSH key, email address,
   user name, sandbox ID, `/workspace/scratch/...` path, or runtime config.
   Placeholders and `*.example.invalid` test values are intentional.
7. Create the public repository with description:
   `Self-hosted SSH relay for ephemeral Work sandboxes`
8. Commit all source files in one clean initial commit and push the default
   branch as `main`. Do not include `node_modules`, `dist`, logs, PID files,
   `.env`, runtime configuration, archives, or private keys.
9. After pushing, inspect the public repository and the complete Git history.
   Confirm it is public, CI is present, Apache-2.0 is detected, and no secret
   appears in history.
10. Return the public URL and the shortest working quick-start. If GitHub asks
    for connection or approval, stop only for that UI action and continue from
    the same step afterward.

This repository is unofficial and must not be presented as an OpenAI,
ChatGPT, or Cloudflare product.

---
