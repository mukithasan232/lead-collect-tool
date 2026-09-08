/**
 * LeadPulse AI — Email Verification & Deliverability Engine
 * Simulates a production-grade async pipeline:
 *   1. Syntax validation (Regex)
 *   2. Disposable/temp-email domain blocklist
 *   3. DNS/MX record lookup simulation
 *   4. SMTP handshake simulation (port 25 RCPT TO / 250 OK check)
 *
 * In production, steps 3 & 4 would call a real backend API.
 * This client-side engine returns realistic simulated results with async delays.
 */

// ── Disposable Domain Blocklist ────────────────────────────────────────────────
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'guerrillamail.info', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net',
  'guerrillamail.org', 'spam4.me', 'trashmail.com', 'trashmail.me', 'trashmail.at',
  'dispostable.com', 'maildrop.cc', 'mailnull.com', 'fakeinbox.com', 'spamgourmet.com',
  'spamgourmet.net', 'spamgourmet.org', 'spamday.com', 'spaml.de', 'spamzator.com',
  'spamfree24.org', 'bouncr.com', 'discardmail.com', 'discardmail.de',
  'emailondeck.com', 'getonemail.com', 'incognitomail.net', 'mailexpire.com',
  'mailnew.com', 'noclickemail.com', 'privymail.de', 'tempemail.net',
  'throwam.com', 'trashmail.io', 'wegwerfmail.de', 'mohmal.com', 'temp-mail.org',
  'emailtemporanea.com', 'discard.email', 'spamhereplease.com', 'crap.monster',
  'mailscrap.com', 'throwmail.net', 'mintemail.com', 'mtmdev.com',
]);

// ── Valid MX domains simulation (domains that pass DNS lookup) ─────────────────
const KNOWN_VALID_MX_TLDS = new Set([
  '.com', '.io', '.ai', '.co', '.net', '.org', '.biz', '.finance', '.tech',
  '.app', '.dev', '.agency', '.studio', '.media', '.cloud', '.digital', '.health',
  '.med', '.jp', '.de', '.fr', '.se', '.ch', '.sg', '.ae', '.uk', '.ca',
]);

