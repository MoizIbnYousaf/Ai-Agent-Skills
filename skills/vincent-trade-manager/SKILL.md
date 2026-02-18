---
name: vincent-trade-manager
description: Automate stop-loss, take-profit, and trailing stops for Polymarket positions.
homepage: https://heyvincent.ai
source: https://github.com/HeyVincent-ai/agent-skills
---
# Trade Manager - Automated Stop-Loss, Take-Profit, and Trailing Stops

Use this skill to create automated trading rules (stop-loss, take-profit, trailing stop) for your Polymarket positions. The Trade Manager runs locally on your OpenClaw VPS and automatically executes trades when price conditions are met.

## How It Works

**Trade Manager is a companion to the Polymarket skill:**
1. Use the **Polymarket skill** to browse markets and place bets
2. Use **Trade Manager** to set automated exit rules on those positions
3. The Trade Manager monitors prices every 15 seconds and executes trades through Vincent's Polymarket API when triggers are met

**Architecture:**
- Local daemon running on your OpenClaw VPS
- Local HTTP API at `http://localhost:19000`
- Stores rules and events in local SQLite database
- Executes trades through Vincent Polymarket API (same as manual trading)
- All Vincent policies (spending limits, approvals) still apply

## Quick Start

### 1. Check Trade Manager Status

Before creating rules, verify the service is running:

```bash
curl http://localhost:19000/health
# Expected: {"status":"ok","version":"0.1.0"}

curl http://localhost:19000/status
# Returns: worker status, active rules count, last sync time, circuit breaker state
```

### 2. Create a Stop-Loss Rule

Automatically sell a position if price drops below a threshold:

```bash
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>" \
  -d '{
    "marketId": "0x123...",
    "tokenId": "456789",
    "ruleType": "STOP_LOSS",
    "triggerPrice": 0.40,
    "action": {"type": "SELL_ALL"}
  }'
```

**Parameters:**
- `marketId`: The Polymarket condition ID (from market data)
- `tokenId`: The outcome token ID you hold (from market data - use the token ID you bought)
- `ruleType`: `"STOP_LOSS"` (sells if price <= trigger) or `"TAKE_PROFIT"` (sells if price >= trigger)
- `triggerPrice`: Price threshold between 0 and 1 (e.g., 0.40 = 40c)
- `action`: `{"type": "SELL_ALL"}` (only supported type in MVP)

**Response:**
```json
{
  "id": "clxyz123...",
  "ruleType": "STOP_LOSS",
  "marketId": "0x123...",
  "tokenId": "456789",
  "triggerPrice": 0.40,
  "action": "{\"type\":\"SELL_ALL\"}",
  "status": "ACTIVE",
  "triggeredAt": null,
  "triggerTxHash": null,
  "createdAt": "2025-02-16T12:00:00.000Z",
  "updatedAt": "2025-02-16T12:00:00.000Z"
}
```

### 3. Create a Take-Profit Rule

Automatically sell a position if price rises above a threshold:

```bash
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>" \
  -d '{
    "marketId": "0x123...",
    "tokenId": "456789",
    "ruleType": "TAKE_PROFIT",
    "triggerPrice": 0.75,
    "action": {"type": "SELL_ALL"}
  }'
```

**Pro tip:** Create both a stop-loss AND take-profit on the same position to bracket your trade.

### 4. Create a Trailing Stop Rule

A trailing stop starts with a stop price, then automatically moves that stop price up as price rises.

```bash
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>" \
  -d '{
    "marketId": "0x123...",
    "tokenId": "456789",
    "ruleType": "TRAILING_STOP",
    "triggerPrice": 0.45,
    "trailingPercent": 5,
    "action": {"type": "SELL_ALL"}
  }'
```

**Trailing stop behavior:**
- `trailingPercent` is percent points (for example `5` means 5%)
- Trade Manager computes `candidateStop = currentPrice * (1 - trailingPercent/100)`
- If `candidateStop` is above the current `triggerPrice`, it updates `triggerPrice`
- `triggerPrice` never moves down
- Rule triggers when `currentPrice <= triggerPrice`

### 5. List Active Rules

```bash
# All rules
curl http://localhost:19000/api/rules \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>"

# Only active rules
curl 'http://localhost:19000/api/rules?status=ACTIVE' \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>"

# Only triggered rules
curl 'http://localhost:19000/api/rules?status=TRIGGERED' \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>"
```

