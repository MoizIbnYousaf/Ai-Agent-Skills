---
name: vincent-twitter
description: Search tweets, look up profiles, and fetch recent tweets via Vincent's X/Twitter proxy.
homepage: https://heyvincent.ai
source: https://github.com/HeyVincent-ai/Vincent
metadata:
  clawdbot:
    homepage: https://heyvincent.ai
    requires:
      config:
        - ~/.openclaw/credentials/datasources
        - ./datasources
---

# Vincent - Twitter / X.com for agents

Use this skill to search tweets, look up user profiles, and retrieve recent tweets from X.com (Twitter). All requests are proxied through the Vincent backend, which handles authentication with the X API, enforces rate limits, tracks per-call costs, and deducts from your credit balance automatically.

**No API keys to manage.** The agent authenticates with a Vincent API key scoped to a `DATA_SOURCES` secret. Vincent handles the upstream Twitter API credentials server-side -- the agent never sees or manages Twitter API keys.

## Security Model

This skill is designed for **autonomous agent operation with pay-per-call pricing and human oversight**.

**No environment variables are required** because this skill uses agent-first onboarding: the agent creates a `DATA_SOURCES` secret at runtime by calling the Vincent API, which returns a scoped API key. The config paths where the agent persists the returned API key (`~/.openclaw/credentials/datasources/` or `./datasources/`) are declared in this skill's metadata.

**The agent's API key is not a Twitter API key.** It is a scoped Bearer token for the Vincent proxy. The Vincent server authenticates with Twitter on the agent's behalf. The agent cannot access the upstream API directly or bypass the proxy's credit and rate-limit enforcement.

**Model invocation is intentionally enabled.** The purpose of this skill is to give AI agents autonomous access to Twitter data. The agent is expected to search tweets and look up profiles on its own. The human controls spending through credit balance and payment method management at `https://heyvincent.ai`.

**All API calls go exclusively to `heyvincent.ai`** over HTTPS/TLS. The Vincent server then calls the Twitter API. The agent does not contact Twitter directly.

**Key lifecycle:**

- **Creation**: The agent calls `POST /api/secrets` with `type: "DATA_SOURCES"` to create a data sources secret. The API returns a scoped API key and a claim URL.
- **Claim**: The human operator uses the claim URL to take ownership, add credit, and manage payment at `https://heyvincent.ai`.
- **Credit**: Each API call costs a small amount (see Pricing below). The human adds credit via the frontend. Calls are rejected when credit runs out and no payment method is on file.
- **Revocation**: The secret owner can revoke the agent's API key at any time from the Vincent frontend.

## Pricing

| Endpoint | Cost per call |
| --- | --- |
| Search tweets | $0.01 |
| Get tweet by ID | $0.005 |
| Get user profile | $0.005 |
| Get user's tweets | $0.01 |

Credit is deducted automatically per call. The response includes `_vincent.creditRemainingUsd` so the agent can track remaining balance.

## Configuration

All API requests require a Bearer token (the scoped API key returned when creating a `DATA_SOURCES` secret).

Store the API key locally after creation in one of the declared config paths. If you're an OpenClaw instance, store and retrieve it from `~/.openclaw/credentials/datasources/<API_KEY_ID>.json`. Otherwise, store it in your current working directory at `datasources/<API_KEY_ID>.json`.

```
Authorization: Bearer <API_KEY>
```

## Quick Start

### 1. Create a Data Sources Secret

If you don't already have a `DATA_SOURCES` API key, create one:

```bash
curl -X POST "https://heyvincent.ai/api/secrets" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "DATA_SOURCES",
    "memo": "My agent data sources"
  }'
```

Response includes:

- `apiKey` -- a scoped API key; store this securely and use it as the Bearer token for all data source requests
- `claimUrl` -- share with the user to claim ownership and add credit

After creating, tell the user:

> "Here is your data sources claim URL: `<claimUrl>`. Use this to claim ownership and add credit for Twitter and other data sources at https://heyvincent.ai."

**Important:** The secret must be claimed and have credit (or a payment method on file) before API calls will succeed.

### 2. Search Tweets

Search recent tweets by keyword.

```bash
curl -X GET "https://heyvincent.ai/api/data-sources/twitter/search?q=bitcoin&max_results=10" \
  -H "Authorization: Bearer <API_KEY>"
```

Parameters:

- `q` (required): Search query (1-512 characters)
- `max_results` (optional): Number of results, 10-100 (default: 10)
- `start_time` (optional): ISO 8601 datetime, earliest tweets to return
- `end_time` (optional): ISO 8601 datetime, latest tweets to return

Returns tweet text, creation time, author ID, and public metrics (likes, retweets, replies).

### 3. Get a Specific Tweet

```bash
curl -X GET "https://heyvincent.ai/api/data-sources/twitter/tweets/<TWEET_ID>" \
  -H "Authorization: Bearer <API_KEY>"
```

### 4. Get User Profile

Look up a Twitter user by username.

```bash
curl -X GET "https://heyvincent.ai/api/data-sources/twitter/users/<USERNAME>" \
  -H "Authorization: Bearer <API_KEY>"
```

Returns the user's description, follower/following counts, profile image, and verified status.

### 5. Get a User's Recent Tweets

```bash
curl -X GET "https://heyvincent.ai/api/data-sources/twitter/users/<USER_ID>/tweets?max_results=10" \
  -H "Authorization: Bearer <API_KEY>"
```

Parameters:

- `max_results` (optional): Number of results, 5-100 (default: 10)

**Note:** This endpoint requires the user's numeric ID (from the user profile response), not the username.

## Response Metadata

Every successful response includes a `_vincent` object with:

```json
{
  "_vincent": {
    "costUsd": 0.01,
    "creditRemainingUsd": 4.99
  }
}
```

Use `creditRemainingUsd` to warn the user when credit is running low.

## Rate Limits

- 60 requests per minute per API key across all data source endpoints (Twitter + Brave Search combined)
- If rate limited, you'll receive a `429` response. Wait and retry.

## Re-linking (Recovering API Access)

If the agent loses its API key, the secret owner can generate a **re-link token** from the frontend. The agent then exchanges this token for a new API key.

```bash
curl -X POST "https://heyvincent.ai/api/secrets/relink" \
  -H "Content-Type: application/json" \
  -d '{
    "relinkToken": "<TOKEN_FROM_USER>",
    "apiKeyName": "Re-linked API Key"
  }'
```

Re-link tokens are one-time use and expire after 10 minutes.

## Important Notes

- Always search for existing API keys in the declared config paths before creating a new secret. If you're an OpenClaw instance, search in `~/.openclaw/credentials/datasources/`. Otherwise, search in `./datasources/`.
- A single `DATA_SOURCES` API key works for **all** data sources (Twitter, Brave Search, etc.). You do not need a separate key per data source.
- Always share the claim URL with the user after creating a secret.
- If a call is rejected with a credit error, tell the user to add credit at `https://heyvincent.ai`.
- The Twitter search endpoint only returns tweets from the last 7 days (X API v2 limitation for recent search).