// ── Catch-all domain patterns ──────────────────────────────────────────────────
const CATCH_ALL_PATTERNS = [
  /^info@/, /^hello@/, /^hi@/, /^hey@/, /^contact@/, /^general@/,
  /^admin@/, /^support@/, /^team@/, /^office@/, /^sales@/,
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDomain(email) {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

function getTLD(domain) {
  const parts = domain.split('.');
  if (parts.length < 2) return '';
  // Handle two-part TLDs like .co.uk, .med.br
  const last2 = `.${parts.slice(-2).join('.')}`;
  const last1 = `.${parts[parts.length - 1]}`;
  return KNOWN_VALID_MX_TLDS.has(last2) ? last2 : last1;
}

function isCatchAll(email) {
  return CATCH_ALL_PATTERNS.some(pattern => pattern.test(email.toLowerCase()));
}

function simulateDeliverabilityScore(email, mxValid, smtpCheck, catchAll, disposable) {
  if (!mxValid || disposable) return 0;
  if (!smtpCheck) return Math.floor(Math.random() * 20 + 30); // 30–50%
  if (catchAll) return Math.floor(Math.random() * 15 + 60);   // 60–75%
  // Personal business email — high score
  const base = 92 + Math.random() * 7.9; // 92–99.9%
  return Math.round(base * 10) / 10;
}

// ── Main Verification Engine ───────────────────────────────────────────────────

export class VerificationEngine {
  /**
   * Full async verification pipeline.
   * @param {string} email - The email address to verify.
   * @param {function} [onProgress] - Optional callback: (step, label) => void
   * @returns {Promise<VerificationResult>}
   */
  static async verifyEmail(email, onProgress = null) {
    const result = {
      email,
      status: 'Unverified',
      syntaxValid: false,
      disposable: false,
      mxValid: false,
      smtpCheck: false,
      catchAll: false,
      deliverabilityScore: 0,
      reason: '',
      verifiedAt: new Date().toISOString(),
      steps: []
    };

    // ── Step 1: Syntax Validation ───────────────────────────────────────────
    if (onProgress) onProgress('syntax', 'Checking email syntax...');
    await sleep(120 + Math.random() * 80);

    const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    result.syntaxValid = EMAIL_REGEX.test(email);
    result.steps.push({
      step: 'syntax',
      label: 'Syntax Validation',
      passed: result.syntaxValid,
      detail: result.syntaxValid ? 'Valid email format detected' : 'Malformed email address structure'
    });

    if (!result.syntaxValid) {
      result.status = 'Invalid';
      result.reason = 'Malformed email address';
      return result;
    }

    const domain = extractDomain(email);
    if (!domain) {
      result.status = 'Invalid';
      result.reason = 'Cannot parse domain from email';
      return result;
    }

    // ── Step 2: Disposable Domain Check ────────────────────────────────────
    if (onProgress) onProgress('disposable', 'Checking disposable domain blocklist...');
    await sleep(80 + Math.random() * 60);

    result.disposable = DISPOSABLE_DOMAINS.has(domain);
    result.steps.push({
      step: 'disposable',
      label: 'Disposable Domain Check',
      passed: !result.disposable,
      detail: result.disposable
        ? `Domain "${domain}" is on the disposable mail blocklist`
        : `Domain "${domain}" not found in blocklist`
    });

    if (result.disposable) {
      result.status = 'Invalid';
      result.reason = 'Disposable / temp-mail domain detected';
      return result;
    }

    // ── Step 3: MX Record / DNS Simulation ─────────────────────────────────
    if (onProgress) onProgress('mx', 'Looking up MX records via DNS...');
    await sleep(200 + Math.random() * 300);

    const tld = getTLD(domain);
    result.mxValid = KNOWN_VALID_MX_TLDS.has(tld) && domain.includes('.');
    // Simulate occasional MX failure for realism (~8% fail rate on random domains)
    if (result.mxValid && Math.random() < 0.08) result.mxValid = false;

    result.steps.push({
      step: 'mx',
      label: 'DNS / MX Record Lookup',
      passed: result.mxValid,
      detail: result.mxValid
        ? `MX records resolved for "${domain}" — mail server active`
        : `No valid MX records found for "${domain}"`
    });

    if (!result.mxValid) {
      result.status = 'Invalid';
      result.reason = 'No MX records — domain cannot receive email';
      return result;
    }

    // ── Step 4: SMTP Handshake Simulation ──────────────────────────────────
    if (onProgress) onProgress('smtp', 'Simulating SMTP handshake (RCPT TO)...');
    await sleep(350 + Math.random() * 450);

    result.catchAll = isCatchAll(email);
    // 5% random SMTP failure rate for unknown addresses
    result.smtpCheck = !result.catchAll && Math.random() > 0.05;

    result.steps.push({
      step: 'smtp',
      label: 'SMTP Handshake (Port 25)',
      passed: result.smtpCheck || result.catchAll,
      detail: result.smtpCheck
        ? `250 OK — Mailbox "${email}" confirmed as active`
        : result.catchAll
          ? `Catch-all server detected — all addresses accepted by domain`
          : `550 No such user — Mailbox not found on server`
    });

    // ── Compute Final Status ────────────────────────────────────────────────
    result.deliverabilityScore = simulateDeliverabilityScore(
      email, result.mxValid, result.smtpCheck, result.catchAll, result.disposable
    );

    if (result.smtpCheck && result.mxValid) {
      result.status = 'Verified';
    } else if (result.catchAll) {
      result.status = 'Catch-All';
    } else {
      result.status = 'Invalid';
    }

    result.reason = result.status === 'Verified'
      ? `Mailbox confirmed active via SMTP handshake`
      : result.status === 'Catch-All'
        ? `Domain accepts all addresses — individual mailbox unconfirmed`
        : `Mailbox rejected by SMTP server`;

    return result;
  }

  /**
   * Batch verify a list of emails with concurrency control.
   * @param {string[]} emails
   * @param {function} [onEach] - Callback per result: (result, index, total) => void
   * @param {number} [concurrency=3]
   */
  static async verifyBatch(emails, onEach = null, concurrency = 3) {
    const results = [];
    for (let i = 0; i < emails.length; i += concurrency) {
      const chunk = emails.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(email => this.verifyEmail(email))
      );
      chunkResults.forEach((r, j) => {
        results.push(r);
        if (onEach) onEach(r, i + j, emails.length);
      });
    }
    return results;
  }

  /**
   * Get color and label for a verification status string.
   */
  static getStatusMeta(status) {
    switch (status) {
      case 'Verified':
        return { color: '#10B981', bg: 'rgba(16,185,129,0.12)', icon: '✓', label: 'Verified' };
      case 'Catch-All':
        return { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', icon: '~', label: 'Catch-All' };
      case 'Invalid':
        return { color: '#F43F5E', bg: 'rgba(244,63,94,0.12)', icon: '✗', label: 'Invalid' };
      case 'Unverified':
      default:
        return { color: '#64748B', bg: 'rgba(100,116,139,0.12)', icon: '?', label: 'Unverified' };
    }
  }
}
