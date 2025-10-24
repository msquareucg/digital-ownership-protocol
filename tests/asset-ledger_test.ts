import { Clarinet, Tx, Chain, Account, types } from "https://deno.land/x/clarinet@v1.0.0/index.ts";
import { assertEquals } from "https://deno.land/std@0.90.0/testing/asserts.ts";

Clarinet.test({
  name: "Registry: Can enroll new asset with valid parameters",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const asset1 = "resource-a001-uuid";
    const metaUrl = "ipfs://bafk2312xyz";
    const integrity = "sha256hash128bit";

    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [
          types.ascii(asset1),
          types.utf8(metaUrl),
          types.ascii(integrity),
        ],
        deployer.address
      ),
    ]);

    assertEquals(block.receipts.length, 1);
    assertEquals(block.receipts[0].result.expectOk(), {
      "item-id": asset1,
      state: types.uint(1),
    });
  },
});

Clarinet.test({
  name: "Registry: Prevents duplicate asset enrollment",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const assetId = "asset-duplicate-test";
    const dataStore = "https://cdn.example.com/data";
    const hash = "integrity1234567890abcdef";

    let block1 = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(assetId), types.utf8(dataStore), types.ascii(hash)],
        deployer.address
      ),
    ]);
    assertEquals(block1.receipts[0].result.expectOk()["item-id"], assetId);

    let block2 = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(assetId), types.utf8(dataStore), types.ascii(hash)],
        deployer.address
      ),
    ]);
    block2.receipts[0].result.expectErr(types.uint(101));
  },
});

Clarinet.test({
  name: "Access Control: Only owner can manage reviewers",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const user1 = accounts.get("wallet_1")!;
    const reviewer = accounts.get("wallet_2")!;

    // Non-owner attempt fails
    let block1 = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        user1.address
      ),
    ]);
    block1.receipts[0].result.expectErr(types.uint(100));

    // Owner succeeds
    let block2 = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);
    block2.receipts[0].result.expectOk();
  },
});

Clarinet.test({
  name: "Reviewer System: Can verify approved asset",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const itemId = "verify-test-001";

    // Setup: enroll asset
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [
          types.ascii(itemId),
          types.utf8("https://metadata.url"),
          types.ascii("hash1234"),
        ],
        owner.address
      ),
    ]);

    // Grant reviewer permissions
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    // Reviewer approves asset
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    assertEquals(block.receipts[0].result.expectOk()["approved"], true);
    assertEquals(block.receipts[0].result.expectOk()["state"], types.uint(2));
  },
});

Clarinet.test({
  name: "Asset Lifecycle: Unauthorized user cannot issue tokens",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const unauthorized = accounts.get("wallet_2")!;
    const assetId = "token-issue-test";

    // Register and verify asset
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [
          types.ascii(assetId),
          types.utf8("https://data.store"),
          types.ascii("integrity_hash"),
        ],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(assetId), types.bool(true)],
        reviewer.address
      ),
    ]);

    // Unauthorized issuer attempt
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [
          types.ascii(assetId),
          types.uint(1000000),
          types.uint(8),
          types.utf8("https://token.uri"),
        ],
        unauthorized.address
      ),
    ]);

    block.receipts[0].result.expectErr(types.uint(100));
  },
});

Clarinet.test({
  name: "Tokenization: Owner can create tokens after verification",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const itemId = "tokenize-success";

    // Enroll
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [
          types.ascii(itemId),
          types.utf8("https://storage.example.com"),
          types.ascii("hash_code"),
        ],
        owner.address
      ),
    ]);

    // Add reviewer
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    // Verify asset
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    // Issue tokens
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [
          types.ascii(itemId),
          types.uint(5000000),
          types.uint(6),
          types.utf8("https://nft.metadata/item"),
        ],
        owner.address
      ),
    ]);

    assertEquals(block.receipts[0].result.expectOk()["supply"], types.uint(5000000));
    assertEquals(block.receipts[0].result.expectOk()["state"], types.uint(4));
  },
});

