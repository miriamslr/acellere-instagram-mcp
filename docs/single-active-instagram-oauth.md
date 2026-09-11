# Single Active Instagram Connection

Status: experimental implementation for issue #52.

This mode lets the Acellere Instagram MCP use exactly **one OAuth-connected Instagram account at a time** without implementing multi-tenant connection persistence.

## Runtime rule

1. If `ActiveInstagramConnectionDO` contains a valid OAuth connection, every Instagram MCP tool uses it.
2. If the OAuth slot is empty, the Worker falls back to the legacy `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, `FACEBOOK_PAGE_ID` and `INSTAGRAM_API_MODE` environment values.
3. If an OAuth slot exists but its token is expired or cannot be decrypted, the MCP fails explicitly and asks for reconnection. It does **not** mix fields from the OAuth connection with the legacy environment account.
4. Reconnecting another account overwrites the single OAuth slot. There is no connection list, tenant table or account history.

Threads credentials are unaffected.

## Security model

- OAuth access tokens are encrypted with AES-GCM before Durable Object storage.
- `ACTIVE_CONNECTION_ENCRYPTION_KEY` is a Worker secret and is never stored in the Durable Object.
- `/auth/*/start`, `/auth/status` and `/auth/disconnect` require the configured MCP `AUTH_TOKEN` as a Bearer header. Query-string auth is intentionally not accepted by the OAuth administration routes.
- OAuth `state` is random, provider-bound, expires after 10 minutes and is single-use.
- OAuth redirect URIs come only from environment configuration; callers cannot submit an arbitrary callback/redirect URL.
- Facebook account selection uses a random, short-lived, one-use selection ID and stores Page Access Tokens encrypted.
- OAuth callbacks never receive the user's Instagram/Facebook password.
- `ACELLERE_LOCAL_STATE_WRITE_MODE=write` is required to start, complete, select or disconnect an OAuth connection. This gate is independent from `ACELLERE_WRITE_MODE`, which continues to control mutations sent to Meta.

## Required Cloudflare binding

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "ACTIVE_INSTAGRAM_CONNECTION_DO",
        "class_name": "ActiveInstagramConnectionDO"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v2",
      "new_sqlite_classes": ["ActiveInstagramConnectionDO"]
    }
  ]
}
```

The first deployment that creates this Durable Object class must use a Cloudflare lifecycle-capable `wrangler deploy`. Branch `versions upload` previews cannot create a new Durable Object class.

## Required configuration

```bash
AUTH_TOKEN=...
ACTIVE_CONNECTION_ENCRYPTION_KEY=...
ACELLERE_LOCAL_STATE_WRITE_MODE=write

META_APP_ID=...
META_APP_SECRET=...
META_API_VERSION=v26.0

INSTAGRAM_OAUTH_REDIRECT_URI=https://<worker-host>/auth/instagram/callback
FACEBOOK_OAUTH_REDIRECT_URI=https://<worker-host>/auth/facebook/callback
```

Optional overrides:

```bash
INSTAGRAM_OAUTH_CLIENT_ID=...
INSTAGRAM_OAUTH_CLIENT_SECRET=...
FACEBOOK_OAUTH_CLIENT_ID=...
FACEBOOK_OAUTH_CLIENT_SECRET=...
ACTIVE_CONNECTION_SUCCESS_REDIRECT_URI=https://app.acellere.com.br/integrations/instagram
```

Use a high-entropy encryption secret, for example:

```bash
openssl rand -base64 32
```

Configure it as a Cloudflare Worker secret; do not commit the real value.

## OAuth endpoints

### Status

```http
GET /auth/status
Authorization: Bearer <AUTH_TOKEN>
```

Safe response example:

```json
{
  "connected": true,
  "source": "oauth-active",
  "login_mode": "instagram-login",
  "instagram_user_id": "...",
  "instagram_username": "account_name",
  "facebook_page_id": null,
  "token_status": "valid",
  "token_expires_at": "2026-10-25T12:00:00.000Z",
  "scopes": ["instagram_business_basic"]
}
```

The access token is never returned.

### Instagram Login

1. Request an authorization URL:

```http
GET /auth/instagram/start
Authorization: Bearer <AUTH_TOKEN>
```

2. Open `authorization_url` in the browser.
3. Instagram redirects to `/auth/instagram/callback`.
4. The Worker exchanges the authorization code, obtains a long-lived Instagram User token, resolves `/me`, encrypts the token and replaces the active connection.

Default requested permissions:

- `instagram_business_basic`
- `instagram_business_manage_messages`
- `instagram_business_manage_comments`
- `instagram_business_content_publish`
- `instagram_business_manage_insights`

Override with `INSTAGRAM_OAUTH_SCOPES` when the Meta app has a different approved permission set.

### Facebook Login for Business

1. Request an authorization URL:

```http
GET /auth/facebook/start
Authorization: Bearer <AUTH_TOKEN>
```

2. Complete Facebook Login for Business.
3. The Worker exchanges the code and obtains a long-lived Facebook User token.
4. The Worker calls `/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{...}`.
5. If exactly one Page is linked to an eligible Instagram professional account, it becomes active immediately.
6. If multiple eligible accounts exist, the callback renders a selection page. Only the selected Page Access Token becomes the active connection.

Default requested permissions:

- `pages_show_list`
- `pages_read_engagement`
- `instagram_basic`
- `instagram_manage_comments`
- `instagram_manage_insights`
- `instagram_content_publish`
- `instagram_manage_messages`

Ads/catalog/partnership permissions should be added through `FACEBOOK_OAUTH_SCOPES` only after the app has the corresponding access/review configuration.

## Disconnect

HTTP:

```http
POST /auth/disconnect
Authorization: Bearer <AUTH_TOKEN>
```

MCP tool:

```text
ig_disconnect_active_connection
```

Disconnect removes only the OAuth slot. It does not revoke the token at Meta and does not delete Instagram content. When the legacy environment credentials are still configured, the next MCP request falls back to that account.

## MCP diagnostics

```text
ig_get_active_connection
```

Returns the same sanitized state model as `/auth/status`.

## Account switching example

```text
legacy ENV / @acelleredigital
        ↓
Instagram OAuth / @account_a
        ↓ reconnect
Instagram OAuth / @account_b
        ↓ disconnect
legacy ENV / @acelleredigital
```

At no point are accounts A and B stored as a managed account list. The OAuth slot is overwritten.

## Meta access levels

The initial flow can be tested with app-owned/tester accounts under the access available to the Meta app. Connecting arbitrary external professional accounts requires the appropriate Advanced Access/App Review for the permissions requested by the flow.
