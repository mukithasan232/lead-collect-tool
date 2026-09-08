import { verifyEmail } from './email-verifier';

async function runTests() {
  console.log('===========================================================');
  console.log('🧪 Starting Email Verification Engine Test Suite');
  console.log('===========================================================\n');

  const testCases = [
    {
      name: 'Test 1: Invalid RFC Syntax',
      email: 'invalid..syntax@domain..com',
      expectedStatus: 'invalid',
    },
    {
      name: 'Test 2: Disposable Domain (Mailinator)',
      email: 'testuser123@mailinator.com',
      expectedStatus: 'invalid',
    },
    {
      name: 'Test 3: Non-Existent Domain (No MX Records)',
      email: 'alex@nonexistentdomain998877112233.com',
      expectedStatus: 'invalid',
    },
    {
      name: 'Test 4: Legitimate Corporate Domain (DNS & MX Verification)',
      email: 'support@github.com',
      expectedStatus: ['verified', 'unverified'], // Unverified if ISP blocks outbound port 25
    },
  ];

  for (const test of testCases) {
    console.log(`▶ Running: ${test.name} (${test.email})`);
    const start = Date.now();
    const result = await verifyEmail(test.email, { timeoutMs: 3000 });
    const duration = Date.now() - start;

    console.log(`   - Status:      ${result.status.toUpperCase()}`);
    console.log(`   - SMTP Score:  ${result.smtpScore}/100`);
    console.log(`   - Syntax:      ${result.details.syntax.valid ? '✓ Valid' : '✗ ' + result.details.syntax.error}`);
    console.log(`   - Disposable:  ${result.details.disposable.isDisposable ? '✗ Yes' : '✓ No'}`);
    console.log(
      `   - MX Records:  ${result.details.dns.hasMxRecords ? '✓ ' + result.details.dns.primaryMx : '✗ None'}`
    );
    console.log(
      `   - SMTP Result: Connected=${result.details.smtp.connected}, Handshake=${result.details.smtp.handshakeSuccessful}, CatchAll=${result.details.smtp.isCatchAll}`
    );
    if (result.details.smtp.error) {
      console.log(`   - Note:        ${result.details.smtp.error}`);
    }
    console.log(`   - Latency:     ${duration}ms\n`);
  }

  console.log('===========================================================');
  console.log('✅ All Email Verifier test cases executed successfully!');
  console.log('===========================================================');
}

runTests().catch(console.error);
