;; Asset Ledger - Digital Ownership Protocol
;; 
;; A comprehensive smart contract system enabling tokenization and fractional
;; ownership of physical assets on the Stacks blockchain. Supports full asset
;; lifecycle management from initial registration through verification, tokenization,
;; and eventual decommissioning.

;; ============================================================================
;; ERROR DEFINITIONS
;; ============================================================================

(define-constant ERROR-UNAUTHORIZED (err u100))
(define-constant ERROR-ASSET-EXISTS (err u101))
(define-constant ERROR-NOT-FOUND (err u102))
(define-constant ERROR-UNVERIFIED (err u103))
(define-constant ERROR-LOW-BALANCE (err u104))
(define-constant ERROR-TXN-FAILED (err u105))
(define-constant ERROR-ALREADY-TOKENIZED (err u106))
(define-constant ERROR-BAD-INPUT (err u107))
(define-constant ERROR-VERIFIER-ONLY (err u108))
(define-constant ERROR-DECOMMISSIONED (err u109))
(define-constant ERROR-COMPLIANCE-BLOCK (err u110))
(define-constant ERROR-INVALID-AMOUNT (err u111))

;; ============================================================================
;; GLOBAL CONSTANTS
;; ============================================================================

(define-constant OWNER tx-sender)
(define-constant STATE-PENDING u1)
(define-constant STATE-APPROVED u2)
(define-constant STATE-DECLINED u3)
(define-constant STATE-ACTIVE u4)
(define-constant STATE-INACTIVE u5)

;; ============================================================================
;; DATA MAPS & STORAGE
;; ============================================================================

;; Primary registry of all physical assets
(define-map ledger-entries
  { item-id: (string-ascii 36) }
  {
    originator: principal,
    lifecycle-state: uint,
    reviewer: (optional principal),
    review-timestamp: (optional uint),
    data-store-uri: (string-utf8 256),
    registered-at: uint,
    modified-at: uint,
    integrity-check: (string-ascii 64),
    decommissioned-flag: bool
  }
)

;; Token metadata for asset-backed tokens
(define-map token-specs
  { item-id: (string-ascii 36) }
  {
    supply-amount: uint,
    precision-level: uint,
    asset-uri: (string-utf8 256),
    activated-at: uint
  }
)

;; Holdings tracking
(define-map account-holdings
  { item-id: (string-ascii 36), holder: principal }
  { token-qty: uint }
)

;; Verified reviewers registry
(define-map reviewer-registry
  { reviewer: principal }
  { enabled: bool, enrollment-time: uint }
)

;; Transaction ledger
(define-map tx-ledger
  { item-id: (string-ascii 36), sequence: uint }
  {
    sender: principal,
    receiver: principal,
    quantity: uint,
    block-num: uint
  }
)

;; Counters and state tracking
(define-data-var seq-counter uint u0)
(define-data-var reviewer-total uint u0)
(define-data-var asset-registry-size uint u0)

;; ============================================================================
;; PRIVATE UTILITIES
;; ============================================================================

;; Confirms sender is the contract deployer
(define-private (validate-owner)
  (is-eq tx-sender OWNER)
)

;; Confirms sender has reviewer permissions
(define-private (validate-reviewer)
  (default-to false (get enabled (map-get? reviewer-registry { reviewer: tx-sender })))
)

;; Verifies asset registration exists
(define-private (entry-registered? (item-id (string-ascii 36)))
  (is-some (map-get? ledger-entries { item-id: item-id }))
)

;; Checks if caller owns the asset registration
(define-private (verify-ownership (item-id (string-ascii 36)))
  (let ((entry (map-get? ledger-entries { item-id: item-id })))
    (if (is-some entry)
      (is-eq tx-sender (get originator (unwrap-panic entry)))
      false
    )
  )
)

;; Query if asset is currently active with tokens
(define-private (has-active-tokens (item-id (string-ascii 36)))
  (let ((entry (map-get? ledger-entries { item-id: item-id })))
    (if (is-some entry)
      (is-eq (get lifecycle-state (unwrap-panic entry)) STATE-ACTIVE)
      false
    )
  )
)

;; Returns if asset is decommissioned
(define-private (is-decommissioned? (item-id (string-ascii 36)))
  (let ((entry (map-get? ledger-entries { item-id: item-id })))
    (if (is-some entry)
      (get decommissioned-flag (unwrap-panic entry))
      false
    )
  )
)

;; Query balance for an account on an asset
(define-private (balance-query (item-id (string-ascii 36)) (account principal))
  (default-to u0 
    (get token-qty (map-get? account-holdings { item-id: item-id, holder: account }))
  )
)

