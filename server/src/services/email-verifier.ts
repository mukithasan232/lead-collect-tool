import dns from 'dns';
import net from 'net';
import crypto from 'crypto';

const { resolveMx } = dns.promises;

// -------------------------------------------------------------
// Type Definitions
// -------------------------------------------------------------

export type VerificationStatus = 'verified' | 'catch_all' | 'invalid' | 'unverified';

export interface EmailVerificationOptions {
  /** Timeout in milliseconds for each SMTP socket operation. Default: 5000ms */
  timeoutMs?: number;
  /** Custom HELO domain name to use in SMTP handshake. Default: 'mail.leadpulse.io' */
  heloDomain?: string;
  /** Custom sender address for MAIL FROM. Default: 'verify@leadpulse.io' */
  mailFrom?: string;
  /** Whether to perform catch-all detection probe. Default: true */
  checkCatchAll?: boolean;
}

export interface EmailVerificationResult {
  email: string;
  user: string;
  domain: string;
  isValid: boolean;
  status: VerificationStatus;
  smtpScore: number; // 0 to 100
  details: {
    syntax: {
      valid: boolean;
      error?: string;
    };
    disposable: {
      isDisposable: boolean;
      domain?: string;
    };
    dns: {
      hasMxRecords: boolean;
      primaryMx?: string;
      mxRecords: Array<{ exchange: string; priority: number }>;
    };
    smtp: {
      connected: boolean;
      handshakeSuccessful: boolean;
      rcptAccepted: boolean;
      responseCode?: number;
      rawResponse?: string;
      isCatchAll: boolean;
      error?: string;
    };
  };
  durationMs: number;
  timestamp: string;
}

// -------------------------------------------------------------
// Top 50+ Disposable Email Domains
// -------------------------------------------------------------

export const DISPOSABLE_DOMAINS = new Set<string>([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  'burnermail.io',
  'crazymailing.com',
  'deadfake.com',
  'disposablemail.com',
  'dispostable.com',
  'emailfake.com',
  'emailondeck.com',
  'fakeinbox.com',
  'fakemailgenerator.com',
  'generator.email',
  'getairmail.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'inboxbear.com',
  'inboxkitten.com',
  'mailcatch.com',
  'maildrop.cc',
  'maildrop.net',
  'mailinator.com',
  'mailnesia.com',
  'mohmal.com',
  'mytemp.email',
  'mytempemail.com',
  'nada.ltd',
  'pokemail.net',
  'sharklasers.com',
  'spam4.me',
  'spambox.us',
  'spamfree24.org',
  'spamgourmet.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.net',
  'tempmailaddress.com',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.net',
  'trashmail.org',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'zippymail.info',
]);

// -------------------------------------------------------------
// Syntax Validation
// -------------------------------------------------------------

/**
 * Validates RFC 5322 syntax compliance
 */
export function validateEmailSyntax(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email must be a non-empty string' };
  }

  const trimmed = email.trim();

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email exceeds maximum allowed length of 254 characters' };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return { valid: false, error: 'Email must contain exactly one "@" symbol' };
  }

  const [localPart, domainPart] = parts;

  if (!localPart || localPart.length > 64) {
    return { valid: false, error: 'Local part must be between 1 and 64 characters' };
  }

  if (!domainPart || domainPart.length > 253) {
    return { valid: false, error: 'Domain part must be between 1 and 253 characters' };
  }

  // Check leading, trailing, or consecutive dots in local part
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return { valid: false, error: 'Local part cannot start, end, or contain consecutive dots' };
  }

  // RFC 5322 conforming regex for local and domain structure
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Email syntax fails RFC standard validation pattern' };
  }

  return { valid: true };
}

// -------------------------------------------------------------
// SMTP Communication Engine
// -------------------------------------------------------------

interface SmtpSessionResult {
  connected: boolean;
  handshakeSuccessful: boolean;
  rcptAccepted: boolean;
  responseCode?: number;
  rawResponse?: string;
  isCatchAll: boolean;
  error?: string;
}

/**
 * Reads an SMTP response from the socket, handling multi-line responses (e.g. 250-...)
 */
