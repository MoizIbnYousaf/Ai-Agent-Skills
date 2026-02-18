---
name: vincent-polymarket
description: Trade Polymarket markets via Vincent wallets without exposing private keys.
homepage: https://heyvincent.ai
source: https://github.com/HeyVincent-ai/Vincent
metadata:
  clawdbot:
    homepage: https://heyvincent.ai
    requires:
      config:
        - ~/.openclaw/credentials/agentwallet
        - ./agentwallet
---

# Vincent - Polymarket for agents

Use this skill to create a Polymarket wallet for your agent and trade on prediction markets. Browse markets, place bets, track positions, and manage orders - all without exposing private keys to the agent. Wallets use Gnosis Safe on Polygon with gasless trading through Polymarket's relayer.

**The agent never sees the private key.** All operations are executed server-side. The agent receives a scoped API key that can only perform actions permitted by the wallet owner's policies. The private key never leaves the Vincent server.

## Security Model

This skill is designed for **autonomous agent trading with human oversight via server-side controls**. Understanding this model is important:

**No environment variables are required** because this skill uses agent-first onboarding: the agent creates its own Polymarket wallet at runtime by calling the Vincent API, which returns a scoped API key. There is no pre-existing credential to configure. The agent generates and stores its own API key during wallet creation - no secrets need to exist before the skill runs. The config paths where the agent persists the returned API key (`~/.openclaw/credentials/agentwallet/` or `./agentwallet/`) are declared in this skill's metadata.

**The agent's API key is not a private key.** It is a scoped Bearer token that can only execute actions within the policies set by the wallet owner. The Vincent server enforces all policies server-side - the agent cannot bypass them regardless of what it sends. If a trade violates a policy, the server rejects it. If a trade requires approval, the server holds it and notifies the wallet owner via Telegram for out-of-band human approval.

**Model invocation is intentionally enabled.** The purpose of this skill is to give AI agents autonomous Polymarket trading capabilities. The agent is expected to invoke trading actions (browse markets, place bets, manage positions) on its own, within the boundaries the human operator defines. The human controls what the agent can do through policies (spending limits, approval thresholds) - not by gating individual invocations. The agent persists its scoped API key to the declared config paths so it can resume trading across sessions; this is expected behavior for an autonomous trading agent. The stored key is scoped and policy-constrained - even if another process reads it, it can only perform actions the wallet owner's policies allow, and the owner can revoke it instantly.

**All API calls go exclusively to `heyvincent.ai`** over HTTPS/TLS. No other endpoints, services, or external hosts are contacted. The agent does not read, collect, or transmit any data beyond what is needed for Polymarket wallet operations.

**Key lifecycle:**

- **Creation**: The agent calls `POST /api/secrets` to create a wallet. The API returns a scoped API key and a claim URL.
- **Claim**: The human operator uses the claim URL to take ownership and configure policies at `https://heyvincent.ai`.
- **Revocation**: The wallet owner can revoke the agent's API key at any time from the Vincent frontend. Revoked keys are rejected immediately by the server.
- **Re-linking**: If the agent loses its API key, the wallet owner generates a one-time re-link token (expires after 10 minutes) and the agent exchanges it for a new key.
- **Rotation**: The wallet owner can revoke the current key and issue a re-link token to rotate credentials at any time.

## Configuration

All API requests require a Bearer token (the scoped API key returned when creating a wallet). This key is not a private key - it is a server-enforced, policy-scoped credential that the wallet owner can revoke at any time.

Store the API key locally after wallet creation in one of the declared config paths. If you're an OpenClaw instance, store and retrieve it from `~/.openclaw/credentials/agentwallet/<API_KEY_ID>.json`. Otherwise, store it in your current working directory at `agentwallet/<API_KEY_ID>.json`. These paths are declared in this skill's metadata so the host environment can audit and manage credential storage.

```
Authorization: Bearer <API_KEY>
```

## Quick Start

### 1. Create a Polymarket Wallet

Create a new Polymarket wallet for your agent. This generates a private key server-side (the agent never sees it), creates a Gnosis Safe on Polygon, and returns a scoped API key for the agent plus a claim URL for the wallet owner.

```bash
curl -X POST "https://heyvincent.ai/api/secrets" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "POLYMARKET_WALLET",
    "memo": "My prediction market wallet"
  }'
```

Response includes:

- `apiKey` -- a scoped API key; store this securely and use it as the Bearer token for all future requests
- `claimUrl` -- share with the user to claim ownership and set policies
- `walletAddress` -- the EOA address (Safe is deployed lazily on first use)

