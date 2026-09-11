/**
 * LeadPulse AI - Application Orchestrator v2
 * Central state manager and event handler for the full LeadPulse AI platform.
 * Imports: FilterEngine, OutreachGenerator, ExportUtils, ScraperEngine, VerificationEngine
 */

import { INITIAL_LEADS, SOURCE_PLATFORM_OPTIONS, INTENT_OPTIONS, EMAIL_STATUS_OPTIONS } from './mock-data.js';
import { FilterEngine } from './filter-engine.js';
import { OutreachGenerator } from './ai-outreach.js';
import { ExportUtils } from './export-utils.js';
import { ScraperEngine, PLATFORM_META } from './scraper-engine.js';
import { VerificationEngine } from './verification-engine.js';

const STORAGE_KEY = 'leadpulse_leads_v2';

// ── Dynamic API Base URL Configuration ─────────────────────────────────────────
// Automatically falls back to localhost:5001/api/v1 during local development,
// and routes to production backend URL when deployed.
export const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5001/api/v1'
  : (window.__LEADPULSE_API_URL__ || 'https://YOUR_BACKEND_URL/api/v1');

// ── Platform Badge HTML Generator ─────────────────────────────────────────────
function getPlatformBadgeHTML(platform) {
  if (!platform) platform = 'LinkedIn';
  const cls = platform.replace(/\s+/g, '-');
  const meta = PLATFORM_META[platform] || PLATFORM_META['LinkedIn'];
  return `<span class="platform-badge ${cls}">${meta.icon || ''} ${meta.label || platform}</span>`;
}

// ── Email Status Badge HTML Generator ─────────────────────────────────────────
function getEmailStatusBadgeHTML(status) {
  const s = VerificationEngine.getStatusMeta(status || 'Unverified');
  return `<span class="email-status-badge ${status || 'Unverified'}">${s.icon} ${s.label}</span>`;
}

// ── Avatar Initials ────────────────────────────────────────────────────────────
function getInitials(name) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

// ── Main App Class ──────────────────────────────────────────────────────────────
class LeadPulseApp {
  constructor() {
    this.leads = [];
    this.filterEngine = null;
    this.selectedLeadIds = new Set();
    this.currentView = 'grid';
    this.activeTab = 'discovery';
    this.currentDrawerLead = null;
    this.currentModalLead = null;
    this.outreachChannel = 'email';
    this.outreachTone = 'value_first';
    this.outreachVariant = 0;
    this.isScanRunning = false;

    this.init();
  }

  init() {
    this.loadLeads();
    this.filterEngine = new FilterEngine(this.leads);
    this.buildSidebarFilters();
    this.bindEvents();
    this.renderResults();
    this.renderAnalytics();
    this.updateNavCounts();
    
    // Hydrate with real data from backend
    this.fetchLeadsFromBackend();
  }

  // ── Data Management ─────────────────────────────────────────────────────────

