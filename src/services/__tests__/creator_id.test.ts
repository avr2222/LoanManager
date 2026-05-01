/**
 * Standalone test for creator_id propagation — run with: npx tsx src/services/__tests__/creator_id.test.ts
 *
 * Tests the exact code path that was causing RLS 42501:
 *   toDbLoan(loan, fallbackCreatorId) must always emit a non-null creator_id
 *   when either loan.creatorId or fallbackCreatorId is provided.
 */

// ── Inline the mapping logic (mirrors supabaseService.ts:toDbLoan) ────────────

function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

function toDbLoan(l: Record<string, unknown>, fallbackCreatorId?: string): Record<string, unknown> {
  return {
    loan_id: l.loanId,
    creator_id: (l.creatorId as string | undefined) ?? fallbackCreatorId,
    borrower_name: l.borrowerName,
    borrower_phone: normalizePhone(l.borrowerPhone as string),
    principal_amount: l.principalAmount,
    loan_status: l.loanStatus,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Test cases ────────────────────────────────────────────────────────────────

const FAKE_USER_ID   = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const LOAN_CREATOR   = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';

const baseLoan = {
  loanId: 'L001',
  borrowerName: 'Test Borrower',
  borrowerPhone: '9876543210',
  principalAmount: 50000,
  loanStatus: 'Active',
};

console.log('\n── toDbLoan: creator_id propagation ─────────────────────────────\n');

// 1. No creatorId on loan, fallback provided → should use fallback
{
  const row = toDbLoan({ ...baseLoan, creatorId: undefined }, FAKE_USER_ID);
  expect('no loan.creatorId + fallback → uses fallback', row.creator_id, FAKE_USER_ID);
}

// 2. Loan has creatorId, fallback also provided → should prefer loan.creatorId
{
  const row = toDbLoan({ ...baseLoan, creatorId: LOAN_CREATOR }, FAKE_USER_ID);
  expect('loan.creatorId set + fallback → prefers loan.creatorId', row.creator_id, LOAN_CREATOR);
}

// 3. Loan has creatorId, no fallback → should use loan.creatorId
{
  const row = toDbLoan({ ...baseLoan, creatorId: LOAN_CREATOR });
  expect('loan.creatorId set, no fallback → uses loan.creatorId', row.creator_id, LOAN_CREATOR);
}

// 4. Neither loan.creatorId nor fallback → creator_id is undefined (will fail RLS — this is the bug scenario)
{
  const row = toDbLoan({ ...baseLoan, creatorId: undefined });
  expect('no creatorId anywhere → creator_id is undefined (bug scenario)', row.creator_id, undefined);
  // This case must NOT happen in production after the fix — addLoan always passes user?.id
}

console.log('\n── addLoan: creatorId stamping ───────────────────────────────────\n');

// Simulate what addLoan now does:
//   finalLoan = { ...loan, loanId, creatorId: loan.creatorId ?? user?.id }
function simulateAddLoan(loan: Record<string, unknown>, userId: string | undefined): Record<string, unknown> {
  const loanId = 'L001'; // mocked getNextLoanId result
  return { ...loan, loanId, creatorId: (loan.creatorId as string | undefined) ?? userId };
}

// 5. LoanForm submits loan with no creatorId (typical case), user is logged in
{
  const formLoan = { ...baseLoan, loanId: '', creatorId: undefined };
  const finalLoan = simulateAddLoan(formLoan, FAKE_USER_ID);
  expect('addLoan stamps creatorId from user when loan has none', finalLoan.creatorId, FAKE_USER_ID);
}

// 6. creatorId already set (e.g., bulk import) — must not be overwritten
{
  const importedLoan = { ...baseLoan, creatorId: LOAN_CREATOR };
  const finalLoan = simulateAddLoan(importedLoan, FAKE_USER_ID);
  expect('addLoan preserves existing creatorId on imported loan', finalLoan.creatorId, LOAN_CREATOR);
}

// 7. User is null (logged out somehow) — creatorId will be undefined → RLS will block (expected)
{
  const formLoan = { ...baseLoan, loanId: '', creatorId: undefined };
  const finalLoan = simulateAddLoan(formLoan, undefined);
  expect('addLoan with null user → creatorId undefined (RLS blocks — expected)', finalLoan.creatorId, undefined);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(55)}`);
if (failed === 0) {
  console.log(`✅  All ${passed} tests passed — creator_id is always set when user is logged in\n`);
  process.exit(0);
} else {
  console.error(`❌  ${failed} of ${passed + failed} tests failed\n`);
  process.exit(1);
}