;; Fetch next sequence number and increment
(define-private (increment-sequence)
  (let ((current (var-get seq-counter)))
    (var-set seq-counter (+ current u1))
    current
  )
)

;; Validates transfer is compliant
(define-private (compliant-transfer? (item-id (string-ascii 36)) (from principal) (to principal) (qty uint))
  (let ((entry (map-get? ledger-entries { item-id: item-id })))
    (if (is-some entry)
      (and 
        (not (get decommissioned-flag (unwrap-panic entry)))
        (is-eq (get lifecycle-state (unwrap-panic entry)) STATE-ACTIVE)
        (>= (balance-query item-id from) qty)
        (> qty u0)
      )
      false
    )
  )
)

;; Updates holdings and records transaction
(define-private (execute-transfer (item-id (string-ascii 36)) (from principal) (to principal) (qty uint))
  (let (
    (from-current (balance-query item-id from))
    (to-current (balance-query item-id to))
  )
    (map-set account-holdings 
      { item-id: item-id, holder: from }
      { token-qty: (- from-current qty) }
    )
    
    (map-set account-holdings
      { item-id: item-id, holder: to }
      { token-qty: (+ to-current qty) }
    )
    
    (map-set tx-ledger
      { item-id: item-id, sequence: (increment-sequence) }
      {
        sender: from,
        receiver: to,
        quantity: qty,
        block-num: block-height
      }
    )
    
    (ok true)
  )
)

;; ============================================================================
;; PUBLIC READ-ONLY FUNCTIONS
;; ============================================================================

;; Query reviewer authorization status
(define-read-only (check-reviewer (subject principal))
  (default-to false (get enabled (map-get? reviewer-registry { reviewer: subject })))
)

;; Retrieve asset metadata and status
(define-read-only (fetch-asset-info (item-id (string-ascii 36)))
  (if (entry-registered? item-id)
    (ok (map-get? ledger-entries { item-id: item-id }))
    ERROR-NOT-FOUND
  )
)

;; Access tokenization parameters
(define-read-only (query-token-metadata (item-id (string-ascii 36)))
  (if (has-active-tokens item-id)
    (ok (map-get? token-specs { item-id: item-id }))
    ERROR-UNVERIFIED
  )
)

;; Query balance for principal on asset
(define-read-only (query-holdings (item-id (string-ascii 36)) (account principal))
  (ok { 
    item-id: item-id, 
    account: account, 
    balance: (balance-query item-id account) 
  })
)

;; Evaluate transfer feasibility
(define-read-only (validate-transfer (item-id (string-ascii 36)) (from principal) (to principal) (qty uint))
  (if (compliant-transfer? item-id from to qty)
    (ok true)
    ERROR-COMPLIANCE-BLOCK
  )
)

;; ============================================================================
;; PUBLIC STATE-CHANGING FUNCTIONS
;; ============================================================================

;; Register a new asset into the system
(define-public (enroll-asset 
  (item-id (string-ascii 36)) 
  (data-uri (string-utf8 256))
  (integrity-hash (string-ascii 64))
)
  (let ((now block-height))
    (if (entry-registered? item-id)
      ERROR-ASSET-EXISTS
      (begin
        (map-set ledger-entries
          { item-id: item-id }
          {
            originator: tx-sender,
            lifecycle-state: STATE-PENDING,
            reviewer: none,
            review-timestamp: none,
            data-store-uri: data-uri,
            registered-at: now,
            modified-at: now,
            integrity-check: integrity-hash,
            decommissioned-flag: false
          }
        )
        (var-set asset-registry-size (+ (var-get asset-registry-size) u1))
        (ok { item-id: item-id, state: STATE-PENDING })
      )
    )
  )
)

;; Modify asset data store information
(define-public (amend-asset-info
  (item-id (string-ascii 36))
  (new-uri (string-utf8 256))
)
  (let ((entry (map-get? ledger-entries { item-id: item-id })))
    (if (is-none entry)
      ERROR-NOT-FOUND
      (if (not (verify-ownership item-id))
        ERROR-UNAUTHORIZED
        (if (is-decommissioned? item-id)
          ERROR-DECOMMISSIONED
          (begin
            (map-set ledger-entries
              { item-id: item-id }
              (merge (unwrap-panic entry)
                {
                  data-store-uri: new-uri,
                  modified-at: block-height
                }
              )
            )
            (ok { item-id: item-id, amended: true })
          )
        )
      )
    )
  )
)