After creating, tell the user:

> "Here is your wallet claim URL: `<claimUrl>`. Use this to claim ownership, set spending policies, and monitor your agent's wallet activity at https://heyvincent.ai."

**Important:** After creation, the wallet has no funds. The user must send **USDC.e (bridged USDC)** on Polygon to the Safe address before placing bets.

### 2. Get Balance

```bash
curl -X GET "https://heyvincent.ai/api/skills/polymarket/balance" \
  -H "Authorization: Bearer <API_KEY>"
```

Returns:

- `walletAddress` -- the Safe address (deployed on first call if needed)
- `collateral.balance` -- USDC.e balance available for trading
- `collateral.allowance` -- approved amount for Polymarket contracts

**Note:** The first balance call triggers Safe deployment and collateral approval (gasless via relayer). This may take 30-60 seconds.

### 3. Fund the Wallet

Before placing bets, the user must send USDC.e to the Safe address:

1. Get the wallet address from `/balance` endpoint
2. Send USDC.e (bridged USDC, contract `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`) on Polygon to that address
3. Minimum $1 required per bet (Polymarket minimum)

**Do not send native USDC** (`0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`). Polymarket only accepts bridged USDC.e.

### 4. Browse & Search Markets

```bash
# Search markets by keyword (recommended)
curl -X GET "https://heyvincent.ai/api/skills/polymarket/markets?query=bitcoin&limit=20" \
  -H "Authorization: Bearer <API_KEY>"

# Search by Polymarket URL or slug (for specific markets)
curl -X GET "https://heyvincent.ai/api/skills/polymarket/markets?slug=btc-updown-5m-1771380900&limit=5" \
  -H "Authorization: Bearer <API_KEY>"

# Or use a full Polymarket URL as the slug parameter
curl -X GET "https://heyvincent.ai/api/skills/polymarket/markets?slug=https://polymarket.com/event/btc-updown-5m-1771380900" \
  -H "Authorization: Bearer <API_KEY>"

# Get all active markets (paginated)
curl -X GET "https://heyvincent.ai/api/skills/polymarket/markets?active=true&limit=50" \
  -H "Authorization: Bearer <API_KEY>"

# Get specific market by condition ID
curl -X GET "https://heyvincent.ai/api/skills/polymarket/market/<CONDITION_ID>" \
  -H "Authorization: Bearer <API_KEY>"
```

**Market response includes:**

- `question`: The market question
- `outcomes`: Array like `["Yes", "No"]` or `["Team A", "Team B"]`
- `outcomePrices`: Current prices for each outcome
- `tokenIds`: **Array of token IDs for each outcome** - use these for placing bets
- `acceptingOrders`: Whether the market is open for trading
- `closed`: Whether the market has resolved

**Important:** Always use the `tokenIds` array from the market response. Each outcome has a corresponding token ID at the same index. For a "Yes/No" market:

- `tokenIds[0]` = "Yes" token ID
- `tokenIds[1]` = "No" token ID

### 5. Get Order Book

```bash
curl -X GET "https://heyvincent.ai/api/skills/polymarket/orderbook/<TOKEN_ID>" \
  -H "Authorization: Bearer <API_KEY>"
```

Returns bids and asks with prices and sizes. Use this to determine current market prices before placing orders.

### 6. Place a Bet

```bash
curl -X POST "https://heyvincent.ai/api/skills/polymarket/bet" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "<OUTCOME_TOKEN_ID>",
    "side": "BUY",
    "amount": 5,
    "price": 0.55
  }'
```

Parameters:

- `tokenId`: The outcome token ID (from market data or order book)
- `side`: `"BUY"` or `"SELL"`
- `amount`: For BUY orders, USD amount to spend. For SELL orders, number of shares to sell.
- `price`: Optional limit price (0.01 to 0.99). Omit for market order. ALWAYS use a market order unless the user specifies a limit price.

**BUY orders:**

- `amount` is the USD you want to spend (e.g., `5` = $5)
- You'll receive `amount / price` shares (e.g., $5 at 0.50 = 10 shares)
- Minimum order is $1

**SELL orders:**

- `amount` is the number of shares to sell
- You'll receive `amount * price` USD
- Must own the shares first (from a previous BUY)

**Important timing:** After a BUY fills, wait a few seconds before selling. Shares need time to settle on-chain.

If a trade violates a policy, the server returns an error explaining which policy was triggered. If a trade requires human approval (based on the approval threshold policy), the server returns `status: "pending_approval"` and the wallet owner receives a Telegram notification to approve or deny.