Clarinet.test({
  name: "Token Operations: Cannot double-tokenize same asset",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const itemId = "double-token-test";

    // Setup asset and tokenize once
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("uri1"), types.ascii("hash1")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [types.ascii(itemId), types.uint(1000), types.uint(8), types.utf8("uri")],
        owner.address
      ),
    ]);

    // Attempt second tokenization
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [types.ascii(itemId), types.uint(2000), types.uint(8), types.utf8("uri2")],
        owner.address
      ),
    ]);

    block.receipts[0].result.expectErr(types.uint(106));
  },
});

Clarinet.test({
  name: "Transfers: Can move tokens between valid holders",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const recipient = accounts.get("wallet_2")!;
    const itemId = "transfer-test";

    // Setup: create tokens
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("data"), types.ascii("check")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [
          types.ascii(itemId),
          types.uint(1000000),
          types.uint(8),
          types.utf8("uri"),
        ],
        owner.address
      ),
    ]);

    // Transfer tokens
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "move-tokens",
        [types.ascii(itemId), types.principal(recipient.address), types.uint(50000)],
        owner.address
      ),
    ]);

    block.receipts[0].result.expectOk();
  },
});

Clarinet.test({
  name: "Transfers: Reject invalid amounts (zero or negative)",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const recipient = accounts.get("wallet_2")!;
    const itemId = "invalid-amount-test";

    // Setup
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("data"), types.ascii("hash")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [types.ascii(itemId), types.uint(1000), types.uint(8), types.utf8("uri")],
        owner.address
      ),
    ]);

    // Try zero amount
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "move-tokens",
        [types.ascii(itemId), types.principal(recipient.address), types.uint(0)],
        owner.address
      ),
    ]);

    block.receipts[0].result.expectErr(types.uint(111));
  },
});

Clarinet.test({
  name: "Transfers: Insufficient balance prevents transfer",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const recipient = accounts.get("wallet_2")!;
    const sender = accounts.get("wallet_3")!;
    const itemId = "low-balance-test";

    // Setup
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("data"), types.ascii("hash")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [types.ascii(itemId), types.uint(1000), types.uint(8), types.utf8("uri")],
        owner.address
      ),
    ]);

    // User with no balance tries to transfer
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "move-tokens",
        [types.ascii(itemId), types.principal(recipient.address), types.uint(100)],
        sender.address
      ),
    ]);

    block.receipts[0].result.expectErr(types.uint(104));
  },
});

Clarinet.test({
  name: "Asset Decommissioning: Owner can decommission asset",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const itemId = "decom-test";

    // Setup and tokenize
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("data"), types.ascii("hash")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [types.ascii(itemId), types.uint(1000), types.uint(8), types.utf8("uri")],
        owner.address
      ),
    ]);

    // Decommission
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "decommission-asset",
        [types.ascii(itemId)],
        owner.address
      ),
    ]);

    block.receipts[0].result.expectOk();
  },
});

Clarinet.test({
  name: "Asset Decommissioning: Prevents transfers on inactive assets",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const recipient = accounts.get("wallet_2")!;
    const itemId = "decom-transfer-test";

    // Setup and tokenize
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("data"), types.ascii("hash")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [types.ascii(itemId), types.uint(1000), types.uint(8), types.utf8("uri")],
        owner.address
      ),
    ]);

    // Decommission
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "decommission-asset",
        [types.ascii(itemId)],
        owner.address
      ),
    ]);

    // Try transfer on decommissioned
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "move-tokens",
        [types.ascii(itemId), types.principal(recipient.address), types.uint(100)],
        owner.address
      ),
    ]);

    block.receipts[0].result.expectErr(types.uint(109));
  },
});

Clarinet.test({
  name: "Asset Metadata: Owner can amend asset info",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const itemId = "amend-test";

    // Enroll
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("original-uri"), types.ascii("hash")],
        owner.address
      ),
    ]);

    // Amend
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "amend-asset-info",
        [types.ascii(itemId), types.utf8("updated-uri")],
        owner.address
      ),
    ]);

    block.receipts[0].result.expectOk();
  },
});

