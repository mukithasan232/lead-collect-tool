/**
 * LeadPulse AI - Search & Filter Engine v2
 * Multi-dimensional indexing, faceted search, presets, and sorting.
 * Now includes: sourcePlatform, emailStatus filters.
 */

export class FilterEngine {
  constructor(initialData) {
    this.allLeads = [...initialData];
    this.activePreset = "all";
    this.filters = {
      query: "",
      industries: new Set(),
      companySizes: new Set(),
      regions: new Set(),
      seniority: new Set(),
      intentCategories: new Set(),
      sourcePlatforms: new Set(),
      emailStatuses: new Set(),
      hasPhoneOnly: false,
      highDeliverabilityOnly: false,
      sortBy: "score_desc"
    };
  }

  setLeads(leads) {
    this.allLeads = [...leads];
  }

  setQuery(query) {
    this.filters.query = (query || "").trim().toLowerCase();
  }

  toggleIndustry(industry, isChecked) {
    isChecked ? this.filters.industries.add(industry) : this.filters.industries.delete(industry);
  }

  toggleCompanySize(size, isChecked) {
    isChecked ? this.filters.companySizes.add(size) : this.filters.companySizes.delete(size);
  }

  toggleRegion(region, isChecked) {
    isChecked ? this.filters.regions.add(region) : this.filters.regions.delete(region);
  }

  toggleSeniority(level, isChecked) {
    isChecked ? this.filters.seniority.add(level) : this.filters.seniority.delete(level);
  }

  toggleIntentCategory(intent, isChecked) {
    isChecked ? this.filters.intentCategories.add(intent) : this.filters.intentCategories.delete(intent);
  }

  toggleSourcePlatform(platform, isChecked) {
    isChecked ? this.filters.sourcePlatforms.add(platform) : this.filters.sourcePlatforms.delete(platform);
  }

  toggleEmailStatus(status, isChecked) {
    isChecked ? this.filters.emailStatuses.add(status) : this.filters.emailStatuses.delete(status);
  }

  setHasPhoneOnly(val) {
    this.filters.hasPhoneOnly = Boolean(val);
  }

  setHighDeliverabilityOnly(val) {
    this.filters.highDeliverabilityOnly = Boolean(val);
  }

  setSortBy(sortKey) {
    this.filters.sortBy = sortKey;
  }

  applyPreset(presetId) {
    this.activePreset = presetId;
    this.filters.industries.clear();
    this.filters.companySizes.clear();
    this.filters.regions.clear();
    this.filters.seniority.clear();
    this.filters.intentCategories.clear();
    this.filters.sourcePlatforms.clear();
    this.filters.emailStatuses.clear();
    this.filters.hasPhoneOnly = false;
    this.filters.highDeliverabilityOnly = false;

    switch (presetId) {
      case "hot_intent":
        this.filters.intentCategories.add("funding");
        this.filters.intentCategories.add("tech_expansion");
        break;
      case "saas_founders":
        this.filters.industries.add("B2B SaaS");
        this.filters.industries.add("AI & ML");
        this.filters.seniority.add("C-Level");
        break;
      case "ecommerce":
        this.filters.industries.add("E-Commerce");
        break;
      case "high_growth":
        this.filters.companySizes.add("51-200");
        this.filters.companySizes.add("201-500");
        this.filters.intentCategories.add("hiring");
        break;
      case "verified_phone":
        this.filters.hasPhoneOnly = true;
        this.filters.highDeliverabilityOnly = true;
        break;
      case "linkedin_only":
        this.filters.sourcePlatforms.add("LinkedIn");
        break;
      case "upwork_clients":
        this.filters.sourcePlatforms.add("Upwork");
        break;
      case "verified_only":
        this.filters.emailStatuses.add("Verified");
        break;
      case "all":
      default:
        break;
    }
  }