### 7. View Holdings, Positions & Orders

```bash
# Get current holdings with P&L (recommended)
curl -X GET "https://heyvincent.ai/api/skills/polymarket/holdings" \
  -H "Authorization: Bearer <API_KEY>"

# Get open orders
curl -X GET "https://heyvincent.ai/api/skills/polymarket/positions" \
  -H "Authorization: Bearer <API_KEY>"

# Get trade history
curl -X GET "https://heyvincent.ai/api/skills/polymarket/trades" \
  -H "Authorization: Bearer <API_KEY>"
```

**Holdings endpoint** returns all positions with shares owned, average entry price, current price, and unrealized P&L:

```json
{
  "success": true,
  "data": {
    "walletAddress": "0x...",
    "holdings": [
      {
        "tokenId": "123456...",
        "shares": 42.5,
        "averageEntryPrice": 0.55,
        "currentPrice": 0.62,
        "pnl": 2.97,
        "pnlPercent": 12.73,
        "marketTitle": "Will Bitcoin hit $100k by end of 2025?",
        "outcome": "Yes"
      }
    ]
  }
}
```

This is the best endpoint for:

- Checking current positions before placing sell orders
- Setting up stop-loss or take-profit rules
- Calculating total portfolio value and performance
- Showing the user their active bets

**Positions endpoint** returns open limit orders (unfilled orders waiting in the order book).

**Trades endpoint** returns historical trade activity.

### 8. Cancel Orders

```bash
# Cancel specific order
curl -X DELETE "https://heyvincent.ai/api/skills/polymarket/orders/<ORDER_ID>" \
  -H "Authorization: Bearer <API_KEY>"

# Cancel all open orders
curl -X DELETE "https://heyvincent.ai/api/skills/polymarket/orders" \
  -H "Authorization: Bearer <API_KEY>"
```

### 9. Redeem Resolved Positions

After a market resolves, winning positions can be redeemed to convert conditional tokens back into USDC.e. Use the holdings endpoint to check which positions have `redeemable: true`, then call the redeem endpoint.

```bash
# Redeem all redeemable positions
curl -X POST "https://heyvincent.ai/api/skills/polymarket/redeem" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Redeem specific markets by condition ID
curl -X POST "https://heyvincent.ai/api/skills/polymarket/redeem" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "conditionIds": ["0xabc123...", "0xdef456..."]
  }'
```

Parameters:

- `conditionIds`: Optional array of condition IDs to redeem. If omitted, redeems **all** redeemable positions.

Response:

```json
{
  "success": true,
  "data": {
    "walletAddress": "0x...",
    "redeemed": [
      {
        "conditionId": "0xabc123...",
        "marketTitle": "Will Bitcoin hit $100k by end of 2025?",
        "outcome": "Yes",
        "shares": 42.5
      }
    ],
    "transactionHash": "0x..."
  }
}
```

If no positions are redeemable, `redeemed` will be an empty array and no transaction is submitted.