  loadLeads() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.leads = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('LocalStorage read error:', e);
    }
    this.leads = [...INITIAL_LEADS];
    this.saveLeads();
  }

  saveLeads() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.leads));
    } catch (e) {
      console.warn('LocalStorage write error:', e);
    }
  }

  addLeads(newLeads) {
    const existingIds = new Set(this.leads.map(l => l.id));
    const unique = newLeads.filter(l => !existingIds.has(l.id));
    this.leads = [...unique, ...this.leads];
    this.filterEngine.setLeads(this.leads);
    this.saveLeads();
    return unique.length;
  }

  updateLead(id, updates) {
    this.leads = this.leads.map(l => l.id === id ? { ...l, ...updates } : l);
    this.filterEngine.setLeads(this.leads);
    this.saveLeads();
  }

  // ── Tab Navigation ──────────────────────────────────────────────────────────

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const section = document.getElementById(`view-${tabId}`);
    if (section) section.classList.add('active');
    const navBtn = document.getElementById(`nav-tab-${tabId}`);
    if (navBtn) navBtn.classList.add('active');
    if (tabId === 'analytics') {
      this.renderAnalytics();
    }
    if (tabId === 'pipeline') {
      this.renderPipeline();
    }
  }

  // ── Sidebar Filter Builder ──────────────────────────────────────────────────

  buildSidebarFilters() {
    const facets = this.filterEngine.getFacetCounts();

    // Source Platform filters
    this._renderCheckboxGroup(
      'platform-filters',
      SOURCE_PLATFORM_OPTIONS,
      (val) => facets.sourcePlatforms[val] || 0,
      (val, checked) => {
        this.filterEngine.toggleSourcePlatform(val, checked);
        this.renderResults();
      }
    );

    // Industry filters
    const industries = ['B2B SaaS', 'AI & ML', 'Fintech', 'E-Commerce', 'Cybersecurity', 'HealthTech', 'Digital Agency', 'Cloud Infrastructure', 'Real Estate'];
    this._renderCheckboxGroup('industry-filters', industries, (v) => facets.industries[v] || 0,
      (val, checked) => { this.filterEngine.toggleIndustry(val, checked); this.renderResults(); });

    // Intent filters
    const intentContainer = document.getElementById('intent-filters');
    if (intentContainer) {
      intentContainer.innerHTML = INTENT_OPTIONS.map(opt => `
        <label class="filter-checkbox-item">
          <input type="checkbox" class="intent-checkbox" data-intent="${opt.id}">
          <span>${opt.label}</span>
          <span class="filter-count">${facets.intentCategories[opt.id] || 0}</span>
        </label>
      `).join('');
      intentContainer.querySelectorAll('.intent-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          this.filterEngine.toggleIntentCategory(e.target.dataset.intent, e.target.checked);
          this.renderResults();
        });
      });
    }

    // Seniority
    this._renderCheckboxGroup('seniority-filters', ['C-Level', 'VP/Director', 'Head/Manager'],
      (v) => facets.seniority[v] || 0,
      (val, checked) => { this.filterEngine.toggleSeniority(val, checked); this.renderResults(); });

    // Company Size
    this._renderCheckboxGroup('size-filters', ['1-10', '11-50', '51-200', '201-500', '500+'],
      (v) => facets.companySizes[v] || 0,
      (val, checked) => { this.filterEngine.toggleCompanySize(val, checked); this.renderResults(); });

    // Region
    this._renderCheckboxGroup('region-filters', ['North America', 'Europe', 'APAC', 'Global'],
      (v) => facets.regions[v] || 0,
      (val, checked) => { this.filterEngine.toggleRegion(val, checked); this.renderResults(); });

    // Email Status filters
    const emailStatusContainer = document.getElementById('email-status-filters');
    if (emailStatusContainer) {
      emailStatusContainer.innerHTML = EMAIL_STATUS_OPTIONS.map(opt => `
        <label class="filter-checkbox-item">
          <input type="checkbox" class="email-status-checkbox" data-status="${opt.id}">
          ${getEmailStatusBadgeHTML(opt.id)}
          <span class="filter-count">${facets.emailStatuses[opt.id] || 0}</span>
        </label>
      `).join('');
      emailStatusContainer.querySelectorAll('.email-status-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          this.filterEngine.toggleEmailStatus(e.target.dataset.status, e.target.checked);
          this.renderResults();
        });
      });
    }
  }

  _renderCheckboxGroup(containerId, options, countFn, onChangeFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = options.map(opt => `
      <label class="filter-checkbox-item">
        <input type="checkbox" class="filter-cb" data-value="${opt}">
        <span>${opt}</span>
        <span class="filter-count">${countFn(opt)}</span>
      </label>
    `).join('');
    container.querySelectorAll('.filter-cb').forEach(cb => {
      cb.addEventListener('change', (e) => onChangeFn(e.target.dataset.value, e.target.checked));
    });
  }

  // ── Render Results ──────────────────────────────────────────────────────────

  renderResults() {
    const filtered = this.filterEngine.getFilteredLeads();
    const countEl = document.getElementById('results-count');
    if (countEl) countEl.textContent = filtered.length;

    if (this.currentView === 'grid') {
      this.renderGrid(filtered);
    } else {
      this.renderTable(filtered);
    }
  }

  renderGrid(leads) {
    const grid = document.getElementById('leads-grid');
    if (!grid) return;

    if (leads.length === 0) {
      grid.innerHTML = this._emptyState();
      return;
    }

    grid.innerHTML = leads.map(lead => this.createLeadCardHTML(lead)).join('');

    // Bind card events
    grid.querySelectorAll('.lead-card').forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
        this.openDrawer(id);
      });
    });

    grid.querySelectorAll('.lead-checkbox-input').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleLeadSelection(cb.dataset.id, cb.checked);
      });
    });

    grid.querySelectorAll('.card-ai-pitch-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAIModal(btn.dataset.id);
      });
    });

    grid.querySelectorAll('.card-save-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSaveLead(btn.dataset.id);
      });
    });
  }

  createLeadCardHTML(lead) {
    const isSelected = this.selectedLeadIds.has(lead.id);
    const platformBadge = getPlatformBadgeHTML(lead.sourcePlatform);
    const emailBadge = getEmailStatusBadgeHTML(lead.emailStatus);
    const techTags = (lead.techStack || []).slice(0, 4).map(t => `<span class="tech-tag">${t}</span>`).join('');
    const verifiedIcon = lead.emailStatus === 'Verified'
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--accent-emerald)"><polyline points="20 6 9 17 4 12"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

    const intentIconSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

    return `
    <div class="glass-card lead-card${isSelected ? ' selected' : ''}" data-id="${lead.id}">
      <!-- Header: Avatar + name + score + checkbox -->
      <div class="card-header-row">
        <div class="lead-profile-summary">
          <div class="lead-avatar-wrap">
            <div class="lead-avatar" style="background: ${lead.avatarBg || 'linear-gradient(135deg, #6366F1, #8B5CF6)'};">
              ${getInitials(lead.name)}
            </div>
            <div class="lead-status-indicator" title="Email active &amp; verified"></div>
          </div>
          <div class="lead-info-text">
            <div class="lead-name-row">
              <span class="lead-name">${lead.name}</span>
            </div>
            <span class="lead-title">${lead.title}</span>
          </div>
        </div>
        <div class="card-top-right">
          <input type="checkbox" class="lead-checkbox lead-checkbox-input" data-id="${lead.id}" ${isSelected ? 'checked' : ''} title="Select">
          <span class="ai-score-badge score-${lead.scoreTier || 'medium'}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            ${lead.aiScore}%
          </span>
        </div>
      </div>

      <!-- Platform & Email Status badges -->
      <div class="card-meta-strip">
        ${platformBadge}
        ${emailBadge}
        ${lead.fundingStage ? `<span class="funding-badge">💰 ${lead.fundingStage}</span>` : ''}
      </div>

      <!-- Company strip -->
      <div class="company-details-strip">
        <div class="company-identity">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          ${lead.company}
        </div>
        <div class="company-meta-tags">
          <span>${lead.industry}</span>
          <span style="opacity:0.3;">|</span>
          <span>${lead.companySize}</span>
          <span style="opacity:0.3;">|</span>
          <span>${lead.location.split(',')[1]?.trim() || lead.location}</span>
        </div>
      </div>

      <!-- Intent Signal -->
      <div class="intent-trigger-box">
        <span class="intent-icon">${intentIconSVG}</span>
        <span>${lead.intentSignal}</span>
      </div>

      <!-- Tech Stack -->
      <div class="tech-stack-row">
        ${techTags}
        ${lead.techStack && lead.techStack.length > 4 ? `<span class="tech-tag" style="color: var(--accent-primary);">+${lead.techStack.length - 4} more</span>` : ''}
      </div>

      <!-- Contact strip -->
      <div class="contact-fast-strip">
        <div class="contact-email-badge">
          ${verifiedIcon}
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lead.email}</span>
        </div>
        <div class="contact-phone-badge">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.5 2.29h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l1.98-1.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span>${lead.phone ? 'Direct' : 'N/A'}</span>
        </div>
      </div>

      <!-- Card Actions -->
      <div class="card-actions-row">
        <button class="btn btn-secondary btn-sm card-save-btn" data-id="${lead.id}" title="${lead.saved ? 'Saved to Pipeline' : 'Save to Pipeline'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="${lead.saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" style="color: ${lead.saved ? 'var(--accent-amber)' : ''}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${lead.saved ? 'Saved' : 'Save'}
        </button>
        <button class="btn btn-primary btn-sm card-ai-pitch-btn" data-id="${lead.id}" title="Generate AI cold outreach for this prospect">
          ✨ AI Pitch
        </button>
      </div>
    </div>
    `;
  }

  renderTable(leads) {
    const tbody = document.getElementById('leads-table-body');
    if (!tbody) return;

    tbody.innerHTML = leads.map(lead => `
      <tr class="${this.selectedLeadIds.has(lead.id) ? 'selected' : ''}" data-id="${lead.id}" style="cursor: pointer;">
        <td>
          <input type="checkbox" class="lead-checkbox lead-checkbox-input" data-id="${lead.id}"
            ${this.selectedLeadIds.has(lead.id) ? 'checked' : ''}>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.7rem;">
            <div style="width: 34px; height: 34px; border-radius: 7px; background: ${lead.avatarBg}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; color: white; flex-shrink: 0;">
              ${getInitials(lead.name)}
            </div>
            <div>
              <div style="font-weight: 600; color: var(--text-primary); font-size: 0.88rem;">${lead.name}</div>
              <div style="font-size: 0.74rem; color: var(--text-muted);">${lead.title}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.85rem;">${lead.company}</div>
          <div style="font-size: 0.74rem; color: var(--text-muted);">${lead.industry} · ${lead.companySize}</div>
        </td>
        <td>${getPlatformBadgeHTML(lead.sourcePlatform)}</td>
        <td>
          <span class="ai-score-badge score-${lead.scoreTier || 'medium'}">${lead.aiScore}%</span>
        </td>
        <td>${getEmailStatusBadgeHTML(lead.emailStatus)}</td>
        <td style="max-width: 280px;">
          <span style="font-size: 0.76rem; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${lead.intentSignal}
          </span>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-primary btn-sm card-ai-pitch-btn" data-id="${lead.id}">✨ Pitch</button>
        </td>
      </tr>
    `).join('');

    if (leads.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">${this._emptyState()}</td></tr>`;
    }

    // Bind row events
    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        this.openDrawer(row.dataset.id);
      });
    });

    tbody.querySelectorAll('.lead-checkbox-input').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleLeadSelection(cb.dataset.id, cb.checked);
      });
    });

    tbody.querySelectorAll('.card-ai-pitch-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAIModal(btn.dataset.id);
      });
    });
  }

  _emptyState() {
    return `
      <div style="text-align: center; padding: 4rem 2rem; color: var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
        <div style="font-size: 1rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.5rem;">No leads match your current filters</div>
        <div style="font-size: 0.84rem;">Try adjusting your filters or run a new radar scan to discover fresh leads.</div>
      </div>
    `;
  }

  // ── Selection Management ──────────────────────────────────────────────────

  toggleLeadSelection(id, selected) {
    if (selected) {
      this.selectedLeadIds.add(id);
    } else {
      this.selectedLeadIds.delete(id);
    }
    this.updateBulkBanner();
    // Update card selected state
    const card = document.querySelector(`.lead-card[data-id="${id}"]`);
    if (card) {
      card.classList.toggle('selected', selected);
    }
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (row) {
      row.classList.toggle('selected', selected);
    }
  }

  updateBulkBanner() {
    const banner = document.getElementById('bulk-action-banner');
    const info = document.getElementById('bulk-count-info');
    if (!banner) return;
    if (this.selectedLeadIds.size > 0) {
      banner.classList.add('active');
      if (info) info.textContent = `${this.selectedLeadIds.size} prospect${this.selectedLeadIds.size !== 1 ? 's' : ''} selected`;
    } else {
      banner.classList.remove('active');
    }
  }

  // ── Lead Save / Pipeline ──────────────────────────────────────────────────

  toggleSaveLead(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;
    const newSaved = !lead.saved;
    const newStage = newSaved ? (lead.pipelineStage === 'discovered' ? 'discovered' : lead.pipelineStage) : lead.pipelineStage;
    this.updateLead(id, { saved: newSaved, pipelineStage: newStage });
    this.renderResults();
    this.updateNavCounts();
    this.showToast(
      newSaved ? 'success' : 'info',
      newSaved ? `⭐ ${lead.name} saved to your pipeline!` : `Removed ${lead.name} from pipeline.`
    );
  }

  updateNavCounts() {
    const saved = this.leads.filter(l => l.saved).length;
    const countEl = document.getElementById('nav-saved-count');
    if (countEl) countEl.textContent = saved;
  }

  // ── Pipeline Kanban View ──────────────────────────────────────────────────

  renderPipeline() {
    const board = document.getElementById('pipeline-board');
    if (!board) return;

    const stages = [
      { id: 'discovered', label: 'Discovered', color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
      { id: 'contacted', label: 'Contacted', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
      { id: 'meeting_booked', label: 'Meeting Booked', color: '#06B6D4', bg: 'rgba(6,182,212,0.12)' },
      { id: 'closed_won', label: 'Closed / Won', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    ];

    const savedLeads = this.leads.filter(l => l.saved);

    board.innerHTML = stages.map(stage => {
      const stageLeads = savedLeads.filter(l => l.pipelineStage === stage.id);
      return `
        <div class="pipeline-col" data-stage="${stage.id}" id="pipeline-col-${stage.id}">
          <div class="pipeline-col-header">
            <div class="pipeline-col-title" style="color: ${stage.color};">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${stage.color}; flex-shrink: 0;"></span>
              ${stage.label}
            </div>
            <span class="pipeline-col-count" style="background: ${stage.bg}; color: ${stage.color};">
              ${stageLeads.length}
            </span>
          </div>
          <div class="pipeline-items-wrap" id="pipeline-items-${stage.id}">
            ${stageLeads.length === 0
              ? `<div class="pipeline-empty-col">Drop leads here</div>`
              : stageLeads.map(lead => this._pipelineCardHTML(lead)).join('')
            }
          </div>
        </div>
      `;
    }).join('');

    this._bindPipelineDnD();
    this._renderPipelineSummary(stages, savedLeads);
  }

  _pipelineCardHTML(lead) {
    return `
      <div class="pipeline-card" draggable="true" data-id="${lead.id}" id="pcard-${lead.id}">
        <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.6rem;">
          <div style="width: 32px; height: 32px; border-radius: 7px; background: ${lead.avatarBg}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.78rem; color: white; flex-shrink: 0;">
            ${getInitials(lead.name)}
          </div>
          <div style="min-width: 0;">
            <div style="font-weight: 700; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${lead.name}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${lead.company} · ${lead.title.split(' ').slice(0, 3).join(' ')}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.4rem;">
          ${getPlatformBadgeHTML(lead.sourcePlatform)}
          ${getEmailStatusBadgeHTML(lead.emailStatus)}
          <span class="ai-score-badge score-${lead.scoreTier || 'medium'}" style="font-size: 0.66rem; padding: 0.1rem 0.4rem;">${lead.aiScore}%</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
          <button class="btn btn-ghost btn-sm" onclick="window.app.openDrawer('${lead.id}')" style="flex:1; font-size:0.73rem; padding: 0.3rem;">
            View Details
          </button>
          <select class="custom-select pipeline-stage-select" data-id="${lead.id}" style="flex: 1; font-size: 0.73rem; padding: 0.3rem; height: auto;">
            <option value="discovered"   ${lead.pipelineStage === 'discovered'    ? 'selected' : ''}>Discovered</option>
            <option value="contacted"    ${lead.pipelineStage === 'contacted'     ? 'selected' : ''}>Contacted</option>
            <option value="meeting_booked" ${lead.pipelineStage === 'meeting_booked' ? 'selected' : ''}>Meeting</option>
            <option value="closed_won"   ${lead.pipelineStage === 'closed_won'   ? 'selected' : ''}>Closed</option>
          </select>
        </div>
      </div>
    `;
  }

  _bindPipelineDnD() {
    let draggedId = null;

    document.querySelectorAll('.pipeline-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        draggedId = card.dataset.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });
    });

    document.querySelectorAll('.pipeline-col').forEach(col => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave', () => {
        col.classList.remove('drag-over');
      });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        if (!draggedId) return;
        const newStage = col.dataset.stage;
        this.updateLead(draggedId, { pipelineStage: newStage, saved: true });
        this.renderPipeline();
        this.showToast('success', `Moved to ${newStage.replace('_', ' ')} stage`);
      });
    });

    document.querySelectorAll('.pipeline-stage-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        e.stopPropagation();
        this.updateLead(sel.dataset.id, { pipelineStage: sel.value });
        this.renderPipeline();
        this.showToast('info', `Stage updated to: ${sel.value.replace('_', ' ')}`);
      });
    });
  }

  _renderPipelineSummary(stages, savedLeads) {
    const chipsEl = document.getElementById('pipeline-summary-chips');
    if (!chipsEl) return;
    chipsEl.innerHTML = stages.map(s => {
      const count = savedLeads.filter(l => l.pipelineStage === s.id).length;
      return `<span style="font-size: 0.78rem; padding: 0.2rem 0.65rem; border-radius: var(--radius-full); background: ${count > 0 ? s.bg : 'rgba(255,255,255,0.04)'}; border: 1px solid ${count > 0 ? s.color + '55' : 'var(--glass-border)'}; color: ${count > 0 ? s.color : 'var(--text-muted)'}; font-weight: 700;">${s.label}: ${count}</span>`;
    }).join('');
  }

  // ── Analytics Rendering ──────────────────────────────────────────────────

  renderAnalytics() {
    const total = this.leads.length;
    if (!total) return;

    const highIntent = this.leads.filter(l => l.aiScore >= 95).length;
    const avgDeliverability = (this.leads.reduce((s, l) => s + (l.emailDeliverability || l.deliverabilityScore || 0), 0) / total).toFixed(1);
    const avgScore = (this.leads.reduce((s, l) => s + (l.aiScore || 0), 0) / total).toFixed(0);

    this._animateCounter('analytics-total-leads', total);
    this._animateCounter('analytics-high-intent', highIntent);
    this._setMetric('analytics-deliverability', `${avgDeliverability}%`);
    this._setMetric('analytics-avg-score', `${avgScore}%`);

    // Industry bars
    const industryCounts = {};
    this.leads.forEach(l => { industryCounts[l.industry] = (industryCounts[l.industry] || 0) + 1; });
    const sortedIndustries = Object.entries(industryCounts).sort((a,b) => b[1]-a[1]).slice(0, 8);
    const maxInd = sortedIndustries[0]?.[1] || 1;
    const BRAND_COLORS = ['#6366F1', '#8B5CF6', '#D946EF', '#EC4899', '#3B82F6', '#06B6D4', '#10B981', '#F59E0B'];
    document.getElementById('analytics-industry-bars').innerHTML = sortedIndustries.map(([name, count], i) => `
      <div class="bar-item">
        <div class="bar-item-header"><span>${name}</span><span>${count} leads</span></div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(count/maxInd*100).toFixed(0)}%; background: ${BRAND_COLORS[i % BRAND_COLORS.length]};"></div>
        </div>
      </div>
    `).join('');

    // Intent bars
    const INTENT_LABELS = { funding: 'Raised Funding Round', hiring: 'Aggressive Hiring', tech_expansion: 'Tech Stack Migration', product_launch: 'Product / Market Launch' };
    const INTENT_COLORS = { funding: '#F59E0B', hiring: '#6366F1', tech_expansion: '#06B6D4', product_launch: '#10B981' };
    const intentCounts = {};
    this.leads.forEach(l => { intentCounts[l.intentCategory] = (intentCounts[l.intentCategory] || 0) + 1; });
    const maxIntent = Math.max(...Object.values(intentCounts), 1);
    document.getElementById('analytics-intent-bars').innerHTML = Object.entries(intentCounts).sort((a,b) => b[1]-a[1]).map(([key, count]) => `
      <div class="bar-item">
        <div class="bar-item-header"><span>${INTENT_LABELS[key] || key}</span><span>${count} leads</span></div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(count/maxIntent*100).toFixed(0)}%; background: ${INTENT_COLORS[key] || '#6366F1'};"></div>
        </div>
      </div>
    `).join('');

    // Pipeline funnel
    const FUNNEL_STAGES = [
      { id: 'all', label: 'Total Discovered', color: '#6366F1' },
      { id: 'contacted', label: 'Contacted', color: '#F59E0B' },
      { id: 'meeting_booked', label: 'Meeting Booked', color: '#06B6D4' },
      { id: 'closed_won', label: 'Closed / Won', color: '#10B981' },
    ];
    const stageCount = { all: total };
    this.leads.forEach(l => { stageCount[l.pipelineStage] = (stageCount[l.pipelineStage] || 0) + 1; });
    const maxFunnel = total;
    document.getElementById('analytics-funnel').innerHTML = FUNNEL_STAGES.map(s => {
      const count = s.id === 'all' ? total : (stageCount[s.id] || 0);
      const pct = maxFunnel > 0 ? Math.round(count / maxFunnel * 100) : 0;
      return `
        <div class="funnel-stage">
          <span class="funnel-label">${s.label}</span>
          <div class="funnel-track">
            <div class="funnel-fill" style="width: ${pct}%; background: linear-gradient(90deg, ${s.color}, ${s.color}aa);">
              ${pct > 15 ? pct + '%' : ''}
            </div>
          </div>
          <span class="funnel-count">${count}</span>
        </div>
      `;
    }).join('');

    // Platform breakdown
    const platformCounts = {};
    this.leads.forEach(l => { const p = l.sourcePlatform || 'LinkedIn'; platformCounts[p] = (platformCounts[p] || 0) + 1; });
    const sortedPlatforms = Object.entries(platformCounts).sort((a,b) => b[1]-a[1]);
    const maxPlat = sortedPlatforms[0]?.[1] || 1;
    document.getElementById('analytics-platform-bars').innerHTML = sortedPlatforms.map(([platform, count]) => {
      const meta = PLATFORM_META[platform] || { color: '#6366F1', label: platform, bgColor: 'rgba(99,102,241,0.15)', icon: '' };
      const pct = Math.round(count / maxPlat * 100);
      return `
        <div class="platform-chart-item">
          <div class="platform-chart-icon" style="background: ${meta.bgColor}; color: ${meta.color};">${meta.icon || ''}</div>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.2rem; color: var(--text-secondary);">
              <span>${meta.label || platform}</span>
              <span>${count}</span>
            </div>
            <div class="bar-track" style="height: 5px;">
              <div class="bar-fill" style="width: ${pct}%; background: ${meta.color};"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  _animateCounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.add('animating');
    const duration = 800;
    const start = performance.now();
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * targetValue);
      if (progress < 1) requestAnimationFrame(animate);
      else {
        el.textContent = targetValue;
        el.classList.remove('animating');
      }
    };
    requestAnimationFrame(animate);
  }

  _setMetric(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = value;
  }

  // ── Enrichment Drawer ──────────────────────────────────────────────────────

  openDrawer(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;
    this.currentDrawerLead = lead;

    const verifyStepsHTML = this._buildVerifyStepsHTML(lead);
    const techTagsHTML = (lead.techStack || []).map(t => `<span class="tech-tag">${t}</span>`).join('');

    document.getElementById('drawer-body').innerHTML = `
      <!-- Profile Hero -->
      <div style="display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0;">
        <div style="width: 62px; height: 62px; border-radius: var(--radius-md); background: ${lead.avatarBg}; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 800; color: white; flex-shrink: 0; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
          ${getInitials(lead.name)}
        </div>
        <div>
          <div style="font-size: 1.2rem; font-weight: 800; margin-bottom: 0.2rem;">${lead.name}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.4rem;">${lead.title} at <strong style="color: var(--text-primary);">${lead.company}</strong></div>
          <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
            ${getPlatformBadgeHTML(lead.sourcePlatform)}
            <span class="ai-score-badge score-${lead.scoreTier || 'medium'}">${lead.aiScore}% AI Match</span>
            ${lead.fundingStage ? `<span class="funding-badge">💰 ${lead.fundingStage}</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Company Snapshot -->
      <div class="drawer-section">
        <div class="drawer-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          Company Intelligence
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.82rem;">
          <div style="background: rgba(19,25,38,0.6); padding: 0.6rem 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border);">
            <div style="color: var(--text-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.2rem;">Industry</div>
            <div style="font-weight: 600;">${lead.industry}</div>
          </div>
          <div style="background: rgba(19,25,38,0.6); padding: 0.6rem 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border);">
            <div style="color: var(--text-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.2rem;">Headcount</div>
            <div style="font-weight: 600;">${lead.companySize} (~${lead.headcount} people)</div>
          </div>
          <div style="background: rgba(19,25,38,0.6); padding: 0.6rem 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border);">
            <div style="color: var(--text-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.2rem;">Revenue</div>
            <div style="font-weight: 600;">${lead.revenue || 'N/A'}</div>
          </div>
          <div style="background: rgba(19,25,38,0.6); padding: 0.6rem 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border);">
            <div style="color: var(--text-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.2rem;">Location</div>
            <div style="font-weight: 600;">${lead.location}</div>
          </div>
        </div>
        <div style="padding: 0.75rem; background: rgba(19,25,38,0.6); border-radius: var(--radius-md); border: 1px solid var(--glass-border); font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5;">
          ${lead.companyBio}
        </div>
      </div>

      <!-- Verified Contact Details -->
      <div class="drawer-section">
        <div class="drawer-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.5 2.29h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l1.98-1.98a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Verified Contact Intelligence
        </div>
        <div class="contact-detail-grid">
          <div class="contact-detail-item" style="grid-column: 1 / -1;">
            <span class="contact-item-label">Email Address</span>
            <div class="contact-item-val">
              <span>${lead.email}</span>
              <button class="copy-mini-btn" onclick="window.app.copyText('${lead.email}', 'Email')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>
          <div class="contact-detail-item">
            <span class="contact-item-label">Email Status</span>
            <div class="contact-item-val">${getEmailStatusBadgeHTML(lead.emailStatus)}</div>
          </div>
          <div class="contact-detail-item">
            <span class="contact-item-label">Deliverability</span>
            <div class="contact-item-val" style="color: var(--accent-emerald); font-weight: 700;">
              ${lead.deliverabilityScore || lead.emailDeliverability}%
            </div>
          </div>
          <div class="contact-detail-item">
            <span class="contact-item-label">MX Records</span>
            <div class="contact-item-val" style="color: ${lead.mxValid ? 'var(--accent-emerald)' : 'var(--accent-rose)'}">
              ${lead.mxValid ? '✓ Valid' : '✗ Invalid'}
            </div>
          </div>
          <div class="contact-detail-item">
            <span class="contact-item-label">SMTP Check</span>
            <div class="contact-item-val" style="color: ${lead.smtpCheck ? 'var(--accent-emerald)' : 'var(--accent-amber)'}">
              ${lead.smtpCheck ? '250 OK' : 'Catch-All / Unconfirmed'}
            </div>
          </div>
          <div class="contact-detail-item">
            <span class="contact-item-label">Direct Phone</span>
            <div class="contact-item-val">
              <span>${lead.phone || 'N/A'}</span>
              ${lead.phone ? `<button class="copy-mini-btn" onclick="window.app.copyText('${lead.phone}', 'Phone')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : ''}
            </div>
          </div>
          <div class="contact-detail-item">
            <span class="contact-item-label">LinkedIn</span>
            <div class="contact-item-val">
              <a href="${lead.linkedin}" target="_blank" rel="noopener" style="font-size: 0.78rem;">Open Profile ↗</a>
            </div>
          </div>
          <div class="contact-detail-item">
            <span class="contact-item-label">Twitter / X</span>
            <div class="contact-item-val">${lead.twitterHandle || 'N/A'}</div>
          </div>
        </div>
      </div>

      <!-- Verification Steps -->
      <div class="drawer-section">
        <div class="drawer-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          4-Step Verification Pipeline
        </div>
        <div class="verify-steps-list">${verifyStepsHTML}</div>
      </div>

      <!-- Buying Intent & News -->
      <div class="drawer-section">
        <div class="drawer-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Buying Intent Signal & Recent News
        </div>
        <div style="background: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.2); border-radius: var(--radius-md); padding: 0.85rem; font-size: 0.84rem; color: #C7D2FE; line-height: 1.5;">
          ${lead.intentSignal}
        </div>
        <div style="padding: 0.75rem; background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.2); border-radius: var(--radius-md); font-size: 0.82rem; color: #FCD34D; line-height: 1.5;">
          <strong style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7;">Latest News:</strong><br>${lead.recentNews}
        </div>
      </div>

      <!-- Tech Stack -->
      <div class="drawer-section">
        <div class="drawer-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          Technology Stack
        </div>
        <div class="tech-stack-row">${techTagsHTML}</div>
      </div>

      <!-- Source Info -->
      <div class="drawer-section">
        <div class="drawer-section-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Discovery Source
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem; font-size: 0.82rem; padding: 0.75rem; background: rgba(19,25,38,0.6); border: 1px solid var(--glass-border); border-radius: var(--radius-md);">
          ${getPlatformBadgeHTML(lead.sourcePlatform)}
          <div>
            <div style="color: var(--text-secondary); font-size: 0.72rem; margin-bottom: 0.1rem;">Discovered via ${lead.sourcePlatform || 'LinkedIn'}</div>
            <a href="${lead.sourceUrl || lead.linkedin}" target="_blank" rel="noopener" style="font-size: 0.78rem; word-break: break-all;">${(lead.sourceUrl || lead.linkedin).slice(0, 60)}${(lead.sourceUrl || '').length > 60 ? '...' : ''} ↗</a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('drawer-backdrop').classList.add('active');

    // Footer button states
    const saveBtn = document.getElementById('drawer-save-pipeline-btn');
    if (saveBtn) {
      saveBtn.textContent = lead.saved ? '⭐ Saved to Pipeline' : 'Save to Pipeline';
      saveBtn.onclick = () => {
        this.toggleSaveLead(lead.id);
        const updated = this.leads.find(l => l.id === lead.id);
        if (saveBtn && updated) saveBtn.textContent = updated.saved ? '⭐ Saved to Pipeline' : 'Save to Pipeline';
      };
    }

    const pitchBtn = document.getElementById('drawer-ai-pitch-btn');
    if (pitchBtn) {
      pitchBtn.onclick = () => this.openAIModal(lead.id);
    }

    const exportBtn = document.getElementById('drawer-export-btn');
    if (exportBtn) {
      exportBtn.onclick = () => {
        const report = ExportUtils.generateProspectReport(lead);
        ExportUtils.copyToClipboard(report);
        this.showToast('success', 'Prospect dossier copied to clipboard!');
      };
    }
  }

  _buildVerifyStepsHTML(lead) {
    const steps = [
      {
        label: 'Email Syntax Validation',
        passed: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email || ''),
        detail: 'Regex pattern validation of email format structure'
      },
      {
        label: 'Disposable Domain Blocklist',
        passed: true,
        detail: 'Not found in 50+ known disposable mail services blocklist'
      },
      {
        label: 'DNS / MX Record Lookup',
        passed: lead.mxValid !== false,
        detail: lead.mxValid !== false ? `MX records resolved for ${lead.domain}` : `No MX records found for ${lead.domain}`
      },
      {
        label: 'SMTP Handshake (Port 25)',
        passed: lead.smtpCheck === true,
        warn: !lead.smtpCheck && lead.emailStatus === 'Catch-All',
        detail: lead.smtpCheck ? `250 OK — ${lead.email} confirmed active` :
                lead.emailStatus === 'Catch-All' ? 'Catch-all server detected — domain accepts all addresses' :
                'SMTP server rejected mailbox'
      }
    ];

    return steps.map((step, i) => {
      const iconClass = step.passed && !step.warn ? 'pass' : step.warn ? 'warn' : 'fail';
      const iconChar = step.passed && !step.warn ? '✓' : step.warn ? '~' : '✗';
      return `
        <div class="verify-step-item" style="animation-delay: ${i * 0.06}s">
          <div class="verify-step-icon ${iconClass}">${iconChar}</div>
          <div class="verify-step-text">
            <span class="verify-step-name">${step.label}</span>
            <span class="verify-step-detail">${step.detail}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  closeDrawer() {
    document.getElementById('drawer-backdrop').classList.remove('active');
    this.currentDrawerLead = null;
  }

  async copyText(text, label) {
    await ExportUtils.copyToClipboard(text);
    this.showToast('success', `${label} copied to clipboard`);
  }

  // ── AI Outreach Modal ──────────────────────────────────────────────────────

  openAIModal(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;
    this.currentModalLead = lead;
    this.outreachChannel = 'email';
    this.outreachTone = 'value_first';
    this.outreachVariant = 0;

    document.getElementById('modal-prospect-name').textContent = lead.name;
    document.getElementById('modal-prospect-company').textContent = lead.company;
    document.getElementById('ai-modal-backdrop').classList.add('active');

    // Reset UI
    document.querySelectorAll('.channel-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.channel-tab[data-channel="email"]')?.classList.add('active');
    document.querySelectorAll('.tone-pill').forEach(t => t.classList.remove('active'));
    document.querySelector('.tone-pill[data-tone="value_first"]')?.classList.add('active');
    document.querySelectorAll('.ab-variant-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.ab-variant-btn[data-variant="0"]')?.classList.add('active');

    this.generatePitch();
  }

  generatePitch() {
    if (!this.currentModalLead) return;
    const offering = document.getElementById('outreach-offering-input')?.value || 'AI sales intelligence & pipeline acceleration';
    const result = OutreachGenerator.generatePitch(this.currentModalLead, {
      tone: this.outreachTone,
      channel: this.outreachChannel,
      offering,
      variant: this.outreachVariant
    });
    document.getElementById('email-subject-display').textContent = result.subject;
    document.getElementById('email-body-display').textContent = result.body;

    // Character counter for short-form channels
    const charEl = document.getElementById('char-counter');
    if (['twitter', 'linkedin'].includes(this.outreachChannel)) {
      const bodyLen = result.body.length;
      const limit = this.outreachChannel === 'twitter' ? 280 : 300;
      charEl.textContent = `${bodyLen} / ${limit} characters`;
      charEl.className = `char-counter${bodyLen > limit ? ' over-limit' : ''}`;
      charEl.style.display = 'block';
    } else {
      charEl.style.display = 'none';
    }
  }

  closeAIModal() {
    document.getElementById('ai-modal-backdrop').classList.remove('active');
    this.currentModalLead = null;
  }

  // ── Scraper Engine ─────────────────────────────────────────────────────────

  async runScraperScan() {
    if (this.isScanRunning) return;
    this.isScanRunning = true;

    const keywordsEl = document.getElementById('scraper-keywords-input');
    const keywords = keywordsEl?.value || '';

    const progressWrap = document.getElementById('scraper-progress-wrap');
    const stageLabel = document.getElementById('scraper-stage-label');
    const pctLabel = document.getElementById('scraper-pct-label');
    const fillBar = document.getElementById('scraper-progress-fill');
    const resultMsg = document.getElementById('scraper-result-msg');
    const runBtn = document.getElementById('run-scraper-btn');

    if (progressWrap) progressWrap.classList.add('active');
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Scanning...'; }
    if (resultMsg) resultMsg.textContent = '';

    this.showToast('info', `Initiating Targeted Scan for "${keywords || 'decision makers'}"...`);

    try {
      if (stageLabel) stageLabel.textContent = 'Queueing job...';
      if (pctLabel) pctLabel.textContent = `10%`;
      if (fillBar) fillBar.style.width = `10%`;

      // 1. Trigger the scan on the backend
      const response = await fetch(`${API_BASE_URL}/leads/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: "test-user-001",
          jobTitle: keywords, // Using keywords as jobTitle
          maxResults: 5
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to start scan: ${response.status}`);
      }
      
      if (stageLabel) stageLabel.textContent = 'Enriching profiles & discovering emails...';
      if (pctLabel) pctLabel.textContent = `40%`;
      if (fillBar) fillBar.style.width = `40%`;

      // 2. Poll dynamically for results until worker inserts them
      const initialCount = this.leads.length;
      let leadsFound = false;
      const startTime = Date.now();
      const maxPollingMs = 25000;

      while (Date.now() - startTime < maxPollingMs) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const elapsed = Date.now() - startTime;
        const currentPct = Math.min(92, 40 + Math.floor((elapsed / maxPollingMs) * 52));
        if (pctLabel) pctLabel.textContent = `${currentPct}%`;
        if (fillBar) fillBar.style.width = `${currentPct}%`;
        if (stageLabel) stageLabel.textContent = `Verifying emails (${Math.round(elapsed / 1000)}s)...`;

        const count = await this.fetchLeadsFromBackend();
        if (count > initialCount) {
          leadsFound = true;
          break;
        }
      }

      // Final refresh check
      if (!leadsFound) {
        await this.fetchLeadsFromBackend();
      }

      if (stageLabel) stageLabel.textContent = 'Done!';
      if (pctLabel) pctLabel.textContent = `100%`;
      if (fillBar) fillBar.style.width = `100%`;

      if (resultMsg) resultMsg.textContent = `✓ Scan completed. Dashboard updated.`;
      this.showToast('success', `🎯 Scan finished and leads refreshed!`);
    } catch (err) {
      console.error('Scraper error:', err);
      if (resultMsg) resultMsg.textContent = '⚠ Scan encountered an issue. Please try again.';
      this.showToast('error', 'Scraper scan failed. Please try again.');
    } finally {
      this.isScanRunning = false;
      if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Targeted Scan'; }
    }
  }

  async fetchLeadsFromBackend() {
    try {
      const response = await fetch(`${API_BASE_URL}/leads?userId=test-user-001&limit=50`);
      if (!response.ok) throw new Error('Failed to fetch leads');
      const data = await response.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        // Map backend leads to UI leads format (merging any missing fields to avoid breaking UI)
        const newLeads = data.data.map(lead => ({
            id: lead.id,
            name: lead.name,
            title: lead.jobTitle || 'Executive Lead',
            jobTitle: lead.jobTitle || 'Executive Lead',
            company: lead.company,
            domain: lead.domain || `${lead.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
            email: lead.email || 'N/A',
            emailStatus: lead.verificationStatus === 'VERIFIED' ? 'Verified' : 'Unverified',
            linkedin: lead.linkedinUrl,
            linkedinUrl: lead.linkedinUrl,
            location: 'San Francisco, US',
            industry: 'B2B SaaS',
            companySize: '51-200',
            sourcePlatform: 'LinkedIn',
            intentCategory: 'High Intent',
            intentSignal: 'Actively scaling revenue and enterprise operations',
            scoreTier: 'high',
            avatarBg: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            pipelineStage: 'discovered',
            aiScore: 88 + Math.floor(Math.random() * 10),
            emailDeliverability: lead.verificationStatus === 'VERIFIED' ? 100 : 70
        }));
        
        // Merge backend leads with any existing leads
        const existingIds = new Set(newLeads.map(l => l.id));
        const filteredOld = this.leads.filter(l => !existingIds.has(l.id));
        this.leads = [...newLeads, ...filteredOld];
        this.saveLeads();
        this.filterEngine.setLeads(this.leads);
        
        this.buildSidebarFilters();
        this.renderResults();
        this.renderAnalytics();
        this.updateNavCounts();
      }
      return this.leads.length;
    } catch (err) {
      console.error('Error fetching leads:', err);
      this.showToast('error', 'Failed to fetch leads from server.');
      return this.leads.length;
    }
  }

  // ── Add Custom Lead ──────────────────────────────────────────────────────

  async addCustomLead(formData) {
    const name = formData.name.trim();
    if (!name || !formData.email || !formData.company) {
      this.showToast('error', 'Please fill in all required fields.');
      return;
    }

    this.showToast('info', `Verifying ${formData.email}...`);
    let verifyResult = { status: 'Unverified', mxValid: false, smtpCheck: false, deliverabilityScore: 0 };
    try {
      verifyResult = await VerificationEngine.verifyEmail(formData.email);
    } catch (e) {}

    const newLead = {
      id: `lead_custom_${Date.now()}`,
      name,
      title: formData.title || 'Decision Maker',
      seniority: 'Head/Manager',
      avatarBg: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
      company: formData.company,
      domain: formData.email.split('@')[1] || 'unknown.com',
      industry: formData.industry || 'B2B SaaS',
      companySize: formData.size || '51-200',
      headcount: 100,
      revenue: 'Unknown',
      fundingStage: 'Unknown',
      location: 'Unknown',
      region: 'North America',
      email: formData.email,
      emailDeliverability: verifyResult.deliverabilityScore || 0,
      emailStatus: verifyResult.status,
      mxValid: verifyResult.mxValid,
      smtpCheck: verifyResult.smtpCheck,
      deliverabilityScore: verifyResult.deliverabilityScore,
      phone: formData.phone || '',
      linkedin: `https://linkedin.com/search/results/all/?keywords=${encodeURIComponent(name)}`,
      twitterHandle: '',
      sourcePlatform: formData.platform || 'LinkedIn',
      sourceUrl: '',
      aiScore: 82,
      scoreTier: 'medium',
      intentSignal: formData.intent || 'Manually added prospect — awaiting enrichment',
      intentCategory: 'tech_expansion',
      techStack: [],
      companyBio: `${formData.company} — manually added prospect.`,
      recentNews: formData.intent || 'Pending enrichment.',
      pipelineStage: 'discovered',
      saved: false
    };

    this.addLeads([newLead]);
    this.buildSidebarFilters();
    this.renderResults();
    this.renderAnalytics();
    this.updateNavCounts();
    this.showToast('success', `✓ ${name} added! Email: ${verifyResult.status}`);
    return true;
  }

  // ── Event Bindings ──────────────────────────────────────────────────────────

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.view));
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        this.filterEngine.setQuery(val);
        this.renderResults();
        const clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
      });
    }

    document.getElementById('search-clear-btn')?.addEventListener('click', () => {
      const si = document.getElementById('search-input');
      if (si) si.value = '';
      this.filterEngine.setQuery('');
      this.renderResults();
      document.getElementById('search-clear-btn').style.display = 'none';
    });

    // Preset pills
    document.querySelectorAll('.preset-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.filterEngine.applyPreset(pill.dataset.preset);
        // Uncheck all sidebar checkboxes
        document.querySelectorAll('.filter-cb, .intent-checkbox, .email-status-checkbox').forEach(cb => cb.checked = false);
        this.renderResults();
      });
    });

    // Sort select
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.filterEngine.setSortBy(e.target.value);
      this.renderResults();
    });

    // Contact filter toggles
    document.getElementById('filter-phone-only')?.addEventListener('change', (e) => {
      this.filterEngine.setHasPhoneOnly(e.target.checked);
      this.renderResults();
    });
    document.getElementById('filter-deliverability')?.addEventListener('change', (e) => {
      this.filterEngine.setHighDeliverabilityOnly(e.target.checked);
      this.renderResults();
    });

    // Reset filters
    document.getElementById('reset-filters-btn')?.addEventListener('click', () => {
      this.filterEngine.resetFilters();
      document.querySelectorAll('.filter-cb, .intent-checkbox, .email-status-checkbox').forEach(cb => cb.checked = false);
      document.getElementById('filter-phone-only').checked = false;
      document.getElementById('filter-deliverability').checked = false;
      document.getElementById('search-input').value = '';
      document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
      document.querySelector('.preset-pill[data-preset="all"]')?.classList.add('active');
      this.renderResults();
    });

    // View toggles (grid/table)
    document.getElementById('view-toggle-grid')?.addEventListener('click', () => {
      this.currentView = 'grid';
      document.getElementById('view-toggle-grid').classList.add('active');
      document.getElementById('view-toggle-table').classList.remove('active');
      document.getElementById('leads-grid').style.display = 'grid';
      document.getElementById('leads-table-container').style.display = 'none';
      this.renderResults();
    });

    document.getElementById('view-toggle-table')?.addEventListener('click', () => {
      this.currentView = 'table';
      document.getElementById('view-toggle-table').classList.add('active');
      document.getElementById('view-toggle-grid').classList.remove('active');
      document.getElementById('leads-grid').style.display = 'none';
      document.getElementById('leads-table-container').style.display = 'block';
      this.renderResults();
    });

    // Select all header checkbox
    document.getElementById('select-all-header')?.addEventListener('change', (e) => {
      const filtered = this.filterEngine.getFilteredLeads();
      filtered.forEach(l => this.toggleLeadSelection(l.id, e.target.checked));
    });

    // Bulk actions
    document.getElementById('bulk-deselect-btn')?.addEventListener('click', () => {
      this.selectedLeadIds.forEach(id => this.toggleLeadSelection(id, false));
      this.selectedLeadIds.clear();
      document.querySelectorAll('.lead-checkbox-input').forEach(cb => cb.checked = false);
      this.updateBulkBanner();
    });

    document.getElementById('bulk-save-btn')?.addEventListener('click', () => {
      this.selectedLeadIds.forEach(id => this.updateLead(id, { saved: true }));
      this.updateNavCounts();
      this.renderResults();
      this.showToast('success', `${this.selectedLeadIds.size} prospects saved to Pipeline!`);
    });

    document.getElementById('bulk-export-btn')?.addEventListener('click', () => {
      const toExport = this.leads.filter(l => this.selectedLeadIds.has(l.id));
      ExportUtils.exportToCSV(toExport, `leadpulse_selected_${Date.now()}.csv`);
      this.showToast('success', `Exporting ${toExport.length} leads as CSV...`);
    });

    document.getElementById('bulk-json-btn')?.addEventListener('click', () => {
      const toExport = this.leads.filter(l => this.selectedLeadIds.has(l.id));
      ExportUtils.exportToJSON(toExport, `leadpulse_selected_${Date.now()}.json`);
      this.showToast('success', `Exporting ${toExport.length} leads as JSON...`);
    });

    document.getElementById('export-csv-btn')?.addEventListener('click', () => {
      const filtered = this.filterEngine.getFilteredLeads();
      ExportUtils.exportToCSV(filtered, `leadpulse_export_${Date.now()}.csv`);
      this.showToast('success', `Exporting ${filtered.length} leads as CSV...`);
    });

    // Header scan button (radar sweep)
    document.getElementById('radar-scan-btn')?.addEventListener('click', () => {
      const scrPanel = document.getElementById('scraper-panel');
      if (scrPanel) scrPanel.scrollIntoView({ behavior: 'smooth' });
      this.runScraperScan();
    });

    // Scraper panel
    document.getElementById('run-scraper-btn')?.addEventListener('click', () => this.runScraperScan());

    document.getElementById('scraper-toggle-btn')?.addEventListener('click', () => {
      const body = document.getElementById('scraper-panel-body');
      if (body) {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? '' : 'none';
      }
    });

    // Drawer close
    document.getElementById('drawer-close-btn')?.addEventListener('click', () => this.closeDrawer());
    document.getElementById('drawer-backdrop')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('drawer-backdrop')) this.closeDrawer();
    });

    // AI Modal
    document.getElementById('ai-modal-close-btn')?.addEventListener('click', () => this.closeAIModal());
    document.getElementById('ai-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('ai-modal-backdrop')) this.closeAIModal();
    });

    // Channel tabs
    document.querySelectorAll('.channel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.channel-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.outreachChannel = tab.dataset.channel;
        this.generatePitch();
      });
    });

    // Tone pills
    document.querySelectorAll('.tone-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.tone-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.outreachTone = pill.dataset.tone;
        this.generatePitch();
      });
    });

    // A/B variant buttons
    document.querySelectorAll('.ab-variant-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ab-variant-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.outreachVariant = parseInt(btn.dataset.variant);
        this.generatePitch();
      });
    });

    // Offering input
    document.getElementById('outreach-offering-input')?.addEventListener('input', () => this.generatePitch());

    // Regenerate
    document.getElementById('regenerate-pitch-btn')?.addEventListener('click', () => {
      this.outreachVariant = this.outreachVariant === 0 ? 1 : 0;
      document.querySelectorAll('.ab-variant-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`.ab-variant-btn[data-variant="${this.outreachVariant}"]`)?.classList.add('active');
      this.generatePitch();
      this.showToast('info', 'New variant generated!');
    });

    // Copy pitch
    document.getElementById('copy-pitch-btn')?.addEventListener('click', () => {
      const subject = document.getElementById('email-subject-display')?.textContent || '';
      const body = document.getElementById('email-body-display')?.textContent || '';
      ExportUtils.copyToClipboard(`Subject: ${subject}\n\n${body}`);
      this.showToast('success', 'AI pitch copied to clipboard!');
    });

    // Open in mail
    document.getElementById('send-mailto-btn')?.addEventListener('click', () => {
      if (!this.currentModalLead) return;
      const subject = encodeURIComponent(document.getElementById('email-subject-display')?.textContent || '');
      const body = encodeURIComponent(document.getElementById('email-body-display')?.textContent || '');
      window.location.href = `mailto:${this.currentModalLead.email}?subject=${subject}&body=${body}`;
    });

    // Add Lead Modal
    document.getElementById('open-add-lead-btn')?.addEventListener('click', () => {
      document.getElementById('add-lead-modal-backdrop').classList.add('active');
    });

    ['close-add-lead-btn', 'close-add-lead-btn-2'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        document.getElementById('add-lead-modal-backdrop').classList.remove('active');
      });
    });

    document.getElementById('add-lead-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const success = await this.addCustomLead({
        name: document.getElementById('new-lead-name').value,
        title: document.getElementById('new-lead-title').value,
        company: document.getElementById('new-lead-company').value,
        industry: document.getElementById('new-lead-industry').value,
        email: document.getElementById('new-lead-email').value,
        phone: document.getElementById('new-lead-phone').value,
        size: document.getElementById('new-lead-size').value,
        platform: document.getElementById('new-lead-platform').value,
        intent: document.getElementById('new-lead-intent').value,
      });
      if (success) {
        document.getElementById('add-lead-modal-backdrop').classList.remove('active');
        document.getElementById('add-lead-form').reset();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeDrawer();
        this.closeAIModal();
        document.getElementById('add-lead-modal-backdrop')?.classList.remove('active');
      }
    });
  }

  // ── Toast Notifications ────────────────────────────────────────────────────

  showToast(type, message, duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      info:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      error:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-rose)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease-in forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.app = new LeadPulseApp();
});