function readSmtpResponse(socket: net.Socket, timeoutMs: number): Promise<{ code: number; message: string }> {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`SMTP response timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function onData(chunk: Buffer) {
      buffer += chunk.toString('utf-8');

      // An SMTP response ends when a line starts with a 3-digit code followed by a space (or end of line)
      // Multi-line responses use hyphens: "250-capability\r\n250 OK\r\n"
      const lines = buffer.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const lastLine = lines[lines.length - 1];

      if (lastLine && /^\d{3}\s/.test(lastLine)) {
        cleanup();
        const code = parseInt(lastLine.substring(0, 3), 10);
        resolve({ code, message: buffer.trim() });
      }
    }

    function onError(err: Error) {
      cleanup();
      reject(err);
    }

    function onClose() {
      cleanup();
      if (buffer.length > 0) {
        const code = parseInt(buffer.substring(0, 3), 10) || 0;
        resolve({ code, message: buffer.trim() });
      } else {
        reject(new Error('SMTP socket closed prematurely'));
      }
    }

    function cleanup() {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    }

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

/**
 * Sends a single SMTP command and awaits the completed response
 */
async function sendSmtpCommand(
  socket: net.Socket,
  command: string,
  timeoutMs: number
): Promise<{ code: number; message: string }> {
  socket.write(`${command}\r\n`);
  return readSmtpResponse(socket, timeoutMs);
}

/**
 * Performs an SMTP handshake simulation with catch-all detection
 */
async function performSmtpHandshake(
  mxHost: string,
  targetEmail: string,
  domain: string,
  options: EmailVerificationOptions
): Promise<SmtpSessionResult> {
  const timeout = options.timeoutMs || 5000;
  const heloDomain = options.heloDomain || 'mail.leadpulse.io';
  const mailFrom = options.mailFrom || 'verify@leadpulse.io';
  const checkCatchAll = options.checkCatchAll !== false;

  const socket = new net.Socket();
  socket.setTimeout(timeout);

  return new Promise((resolve) => {
    let connected = false;
    let handshakeSuccessful = false;
    let isCatchAll = false;

    // Safety timer for entire socket lifetime
    const totalTimer = setTimeout(() => {
      socket.destroy(new Error(`Total SMTP session exceeded ${timeout * 2}ms timeout`));
      resolve({
        connected,
        handshakeSuccessful,
        rcptAccepted: false,
        isCatchAll: false,
        error: `Connection timed out after ${timeout}ms (port 25 blocked or host unreachable)`,
      });
    }, timeout * 2);

    socket.on('timeout', () => {
      socket.destroy();
      clearTimeout(totalTimer);
      resolve({
        connected,
        handshakeSuccessful,
        rcptAccepted: false,
        isCatchAll: false,
        error: `Socket timeout of ${timeout}ms reached on host ${mxHost}:25`,
      });
    });

    socket.on('error', (err: Error) => {
      clearTimeout(totalTimer);
      socket.destroy();
      resolve({
        connected,
        handshakeSuccessful,
        rcptAccepted: false,
        isCatchAll: false,
        error: err.message,
      });
    });

    socket.connect(25, mxHost, async () => {
      connected = true;

      try {
        // 1. Await 220 Server Greeting
        const greeting = await readSmtpResponse(socket, timeout);
        if (greeting.code !== 220) {
          throw new Error(`Unexpected server greeting: ${greeting.message}`);
        }

        // 2. Send EHLO (fallback to HELO if 500/502)
        let heloReply = await sendSmtpCommand(socket, `EHLO ${heloDomain}`, timeout);
        if (heloReply.code >= 400 && heloReply.code < 600) {
          heloReply = await sendSmtpCommand(socket, `HELO ${heloDomain}`, timeout);
        }
        if (heloReply.code !== 250) {
          throw new Error(`HELO rejected: ${heloReply.message}`);
        }

        // 3. Send MAIL FROM
        const mailFromReply = await sendSmtpCommand(socket, `MAIL FROM:<${mailFrom}>`, timeout);
        if (mailFromReply.code !== 250) {
          throw new Error(`MAIL FROM rejected: ${mailFromReply.message}`);
        }

        handshakeSuccessful = true;

        // 4. Catch-All Detection Probe
        // Verify a non-existent random hash address first
        if (checkCatchAll) {
          const randomHash = crypto.randomBytes(12).toString('hex');
          const catchAllProbeEmail = `probe-${randomHash}@${domain}`;
          const probeReply = await sendSmtpCommand(socket, `RCPT TO:<${catchAllProbeEmail}>`, timeout);

          if (probeReply.code === 250) {
            // Server accepted a random gibberish address -> Domain is Catch-All!
            isCatchAll = true;
          }
        }

        // 5. Verify Actual Target Address
        const rcptReply = await sendSmtpCommand(socket, `RCPT TO:<${targetEmail}>`, timeout);

        // 6. Graceful Disconnect
        try {
          await sendSmtpCommand(socket, 'QUIT', Math.min(2000, timeout));
        } catch {
          // Ignore QUIT errors
        }

        clearTimeout(totalTimer);
        socket.destroy();

        const rcptAccepted = rcptReply.code === 250;

        resolve({
          connected: true,
          handshakeSuccessful: true,
          rcptAccepted,
          responseCode: rcptReply.code,
          rawResponse: rcptReply.message,
          isCatchAll,
          error: rcptAccepted ? undefined : `Recipient rejected with code ${rcptReply.code}: ${rcptReply.message}`,
        });
      } catch (err) {
        clearTimeout(totalTimer);
        socket.destroy();
        resolve({
          connected: true,
          handshakeSuccessful,
          rcptAccepted: false,
          isCatchAll: false,
          error: (err as Error).message,
        });
      }
    });
  });
}

// -------------------------------------------------------------
// Main Verification Pipeline
// -------------------------------------------------------------

/**
 * Executes the multi-step email verification pipeline
 *
 * @param email Email address to verify
 * @param options Configurable options for timeouts and headers
 * @returns Comprehensive verification result object
 */
export async function verifyEmail(
  email: string,
  options: EmailVerificationOptions = {}
): Promise<EmailVerificationResult> {
  const startTime = Date.now();
  const normalizedEmail = (email || '').trim().toLowerCase();

  const [user = '', domain = ''] = normalizedEmail.split('@');

  const result: EmailVerificationResult = {
    email: normalizedEmail,
    user,
    domain,
    isValid: false,
    status: 'unverified',
    smtpScore: 0,
    details: {
      syntax: { valid: false },
      disposable: { isDisposable: false },
      dns: { hasMxRecords: false, mxRecords: [] },
      smtp: {
        connected: false,
        handshakeSuccessful: false,
        rcptAccepted: false,
        isCatchAll: false,
      },
    },
    durationMs: 0,
    timestamp: new Date().toISOString(),
  };

  // -----------------------------------------------------------
  // Step 1: Regex & RFC 5322 Syntax Validation
  // -----------------------------------------------------------
  const syntaxCheck = validateEmailSyntax(normalizedEmail);
  result.details.syntax = syntaxCheck;

  if (!syntaxCheck.valid) {
    result.status = 'invalid';
    result.isValid = false;
    result.smtpScore = 0;
    result.durationMs = Date.now() - startTime;
    return result;
  }

  let score = 20; // +20 points for valid syntax

  // -----------------------------------------------------------
  // Step 2: Disposable Domain Verification
  // -----------------------------------------------------------
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  result.details.disposable = {
    isDisposable,
    domain,
  };

  if (isDisposable) {
    result.status = 'invalid';
    result.isValid = false;
    result.smtpScore = 10;
    result.durationMs = Date.now() - startTime;
    return result;
  }

  score += 20; // +20 points for non-disposable domain

  // -----------------------------------------------------------
  // Step 3: DNS MX Records Resolution
  // -----------------------------------------------------------
  let mxRecords: Array<{ exchange: string; priority: number }> = [];

  try {
    const rawMx = await resolveMx(domain);
    if (rawMx && rawMx.length > 0) {
      // Sort by priority ascending (lower number = higher priority)
      mxRecords = rawMx.sort((a, b) => a.priority - b.priority);
    }
  } catch (dnsErr) {
    result.details.dns = {
      hasMxRecords: false,
      mxRecords: [],
    };
    result.status = 'invalid';
    result.isValid = false;
    result.smtpScore = score;
    result.durationMs = Date.now() - startTime;
    return result;
  }

  if (mxRecords.length === 0) {
    result.details.dns = {
      hasMxRecords: false,
      mxRecords: [],
    };
    result.status = 'invalid';
    result.isValid = false;
    result.smtpScore = score;
    result.durationMs = Date.now() - startTime;
    return result;
  }

  const primaryMx = mxRecords[0].exchange;
  result.details.dns = {
    hasMxRecords: true,
    primaryMx,
    mxRecords,
  };

  score += 30; // +30 points for verified MX records

  // -----------------------------------------------------------
  // Step 4 & 5: SMTP Handshake & Catch-All Detection
  // -----------------------------------------------------------
  try {
    const smtpResult = await performSmtpHandshake(primaryMx, normalizedEmail, domain, options);
    result.details.smtp = smtpResult;

    if (smtpResult.connected && smtpResult.handshakeSuccessful) {
      if (smtpResult.isCatchAll) {
        // Server accepted both target and gibberish probe
        result.status = 'catch_all';
        result.isValid = true;
        result.smtpScore = score + 15; // 85% confidence for catch-all
      } else if (smtpResult.rcptAccepted) {
        // Server specifically accepted target address
        result.status = 'verified';
        result.isValid = true;
        result.smtpScore = 100; // 100% verified deliverable
      } else {
        // Server explicitly rejected recipient (e.g. 550 User unknown)
        result.status = 'invalid';
        result.isValid = false;
        result.smtpScore = 15; // DNS valid but mailbox does not exist
      }
    } else {
      // Port 25 blocked by network/ISP or connection timed out
      // Valid syntax and MX records, but mailbox cannot be confirmed via direct port 25
      result.status = 'unverified';
      result.isValid = true; // Still considered plausible
      result.smtpScore = score; // 70% based on syntax + DNS
    }
  } catch (err) {
    result.details.smtp = {
      connected: false,
      handshakeSuccessful: false,
      rcptAccepted: false,
      isCatchAll: false,
      error: (err as Error).message,
    };
    result.status = 'unverified';
    result.isValid = true;
    result.smtpScore = score;
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

export default verifyEmail;