**How it works:** Redemption is gasless (executed via Polymarket's relayer through the Safe). For standard markets, it calls `redeemPositions` on the CTF contract. For negative-risk markets, it calls `redeemPositions` on the NegRiskAdapter. Both types are handled automatically - you don't need to know which type a market is.

**When to redeem:** Check the holdings endpoint periodically. After a market resolves, it may take some time before positions become redeemable. Look for `redeemable: true` in the holdings response.

## Policies (Server-Side Enforcement)

The wallet owner controls what the agent can do by setting policies via the claim URL at `https://heyvincent.ai`. All policies are enforced server-side by the Vincent API - the agent cannot bypass or modify them. If a trade violates a policy, the API rejects it. If a trade triggers an approval threshold, the API holds it and sends the wallet owner a Telegram notification for out-of-band human approval.

| Policy                      | What it does                                                     |
| --------------------------- | ---------------------------------------------------------------- |
| **Spending limit (per tx)** | Max USD value per transaction                                    |
| **Spending limit (daily)**  | Max USD value per rolling 24 hours                               |
| **Spending limit (weekly)** | Max USD value per rolling 7 days                                 |
| **Require approval**        | Every transaction needs human approval via Telegram              |
| **Approval threshold**      | Transactions above a USD amount need human approval via Telegram |

Before the wallet is claimed, the agent can operate without policy restrictions. This is by design: agent-first onboarding allows the agent to begin trading immediately. Once the human operator claims the wallet via the claim URL, they can add any combination of policies to constrain the agent's behavior. The wallet owner can also revoke the agent's API key entirely at any time.

## Re-linking (Recovering API Access)

If the agent loses its API key, the wallet owner can generate a **re-link token** from the frontend. The agent then exchanges this token for a new scoped API key.

**How it works:**

1. The user generates a re-link token from the wallet detail page at `https://heyvincent.ai`
2. The user gives the token to the agent (e.g. by pasting it in chat)
3. The agent calls the re-link endpoint to exchange the token for a new scoped API key

```bash
curl -X POST "https://heyvincent.ai/api/secrets/relink" \
  -H "Content-Type: application/json" \
  -d '{
    "relinkToken": "<TOKEN_FROM_USER>",
    "apiKeyName": "Re-linked API Key"
  }'
```

Response includes:

- `secret` -- the wallet metadata (id, type, address, chainId, etc.)
- `apiKey.key` -- the new scoped API key to use as Bearer token for all future requests

**Important:** Re-link tokens are one-time use and expire after 10 minutes. No authentication is required on this endpoint -- the token itself is the authorization.

If a user tells you they have a re-link token, use this endpoint to regain access to the wallet. Store the returned API key and use it for all subsequent requests.

## Workflow Example

1. **Create wallet:**

   ```bash
   POST /api/secrets {"type": "POLYMARKET_WALLET", "memo": "Betting wallet"}
   ```

2. **Get Safe address (triggers deployment):**

   ```bash
   GET /api/skills/polymarket/balance
   # Returns walletAddress -- give this to user to fund
   ```

3. **User sends USDC.e to the Safe address on Polygon**

4. **Search for a market:**

   ```bash
   # Search by keyword - returns only active, tradeable markets
   GET /api/skills/polymarket/markets?query=bitcoin&active=true

   # Or search by slug from a Polymarket URL
   GET /api/skills/polymarket/markets?slug=btc-updown-5m-1771380900
   ```

   Response example:

   ```json
   {
     "markets": [
       {
         "question": "Will Bitcoin hit $100k by end of 2025?",
         "outcomes": ["Yes", "No"],
         "outcomePrices": ["0.65", "0.35"],
         "tokenIds": ["123456...", "789012..."],
         "acceptingOrders": true
       }
     ]
   }
   ```

5. **Check order book for the outcome you want:**

   ```bash
   # Use the tokenId from the market response
   GET /api/skills/polymarket/orderbook/123456...
   # Note the bid/ask prices
   ```

6. **Place BUY bet using the correct token ID:**

   ```bash
   # tokenId must be from the tokenIds array, NOT the conditionId
   POST /api/skills/polymarket/bet
   {"tokenId": "123456...", "side": "BUY", "amount": 5, "price": 0.55}
   ```

7. **Wait for settlement** (a few seconds)

8. **Sell position:**
   ```bash
   POST /api/skills/polymarket/bet
   {"tokenId": "123456...", "side": "SELL", "amount": 9.09, "price": 0.54}
   ```

9. **Redeem after market resolves** (if holding through resolution):
   ```bash
   # Check holdings for redeemable positions
   GET /api/skills/polymarket/holdings
   # If redeemable: true, redeem to get USDC.e back
   POST /api/skills/polymarket/redeem {}
   ```

## Important Notes

- **After any bet or trade**, share the user's Polymarket profile link so they can verify and view their positions: `https://polymarket.com/profile/<polymarketWalletAddress>` (use the wallet's Safe address).
- **No gas needed.** All Polymarket transactions are gasless via Polymarket's relayer.
- **Never try to access raw secret values.** The private key stays server-side -- that's the whole point.
- Always store the API key from wallet creation in the declared config paths. If you're an OpenClaw instance, store it in `~/.openclaw/credentials/agentwallet/<API_KEY_ID>.json`. Otherwise, store it in your current working directory at `agentwallet/<API_KEY_ID>.json`.
- Always search for existing API keys in the declared config paths before creating a new wallet. If you're an OpenClaw instance, search in `~/.openclaw/credentials/agentwallet/`. Otherwise, search in `./agentwallet/`.
- Always share the claim URL with the user after creating a wallet.
- If a transaction is rejected, it may be blocked by a server-side policy. Tell the user to check their policy settings at `https://heyvincent.ai`.
- If a transaction requires approval, it will return `status: "pending_approval"`. The wallet owner will receive a Telegram notification to approve or deny.

**Common Errors:**

- `"No orderbook exists for the requested token id"` - The market is closed or you're using the wrong ID. Make sure:
  - The market has `acceptingOrders: true`
  - You're using a `tokenId` from the `tokenIds` array, not the `conditionId`
  - The market hasn't already resolved
