import axios from 'axios';
import { validate } from 'deep-email-validator';
import { env } from '../config/env';

export interface EmailVerificationResult {
  email: string;
  status: 'VERIFIED' | 'UNVERIFIED';
}

export const emailVerifierService = {
  /**
   * Generates standard B2B email permutations for a given name and company domain.
   * e.g., first.last@domain.com, first@domain.com, flast@domain.com, etc.
   */
  generatePermutations(firstName: string, lastName: string, domain: string): string[] {
    const f = (firstName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const l = (lastName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const d = (domain || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    if (!f || !d) return [];

    if (!l) {
      return [`${f}@${d}`];
    }

    return [
      `${f}.${l}@${d}`,    // first.last@domain.com
      `${f}@${d}`,         // first@domain.com
      `${f[0]}${l}@${d}`,  // flast@domain.com
      `${f}${l}@${d}`,     // firstlast@domain.com
    ];
  },

  /**
   * Fast Nubela work-email lookup if API key is present.
   */
  async lookupViaNubela(firstName: string, lastName: string, domain: string): Promise<string | null> {
    if (!env.PROXYCURL_API_KEY) return null;
    try {
      const resp = await axios.get<{ work_email?: string }>(
        'https://nubela.co/api/v1/employee/work-email',
        {
          params: { first_name: firstName, last_name: lastName, domain },
          headers: { Authorization: `Bearer ${env.PROXYCURL_API_KEY}` },
          timeout: 2500, // 2.5s timeout
        }
      );
      if (resp.data?.work_email) {
        return resp.data.work_email;
      }
    } catch {
      // Ignore API errors, proceed to SMTP validator
    }
    return null;
  },

  /**
   * Runs single email validation with an execution timeout to prevent slow SMTP servers from stalling.
   */
  async validateSingleEmail(email: string, timeoutMs = 3500): Promise<{ valid: boolean; isCatchAll?: boolean }> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SMTP Validation timeout')), timeoutMs)
    );

    try {
      const res = await Promise.race([
        validate({
          email,
          validateRegex: true,
          validateMx: true,
          validateTypo: false, // Disabled to prevent false positives on modern tech domains
          validateDisposable: true,
          validateSMTP: true,
        }),
        timeout,
      ]);

      if (res.valid) {
        return { valid: true };
      }

      const smtpReason = res.validators?.smtp?.reason?.toLowerCase() || '';
      const isCatchAll = smtpReason.includes('catch-all') || smtpReason.includes('catch all');

      return {
        valid: false,
        isCatchAll,
      };
    } catch {
      return { valid: false };
    }
  },

  /**
   * Discovers and verifies the email address by testing standard B2B permutations.
   * Runs them through the SMTP/MX validator and returns the first valid email.
   * Wrapped in a master timeout and try/catch to guarantee safety and never crash the worker.
   */
  async discoverAndVerifyEmail(
    firstName: string,
    lastName: string,
    domain: string
  ): Promise<EmailVerificationResult> {
    const fallbackEmail = `${(firstName || 'contact').toLowerCase()}.${(lastName || 'prospect').toLowerCase()}@${domain || 'company.com'}`;

    try {
      // 1. Try Nubela work-email API lookup first (fastest, 500ms)
      const nubelaEmail = await this.lookupViaNubela(firstName, lastName, domain);
      if (nubelaEmail) {
        console.log(`   ✅ [EmailVerifier] Nubela verified work email: ${nubelaEmail}`);
        return {
          email: nubelaEmail,
          status: 'VERIFIED',
        };
      }

      // 2. Generate permutations for DNS/SMTP testing
      const permutations = this.generatePermutations(firstName, lastName, domain);
      if (permutations.length === 0) {
        return { email: fallbackEmail, status: 'UNVERIFIED' };
      }

      console.log(`🔎 [EmailVerifier] Discovering email for ${firstName} ${lastName} @ ${domain} (${permutations.length} permutations)`);

      // Master timeout for checking all permutations (max 3.5 seconds total)
      const testPromise = (async () => {
        for (const email of permutations) {
          try {
            console.log(`   ↪ Testing: ${email}`);
            const result = await this.validateSingleEmail(email, 2000);

            if (result.valid) {
              console.log(`   ✅ [EmailVerifier] Verified active mailbox: ${email}`);
              return { email, status: 'VERIFIED' as const };
            }

            if (result.isCatchAll) {
              console.log(`   ℹ️ [EmailVerifier] Catch-all domain detected for ${domain}.`);
              return { email: permutations[0], status: 'VERIFIED' as const };
            }
          } catch (err: any) {
            console.log(`   ⚠️ Validation error on ${email}: ${err.message}`);
          }
        }
        return null;
      })();

      const overallTimeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 3500)
      );

      const verified = await Promise.race([testPromise, overallTimeout]);
      if (verified) {
        return verified;
      }

      console.log(`   ℹ️ [EmailVerifier] Timeout/completion for ${domain}. Saving candidate as UNVERIFIED.`);
      return {
        email: permutations[0] || fallbackEmail,
        status: 'UNVERIFIED',
      };
    } catch (fatalErr: any) {
      console.warn(`⚠️ [EmailVerifier] Unexpected error in discoverAndVerifyEmail: ${fatalErr.message}`);
      return {
        email: fallbackEmail,
        status: 'UNVERIFIED',
      };
    }
  },
};

export const discoverAndVerifyEmail = emailVerifierService.discoverAndVerifyEmail.bind(emailVerifierService);