### 6. Update a Rule's Trigger Price

```bash
curl -X PATCH http://localhost:19000/api/rules/<rule-id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>" \
  -d '{
    "triggerPrice": 0.45
  }'
```

### 7. Cancel a Rule

```bash
curl -X DELETE http://localhost:19000/api/rules/<rule-id> \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>"
```

The rule status changes to "CANCELED" and won't trigger anymore.

### 8. View Monitored Positions

See what positions the Trade Manager is currently tracking:

```bash
curl http://localhost:19000/api/positions \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>"
```

Returns cached position data with current prices. This cache updates every 15 seconds.

### 9. View Event Log (Audit Trail)

See detailed history of rule evaluations and executions:

```bash
# All events
curl http://localhost:19000/api/events \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>"

# Events for specific rule
curl 'http://localhost:19000/api/events?ruleId=<rule-id>' \
  -H "Authorization: Bearer <POLYMARKET_API_KEY>"
```

**Event types:**
- `RULE_CREATED` - Rule was created
- `RULE_TRAILING_UPDATED` - Trailing stop moved triggerPrice upward
- `RULE_EVALUATED` - Worker checked the rule (happens every poll)
- `RULE_TRIGGERED` - Trigger condition was met
- `ACTION_EXECUTED` - Trade executed successfully
- `ACTION_FAILED` - Trade execution failed
- `RULE_CANCELED` - Rule was manually canceled

## Complete Workflow: Polymarket + Trade Manager

Here's how to use both skills together:

### Step 1: Place a bet with Polymarket skill

```bash
# Search for a market
curl "https://heyvincent.ai/api/skills/polymarket/markets?query=bitcoin" \
  -H "Authorization: Bearer <API_KEY>"

# Place a bet on "Yes" outcome
curl -X POST "https://heyvincent.ai/api/skills/polymarket/bet" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "123456789",
    "side": "BUY",
    "amount": 10,
    "price": 0.55
  }'
# You bought 18.18 shares at 55c
```

### Step 2: Set stop-loss with Trade Manager

```bash
# Protect your position with a 40c stop-loss
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{
    "marketId": "0xabc...",
    "tokenId": "123456789",
    "ruleType": "STOP_LOSS",
    "triggerPrice": 0.40,
    "action": {"type": "SELL_ALL"}
  }'
```

### Step 3: Set take-profit with Trade Manager

```bash
# Lock in profit if price hits 85c
curl -X POST http://localhost:19000/api/rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{
    "marketId": "0xabc...",
    "tokenId": "123456789",
    "ruleType": "TAKE_PROFIT",
    "triggerPrice": 0.85,
    "action": {"type": "SELL_ALL"}
  }'
```

### Step 4: Monitor your rules

```bash
# Check status
curl http://localhost:19000/api/rules?status=ACTIVE \
  -H "Authorization: Bearer <API_KEY>"

# Check recent events
curl http://localhost:19000/api/events \
  -H "Authorization: Bearer <API_KEY>"
```

### What Happens When a Rule Triggers

1. **Worker detects trigger:** Every 15 seconds, the background worker checks all active rules against current prices
2. **Rule marked as triggered:** Status changes from `ACTIVE` to `TRIGGERED` atomically (prevents double-execution)
3. **Trade executes:** Calls Vincent Polymarket API to place a market sell order
4. **Events logged:** Creates `RULE_TRIGGERED` and `ACTION_EXECUTED` events
5. **You're notified:** (Future feature - Telegram notifications coming soon)

**Important:** Executed trades still go through Vincent's policy enforcement. If your trade violates a spending limit or requires approval, the Trade Manager respects those policies.

## Rule Statuses

- `ACTIVE` - Rule is live and being monitored
- `TRIGGERED` - Condition was met, trade executed (or attempted)
- `CANCELED` - Rule was manually canceled before triggering
- `FAILED` - Rule triggered but trade execution failed
- `EXPIRED` - (Future feature for time-based expiration)

## Background Worker

The Trade Manager runs a background worker that:
- Polls every 15 seconds (configurable)
- Fetches current positions from Vincent Polymarket API
- Fetches current prices for all markets with active rules
- Evaluates each rule against current price
- Executes trades when conditions are met
- Logs all evaluations and actions

