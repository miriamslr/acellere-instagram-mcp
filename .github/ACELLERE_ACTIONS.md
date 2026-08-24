# Acellere GitHub Actions policy

This fork keeps automated Actions intentionally minimal.

- `ci.yml` is the only workflow intended to run automatically on pull requests to `main`.
- `release.yml` is manual and does not publish packages until Acellere defines its own package identity, registry target, versioning, and credentials.
- `claude.yml` is manual and functionally disabled until a trusted integration policy and credentials are configured.
- Instagram, Meta App, and MCP runtime credentials must never be stored in workflow files or committed to the repository.

Before enabling any new automatic workflow, review its triggers, permissions, external actions, secrets, and write capabilities.