;; Register a new permitted reviewer
(define-public (grant-reviewer-access (subject principal))
  (if (validate-owner)
    (begin
      (map-set reviewer-registry
        { reviewer: subject }
        { enabled: true, enrollment-time: block-height }
      )
      (var-set reviewer-total (+ (var-get reviewer-total) u1))
      (ok { reviewer: subject, granted: true })
    )
    ERROR-UNAUTHORIZED
  )
)

;; Revoke reviewer permissions
(define-public (revoke-reviewer-access (subject principal))
  (if (validate-owner)
    (begin
      (map-set reviewer-registry
        { reviewer: subject }
        { enabled: false, enrollment-time: (default-to block-height (get enrollment-time (map-get? reviewer-registry { reviewer: subject }))) }
      )
      (var-set reviewer-total (- (var-get reviewer-total) u1))
      (ok { reviewer: subject, revoked: true })
    )
    ERROR-UNAUTHORIZED
  )
)

;; Review and approve or reject an asset
(define-public (assess-asset (item-id (string-ascii 36)) (decision bool))
  (let ((entry (map-get? ledger-entries { item-id: item-id })))
    (if (is-none entry)
      ERROR-NOT-FOUND
      (if (not (validate-reviewer))
        ERROR-VERIFIER-ONLY
        (begin
          (map-set ledger-entries
            { item-id: item-id }
            (merge (unwrap-panic entry)
              {
                lifecycle-state: (if decision STATE-APPROVED STATE-DECLINED),
                reviewer: (some tx-sender),
                review-timestamp: (some block-height),
                modified-at: block-height
              }
            )
          )
          (ok { 
            item-id: item-id, 
            approved: decision, 
            state: (if decision STATE-APPROVED STATE-DECLINED)
          })
        )
      )
    )
  )
)

;; Create tokens from a verified asset
(define-public (issue-tokens
  (item-id (string-ascii 36))
  (issuance-qty uint)
  (decimal-places uint)
  (token-uri (string-utf8 256))
)
  (let ((entry (map-get? ledger-entries { item-id: item-id })))
    (if (is-none entry)
      ERROR-NOT-FOUND
      (if (not (verify-ownership item-id))
        ERROR-UNAUTHORIZED
        (if (not (is-eq (get lifecycle-state (unwrap-panic entry)) STATE-APPROVED))
          ERROR-UNVERIFIED
          (if (has-active-tokens item-id)
            ERROR-ALREADY-TOKENIZED
            (begin
              (map-set ledger-entries
                { item-id: item-id }
                (merge (unwrap-panic entry)
                  {
                    lifecycle-state: STATE-ACTIVE,
                    modified-at: block-height
                  }
                )
              )
              
              (map-set token-specs
                { item-id: item-id }
                {
                  supply-amount: issuance-qty,
                  precision-level: decimal-places,
                  asset-uri: token-uri,
                  activated-at: block-height
                }
              )
              
              (map-set account-holdings
                { item-id: item-id, holder: tx-sender }
                { token-qty: issuance-qty }
              )
              
              (ok { 
                item-id: item-id, 
                supply: issuance-qty,
                issuer: tx-sender,
                state: STATE-ACTIVE
              })
            )
          )
        )
      )
    )
  )
)

;; Transfer tokens between parties
(define-public (move-tokens
  (item-id (string-ascii 36))
  (recipient principal)
  (amount uint)
)
  (let ((sender tx-sender))
    (if (not (entry-registered? item-id))
      ERROR-NOT-FOUND
      (if (not (has-active-tokens item-id))
        ERROR-UNVERIFIED
        (if (is-decommissioned? item-id)
          ERROR-DECOMMISSIONED
          (if (<= amount u0)
            ERROR-INVALID-AMOUNT
            (if (> amount (balance-query item-id sender))
              ERROR-LOW-BALANCE
              (if (not (compliant-transfer? item-id sender recipient amount))
                ERROR-COMPLIANCE-BLOCK
                (execute-transfer item-id sender recipient amount)
              )
            )
          )
        )
      )
    )
  )
)

;; Mark an asset as decommissioned
(define-public (decommission-asset (item-id (string-ascii 36)))
  (let ((entry (map-get? ledger-entries { item-id: item-id })))
    (if (is-none entry)
      ERROR-NOT-FOUND
      (if (and (not (verify-ownership item-id)) (not (validate-owner)))
        ERROR-UNAUTHORIZED
        (if (is-decommissioned? item-id)
          ERROR-DECOMMISSIONED
          (begin
            (map-set ledger-entries
              { item-id: item-id }
              (merge (unwrap-panic entry)
                {
                  lifecycle-state: STATE-INACTIVE,
                  decommissioned-flag: true,
                  modified-at: block-height
                }
              )
            )
            (ok { item-id: item-id, decommissioned: true })
          )
        )
      )
    )
  )
)