**Circuit Breaker:**
If Vincent API fails 5+ consecutive times, the worker enters "OPEN" state and pauses polling. It resumes after a cooldown period. Check worker status:

```bash
curl http://localhost:19000/status
```

Look for `circuitBreakerState: "CLOSED"` (healthy) or `"OPEN"` (paused due to errors).

## Error Handling

### Common Errors

**400 Bad Request - Invalid trigger price:**
```json
{"error": "Trigger price must be between 0 and 1"}
```
Fix: Use prices between 0.01 and 0.99

**400 Bad Request - Missing required field:**
```json
{"error": "tokenId is required"}
```
Fix: Include all required fields (marketId, tokenId, ruleType, triggerPrice, action)

**404 Not Found - Rule doesn't exist:**
```json
{"error": "Rule not found"}
```
Fix: Check the rule ID is correct

**500 Internal Server Error - Trade execution failed:**
The rule status will be `FAILED` with an `errorMessage` field explaining what went wrong. Common causes:
- Insufficient balance
- Market closed
- Vincent API unreachable
- Policy violation

Check the event log for details:
```bash
curl 'http://localhost:19000/api/events?ruleId=<rule-id>'
```

## Best Practices

1. **Always set both stop-loss and take-profit** to bracket your position
2. **Don't set triggers too close** to current price - market noise can trigger prematurely
3. **Monitor the worker status** - if circuit breaker is OPEN, your rules won't trigger
4. **Check event logs** after rules trigger to verify execution
5. **Cancel old rules** after positions close to keep your rule list clean
6. **Use SELL_ALL** - partial sells (`SELL_PARTIAL`) coming in v2

## Limitations (MVP)

- Only supports `SELL_ALL` action (no partial sells yet)
- No time-based triggers (coming in v2)
- No Telegram notifications yet (manual event log checking)
- Polling interval is 15 seconds (not real-time)

## Example User Prompts

When a user says:
- **"Set a stop-loss at 40c for my Bitcoin Yes position"** -> Create STOP_LOSS rule
- **"Take profit at 85c"** -> Create TAKE_PROFIT rule
- **"Set a 5% trailing stop on my Bitcoin Yes position"** -> Create TRAILING_STOP rule
- **"What are my active stop-losses?"** -> List rules with `status=ACTIVE`
- **"Cancel my stop-loss for market XYZ"** -> Delete the rule
- **"Did my stop-loss trigger?"** -> Check rule status and event log
- **"Move my stop-loss to 50c"** -> PATCH the rule's triggerPrice

## API Reference

### POST /api/rules
Create a new trading rule.

**Request:**
```json
{
  "marketId": "string",
  "tokenId": "string",
  "ruleType": "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING_STOP",
  "triggerPrice": number,  // 0 to 1
  "trailingPercent": number,  // required for TRAILING_STOP (0 < x < 100)
  "action": {"type": "SELL_ALL"}
}
```

**Response:** Rule object with `id`, `status: "ACTIVE"`, timestamps

### GET /api/rules
List all rules. Optional query param: `?status=ACTIVE|TRIGGERED|CANCELED|FAILED`

### GET /api/rules/:id
Get a specific rule by ID.

### PATCH /api/rules/:id
Update a rule's trigger price.

**Request:**
```json
{
  "triggerPrice": number  // New trigger price
}
```

### DELETE /api/rules/:id
Cancel a rule. Changes status to "CANCELED".

### GET /api/positions
Get monitored positions (cached, updated every 15s).

### GET /api/events
Get event log. Optional query param: `?ruleId=<id>`

### GET /health
Health check. Returns `{"status":"ok","version":"0.1.0"}`

### GET /status
Worker status including active rules count, last sync time, circuit breaker state.

## Important Notes

- **Authorization:** All endpoints require the same Polymarket API key you use for the Polymarket skill
- **Local only:** The API listens on `localhost:19000` - only accessible from the same VPS
- **No private keys:** Trade Manager uses Vincent API for all trades - your private key stays secure on Vincent's servers
- **Policy enforcement:** All trades executed by Trade Manager still go through Vincent's policy checks
- **Idempotency:** Rules only trigger once - even if the worker crashes and restarts
- **Database location:** SQLite DB at `~/.openclaw/trade-manager.db` (or configured path)