Clarinet.test({
  name: "Asset Metadata: Non-owner cannot amend asset",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const other = accounts.get("wallet_1")!;
    const itemId = "amend-fail-test";

    // Enroll
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("uri"), types.ascii("hash")],
        owner.address
      ),
    ]);

    // Try to amend as non-owner
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "amend-asset-info",
        [types.ascii(itemId), types.utf8("new-uri")],
        other.address
      ),
    ]);

    block.receipts[0].result.expectErr(types.uint(100));
  },
});

Clarinet.test({
  name: "Read-Only: Query asset info returns correct data",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const itemId = "query-test";

    // Enroll
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [
          types.ascii(itemId),
          types.utf8("https://example.com/data"),
          types.ascii("abc123def456"),
        ],
        owner.address
      ),
    ]);

    // Query
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "fetch-asset-info",
        [types.ascii(itemId)],
        owner.address
      ),
    ]);

    const result = block.receipts[0].result.expectOk();
    assertEquals(result["originator"], owner.address);
  },
});

Clarinet.test({
  name: "Read-Only: Query holdings shows correct balance",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const recipient = accounts.get("wallet_2")!;
    const itemId = "balance-query-test";

    // Setup and tokenize
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("uri"), types.ascii("hash")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [types.ascii(itemId), types.uint(1000000), types.uint(8), types.utf8("uri")],
        owner.address
      ),
    ]);

    // Transfer some tokens
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "move-tokens",
        [types.ascii(itemId), types.principal(recipient.address), types.uint(100000)],
        owner.address
      ),
    ]);

    // Query recipient balance
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "query-holdings",
        [types.ascii(itemId), types.principal(recipient.address)],
        owner.address
      ),
    ]);

    const result = block.receipts[0].result.expectOk();
    assertEquals(result["balance"], types.uint(100000));
  },
});

Clarinet.test({
  name: "Reviewer Removal: Can revoke reviewer access",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const itemId = "reviewer-revoke-test";

    // Grant access
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    // Create and verify asset
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("uri"), types.ascii("hash")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    // Revoke reviewer
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "revoke-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    // Verify they cannot verify another asset
    let itemId2 = "after-revoke-test";
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId2), types.utf8("uri"), types.ascii("hash")],
        owner.address
      ),
    ]);

    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId2), types.bool(true)],
        reviewer.address
      ),
    ]);

    block.receipts[0].result.expectErr(types.uint(108));
  },
});

Clarinet.test({
  name: "Verification: Reviewer can reject asset",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const itemId = "reject-test";

    // Setup
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("uri"), types.ascii("hash")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    // Reject asset
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(false)],
        reviewer.address
      ),
    ]);

    assertEquals(block.receipts[0].result.expectOk()["approved"], false);
    assertEquals(block.receipts[0].result.expectOk()["state"], types.uint(3));

    // Cannot tokenize rejected asset
    let block2 = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [types.ascii(itemId), types.uint(1000), types.uint(8), types.utf8("uri")],
        owner.address
      ),
    ]);

    block2.receipts[0].result.expectErr(types.uint(103));
  },
});

Clarinet.test({
  name: "Asset Info: Cannot amend decommissioned asset",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const owner = accounts.get("deployer")!;
    const reviewer = accounts.get("wallet_1")!;
    const itemId = "decom-amend-test";

    // Setup, tokenize, and decommission
    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "enroll-asset",
        [types.ascii(itemId), types.utf8("uri"), types.ascii("hash")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "grant-reviewer-access",
        [types.principal(reviewer.address)],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "assess-asset",
        [types.ascii(itemId), types.bool(true)],
        reviewer.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "issue-tokens",
        [types.ascii(itemId), types.uint(1000), types.uint(8), types.utf8("uri")],
        owner.address
      ),
    ]);

    chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "decommission-asset",
        [types.ascii(itemId)],
        owner.address
      ),
    ]);

    // Try to amend
    let block = chain.mineBlock([
      Tx.contractCall(
        "asset-ledger",
        "amend-asset-info",
        [types.ascii(itemId), types.utf8("new-uri")],
        owner.address
      ),
    ]);

    block.receipts[0].result.expectErr(types.uint(109));
  },
});