  resetFilters() {
    this.activePreset = "all";
    this.filters.query = "";
    this.filters.industries.clear();
    this.filters.companySizes.clear();
    this.filters.regions.clear();
    this.filters.seniority.clear();
    this.filters.intentCategories.clear();
    this.filters.sourcePlatforms.clear();
    this.filters.emailStatuses.clear();
    this.filters.hasPhoneOnly = false;
    this.filters.highDeliverabilityOnly = false;
  }

  getFilteredLeads() {
    let result = this.allLeads.filter(lead => {
      // 1. Text Query
      if (this.filters.query) {
        const q = this.filters.query;
        const haystack = [
          lead.name, lead.title, lead.company, lead.domain,
          lead.location, lead.industry, lead.intentSignal,
          ...(lead.techStack || []),
          lead.sourcePlatform || '',
          lead.emailStatus || '',
          lead.fundingStage || '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // 2. Industries
      if (this.filters.industries.size > 0 && !this.filters.industries.has(lead.industry)) return false;

      // 3. Company Size
      if (this.filters.companySizes.size > 0 && !this.filters.companySizes.has(lead.companySize)) return false;

      // 4. Region
      if (this.filters.regions.size > 0 && !this.filters.regions.has(lead.region)) return false;

      // 5. Seniority
      if (this.filters.seniority.size > 0 && !this.filters.seniority.has(lead.seniority)) return false;

      // 6. Intent Category
      if (this.filters.intentCategories.size > 0 && !this.filters.intentCategories.has(lead.intentCategory)) return false;

      // 7. Source Platform
      if (this.filters.sourcePlatforms.size > 0 && !this.filters.sourcePlatforms.has(lead.sourcePlatform || 'LinkedIn')) return false;

      // 8. Email Status
      if (this.filters.emailStatuses.size > 0 && !this.filters.emailStatuses.has(lead.emailStatus || 'Unverified')) return false;

      // 9. Phone Only
      if (this.filters.hasPhoneOnly && (!lead.phone || lead.phone.trim() === "")) return false;

      // 10. High Deliverability Only
      if (this.filters.highDeliverabilityOnly && lead.emailDeliverability < 98) return false;

      return true;
    });

    // Apply Sorting
    switch (this.filters.sortBy) {
      case "score_desc":
        result.sort((a, b) => b.aiScore - a.aiScore);
        break;
      case "score_asc":
        result.sort((a, b) => a.aiScore - b.aiScore);
        break;
      case "headcount_desc":
        result.sort((a, b) => b.headcount - a.headcount);
        break;
      case "headcount_asc":
        result.sort((a, b) => a.headcount - b.headcount);
        break;
      case "name_asc":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "deliverability_desc":
        result.sort((a, b) => (b.deliverabilityScore || b.emailDeliverability || 0) - (a.deliverabilityScore || a.emailDeliverability || 0));
        break;
      case "platform_asc":
        result.sort((a, b) => (a.sourcePlatform || '').localeCompare(b.sourcePlatform || ''));
        break;
      default:
        result.sort((a, b) => b.aiScore - a.aiScore);
    }

    return result;
  }

  getFacetCounts() {
    const counts = {
      industries: {},
      companySizes: {},
      regions: {},
      seniority: {},
      intentCategories: {},
      sourcePlatforms: {},
      emailStatuses: {}
    };

    for (const lead of this.allLeads) {
      counts.industries[lead.industry] = (counts.industries[lead.industry] || 0) + 1;
      counts.companySizes[lead.companySize] = (counts.companySizes[lead.companySize] || 0) + 1;
      counts.regions[lead.region] = (counts.regions[lead.region] || 0) + 1;
      counts.seniority[lead.seniority] = (counts.seniority[lead.seniority] || 0) + 1;
      counts.intentCategories[lead.intentCategory] = (counts.intentCategories[lead.intentCategory] || 0) + 1;
      const platform = lead.sourcePlatform || 'LinkedIn';
      counts.sourcePlatforms[platform] = (counts.sourcePlatforms[platform] || 0) + 1;
      const status = lead.emailStatus || 'Unverified';
      counts.emailStatuses[status] = (counts.emailStatuses[status] || 0) + 1;
    }

    return counts;
  }
}
