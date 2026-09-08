/**
 * LeadPulse AI - Cold Outreach & Personalization Studio v2
 * Generates context-aware, hyper-personalized messages across 5 channels and 4 tones.
 * Channels: Cold Email, LinkedIn InMail, Twitter/X DM, Upwork Proposal, Follow-Up Note
 * Tones: Value-First & ROI, Direct & Concise, Casual Peer-to-Peer, Executive Briefing
 */

export class OutreachGenerator {
  static generatePitch(lead, options = {}) {
    const tone = options.tone || "value_first";
    const channel = options.channel || "email";
    const userOffering = options.offering || "AI sales intelligence & pipeline acceleration";
    const variant = options.variant || 0; // for A/B subject variants

    const firstName = lead.name.split(" ")[0];
    const techMention = lead.techStack && lead.techStack.length > 0
      ? lead.techStack.slice(0, 2).join(" & ")
      : "your current stack";

    switch (channel) {
      case "linkedin":
        return this._generateLinkedInMessage(lead, firstName, tone, userOffering, variant);
      case "twitter":
        return this._generateTwitterDM(lead, firstName, tone, userOffering);
      case "upwork":
        return this._generateUpworkProposal(lead, firstName, tone, userOffering);
      case "followup":
        return this._generateFollowUpEmail(lead, firstName, tone, userOffering);
      default:
        return this._generateColdEmail(lead, firstName, tone, userOffering, techMention, variant);
    }
  }

  // ── Cold Email ─────────────────────────────────────────────────────────────
  static _generateColdEmail(lead, firstName, tone, userOffering, techMention, variant = 0) {
    const subjectVariants = {
      direct: [
        `Quick question re: ${lead.company}'s sales pipeline`,
        `${lead.company} pipeline — 5-min chat?`
      ],
      casual: [
        `${firstName} - loved the latest update on ${lead.company}!`,
        `${lead.company}'s momentum is impressive 🚀`
      ],
      executive: [
        `${lead.company} <> Executive briefing on pipeline efficiency`,
        `Strategic note: ${lead.company}'s revenue velocity`
      ],
      value_first: [
        `Idea for ${lead.company}'s outbound growth (${lead.industry})`,
        `${lead.company} + ${userOffering.split(' ')[0]} = ?`
      ]
    };

    let subject = (subjectVariants[tone] || subjectVariants.value_first)[variant % 2];
    let body = "";

    switch (tone) {
      case "direct":
        body = `Hi ${firstName},

Noticed that ${lead.intentSignal.toLowerCase()}.

Given you're leading ${lead.title.toLowerCase()} at ${lead.company}, you're likely focused on scaling pipeline without burning engineering or SDR headcount.

We help companies in ${lead.industry} plug directly into ${techMention} with ${userOffering}, generating 3x more qualified meetings within 30 days.

Worth a 5-minute chat next Tuesday morning?

Best,
[Your Name]
Growth Director | LeadPulse AI`;
        break;

      case "casual":
        body = `Hey ${firstName},

Saw the news about ${lead.company} — huge congratulations on ${lead.recentNews ? lead.recentNews.toLowerCase() : 'the recent momentum'}!

I know how hectic things get when ${lead.intentSignal.toLowerCase()}, so I'll keep this short.

We recently helped another ${lead.industry} team that uses ${techMention} cut their outbound prospecting time by 75% using ${userOffering}.

Would love to share the teardown if you're open to it. No hard pitch, promise.

Cheers,
[Your Name]`;
        break;

      case "executive":
        body = `Dear ${firstName},

As ${lead.title} at ${lead.company}, operational leverage and revenue predictability are paramount — especially as ${lead.intentSignal.toLowerCase()}.

We've deployed ${userOffering} across high-growth enterprise leaders in ${lead.industry}, delivering:
• 42% reduction in customer acquisition cost (CAC)
• Native synchronization with ${techMention}
• 99.4% verified decision-maker contact accuracy
• Average 3.8x pipeline velocity improvement

If revenue predictability is on your strategic roadmap this quarter, let's schedule a brief 10-minute executive briefing.

Sincerely,
[Your Name]
Managing Director`;
        break;

      case "value_first":
      default:
        body = `Hi ${firstName},

I was researching high-growth leaders in the ${lead.industry} space and came across ${lead.company}.

I saw that you ${lead.intentSignal.toLowerCase()}. Typically, when teams reach this inflection point, manual prospecting and stale contact data become massive friction points that stall pipeline momentum.

We built an integration specifically for teams utilizing ${techMention} to automate outbound intelligence with ${userOffering}. For similar companies with ~${lead.headcount} employees, this delivered a 3.4x lift in reply rates within 45 days.

Would you be open to a 7-minute visual walkthrough this Thursday at 2 PM EST?

Best regards,
[Your Name]
Sales Strategist | LeadPulse AI`;
        break;
    }

    return { subject, body };
  }

