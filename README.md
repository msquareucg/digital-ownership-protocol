# Digital Ownership Protocol

A production-ready Clarity smart contract implementing a comprehensive asset ledger system for blockchain-backed physical asset tokenization. Enables secure registration, verification, fractional tokenization, and trading of real-world assets with enterprise-grade compliance controls.

## What is Digital Ownership Protocol?

Digital Ownership Protocol (DOP) solves the critical challenge of bridging physical assets with blockchain technology. It provides a trusted framework where:

- **Physical asset originators** can register and tokenize ownership rights
- **Verifiers** authenticate and validate assets before tokenization
- **Investors** can own fractional shares of tangible assets
- **Holders** can securely trade tokens with built-in compliance assurance

The protocol manages the complete lifecycle from enrollment through verification, active trading, and eventual decommissioning.

## Key Features

- **Enterprise Asset Lifecycle Management**: Complete tracking from registration through decommissioning
- **Decentralized Verification**: Multi-reviewer approval system prevents single points of failure
- **Compliance Framework**: Built-in checks prevent unauthorized transfers and invalid transactions
- **Fractional Ownership**: Create divisible tokens from physical assets
- **Immutable Audit Trail**: All transactions recorded on-chain for transparency
- **Role-Based Access Control**: Distinct permissions for owners, reviewers, and token holders

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Asset Registration                        │
│  (enrollment) → State: PENDING                               │
└─────────────┬──────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│                 Reviewer Assessment                          │
│  (assess-asset) → State: APPROVED / DECLINED                │
└─────────────┬──────────────────────────────────────────────┘
              │
              ↓ (if approved)
┌─────────────────────────────────────────────────────────────┐
│            Token Issuance & Distribution                     │
│  (issue-tokens) → State: ACTIVE                             │
└─────────────┬──────────────────────────────────────────────┘
              │
              ├────→ Holdings Tracking (query-holdings)
              ├────→ Token Transfers (move-tokens)
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│              Asset Decommissioning                           │
│  (decommission-asset) → State: INACTIVE                     │
└─────────────────────────────────────────────────────────────┘
```

## Contract Data Model

### Primary Storage Maps

| Map | Purpose | Key | Value |
|-----|---------|-----|-------|
| `ledger-entries` | Master asset registry | item-id | Asset metadata & lifecycle state |
| `token-specs` | Tokenization parameters | item-id | Supply, decimals, activation date |
| `account-holdings` | Token balances | (item-id, holder) | Quantity held |
| `reviewer-registry` | Authorized reviewers | reviewer | Enabled status & enrollment time |
| `tx-ledger` | Transfer history | (item-id, sequence) | Sender, receiver, quantity, block |

### State Constants

- **STATE-PENDING** (u1): Asset awaiting review
- **STATE-APPROVED** (u2): Asset approved for tokenization
- **STATE-DECLINED** (u3): Asset rejected by reviewer
- **STATE-ACTIVE** (u4): Tokens issued and actively trading
- **STATE-INACTIVE** (u5): Asset decommissioned, no transfers allowed

## Public API Reference

### Asset Enrollment & Management

#### `enroll-asset`
Register a new physical asset in the protocol.
```clarity
(enroll-asset item-id data-uri integrity-hash)
```
**Parameters:**
- `item-id`: Unique identifier (max 36 ASCII chars)
- `data-uri`: IPFS or storage location of asset metadata (max 256 UTF-8 chars)
- `integrity-hash`: SHA-256 checksum for verification (64 ASCII chars)

**Returns:** `{ item-id, state: u1 }`

#### `amend-asset-info`
Update asset metadata (owner only).
```clarity
(amend-asset-info item-id new-uri)
```

### Reviewer Operations

#### `grant-reviewer-access`
Authorize a principal to verify assets (owner only).
```clarity
(grant-reviewer-access subject)
```

#### `revoke-reviewer-access`
Remove reviewer permissions (owner only).
```clarity
(revoke-reviewer-access subject)
```

#### `assess-asset`
Approve or reject an asset for tokenization (reviewer only).
```clarity
(assess-asset item-id decision)
```
**Parameters:**
- `decision`: `true` for approval, `false` for rejection

### Token Operations

#### `issue-tokens`
Create and distribute tokens from a verified asset (owner only).
```clarity
(issue-tokens item-id issuance-qty decimal-places token-uri)
```
**Parameters:**
- `issuance-qty`: Total supply (uint)
- `decimal-places`: Precision level (typically 6-8)
- `token-uri`: Metadata endpoint for token

#### `move-tokens`
Transfer tokens between principals with compliance validation.
```clarity
(move-tokens item-id recipient amount)
```

### Asset Decommissioning

#### `decommission-asset`
Mark asset as inactive (prevents further transfers).
```clarity
(decommission-asset item-id)
```
Only callable by asset owner or contract owner.

### Read-Only Queries

#### `fetch-asset-info`
Retrieve asset registration and status.
```clarity
(fetch-asset-info item-id)
```

#### `query-token-metadata`
Get tokenization parameters (returns error if not tokenized).
```clarity
(query-token-metadata item-id)
```

#### `query-holdings`
Check token balance for a principal.
```clarity
(query-holdings item-id account)
```

#### `validate-transfer`
Pre-flight check for transfer validity (compliance).
```clarity
(validate-transfer item-id from to qty)
```

#### `check-reviewer`
Query authorization status of a principal.
```clarity
(check-reviewer subject)
```

## Quick Start Example

```clarity
;; Step 1: Register asset
(contract-call? .asset-ledger enroll-asset
    "rare-artwork-001"
    "ipfs://Qm..."
    "sha256hash..."
)

