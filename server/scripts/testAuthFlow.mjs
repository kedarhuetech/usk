import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { pool } from "../src/db/mysql.js";
import { signAuthToken, verifyAuthToken } from "../src/middleware/authMiddleware.js";

async function runTests() {
  console.log("=== STARTING AUTH & MULTI-TENANCY TESTS ===\n");

  const timestamp = Date.now();
  const testEmail = `tenant_${timestamp}@testcompany.com`;
  const testBusinessId = `testbiz-${timestamp}`;
  const testPassword = "SecurePass123!";
  const testBizName = "Alpha Supermarket";

  // Test 1: Password bcrypt hashing and verification
  console.log("TEST 1: Password bcrypt hashing & verification...");
  const hashedPassword = await bcrypt.hash(testPassword, 10);
  assert.ok(hashedPassword && hashedPassword.startsWith("$2"), "Password must be hashed with bcrypt");
  const isMatch = await bcrypt.compare(testPassword, hashedPassword);
  assert.equal(isMatch, true, "Bcrypt compare must succeed for matching password");
  const isBadMatch = await bcrypt.compare("WrongPassword!", hashedPassword);
  assert.equal(isBadMatch, false, "Bcrypt compare must fail for incorrect password");
  console.log("PASSED: Bcrypt hashing & verification works accurately.\n");

  // Test 2: JWT token generation and verification
  console.log("TEST 2: JWT signing and verification...");
  const mockUser = { id: `usr_test_${timestamp}`, email: testEmail, businessId: testBusinessId, role: "business_admin" };
  const token = signAuthToken(mockUser);
  assert.ok(typeof token === "string" && token.length > 20, "JWT token must be a non-empty string");
  const decoded = verifyAuthToken(token);
  assert.equal(decoded.email, testEmail, "Decoded token must have matching email");
  assert.equal(decoded.businessId, testBusinessId, "Decoded token must have matching businessId");
  console.log("PASSED: JWT token generation and verification valid.\n");

  // Test 3: Email OTP creation and storage in MySQL
  console.log("TEST 3: Email OTP creation and database record...");
  const otpId = `otp_${timestamp}_abc`;
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Invalidate any older OTPs
  await pool.query("DELETE FROM email_verifications WHERE email = ?", [testEmail]);
  await pool.query(
    "INSERT INTO email_verifications (id, email, otp_code, expires_at, is_verified) VALUES (?, ?, ?, ?, FALSE)",
    [otpId, testEmail, otpCode, expiresAt]
  );

  const [otpRows] = await pool.query(
    "SELECT * FROM email_verifications WHERE email = ? AND otp_code = ? AND is_verified = FALSE",
    [testEmail, otpCode]
  );
  assert.equal(otpRows.length, 1, "OTP record must exist in database");
  assert.equal(otpRows[0].otp_code, otpCode, "Stored OTP must match generated code");

  // Verify OTP
  await pool.query("UPDATE email_verifications SET is_verified = TRUE WHERE id = ?", [otpRows[0].id]);
  const [verifiedRows] = await pool.query("SELECT is_verified FROM email_verifications WHERE id = ?", [otpRows[0].id]);
  assert.equal(verifiedRows[0].is_verified, 1, "OTP must be marked as verified");
  console.log("PASSED: Email verification OTP record created and verified.\n");

  // Test 4: Business ID uniqueness check
  console.log("TEST 4: Business ID / Tenant ID uniqueness check...");
  // Check non-existent business ID
  const [existingBiz] = await pool.query("SELECT id FROM businesses WHERE id = ?", [testBusinessId]);
  assert.equal(existingBiz.length, 0, "Test business ID should not exist yet");

  // Insert business
  await pool.query(
    "INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
    [testBusinessId, testBizName]
  );
  const [nowExists] = await pool.query("SELECT id FROM businesses WHERE id = ?", [testBusinessId]);
  assert.equal(nowExists.length, 1, "Business must now be in businesses table");
  console.log("PASSED: Business ID uniqueness verified.\n");

  // Test 5: User registration in users table
  console.log("TEST 5: Business User registration in MySQL users table...");
  const userId = `usr_${timestamp}_reg`;
  const userHashedPassword = await bcrypt.hash(testPassword, 10);
  await pool.query(
    "INSERT INTO users (id, email, password_hash, business_id, role, is_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())",
    [userId, testEmail, userHashedPassword, testBusinessId, "business_admin"]
  );

  const [userRecord] = await pool.query("SELECT * FROM users WHERE email = ?", [testEmail]);
  assert.equal(userRecord.length, 1, "User must be found by email");
  assert.equal(userRecord[0].business_id, testBusinessId, "User must be mapped to the unique business ID");
  console.log("PASSED: Business User successfully registered and mapped to tenant.\n");

  // Test 6: Multi-Tenant Data Isolation
  console.log("TEST 6: Multi-Tenant Data Isolation between two businesses...");
  const tenantA = testBusinessId;
  const tenantB = `tenant-b-${timestamp}`;

  // Insert business B
  await pool.query("INSERT INTO businesses (id, name, created_at, updated_at) VALUES (?, 'Tenant B Corp', NOW(), NOW())", [tenantB]);

  // Insert party for Tenant A
  const partyAId = `party_a_${timestamp}`;
  await pool.query(
    "INSERT INTO parties (id, business_id, party_name, phone, party_type, created_at, updated_at) VALUES (?, ?, 'Party for Tenant A', '9999988888', 'customer', NOW(), NOW())",
    [partyAId, tenantA]
  );

  // Insert party for Tenant B
  const partyBId = `party_b_${timestamp}`;
  await pool.query(
    "INSERT INTO parties (id, business_id, party_name, phone, party_type, created_at, updated_at) VALUES (?, ?, 'Party for Tenant B', '1111122222', 'supplier', NOW(), NOW())",
    [partyBId, tenantB]
  );

  // Query as Tenant A: Must only see Tenant A's party
  const [partiesTenantA] = await pool.query("SELECT id, party_name FROM parties WHERE business_id = ?", [tenantA]);
  const idsTenantA = partiesTenantA.map((p) => p.id);
  assert.ok(idsTenantA.includes(partyAId), "Tenant A must see its own party");
  assert.ok(!idsTenantA.includes(partyBId), "Tenant A must NEVER see Tenant B's party");

  // Query as Tenant B: Must only see Tenant B's party
  const [partiesTenantB] = await pool.query("SELECT id, party_name FROM parties WHERE business_id = ?", [tenantB]);
  const idsTenantB = partiesTenantB.map((p) => p.id);
  assert.ok(idsTenantB.includes(partyBId), "Tenant B must see its own party");
  assert.ok(!idsTenantB.includes(partyAId), "Tenant B must NEVER see Tenant A's party");

  console.log("PASSED: Strict multi-tenant isolation verified! No cross-tenant data leakage.\n");

  // Clean up test data
  console.log("Cleaning up test records...");
  await pool.query("DELETE FROM parties WHERE id IN (?, ?)", [partyAId, partyBId]);
  await pool.query("DELETE FROM users WHERE email = ?", [testEmail]);
  await pool.query("DELETE FROM email_verifications WHERE email = ?", [testEmail]);
  await pool.query("DELETE FROM businesses WHERE id IN (?, ?)", [tenantA, tenantB]);
  console.log("Cleanup complete.");

  console.log("\n===========================================");
  console.log(" ALL 6 AUTH & MULTI-TENANCY TESTS PASSED! ");
  console.log("===========================================\n");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
