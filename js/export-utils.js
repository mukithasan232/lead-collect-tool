/**
 * LeadPulse AI - Export & Utility Functions v2
 * CSV export (full schema), JSON export, clipboard, and single-lead dossier.
 */

export class ExportUtils {
  /**
   * Export an array of leads to a simplified CSV file download for the client demo.
   * @param {object[]} leadsArray
   */
  static exportLeadsToCSV(leadsArray) {
    const headers = [
      "Name", "Job Title", "Company", "Email", "Verification Status", "Domain", "LinkedIn Profile"
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = leadsArray.map(lead => [
      lead.name,
      lead.title || lead.jobTitle || "",
      lead.company,
      lead.email,
      lead.emailStatus || lead.verificationStatus || "Unverified",
      lead.domain,
      lead.linkedin || lead.linkedinUrl || ""
    ].map(escapeCSV).join(","));

    const csvContent = [headers.join(","), ...rows].join("\n");
    this._downloadFile(csvContent, "LeadPulse_Verified_Leads.csv", "text/csv;charset=utf-8;");
  }

  /**
   * Export an array of leads to a CSV file download.
   * @param {object[]} leads
   * @param {string} filename
   */
  static exportToCSV(leads, filename = "leadpulse_export.csv") {
    const headers = [
      "Name", "Title", "Seniority", "Company", "Domain", "Industry",
      "Company Size", "Headcount", "Revenue", "Funding Stage", "Location", "Region",
      "Email", "Email Status", "MX Valid", "SMTP Check", "Deliverability Score",
      "Email Deliverability %", "Phone", "LinkedIn", "Twitter Handle",
      "Source Platform", "Source URL",
      "AI Score", "Score Tier", "Intent Signal", "Intent Category",
      "Tech Stack", "Company Bio", "Recent News",
      "Pipeline Stage", "Saved"
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = leads.map(lead => [
      lead.name,
      lead.title,
      lead.seniority || "",
      lead.company,
      lead.domain,
      lead.industry,
      lead.companySize,
      lead.headcount,
      lead.revenue,
      lead.fundingStage || "",
      lead.location,
      lead.region,
      lead.email,
      lead.emailStatus || "Unverified",
      lead.mxValid ? "Yes" : "No",
      lead.smtpCheck ? "Yes" : "No",
      lead.deliverabilityScore || lead.emailDeliverability || "",
      lead.emailDeliverability,
      lead.phone,
      lead.linkedin,
      lead.twitterHandle || "",
      lead.sourcePlatform || "LinkedIn",
      lead.sourceUrl || "",
      lead.aiScore,
      lead.scoreTier,
      lead.intentSignal,
      lead.intentCategory,
      (lead.techStack || []).join("; "),
      lead.companyBio,
      lead.recentNews,
      lead.pipelineStage,
      lead.saved ? "Yes" : "No"
    ].map(escapeCSV).join(","));

    const csvContent = [headers.join(","), ...rows].join("\n");
    this._downloadFile(csvContent, filename, "text/csv;charset=utf-8;");
  }

  /**
   * Export leads to a formatted JSON file.
   * @param {object[]} leads
   * @param {string} filename
   */
  static exportToJSON(leads, filename = "leadpulse_export.json") {
    const jsonContent = JSON.stringify(leads, null, 2);
    this._downloadFile(jsonContent, filename, "application/json");
  }

  /**
   * Generate a formatted plain-text dossier for a single lead.
   * @param {object} lead
   * @returns {string}
   */
  static generateProspectReport(lead) {
    const line = "─".repeat(55);
    const techList = (lead.techStack || []).join(", ");
    const verifiedIcon = lead.emailStatus === 'Verified' ? '✓' : lead.emailStatus === 'Catch-All' ? '~' : '?';

    return `
${line}
  LEADPULSE AI — PROSPECT INTELLIGENCE DOSSIER
${line}

CONTACT
  Name         : ${lead.name}
  Title        : ${lead.title} (${lead.seniority || ''})
  Company      : ${lead.company}
  Domain       : ${lead.domain}
  Location     : ${lead.location}, ${lead.region}

VERIFIED CONTACT
  Email        : ${lead.email}
  Status       : ${verifiedIcon} ${lead.emailStatus || 'Unverified'}
  Deliverability : ${lead.deliverabilityScore || lead.emailDeliverability}%
  MX Valid     : ${lead.mxValid ? 'Yes' : 'No'}
  SMTP Check   : ${lead.smtpCheck ? '250 OK' : 'Not Confirmed'}
  Phone        : ${lead.phone}
  LinkedIn     : ${lead.linkedin}
  Twitter      : ${lead.twitterHandle || 'N/A'}

FIRMOGRAPHIC INTELLIGENCE
  Industry     : ${lead.industry}
  Company Size : ${lead.companySize} employees (~${lead.headcount})
  Revenue      : ${lead.revenue}
  Funding Stage: ${lead.fundingStage || 'Unknown'}

BUYING INTENT
  Signal       : ${lead.intentSignal}
  Category     : ${lead.intentCategory}
  AI Score     : ${lead.aiScore}% (${lead.scoreTier})

TECH STACK
  ${techList}

COMPANY BIO
  ${lead.companyBio}

RECENT NEWS
  ${lead.recentNews}

SOURCE
  Platform     : ${lead.sourcePlatform || 'LinkedIn'}
  URL          : ${lead.sourceUrl || lead.linkedin}

PIPELINE
  Stage        : ${(lead.pipelineStage || '').replace('_', ' ').toUpperCase()}
  Saved        : ${lead.saved ? 'Yes' : 'No'}

${line}
  Generated by LeadPulse AI • ${new Date().toLocaleDateString()}
${line}
`.trim();
  }

  /**
   * Copy text content to the system clipboard.
   * @param {string} text
   */
  static async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-HTTPS / older browsers
        const el = document.createElement("textarea");
        el.value = text;
        el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────
  static _downloadFile(content, filename, mimeType) {
    const BOM = mimeType.includes("csv") ? "\uFEFF" : ""; // BOM for Excel compatibility
    const blob = new Blob([BOM + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
