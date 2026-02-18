---
name: vincent-wallet
description: Create a policy-limited wallet for agents (EVM + Solana) without exposing private keys.
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

# Vincent - A wallet for agents

Use this skill to safely create a wallet the agent can use for transfers, swaps, and any EVM chain transaction without ever exposing private keys to the agent. Create a wallet, set spending policies, and your agent can transfer tokens, do swaps, and interact with smart contracts within the boundaries you define.

**The agent never sees the private key.** All transactions are executed server-side through a ZeroDev smart account. The agent receives a scoped API key that can only perform actions permitted by the wallet owner's policies. The private key never leaves the Vincent server.

## Security Model

This skill is designed for **autonomous agent operation with human oversight via server-side controls**. Understanding this model is important:

**No environment variables are required** because this skill uses agent-first onboarding: the agent creates its own wallet at runtime by calling the Vincent API, which returns a scoped API key. There is no pre-existing credential to configure. The agent generates and stores its own API key during wallet creation - no secrets need to exist before the skill runs. The config paths where the agent persists the returned API key (`~/.openclaw/credentials/agentwallet/` or `./agentwallet/`) are declared in this skill's metadata.

**The agent's API key is not a private key.** It is a scoped Bearer token that can only execute transactions within the policies set by the wallet owner. The Vincent server enforces all policies server-side - the agent cannot bypass them regardless of what it sends. If a transaction violates a policy, the server rejects it. If a transaction requires approval, the server holds it and notifies the wallet owner via Telegram for out-of-band human approval.

**Model invocation is intentionally enabled.** The purpose of this skill is to give AI agents autonomous wallet capabilities. The agent is expected to invoke wallet actions (transfers, swaps, contract calls) on its own, within the boundaries the human operator defines. The human controls what the agent can do through policies (spending limits, address allowlists, token allowlists, function allowlists, approval thresholds) - not by gating individual invocations. The agent persists its scoped API key to the declared config paths so it can resume wallet operations across sessions; this is expected behavior for an autonomous wallet agent. The stored key is scoped and policy-constrained - even if another process reads it, it can only perform actions the wallet owner's policies allow, and the owner can revoke it instantly.

**All API calls go exclusively to `heyvincent.ai`** over HTTPS/TLS. No other endpoints, services, or external hosts are contacted. The agent does not read, collect, or transmit any data beyond what is needed for wallet operations.