  // ── LinkedIn InMail ────────────────────────────────────────────────────────
  static _generateLinkedInMessage(lead, firstName, tone, userOffering, variant = 0) {
    const subjects = [
      `Quick thought for ${lead.company}`,
      `${lead.industry} insight for you, ${firstName}`
    ];
    const subject = subjects[variant % 2];
    let body = "";

    switch (tone) {
      case "casual":
        body = `Hi ${firstName}, came across your profile while tracking top leaders in ${lead.industry}. Congrats on ${lead.company}'s recent momentum! Would love to connect and share some insights on how peer teams are approaching ${userOffering}. No pitch — just value. Open to a quick chat?`;
        break;
      case "executive":
        body = `${firstName}, as ${lead.title} at ${lead.company}, I believe you'll find this relevant. We're helping ${lead.industry} executives achieve 3x pipeline velocity with ${userOffering}. Given ${lead.intentSignal.toLowerCase()}, timing seems ideal. Would a 10-minute briefing make sense?`;
        break;
      case "direct":
        body = `Hi ${firstName} — quick note. Noticed ${lead.company}'s recent move: ${lead.intentSignal.toLowerCase()}. We help teams in this position scale outbound with ${userOffering}. 5-minute call this week?`;
        break;
      default:
        body = `Hi ${firstName}, noticed ${lead.company}'s recent milestone: "${lead.intentSignal}". We're currently helping ${lead.industry} leaders scale outbound pipeline with ${userOffering}. Teams like yours typically see 3x reply rates. Would love to connect and exchange notes — no hard sell!`;
        break;
    }

    return { subject, body };
  }

  // ── Twitter / X DM ────────────────────────────────────────────────────────
  static _generateTwitterDM(lead, firstName, tone, userOffering) {
    const subject = `DM — ${lead.company}`;
    const handle = lead.twitterHandle || `@${firstName.toLowerCase()}`;
    let body = "";

    switch (tone) {
      case "casual":
        body = `Hey ${firstName}! 👋 Huge fan of what you're building at ${lead.company}. Saw your tweet about ${lead.intentSignal.toLowerCase().slice(0, 60)}... — we help teams in exactly this spot. DM me if you ever want to chat ${userOffering}. Zero spam, just signal. 🚀`;
        break;
      case "direct":
        body = `${firstName} — quick DM. ${lead.company}'s recent move caught my eye. We help ${lead.industry} founders 3x pipeline with ${userOffering}. Open to a 5-min call this week? Reply here or book: [link]`;
        break;
      default:
        body = `Hi ${firstName}! Noticed you're building something awesome at ${lead.company}. We work with ${lead.industry} leaders on ${userOffering} and the results for teams your size have been 🔥. Would love to share what we've seen work — any interest?`;
        break;
    }

    return { subject, body };
  }

  // ── Upwork Proposal ───────────────────────────────────────────────────────
  static _generateUpworkProposal(lead, firstName, tone, userOffering) {
    const subject = `Proposal: ${userOffering} for ${lead.company}`;
    let body = "";

    switch (tone) {
      case "executive":
        body = `Dear ${firstName},

Thank you for posting this project. Having reviewed your requirements for ${lead.company}, I'm confident we can deliver results that align with your stated goals.

Our Approach:
• Phase 1 (Days 1–7): Setup and data source configuration for your ${lead.industry} target market
• Phase 2 (Days 8–21): Automated prospect discovery using ${userOffering}
• Phase 3 (Days 22–30): Verification pipeline (MX + SMTP validation), export to ${lead.techStack ? lead.techStack[0] : 'your CRM'}
• KPI Benchmark: 500–1,000 verified, high-intent contacts with 97%+ deliverability guarantee

Timeline: 4 weeks | Delivery: Fully documented pipeline + data CSV

I'd welcome a discovery call to tailor scope to your exact requirements.

Best regards,
[Your Name]`;
        break;
      default:
        body = `Hi ${firstName},

I came across your Upwork listing and immediately recognized the challenge — building a scalable B2B prospecting engine that actually converts is genuinely hard.

Here's how I'd approach this for ${lead.company}:

✓ Multi-source data ingestion (LinkedIn, Apollo, custom domain crawling)
✓ Email verification pipeline: regex → MX lookup → SMTP handshake
✓ Enrichment: company headcount, tech stack, buying intent signals
✓ Output: clean CSV / CRM-ready export

I've built similar pipelines for ${lead.industry} teams and regularly achieve 97–99% deliverability rates.

Rate: [Your Rate] | Timeline: 3–4 weeks
Let me know if you'd like a sample output before we begin!

Best,
[Your Name]`;
        break;
    }

    return { subject, body };
  }

  // ── Follow-Up Email ────────────────────────────────────────────────────────
  static _generateFollowUpEmail(lead, firstName, tone, userOffering) {
    const subject = `Re: Quick thought for ${lead.company}`;
    let body = "";

    switch (tone) {
      case "direct":
        body = `Hi ${firstName},

Just checking back on my note from last week.

Still keen to explore ${userOffering} for ${lead.company}? Happy to make it a 5-minute call — you decide the format.

If the timing's off, no worries at all — I can reconnect next quarter.

Best,
[Your Name]`;
        break;
      case "casual":
        body = `Hey ${firstName},

Just floating this back to the top of your inbox! 😊

I know ${lead.intentSignal.toLowerCase()} keeps things busy. Totally get it.

If there's a 7-minute window this week to explore ${userOffering}, I promise it'll be worth it. If not, no hard feelings!

Cheers,
[Your Name]`;
        break;
      default:
        body = `Hi ${firstName},

Following up briefly on my previous note.

I know how busy things are with ${lead.intentSignal.toLowerCase()}.

Just wanted to see if exploring ${userOffering} to accelerate ${lead.company}'s pipeline makes sense for you this month. If not, no worries at all — happy to reconnect next quarter.

Best,
[Your Name]`;
        break;
    }

    return { subject, body };
  }
}