;; Step 2: Grant reviewer permissions (as contract owner)
(contract-call? .asset-ledger grant-reviewer-access
    'SP2C2YRP3NVSR3MNQB504BEDQOHZDTQSP1K4F4L88
)

;; Step 3: Review and approve (as reviewer)
(contract-call? .asset-ledger assess-asset
    "rare-artwork-001"
    true
)

;; Step 4: Issue tokens (as asset originator)
(contract-call? .asset-ledger issue-tokens
    "rare-artwork-001"
    u10000000
    u8
    "https://token-metadata.example.com/artwork-001"
)

;; Step 5: Transfer tokens to buyer
(contract-call? .asset-ledger move-tokens
    "rare-artwork-001"
    'SP3X6QC7JX4DCGP5XYNZB9K8GT87HQRTZ7JMVH1A3
    u500000
)

;; Step 6: Query holdings
(contract-call? .asset-ledger query-holdings
    "rare-artwork-001"
    'SP3X6QC7JX4DCGP5XYNZB9K8GT87HQRTZ7JMVH1A3
)
```

## Development & Testing

### Run Test Suite
```bash
clarinet test
```

### Interactive Console
```bash
clarinet console
```

### Network Deployment
```bash
# Testnet
clarinet deploy -n testnet

# Mainnet
clarinet deploy -n mainnet
```

## Security Model

### Verification System
- Multi-reviewer architecture prevents fraudulent asset approval
- Each asset requires explicit reviewer sign-off
- Verification state immutable once set (cannot be reversed)
- Reviewers recorded with timestamp for audit

### Transfer Compliance
- All transfers validated against asset state
- Decommissioned assets cannot transfer tokens
- Insufficient balance checks enforced
- Zero-amount transfers rejected at protocol level

### Role Separation
- **Asset Originator** (owner): Can only manage their own assets
- **Reviewer**: Can only verify, no access to other functions
- **Token Holders**: Can transfer only their own tokens
- **Contract Owner**: Administrative operations only

### Failure Modes
| Error Code | Meaning | Resolution |
|----------|---------|-----------|
| u100 | UNAUTHORIZED | Verify caller has required role |
| u101 | ASSET-EXISTS | Asset already registered; use different ID |
| u102 | NOT-FOUND | Asset does not exist; check item-id |
| u103 | UNVERIFIED | Asset not approved; wait for reviewer |
| u104 | LOW-BALANCE | Insufficient tokens; reduce transfer amount |
| u105 | TXN-FAILED | Transfer operation failed internally |
| u106 | ALREADY-TOKENIZED | Asset already has active tokens |
| u107 | BAD-INPUT | Invalid input parameters |
| u108 | VERIFIER-ONLY | Caller must be authorized reviewer |
| u109 | DECOMMISSIONED | Asset is inactive; no transfers allowed |
| u110 | COMPLIANCE-BLOCK | Transfer failed compliance checks |
| u111 | INVALID-AMOUNT | Amount must be greater than zero |

## Production Deployment Checklist

- [ ] Verify all reviewer addresses before granting access
- [ ] Audit asset metadata storage for integrity
- [ ] Establish off-chain verification procedures
- [ ] Implement compliance monitoring system
- [ ] Configure rate limiting for high-volume operations
- [ ] Set up transfer hooks for advanced compliance
- [ ] Document asset retirement procedures
- [ ] Establish incident response procedures

## License

This project is released as open-source smart contract infrastructure for the Stacks ecosystem.