**Vincent is open source and audited.** The server-side code that enforces policies, manages private keys, and executes transactions is publicly auditable at [github.com/HeyVincent-ai/Vincent](https://github.com/HeyVincent-ai/Vincent). The Vincent backend undergoes continuous security audits covering key management, policy enforcement, transaction signing, and API authentication. You can verify how policy enforcement works, how private keys are stored, how the scoped API key is validated, and how revocation is handled - nothing is opaque. If you want to self-host Vincent rather than trust the hosted service, the repository includes deployment instructions.

**Key lifecycle:**

- **Creation**: The agent calls `POST /api/secrets` to create a wallet. The API returns a scoped API key and a claim URL.
- **Claim**: The human operator uses the claim URL to take ownership and configure policies.
- **Revocation**: The wallet owner can revoke the agent's API key at any time from the Vincent frontend (`https://heyvincent.ai`). Revoked keys are rejected immediately by the server. The revocation logic is [open source](https://github.com/HeyVincent-ai/Vincent).
- **Re-linking**: If the agent loses its API key, the wallet owner generates a one-time re-link token (expires after 10 minutes) and the agent exchanges it for a new key.
- **Rotation**: The wallet owner can revoke the current key and issue a re-link token to rotate credentials at any time.

## Which Secret Type to Use

| Type         | Use Case                                  | Network                 | Gas              |
| ------------ | ----------------------------------------- | ----------------------- | ---------------- |
| `EVM_WALLET` | Transfers, swaps, DeFi, contract calls    | Any EVM chain           | Sponsored (free) |
| `RAW_SIGNER` | Raw message signing for special protocols | Any (Ethereum + Solana) | You pay          |

**Choose `EVM_WALLET`** (default) for:

- Sending ETH or tokens
- Swapping tokens on DEXs
- Interacting with smart contracts
- Any standard EVM transaction

**Choose `RAW_SIGNER`** only when you need:

- Raw ECDSA/Ed25519 signatures for protocols that don't work with smart accounts
- To sign transaction hashes you'll broadcast yourself
- Solana signatures

## Configuration

All API requests require a Bearer token (the scoped API key returned when creating a wallet). This key is not a private key - it is a server-enforced, policy-scoped credential that the wallet owner can revoke at any time.

Store the API key locally after wallet creation in one of the declared config paths. If you're an OpenClaw instance, store and retrieve it from `~/.openclaw/credentials/agentwallet/<API_KEY_ID>.json`. Otherwise, store it in your current working directory at `agentwallet/<API_KEY_ID>.json`. These paths are declared in this skill's metadata so the host environment can audit and manage credential storage.

```
Authorization: Bearer <API_KEY>
```

## Quick Start

### 1. Create a Wallet

Create a new smart account wallet for your agent. This generates a private key server-side (the agent never sees it), creates a ZeroDev smart account, and returns a scoped API key for the agent plus a claim URL for the wallet owner.

```bash
curl -X POST "https://heyvincent.ai/api/secrets" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EVM_WALLET",
    "memo": "My agent wallet",
    "chainId": 84532
  }'
```

Response includes:

- `apiKey` -- a scoped API key; store this securely and use it as the Bearer token for all future requests
- `claimUrl` -- share this with the user so they can claim the wallet and set policies
- `address` -- the smart account address

After creating, tell the user:

> "Here is your wallet claim URL: `<claimUrl>`. Use this to claim ownership, set spending policies, and monitor your agent's wallet activity at https://heyvincent.ai."

### 2. Get Wallet Address

```bash
curl -X GET "https://heyvincent.ai/api/skills/evm-wallet/address" \
  -H "Authorization: Bearer <API_KEY>"
```

### 3. Check Balances

```bash
# Get all token balances across all supported chains (ETH, WETH, USDC, etc.)
curl -X GET "https://heyvincent.ai/api/skills/evm-wallet/balances" \
  -H "Authorization: Bearer <API_KEY>"

# Filter to specific chains (comma-separated chain IDs)
curl -X GET "https://heyvincent.ai/api/skills/evm-wallet/balances?chainIds=1,137,42161" \
  -H "Authorization: Bearer <API_KEY>"
```

Returns all ERC-20 tokens and native balances with symbols, decimals, logos, and USD values.

### 4. Transfer ETH or Tokens

```bash
# Transfer native ETH
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/transfer" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xRecipientAddress",
    "amount": "0.01"
  }'

# Transfer ERC-20 token
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/transfer" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xRecipientAddress",
    "amount": "100",
    "token": "0xTokenContractAddress"
  }'
```

If the transaction violates a policy, the server returns an error explaining which policy was triggered. If the transaction requires human approval (based on the approval threshold policy), the server returns `status: "pending_approval"` and the wallet owner receives a Telegram notification to approve or deny.

### 5. Swap Tokens

Swap one token for another using DEX liquidity (powered by 0x).

```bash
# Preview a swap (no execution, just pricing)
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/swap/preview" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "sellToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "buyToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "sellAmount": "0.1",
    "chainId": 1
  }'

# Execute a swap
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/swap/execute" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "sellToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "buyToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "sellAmount": "0.1",
    "chainId": 1,
    "slippageBps": 100
  }'
```

- `sellToken` / `buyToken`: Token contract addresses. Use `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` for native ETH.
- `sellAmount`: Human-readable amount to sell (e.g. `"0.1"` for 0.1 ETH).
- `chainId`: The chain to swap on (1 = Ethereum, 137 = Polygon, 42161 = Arbitrum, 10 = Optimism, 8453 = Base, etc.).
- `slippageBps`: Optional slippage tolerance in basis points (100 = 1%). Defaults to 100.

The preview endpoint returns expected buy amount, route info, and fees without executing. The execute endpoint performs the actual swap through the smart account, handling ERC20 approvals automatically.

### 6. Send Arbitrary Transaction

Interact with any smart contract by sending custom calldata.

```bash
curl -X POST "https://heyvincent.ai/api/skills/evm-wallet/send-transaction" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xContractAddress",
    "data": "0xCalldata",
    "value": "0"
  }'
```

## Policies (Server-Side Enforcement)

The wallet owner controls what the agent can do by setting policies via the claim URL at `https://heyvincent.ai`. All policies are enforced server-side by the Vincent API - the agent cannot bypass or modify them. If a transaction violates a policy, the API rejects it. If a transaction triggers an approval threshold, the API holds it and sends the wallet owner a Telegram notification for out-of-band human approval. The policy enforcement logic is open source and auditable at [github.com/HeyVincent-ai/Vincent](https://github.com/HeyVincent-ai/Vincent).

| Policy                      | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| **Address allowlist**       | Only allow transfers/calls to specific addresses                    |
| **Token allowlist**         | Only allow transfers of specific ERC-20 tokens                      |
| **Function allowlist**      | Only allow calling specific contract functions (by 4-byte selector) |
| **Spending limit (per tx)** | Max USD value per transaction                                       |
| **Spending limit (daily)**  | Max USD value per rolling 24 hours                                  |
| **Spending limit (weekly)** | Max USD value per rolling 7 days                                    |
| **Require approval**        | Every transaction needs human approval via Telegram                 |
| **Approval threshold**      | Transactions above a USD amount need human approval via Telegram    |

Before the wallet is claimed, the agent can operate without policy restrictions. This is by design: agent-first onboarding allows the agent to begin accumulating and managing funds immediately. Once the human operator claims the wallet via the claim URL, they can add any combination of policies to constrain the agent's behavior. The wallet owner can also revoke the agent's API key entirely at any time.

## Re-linking (Recovering API Access)

If the agent loses its API key, the wallet owner can generate a **re-link token** from the frontend. The agent then exchanges this token for a new API key.

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

## Important Notes

- **No gas needed.** A paymaster is fully set up -- all transaction gas fees are sponsored automatically. The wallet does not need ETH for gas.
- **Never try to access raw secret values.** The private key stays server-side -- that's the whole point.
- Always store the API key from wallet creation in the declared config paths. If you're an OpenClaw instance, store it in `~/.openclaw/credentials/agentwallet/<API_KEY_ID>.json`. Otherwise, store it in your current working directory at `agentwallet/<API_KEY_ID>.json`.
- Always search for existing API keys in the declared config paths before creating a new wallet. If you're an OpenClaw instance, search in `~/.openclaw/credentials/agentwallet/`. Otherwise, search in `./agentwallet/`.
- Always share the claim URL with the user after creating a wallet.
- If a transaction is rejected, it may be blocked by a server-side policy. Tell the user to check their policy settings at `https://heyvincent.ai`.
- If a transaction requires approval, it will return `status: "pending_approval"`. The wallet owner will receive a Telegram notification to approve or deny.

---

## Raw Signer (Advanced)

For raw ECDSA/Ed25519 signing when smart accounts won't work.

### Create a Raw Signer

```bash
curl -X POST "https://heyvincent.ai/api/secrets" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "RAW_SIGNER",
    "memo": "My raw signer"
  }'
```

Response includes both Ethereum (secp256k1) and Solana (ed25519) addresses derived from the same seed.

### Get Addresses

```bash
curl -X GET "https://heyvincent.ai/api/skills/raw-signer/addresses" \
  -H "Authorization: Bearer <API_KEY>"
```

Returns `ethAddress` and `solanaAddress`.

### Sign a Message

```bash
curl -X POST "https://heyvincent.ai/api/skills/raw-signer/sign" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "0x<hex-encoded-bytes>",
    "curve": "ethereum"
  }'
```

- `message`: Hex-encoded bytes to sign (must start with `0x`)
- `curve`: `"ethereum"` for secp256k1 ECDSA, `"solana"` for ed25519

Returns a hex-encoded signature. For Ethereum, this is `r || s || v` (65 bytes). For Solana, it's a 64-byte ed25519 signature.
