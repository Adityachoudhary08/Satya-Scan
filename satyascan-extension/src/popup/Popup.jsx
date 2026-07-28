import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanSearch,
  FileText,
  Clock,
  Settings,
  Inbox,
  Sparkles,
  Loader2,
  ArrowLeft,
  CircleCheckBig,
  CheckCircle2,
  CircleX,
  BadgeCheck,
  TriangleAlert,
  ShieldQuestion,
  ExternalLink,
  Share2,
  Copy,
  Trash2,
  Award,
  Info,
  Globe,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Newspaper,
  Check,
  BookOpen,
  Brain,
  Gauge,
  Target,
  Search
} from 'lucide-react';

import ActionCard from '../components/ActionCard';
import SectionTitle from '../components/SectionTitle';
import EmptyState from '../components/EmptyState';
import { STORAGE_KEY_RESULT } from '../lib/config';
import { createT, readStoredLang, storeLang } from '../lib/i18n';
import { verifySelectedText } from '../services/verifyService';

const API_URL = import.meta.env.VITE_APP_API_URL || 'http://localhost:5000';
const WEBSITE_URL = import.meta.env.VITE_APP_WEBSITE_URL || 
  (API_URL.includes('localhost') ? 'http://localhost:5173' : 'https://satya-scan-vho6.onrender.com');

// ─── Constants & Configuration ──────────────────────────────────────────────

// VERDICT_CONFIG is now a function so labels/microcopy are reactive to language.
function getVerdictConfig(t) {
  const mc = (key) => t(`verdict.microcopy.${key}`);
  const lbl = (key, fallback) => t(`verdict.${key}`, fallback);
  return {
    Supported:        { color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.1)', border: 'rgba(46, 125, 50, 0.2)', Icon: CircleCheckBig,  label: lbl('Supported', 'Verified'),           microcopy: mc('Supported') },
    True:             { color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.1)', border: 'rgba(46, 125, 50, 0.2)', Icon: CircleCheckBig,  label: lbl('True', 'Verified'),                microcopy: mc('True') },
    Contradicted:     { color: '#C62828', bg: 'rgba(198, 40, 40, 0.1)', border: 'rgba(198, 40, 40, 0.2)', Icon: CircleX,         label: lbl('Contradicted', 'False'),           microcopy: mc('Contradicted') },
    False:            { color: '#C62828', bg: 'rgba(198, 40, 40, 0.1)', border: 'rgba(198, 40, 40, 0.2)', Icon: CircleX,         label: lbl('False', 'False'),                  microcopy: mc('False') },
    Misleading:       { color: '#E65100', bg: 'rgba(230, 81, 0, 0.1)',  border: 'rgba(230, 81, 0, 0.2)',  Icon: TriangleAlert,   label: lbl('Misleading', 'Misleading'),        microcopy: mc('Misleading') },
    PARTIALLY_TRUE:   { color: '#D87D0A', bg: 'rgba(216, 125, 10, 0.1)', border: 'rgba(216, 125, 10, 0.2)', Icon: BadgeCheck,     label: lbl('PARTIALLY_TRUE', 'Partially Verified'), microcopy: mc('PARTIALLY_TRUE') },
    Unverified:       { color: '#5C6650', bg: 'rgba(92, 102, 80, 0.1)',  border: 'rgba(92, 102, 80, 0.2)', Icon: ShieldQuestion,  label: lbl('Unverified', "Couldn't Verify"),  microcopy: mc('Unverified') },
    Informational:    { color: '#006064', bg: 'rgba(0, 96, 100, 0.1)',   border: 'rgba(0, 96, 100, 0.2)',  Icon: Info,            label: lbl('Informational', 'Informational'),  microcopy: mc('Informational') },
    INFORMATIONAL:    { color: '#006064', bg: 'rgba(0, 96, 100, 0.1)',   border: 'rgba(0, 96, 100, 0.2)',  Icon: Info,            label: lbl('Informational', 'Informational'),  microcopy: mc('Informational') },
    Opinion:          { color: '#4A148C', bg: 'rgba(74, 20, 140, 0.1)',  border: 'rgba(74, 20, 140, 0.2)', Icon: BookOpen,        label: lbl('Opinion', 'Opinion / Editorial'),  microcopy: mc('Opinion') },
    OPINION:          { color: '#4A148C', bg: 'rgba(74, 20, 140, 0.1)',  border: 'rgba(74, 20, 140, 0.2)', Icon: BookOpen,        label: lbl('Opinion', 'Opinion / Editorial'),  microcopy: mc('Opinion') },
  };
}

// Module-level fallback (English) for helpers that run outside component context
const _tEN = createT('en');
const VERDICT_CONFIG_EN = getVerdictConfig(_tEN);

function getVerdict(v, t) {
  const cfg = t ? getVerdictConfig(t) : VERDICT_CONFIG_EN;
  return cfg[v] || { color: '#5C6650', bg: 'rgba(92, 102, 80, 0.1)', border: 'rgba(92, 102, 80, 0.2)', Icon: ShieldQuestion, label: v || 'Unknown', microcopy: '' };
}

function getReliabilityColor(score) {
  if (score >= 70) return '#2E7D32';
  if (score >= 40) return '#D87D0A';
  return '#C62828';
}

function splitReasoning(text) {
  if (!text) return [];
  if (Array.isArray(text)) {
    return text.map(s => String(s).trim()).filter(s => s.length > 5).slice(0, 3);
  }
  return String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/^[-•*]\s*/, '').trim())
    .filter(s => s.length > 5)
    .slice(0, 3);
}

function getDomain(url) {
  try { return new URL(url || '').hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

const TIER1_PUBLISHERS = ['reuters', 'bbc', 'apnews', 'ap.org', 'pib.gov', 'who.int', 'cdc.gov', 'nih.gov', 'gov.in'];
const TIER2_PUBLISHERS = ['ndtv', 'thehindu', 'indianexpress', 'theguardian', 'nytimes', 'washingtonpost', 'economist', 'bloomberg', 'ft.com', 'forbes', 'cnbc', 'abc', 'cbs', 'nbc'];

function publisherReliability(src, t) {
  const _t = t || _tEN;
  const s = (src.source || src.url || '').toLowerCase();
  if (TIER1_PUBLISHERS.some(k => s.includes(k))) return { label: _t('publisherTrust.highlyTrusted'), color: '#2E7D32', tier: 1, reason: _t('publisherTrust.highlyTrustedReason') };
  if (TIER2_PUBLISHERS.some(k => s.includes(k))) return { label: _t('publisherTrust.trusted'), color: '#2E7D32', tier: 2, reason: _t('publisherTrust.trustedReason') };
  if (src.trusted) return { label: _t('publisherTrust.verified'), color: '#2E7D32', tier: 3, reason: _t('publisherTrust.verifiedReason') };
  return { label: _t('publisherTrust.moderate'), color: '#D87D0A', tier: 4, reason: _t('publisherTrust.moderateReason') };
}

// ─── KeyFindingsCard ──────────────────────────────────────────────────────────
function KeyFindingsCard({ keyFindings, fallbackBullets, t }) {
  const ICON_COLORS = { '✓': '#2E7D32', '⚠': '#D87D0A', '✗': '#C62828' };
  const items = keyFindings && keyFindings.length > 0 ? keyFindings : null;
  const bullets = items
    ? items
    : (fallbackBullets || []).map(t => ({ icon: '✓', text: t }));
  if (bullets.length === 0) return null;
  return (
    <div className="rounded-xl p-4 bg-[#E4DFB5] border border-[#C3CC9B] space-y-2.5">
      <h3 className="text-xs font-bold text-[#232B1B] flex items-center gap-1.5">
        <Brain size={13} className="text-[#768E56]" />
        {t('extension.keyFindings', 'Key Findings')}
      </h3>
      <ul className="space-y-2">
        {bullets.map((item, i) => {
          const icon = typeof item === 'string' ? '✓' : (item.icon || '✓');
          const text = typeof item === 'string' ? item : item.text;
          const col = ICON_COLORS[icon] || '#768E56';
          return (
            <li key={i} className="flex items-start gap-2 text-xs text-[#232B1B] leading-relaxed font-medium">
              <span className="shrink-0 font-black text-sm leading-none mt-px" style={{ color: col }}>{icon}</span>
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── EvidenceDistributionCard ─────────────────────────────────────────────────
function EvidenceDistributionCard({ supporting, contradicting, neutral, t }) {
  if (!supporting && !contradicting && !neutral) return null;
  const chips = [
    { label: t('extension.supporting', 'Supporting'), count: supporting || 0, color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.08)' },
    { label: t('extension.contradicting', 'Contradicting'), count: contradicting || 0, color: '#C62828', bg: 'rgba(198, 40, 40, 0.08)' },
    { label: t('extension.neutral', 'Neutral'), count: neutral || 0, color: '#5C6650', bg: 'rgba(92, 102, 80, 0.08)' },
  ];
  const total = chips.reduce((acc, c) => acc + c.count, 0);
  if (total === 0) return null;

  return (
    <div className="rounded-xl p-4 border border-[#C3CC9B] bg-[#E4DFB5]/40">
      <p className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider mb-2.5">
        {t('extension.evidenceDistribution', 'Evidence Distribution')}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {chips.map(({ label, count, color, bg }) => (
          <div key={label} className="rounded-lg p-2 text-center" style={{ background: bg, border: `1px solid ${color}25` }}>
            <p className="text-lg font-black leading-none" style={{ color }}>{count}</p>
            <p className="text-[9px] font-bold mt-1" style={{ color }}>{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ClaimAccordion ───────────────────────────────────────────────────────────
function ClaimAccordion({ claims, t }) {
  const [openIdx, setOpenIdx] = useState(null);
  if (!claims || claims.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-[#232B1B] flex items-center gap-1.5">
        <Target size={13} className="text-[#768E56]" />
        {t('extension.claimsAnalyzed', 'Claims Analyzed')} ({claims.length})
      </h3>
      {claims.map((claim, idx) => {
        const claimCfg = getVerdict(claim.verdict, t);
        const isOpen = openIdx === idx;
        const hasSources = (claim.sources || []).length > 0;
        return (
          <div key={idx} className="rounded-xl border overflow-hidden" style={{ borderColor: isOpen ? claimCfg.color + '55' : '#C3CC9B', background: isOpen ? claimCfg.bg : '#E4DFB5' }}>
            <button
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              className="w-full flex items-start gap-2.5 p-3 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#232B1B] leading-snug">{claim.text}</p>
                {!isOpen && claim.reasoning && (
                  <p className="text-[10px] text-[#5C6650] mt-0.5 line-clamp-1 font-medium">{claim.reasoning}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: claimCfg.bg, color: claimCfg.color, border: `1px solid ${claimCfg.border}` }}>
                  {claimCfg.label}
                </span>
                <span className="text-[9px] font-bold" style={{ color: claimCfg.color }}>{claim.confidence || 0}%</span>
                {isOpen ? <ChevronUp size={12} className="text-[#5C6650]" /> : <ChevronDown size={12} className="text-[#5C6650]" />}
              </div>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-[#C3CC9B]/40 pt-2.5">
                {claim.reasoning && (
                  <p className="text-[11px] text-[#5C6650] leading-relaxed font-medium">{claim.reasoning}</p>
                )}
                {hasSources && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(claim.sources || []).slice(0, 4).map((src, si) => {
                      const pub = publisherReliability(src, t);
                      const name = src.source || getDomain(src.url) || t('results.trusted', 'Source');
                      return (
                        <a key={si} href={src.url || '#'} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full no-underline"
                          style={{ background: pub.color + '15', color: pub.color, border: `1px solid ${pub.color}30` }}
                        >
                          <Newspaper size={8} />{name}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Reliability Explanation Helper ─────────────────────────────────────────
function getConfidenceExplanation(score, verdict, trustedCount, totalSources, t) {
  const level = t ? t(`results.${score >= 70 ? 'highReliability' : score >= 40 ? 'moderateReliability' : 'lowReliability'}`) : (score >= 70 ? 'High Reliability' : score >= 40 ? 'Moderate Reliability' : 'Low Reliability');
  const reasons = [];

  if (t) {
    if (trustedCount >= 2) reasons.push(t('results.reliabilityReasons.multiTrusted'));
    else if (trustedCount >= 1) reasons.push(t('results.reliabilityReasons.oneTrusted'));
    else reasons.push(t('results.reliabilityReasons.noTrusted'));

    if (totalSources >= 3) reasons.push(t('results.reliabilityReasons.someEvidence'));
    else reasons.push(t('results.reliabilityReasons.limitedEvidence'));

    if (verdict === 'Supported' || verdict === 'True') reasons.push(t('results.reliabilityReasons.noContradictions'));
    else if (verdict === 'Contradicted' || verdict === 'False') reasons.push(t('results.reliabilityReasons.contradictions'));
    else if (verdict === 'Misleading') reasons.push(t('results.reliabilityReasons.contextGaps'));
  } else {
    if (trustedCount >= 2) reasons.push('Multiple independent trusted publications agree');
    else if (trustedCount >= 1) reasons.push('At least one trusted publication found');
    else reasons.push('No established trusted publications found');

    if (totalSources >= 3) reasons.push('Supporting evidence across multiple sources');
    else reasons.push('Limited evidence sources available');

    if (verdict === 'Supported' || verdict === 'True') reasons.push('No contradictions detected');
    else if (verdict === 'Contradicted' || verdict === 'False') reasons.push('Credible sources contradict this claim');
    else if (verdict === 'Misleading') reasons.push('Selective framing detected');
  }

  return { level, reasons };
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function ReliabilityRing({ score }) {
  const color = getReliabilityColor(score);
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#C3CC9B" strokeWidth="5.5" />
        <motion.circle
          cx="32" cy="32" r={r}
          fill="none" stroke={color} strokeWidth="5.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-black text-[#232B1B] leading-none">{score}</span>
        <span className="text-[7px] text-[#5C6650] mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

  function TrustCard({ score, verdict, trustedCount, totalSources, breakdown, t }) {
  const _t = t || _tEN;
  const { level, reasons } = getConfidenceExplanation(score, verdict, trustedCount, totalSources, _t);
  const color = getReliabilityColor(score);
  const isHigh = score >= 70;
  const isMed = score >= 40 && score < 70;
  const TrustIcon = isHigh ? CheckCircle2 : isMed ? BadgeCheck : TriangleAlert;

  return (
    <div
      className="rounded-xl p-3.5 border"
      style={{
        background: isHigh ? 'rgba(46, 125, 50, 0.05)' : isMed ? 'rgba(216, 125, 10, 0.05)' : 'rgba(198, 40, 40, 0.05)',
        borderColor: isHigh ? 'rgba(46, 125, 50, 0.15)' : isMed ? 'rgba(216, 125, 10, 0.15)' : 'rgba(198, 40, 40, 0.15)'
      }}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: color + '15', border: `1px solid ${color}25` }}>
          <TrustIcon size={15} style={{ color }} />
        </div>
        <div className="flex-grow min-w-0">
          <p className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider mb-0.5">
            {_t('results.canITrustThis', 'Can I trust this result?')}
          </p>
          <p className="text-xs font-black mb-1.5" style={{ color }}>{level} {_t('extension.reliability', 'Reliability')}</p>
          {breakdown && breakdown.length > 0 ? (
            <ul className="space-y-1">
              {breakdown.slice(0, 3).map((item, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[10px] text-[#5C6650] leading-snug">
                  <Check size={10} style={{ color, flexShrink: 0 }} />
                  <span className="font-semibold">{item.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-1">
              {reasons.slice(0, 3).map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px] text-[#5C6650] leading-snug">
                  <span className="shrink-0 mt-0.5 text-xs" style={{ color }}>•</span>
                  <span className="font-semibold">{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const RELATION_BADGE = {
  Supports:     { label: 'Supports',     color: '#2E7D32' },
  Contradicts:  { label: 'Contradicts',  color: '#C62828' },
  Neutral:      { label: 'Neutral',      color: '#5C6650' },
};

function ReasoningCard({ reasoning, t }) {
  const [expanded, setExpanded] = useState(false);
  if (!reasoning) return null;

  const fields = [
    { key: 'evidenceSummary', label: t('extension.evidenceSummary', 'Evidence Summary') },
    { key: 'crossSourceAgreement', label: t('extension.crossSourceAgreement', 'Cross-Source Agreement') },
    { key: 'contradictionsFound', label: t('extension.contradictionsFound', 'Contradictions Found') },
    { key: 'officialConfirmation', label: t('extension.officialConfirmation', 'Official Confirmation') },
    { key: 'missingContext', label: t('extension.missingContext', 'Missing Context') },
    { key: 'aiReasoning', label: t('extension.aiReasoning', 'AI Reasoning') }
  ];

  const hasContent = fields.some(f => reasoning[f.key]);
  if (!hasContent) return null;

  return (
    <div className="rounded-xl border border-[#C3CC9B] bg-[#E4DFB5] overflow-hidden text-left shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3.5 font-bold text-xs text-[#232B1B] hover:bg-[#C3CC9B]/20 transition-colors cursor-pointer bg-transparent border-none"
      >
        <div className="flex items-center gap-1.5">
          <Brain size={13} className="text-[#768E56]" />
          <span>{t('extension.whyConclusion', 'Why We Reached This Conclusion')}</span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-[#5C6650]" /> : <ChevronDown size={14} className="text-[#5C6650]" />}
      </button>

      {expanded && (
        <div className="p-3.5 pt-0 border-t border-[#C3CC9B]/40 space-y-3">
          {fields.map(f => {
            const val = reasoning[f.key];
            if (!val) return null;
            return (
              <div key={f.key} className="space-y-0.5">
                <p className="text-[9px] font-black text-[#5C6650] uppercase tracking-wider">{f.label}</p>
                <p className="text-xs text-[#232B1B] leading-relaxed font-semibold">{val}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfidenceBreakdown({ breakdown, t }) {
  if (!breakdown) return null;

  const renderStars = (num) => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(
        <span key={i} className="text-xs font-black leading-none" style={{ color: i < num ? '#768E56' : '#C3CC9B' }}>
          ★
        </span>
      );
    }
    return <div className="flex items-center gap-0.5 shrink-0">{stars}</div>;
  };

  const metrics = [
    { key: 'evidenceQuality', label: t('extension.evidenceQuality', 'Evidence Quality'), isStars: true },
    { key: 'independentSources', label: t('extension.independentSources', 'Independent Sources'), isStars: true },
    { key: 'officialSources', label: t('extension.officialSources', 'Official Sources'), isStars: true },
    { key: 'recentReporting', label: t('extension.recentReporting', 'Recent Reporting'), isStars: true },
    { key: 'contradictoryEvidence', label: t('extension.contradictoryEvidence', 'Contradictory Evidence'), isStatus: true },
    { key: 'aiConsistency', label: t('extension.aiConsistency', 'AI Consistency'), isStatus: true }
  ];

  return (
    <div className="rounded-xl border border-[#C3CC9B] bg-[#E4DFB5]/40 p-3.5 space-y-3 text-left shadow-sm">
      <p className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider">
        {t('results.canITrustThis', 'Why Confidence is ')}
      </p>
      <div className="grid grid-cols-1 gap-2.5">
        {metrics.map(m => {
          const data = breakdown[m.key];
          if (!data) return null;

          const isContradictory = m.key === 'contradictoryEvidence';
          const isConsistent = m.key === 'aiConsistency';

          return (
            <div key={m.key} className="rounded-lg p-2.5 bg-[#E4DFB5] border border-[#C3CC9B]/50 flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black text-[#232B1B]">{m.label}</span>
                {m.isStars && renderStars(data.stars || 0)}
                {m.isStatus && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 border" 
                        style={{ 
                          background: isContradictory && data.status === 'None Found' ? 'rgba(46, 125, 50, 0.1)' : 
                                      isConsistent && data.status === 'High' ? 'rgba(46, 125, 50, 0.1)' : 'rgba(216, 125, 10, 0.1)',
                          color: isContradictory && data.status === 'None Found' ? '#2E7D32' : 
                                 isConsistent && data.status === 'High' ? '#2E7D32' : '#D87D0A',
                          borderColor: isContradictory && data.status === 'None Found' ? 'rgba(46,125,50,0.2)' : 'rgba(216,125,10,0.2)'
                        }}>
                    {data.status}
                  </span>
                )}
              </div>
              {data.explanation && (
                <p className="text-[9px] text-[#5C6650] font-semibold leading-normal">{data.explanation}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceConsensusCard({ metrics, t }) {
  if (!metrics) return null;
  const { supportCount = 0, contradictCount = 0, neutralCount = 0, unknownCount = 0 } = metrics;
  const total = supportCount + contradictCount + neutralCount + unknownCount;
  if (total === 0) return null;

  const pctSupport = (supportCount / total) * 100;
  const pctContradict = (contradictCount / total) * 100;
  const pctNeutral = (neutralCount / total) * 100;
  const pctUnknown = (unknownCount / total) * 100;

  let level = t('extension.consensusLevels.Weak', 'Weak');
  if (supportCount >= 4 && contradictCount === 0) level = t('extension.consensusLevels.Strong', 'Strong');
  else if (supportCount >= 2 && contradictCount === 0) level = t('extension.consensusLevels.Moderate', 'Moderate');
  else if (supportCount > 0 && contradictCount > 0) level = t('extension.consensusLevels.Mixed', 'Mixed');
  else if (total === 0) level = t('extension.consensusLevels.None', 'None');

  return (
    <div className="rounded-xl p-3.5 border border-[#C3CC9B] bg-[#E4DFB5]/40 text-left space-y-3 shadow-sm">
      <p className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider">
        {t('extension.evidenceConsensus', 'Evidence Consensus')}
      </p>
      
      <div className="space-y-1">
        <p className="text-xs text-[#232B1B] font-black">
          {total} {t('extension.sourcesAnalyzed', 'sources analyzed')}
        </p>
        <p className="text-[10px] text-[#5C6650] font-semibold leading-relaxed">
          {supportCount} {t('extension.support', 'support')}, {contradictCount} {t('extension.contradict', 'contradict')}, {neutralCount + unknownCount} {t('extension.mention', 'mention')}.
        </p>
        <p className="text-[10px] text-[#5C6650] font-bold">
          {t('extension.overallConsensus', 'Overall consensus')}: <span className="text-[#768E56] font-black">{level}</span>
        </p>
      </div>

      <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-[#C3CC9B]/30 border border-[#C3CC9B]/40">
        {supportCount > 0 && (
          <div style={{ width: `${pctSupport}%`, backgroundColor: '#2E7D32' }} title={`Supports: ${supportCount}`} />
        )}
        {neutralCount > 0 && (
          <div style={{ width: `${pctNeutral}%`, backgroundColor: '#5C6650' }} title={`Neutral: ${neutralCount}`} />
        )}
        {contradictCount > 0 && (
          <div style={{ width: `${pctContradict}%`, backgroundColor: '#C62828' }} title={`Contradicts: ${contradictCount}`} />
        )}
        {unknownCount > 0 && (
          <div style={{ width: `${pctUnknown}%`, backgroundColor: '#8E9A7B' }} title={`Unknown: ${unknownCount}`} />
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-0.5 text-[9px] font-bold text-[#5C6650]">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#2E7D32' }} />
          <span>{t('extension.supporting', 'Supports')} ({supportCount})</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#C62828' }} />
          <span>{t('extension.contradicting', 'Contradicts')} ({contradictCount})</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#5C6650' }} />
          <span>{t('extension.neutral', 'Neutral')} ({neutralCount + unknownCount})</span>
        </div>
      </div>
    </div>
  );
}

function SourceCard({ src, index, t }) {
  const handleCardClick = (e) => {
    if (src.url) {
      window.open(src.url, '_blank');
    } else {
      e.preventDefault();
    }
  };

  const STANCE_CONFIG = {
    Supports: { label: t('extension.supporting', 'Supports'), color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.1)', border: 'rgba(46, 125, 50, 0.2)' },
    Contradicts: { label: t('extension.contradicting', 'Contradicts'), color: '#C62828', bg: 'rgba(198, 40, 40, 0.1)', border: 'rgba(198, 40, 40, 0.2)' },
    Mentions: { label: t('extension.neutral', 'Neutral'), color: '#5C6650', bg: 'rgba(92, 102, 80, 0.1)', border: 'rgba(92, 102, 80, 0.2)' },
    Neutral: { label: t('extension.neutral', 'Neutral'), color: '#5C6650', bg: 'rgba(92, 102, 80, 0.1)', border: 'rgba(92, 102, 80, 0.2)' },
    Opinion: { label: t('extension.opinion', 'Opinion'), color: '#4A148C', bg: 'rgba(74, 20, 140, 0.1)', border: 'rgba(74, 20, 140, 0.2)' },
    Unknown: { label: t('extension.neutral', 'Neutral'), color: '#5C6650', bg: 'rgba(92, 102, 80, 0.1)', border: 'rgba(92, 102, 80, 0.2)' }
  };

  const stanceCfg = STANCE_CONFIG[src.stance] || STANCE_CONFIG.Neutral;

  const TRUST_CONFIG = {
    'Highly Trusted': { color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.05)' },
    'Trusted': { color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.05)' },
    'Moderate': { color: '#D87D0A', bg: 'rgba(216, 125, 10, 0.05)' },
    'Low': { color: '#C62828', bg: 'rgba(198, 40, 40, 0.05)' }
  };

  const trustCfg = TRUST_CONFIG[src.trustLevel] || TRUST_CONFIG.Moderate;

  let displayDate = '';
  if (src.publishedAt) {
    try {
      displayDate = new Date(src.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (err) {
      displayDate = src.publishedAt;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index }}
      onClick={handleCardClick}
      className="group bg-[#FBE8CE] hover:bg-[#FBE8CE]/70 border border-[#C3CC9B] hover:border-[#768E56] rounded-xl p-3.5 transition-all duration-200 cursor-pointer text-left space-y-2.5 shadow-sm relative overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#E4DFB5] border border-[#C3CC9B] flex items-center justify-center text-[10px] font-black text-[#768E56]">
            {src.publisher.charAt(0).toUpperCase()}
          </div>
          <span className="text-[10px] font-black text-[#232B1B]">{src.publisher}</span>
        </div>
        
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 border"
                style={{ background: stanceCfg.bg, color: stanceCfg.color, borderColor: stanceCfg.border }}>
            {stanceCfg.label}
          </span>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: trustCfg.bg, color: trustCfg.color, border: `1px solid ${trustCfg.color}25` }}>
            {src.trustLevel}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <h4 className="text-xs font-bold text-[#232B1B] leading-snug group-hover:text-[#768E56] transition-colors line-clamp-2">
          {src.title || t('results.untitledArticle', 'Untitled article')}
        </h4>
        {src.summary && (
          <p className="text-[9px] text-[#5C6650] leading-relaxed font-semibold line-clamp-2 italic">
            "{src.summary}"
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-[#C3CC9B]/35">
        <span className="text-[8px] font-bold text-[#5C6650]/75">{displayDate}</span>
        <span className="text-[9px] text-[#768E56] group-hover:text-[#5C6650] transition-colors font-extrabold flex items-center gap-0.5">
          {t('extension.openSource', 'Open Source')}
          <ExternalLink size={10} strokeWidth={2.5} />
        </span>
      </div>
    </motion.div>
  );
}

// ─── Sub-Views ──────────────────────────────────────────────────────────────

function LoadingView({ text, onBack, mainClaim, t }) {
  const _t = t || _tEN;
  const [currentStep, setCurrentStep] = useState(0);
  const [barWidths, setBarWidths] = useState({});

  const STEP_KEYS = ['extracting', 'searching', 'factChecking', 'analyzing', 'generating'];

  useEffect(() => {
    // Increase step over time to simulate progress
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= STEP_KEYS.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const widths = {};
    STEP_KEYS.forEach((_, i) => {
      if (i < currentStep) widths[i] = 100;
      else if (i === currentStep) widths[i] = 60 + Math.random() * 30;
      else widths[i] = 0;
    });
    setBarWidths(widths);
  }, [currentStep]);

  const isComplete = currentStep >= STEP_KEYS.length;

  return (
    <div className="flex flex-col flex-grow h-full max-h-[500px]">
      <div className="flex items-center justify-between px-5 pt-3.5 pb-2.5 border-b border-[#C3CC9B] bg-[#FBE8CE]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-[#5C6650] hover:text-[#232B1B] transition-colors font-bold"
        >
          <ArrowLeft size={13} />
          {_t('extension.back')}
        </button>
        <span className="text-[10px] font-bold text-[#5C6650]/60 flex items-center gap-1">
          <Loader2 size={11} className="text-[#768E56] animate-spin" />
          {_t('extension.analyzing', 'Analyzing...')}
        </span>
      </div>

      <div className="flex flex-col flex-grow px-5 py-6 gap-5 animate-fade-in-up overflow-y-auto">
        <div className="text-center">
          <h2 className="text-[15px] font-extrabold mb-1 text-[#232B1B]">
            {isComplete ? _t('extension.loadingComplete', 'Analysis Complete') : _t('extension.loadingTitle', 'Scanning with SatyaScan...')}
          </h2>
          <p className="text-[#5C6650] text-[10px]">
            {_t('extension.waitVerify')}
          </p>
        </div>

        <div className="space-y-4 w-full px-2">
          {STEP_KEYS.map((key, i) => {
            const done = i < currentStep;
            const active = i === currentStep && !isComplete;

            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-all duration-500
                      ${done
                        ? 'bg-[#9AB17A]/20 border-[#9AB17A]'
                        : active
                        ? 'bg-[#9AB17A]/10 border-[#9AB17A]/60'
                        : 'bg-[#E4DFB5] border-[#C3CC9B]'}`}>
                      {done ? (
                        <span className="text-[#768E56] text-[9px] font-bold">✓</span>
                      ) : active ? (
                        <motion.span
                          className="w-1.5 h-1.5 rounded-full bg-[#9AB17A]"
                          animate={{ scale: [1, 1.4, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        />
                      ) : (
                        <span className="w-1 h-1 rounded-full bg-[#C3CC9B]" />
                      )}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest
                      ${done ? 'text-[#232B1B]' : active ? 'text-[#232B1B]' : 'text-[#5C6650]/40'}`}>
                      {_t(`extension.loadingSteps.${key}`)}
                    </span>
                  </div>
                  <span className={`text-[9px] font-semibold uppercase tracking-wider
                    ${done ? 'text-[#768E56]' : active ? 'text-[#768E56] font-bold' : 'text-[#5C6650]/40'}`}>
                    {done ? _t('extension.statusComplete', 'Complete') : active ? _t('extension.statusRunning', 'Running') : _t('extension.statusPending', 'Pending')}
                  </span>
                </div>

                <div className="ml-7 mt-0.5">
                  <div className="h-[2px] bg-[#C3CC9B]/60 rounded-full overflow-hidden w-full">
                    <motion.div
                      className="h-[2px] rounded-full"
                      style={{
                        background: done
                          ? 'linear-gradient(90deg, #9AB17A, #768E56)'
                          : 'linear-gradient(90deg, #9AB17A, #5C6650)',
                      }}
                      initial={{ width: '0%' }}
                      animate={{ width: done ? '100%' : active ? `${barWidths[i] || 60}%` : '0%' }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {mainClaim && (
          <div className="w-full rounded-xl px-4 py-3 mt-1 bg-[#E4DFB5] border border-[#C3CC9B] text-left animate-fade-in-up">
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1 text-[#5C6650]">
              {_t('extension.mainClaimDetected')}
            </p>
            <p className="text-[11px] leading-snug text-[#232B1B] font-bold">"{mainClaim}"</p>
          </div>
        )}
      </div>
    </div>
  );
}



function ErrorView({ errorType, message, evidenceCollected, onBack, onRetry, t }) {
  const _t = t || _tEN;
  // Infer errorType from message if not explicitly provided
  let activeType = errorType;
  if (!activeType && message) {
    const lower = message.toLowerCase();
    if (lower.includes('quota') || lower.includes('429') || lower.includes('limit')) {
      activeType = 'quota';
    } else if (lower.includes('timeout') || lower.includes('timed out')) {
      activeType = 'timeout';
    } else if (lower.includes('reach') || lower.includes('failed to fetch') || lower.includes('connection') || lower.includes('network')) {
      activeType = 'network';
    } else if (lower.includes('offline') || lower.includes('backend') || lower.includes('connect')) {
      activeType = 'backend';
    } else if (lower.includes('no evidence') || lower.includes('evidence could not be retrieved') || lower.includes('no_evidence')) {
      activeType = 'no_evidence';
    }
  }
  if (!activeType) activeType = 'default';

  const isExtractionError = message && message.includes('Unable to extract page content');

  const configs = {
    quota:      { Icon: TriangleAlert, iconColor: '#C62828', bgLight: 'rgba(198,40,40,0.06)',  borderCol: 'rgba(198,40,40,0.15)',  title: _t('extension.errorTitles.quota'),            description: _t('extension.errorDescs.quota'),            subtext: _t('extension.errorSubtext.quota') },
    timeout:    { Icon: Clock,         iconColor: '#D87D0A', bgLight: 'rgba(216,125,10,0.06)', borderCol: 'rgba(216,125,10,0.15)', title: _t('extension.errorTitles.timeout'),          description: _t('extension.errorDescs.timeout'),          subtext: _t('extension.errorSubtext.timeout') },
    backend:    { Icon: Globe,         iconColor: '#C62828', bgLight: 'rgba(198,40,40,0.06)',  borderCol: 'rgba(198,40,40,0.15)',  title: _t('extension.errorTitles.backend'),          description: _t('extension.errorDescs.backend'),          subtext: _t('extension.errorSubtext.backend') },
    network:    { Icon: Globe,         iconColor: '#C62828', bgLight: 'rgba(198,40,40,0.06)',  borderCol: 'rgba(198,40,40,0.15)',  title: _t('extension.errorTitles.network'),          description: _t('extension.errorDescs.network'),          subtext: _t('extension.errorSubtext.network') },
    no_evidence:{ Icon: Inbox,         iconColor: '#5C6650', bgLight: 'rgba(92,102,80,0.06)',  borderCol: 'rgba(92,102,80,0.15)',  title: _t('extension.errorTitles.noEvidence'),       description: _t('extension.errorDescs.noEvidence'),       subtext: _t('extension.errorSubtext.noEvidence') },
    default:    { Icon: TriangleAlert, iconColor: '#C62828', bgLight: 'rgba(198,40,40,0.08)',  borderCol: 'rgba(198,40,40,0.2)',
      title: isExtractionError ? _t('extension.errorTitles.extractionBlocked') : _t('extension.errorTitles.analysisFailed'),
      description: isExtractionError ? _t('extension.errorDescs.extractionBlocked') : (message || _t('extension.errorDescs.default')),
      subtext: isExtractionError ? _t('extension.errorSubtext.extractionBlocked') : _t('extension.errorSubtext.default'),
    },
  };

  const current = configs[activeType] || configs.default;
  const ScreenIcon = current.Icon;

  return (
    <div className="flex flex-col flex-grow h-full max-h-[500px]">
      <div className="flex items-center justify-between px-5 pt-3.5 pb-2.5 border-b border-[#C3CC9B] bg-[#FBE8CE]">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#5C6650] hover:text-[#232B1B] transition-colors font-bold">
          <ArrowLeft size={13} />
          {_t('extension.back')}
        </button>
        <span className="text-[10px] font-bold text-[#C62828]/70 flex items-center gap-1">
          <TriangleAlert size={10} color="#C62828" />
          {_t('extension.failed')}
        </span>
      </div>

      <div className="flex flex-col items-center justify-center flex-grow px-6 py-8 gap-5 animate-fade-in-up">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm"
          style={{ background: current.bgLight, border: `1px solid ${current.borderCol}` }}>
          <ScreenIcon size={30} style={{ color: current.iconColor }} />
        </div>
        <div className="text-center space-y-2 max-w-[280px]">
          <h2 className="text-sm font-black text-[#232B1B]" style={{ lineHeight: '1.25' }}>{current.title}</h2>
          <p className="text-xs text-[#5C6650] leading-relaxed font-semibold">{current.description}</p>
          {current.subtext && (
            <p className="text-[10px] font-extrabold text-[#C62828]/80 uppercase tracking-wide pt-1">{current.subtext}</p>
          )}
        </div>
        <div className="flex items-center gap-3 mt-3 w-full justify-center">
          <button type="button" onClick={onBack} className="btn-secondary px-5 py-2.5 text-xs font-black rounded-xl border border-[#C3CC9B] hover:border-[#768E56]" style={{ fontSize: '11px', minWidth: '100px' }}>
            {_t('extension.back')}
          </button>
          <button type="button" onClick={onRetry} className="btn-primary px-5 py-2.5 text-xs font-black rounded-xl text-[#FBE8CE]" style={{ fontSize: '11px', minWidth: '100px' }}>
            {_t('extension.retry')}
          </button>
        </div>
      </div>
    </div>
  );
}
function ResultView({ result, onBack, t }) {
  const _t = t || _tEN;
  const [claimExpanded, setClaimExpanded] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const {
    inputType, trustScore, aiReasoning,
    claims = [], checkId, verifiedAt, originalText,
    keyFindings = [],
    verifiedFacts = [],
    finalAssessment,
    timeline,
    supportingCount, contradictingCount, neutralCount,
    trustScoreBreakdown,
    reasoning, confidenceBreakdown, sourceConsensus, evidenceMetrics
  } = result;

  const displayScore = Math.round(trustScore ?? 50);
  const pageVerdict = result.pageVerdict || result.verdict;
  const rawVerdict = pageVerdict || (displayScore >= 70 ? 'Supported' : displayScore >= 40 ? 'Misleading' : 'Contradicted');
  
  const cfg = getVerdict(rawVerdict, _t);
  const VerdictIcon = cfg.Icon;

  // Fallback summary bullets (for backwards-compat when keyFindings absent)
  const reasoningBullets = splitReasoning(aiReasoning || result.explanation);
  const firstSummary = result._summary || reasoningBullets[0] || cfg.microcopy;

  // Extracted unique sources (Phase 6 Consensus mapping)
  const uniqueSources = sourceConsensus && sourceConsensus.length > 0
    ? sourceConsensus
    : claims.flatMap(c => c.sources || []).reduce((acc, s) => {
        const key = s.url || s.title || '';
        if (key && !acc.seen.has(key)) {
          acc.seen.add(key);
          const pub = publisherReliability(s, _t);
          const isSupporting = claims.some(c => c.verdict === 'Supported' && c.sources?.some(src => src.url === s.url));
          const isContradicting = claims.some(c => c.verdict === 'Contradicted' && c.sources?.some(src => src.url === s.url));
          const stance = isSupporting ? 'Supports' : isContradicting ? 'Contradicts' : 'Mentions';
          
          acc.list.push({
            publisher: s.source || getDomain(s.url) || _t('results.trusted', 'Trusted Source'),
            title: s.title || _t('results.untitledArticle', 'Untitled article'),
            url: s.url,
            publishedAt: s.publishedAt || s.date || null,
            trustLevel: pub.label,
            stance,
            credibilityScore: s.score || 50,
            summary: s.snippet || ''
          });
        }
        return acc;
      }, { seen: new Set(), list: [] }).list.slice(0, 8);

  const allTrustedCount = uniqueSources.filter(s => {
    const tier = s.trustLevel === _t('publisherTrust.highlyTrusted') || s.trustLevel === 'Highly Trusted' ? 1 :
                 s.trustLevel === _t('publisherTrust.trusted') || s.trustLevel === 'Trusted' ? 2 : 3;
    return tier <= 2;
  }).length;
  const totalSourceCount = uniqueSources.length;
  const claimText = originalText || result.text || '';

  // Copy result action
  const handleCopy = () => {
    const textToCopy = `${_t('common.satyascan', 'SatyaScan')} ${_t('results.factCheckReport', 'Verification Result')}:\n${_t('extension.overallVerdict', 'Verdict')}: ${cfg.label} (${displayScore}% ${_t('extension.reliability', 'Reliability')})\n${_t('results.verificationSummary', 'Summary')}: ${firstSummary}\n${_t('extension.verifiedOn', 'Verified on SatyaScan')}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  // View full analysis redirect
  const handleViewFullAnalysis = () => {
    if (checkId) {
      window.open(`${WEBSITE_URL}/report/${checkId}`, '_blank');
    } else {
      window.open(`${WEBSITE_URL}/analyze?text=${encodeURIComponent(claimText)}`, '_blank');
    }
  };

  // Share result action
  const handleShare = () => {
    const shareUrl = checkId
      ? `${WEBSITE_URL}/report/${checkId}`
      : `${WEBSITE_URL}/analyze?text=${encodeURIComponent(claimText)}`;
    
    if (navigator.share) {
      navigator.share({
        title: `${_t('common.satyascan', 'SatyaScan')} ${_t('results.factCheckReport', 'Verdict Report')}`,
        text: `${_t('results.whyWeReachedDesc', 'AI verification report')}: ${cfg.label}`,
        url: shareUrl
      }).catch(err => console.log('Share aborted:', err));
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert(_t('share.copied', 'Shareable report URL copied to clipboard!'));
      });
    }
  };

  return (
    <div className="flex flex-col flex-grow h-full max-h-[500px]">
      
      {/* View Header with back button */}
      <div className="flex items-center justify-between px-5 pt-3.5 pb-2.5 border-b border-[#C3CC9B] bg-[#FBE8CE]">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#5C6650] hover:text-[#232B1B] transition-colors font-bold">
          <ArrowLeft size={13} />
          {_t('extension.back')}
        </button>
        <span className="text-[10px] font-bold text-[#5C6650]/60 flex items-center gap-1">
          <ShieldCheck size={11} style={{ color: '#768E56' }} />
          {_t('extension.officialMiniReport')}
        </span>
      </div>

      {/* Main content area (Scrollable) */}
      <div className="flex-grow overflow-y-auto px-5 py-4 space-y-3.5 scroll-container">
        
        {/* ── 1. SUBMITTED CLAIM ────────────────────────────────────────────── */}
        <div className="rounded-xl p-3.5 bg-[#E4DFB5] border border-[#C3CC9B] text-left">
          <p className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider mb-1.5">{_t('extension.theClaim', 'The Claim')}</p>
          <p className={`text-xs text-[#232B1B] leading-relaxed font-semibold ${!claimExpanded ? 'line-clamp-3' : ''}`}>
            "{claimText}"
          </p>
          {claimText.length > 140 && (
            <button
              onClick={() => setClaimExpanded(e => !e)}
              className="flex items-center gap-1 mt-2 text-[10px] font-bold text-[#768E56] hover:text-[#5C6650]"
            >
              {claimExpanded ? <>{_t('extension.readLess')} <ChevronUp size={11} /></> : <>{_t('extension.readMore')} <ChevronDown size={11} /></>}
            </button>
          )}
        </div>

        {/* ── 2. FACT CHECK VERDICT ────────────────────────────────────────── */}
        <div className="rounded-xl p-4 bg-[#E4DFB5] border border-[#C3CC9B] text-left" style={{ borderColor: cfg.border }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-grow min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-[#5C6650] mb-2">{_t('extension.overallVerdict')}</p>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg shrink-0" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <VerdictIcon size={16} style={{ color: cfg.color }} strokeWidth={2.5} />
                </div>
                <span className="text-xs font-black px-2.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-xs text-[#5C6650] leading-normal font-semibold">
                {cfg.microcopy}
              </p>
            </div>
            <ReliabilityRing score={displayScore} />
          </div>
        </div>

        {/* ── 2.5 EVIDENCE CONSENSUS BAR ────────────────────────────────────── */}
        {(() => {
          const calculatedMetrics = evidenceMetrics || {
            supportCount: uniqueSources.filter(s => s.stance === 'Supports').length,
            contradictCount: uniqueSources.filter(s => s.stance === 'Contradicts').length,
            neutralCount: uniqueSources.filter(s => ['Mentions', 'Neutral', 'Opinion'].includes(s.stance)).length,
            unknownCount: uniqueSources.filter(s => !['Supports', 'Contradicts', 'Mentions', 'Neutral', 'Opinion'].includes(s.stance)).length
          };
          return <EvidenceConsensusCard metrics={calculatedMetrics} t={_t} />;
        })()}

        {/* ── 3. VERIFICATION SUMMARY ──────────────────────────────────────── */}
        {firstSummary && (
          <div className="rounded-xl p-3.5 bg-[#E4DFB5] border border-[#C3CC9B] text-left">
            <p className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider mb-1.5">{_t('results.verificationSummary', 'Verification Summary')}</p>
            <p className="text-xs text-[#232B1B] leading-relaxed font-semibold">
              {firstSummary}
            </p>
          </div>
        )}

        {/* ── 4. WHY WE REACHED THIS CONCLUSION ────────────────────────────── */}
        {reasoning && typeof reasoning === 'object' && Object.keys(reasoning).length > 0 ? (
          <ReasoningCard reasoning={reasoning} t={_t} />
        ) : reasoningBullets.length > 0 && (
          <div className="rounded-xl p-3.5 bg-[#E4DFB5] border border-[#C3CC9B] text-left space-y-2 shadow-sm">
            <h3 className="text-xs font-bold text-[#232B1B] flex items-center gap-1.5">
              <Brain size={13} className="text-[#768E56]" />
              {_t('extension.whyThisConclusion', 'Why this conclusion?')}
            </h3>
            <div className="space-y-1.5">
              {reasoningBullets.map((bullet, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-[#232B1B] leading-relaxed font-semibold">
                  <span className="shrink-0 text-[#2E7D32] font-black">✓</span>
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 4.5. KEY FINDINGS ─────────────────────────────────────────────── */}
        {keyFindings && keyFindings.length > 0 && (
          <KeyFindingsCard keyFindings={keyFindings} t={_t} />
        )}

        {/* ── 4.6. VERIFIED FACTS ───────────────────────────────────────────── */}
        {verifiedFacts && verifiedFacts.length > 0 && (
          <div className="rounded-xl p-4 bg-[#E4DFB5] border border-[#C3CC9B] text-left space-y-2.5 shadow-sm">
            <h3 className="text-xs font-bold text-[#232B1B] flex items-center gap-1.5">
              <CircleCheckBig size={13} className="text-[#2E7D32]" />
              {_t('extension.verifiedFacts', 'Verified Facts')}
            </h3>
            <ul className="space-y-2">
              {verifiedFacts.map((fact, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[#232B1B] leading-relaxed font-semibold">
                  <span className="shrink-0 font-black text-sm leading-none mt-px text-[#2E7D32]">✓</span>
                  <span>{typeof fact === 'string' ? fact : fact.text || fact}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── 5. RELIABILITY BREAKDOWN ─────────────────────────────────────── */}
        {confidenceBreakdown && typeof confidenceBreakdown === 'object' && Object.keys(confidenceBreakdown).length > 0 ? (
          <ConfidenceBreakdown breakdown={confidenceBreakdown} t={_t} />
        ) : (
          <TrustCard
            score={displayScore}
            verdict={rawVerdict}
            trustedCount={allTrustedCount}
            totalSources={totalSourceCount}
            breakdown={trustScoreBreakdown}
            t={_t}
          />
        )}

        {/* ── 6. TRUSTED SOURCES ────────────────────────────────────────────── */}
        {uniqueSources.length > 0 && (
          <div className="space-y-2 text-left">
            <h3 className="text-xs font-bold text-[#232B1B] flex items-center gap-1.5">
              <Globe size={13} className="text-[#768E56]" />
              {_t('extension.sourceConsensus', 'Source Consensus')}
            </h3>
            <div className="grid grid-cols-1 gap-2.5">
              {uniqueSources.slice(0, 3).map((src, i) => (
                <SourceCard key={i} src={src} index={i} t={_t} />
              ))}
            </div>
            {uniqueSources.length > 3 && (
              <button
                onClick={handleViewFullAnalysis}
                className="w-full text-center py-2.5 text-xs font-black text-[#768E56] hover:text-[#5C6650] bg-[#E4DFB5] hover:bg-[#C3CC9B]/30 rounded-xl border border-[#C3CC9B] transition-colors cursor-pointer"
              >
                +{uniqueSources.length - 3} {_t('extension.moreSources', 'more sources')}
              </button>
            )}
          </div>
        )}

        {/* ── 7. CLAIMS ANALYZED ────────────────────────────────────────────── */}
        {claims && claims.length > 0 && (
          <ClaimAccordion claims={claims} t={_t} />
        )}

        {/* ── 8. FINAL ASSESSMENT / CONCLUSION ─────────────────────────────── */}
        {finalAssessment && (
          <div className="rounded-xl p-4 bg-[#E4DFB5] border border-[#C3CC9B] text-left shadow-sm">
            <h3 className="text-xs font-bold text-[#232B1B] flex items-center gap-1.5 mb-2">
              <Award size={13} className="text-[#768E56]" />
              {_t('extension.finalAssessment', 'Final Assessment')}
            </h3>
            <p className="text-xs text-[#232B1B] leading-relaxed font-semibold">{finalAssessment}</p>
          </div>
        )}

        {/* ── 9. TIMELINE ───────────────────────────────────────────────────── */}
        {timeline && typeof timeline === 'object' && Object.values(timeline).some(v => v) && (
          <div className="rounded-xl p-4 bg-[#E4DFB5] border border-[#C3CC9B] text-left shadow-sm">
            <h3 className="text-xs font-bold text-[#232B1B] flex items-center gap-1.5 mb-2.5">
              <Clock size={13} className="text-[#768E56]" />
              {_t('extension.timeline', 'Timeline')}
            </h3>
            <div className="space-y-2">
              {timeline.claimPublished && (
                <div className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#768E56] shrink-0 mt-1.5" />
                  <div>
                    <p className="text-[9px] font-black text-[#5C6650] uppercase tracking-wider">{_t('extension.claimPublished', 'Claim Published')}</p>
                    <p className="text-xs font-semibold text-[#232B1B]">{timeline.claimPublished}</p>
                  </div>
                </div>
              )}
              {timeline.majorCoverage && (
                <div className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#D87D0A] shrink-0 mt-1.5" />
                  <div>
                    <p className="text-[9px] font-black text-[#5C6650] uppercase tracking-wider">{_t('extension.majorCoverage', 'Major Coverage')}</p>
                    <p className="text-xs font-semibold text-[#232B1B]">{timeline.majorCoverage}</p>
                  </div>
                </div>
              )}
              {timeline.officialConfirmation && (
                <div className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#2E7D32] shrink-0 mt-1.5" />
                  <div>
                    <p className="text-[9px] font-black text-[#5C6650] uppercase tracking-wider">{_t('extension.officialConfirmationLabel', 'Official Confirmation')}</p>
                    <p className="text-xs font-semibold text-[#232B1B]">{timeline.officialConfirmation}</p>
                  </div>
                </div>
              )}
              {timeline.verificationCompleted && (
                <div className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#5C6650] shrink-0 mt-1.5" />
                  <div>
                    <p className="text-[9px] font-black text-[#5C6650] uppercase tracking-wider">{_t('extension.verificationCompleted', 'Verification Completed')}</p>
                    <p className="text-xs font-semibold text-[#232B1B]">{new Date(timeline.verificationCompleted).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timestamp */}
        {verifiedAt && (
          <p className="text-center text-[9px] font-bold text-[#5C6650]/55 pt-1">
            {_t('extension.verifiedOn')} {new Date(verifiedAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Sticky footer action panel */}
      <div className="border-t border-[#C3CC9B] bg-[#E4DFB5] px-4 py-3 flex items-center gap-2">
        <button
          onClick={handleViewFullAnalysis}
          className="flex-grow btn-primary flex items-center justify-center gap-1.5 py-2.5 text-xs font-black text-[#FBE8CE]"
        >
          <Search size={14} />
          {_t('extension.viewFullAnalysis')}
        </button>

        <button
          onClick={handleCopy}
          className="btn-secondary w-10 h-10 flex items-center justify-center rounded-xl border border-[#C3CC9B]"
          title="Copy Summary"
        >
          {copySuccess ? <Check size={14} className="text-[#2E7D32]" /> : <Copy size={14} />}
        </button>

        <button
          onClick={handleShare}
          className="btn-secondary w-10 h-10 flex items-center justify-center rounded-xl border border-[#C3CC9B]"
          title="Share Report"
        >
          <Share2 size={14} />
        </button>
      </div>

    </div>
  );
}




// ─── Main Popup Component ───────────────────────────────────────────────────

export default function Popup({ uiLang, onToggleLang, token, user, onLogout, onSignIn }) {
  const [view, setView]         = useState('home');
  const [result, setResult]     = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingText, setLoadingText] = useState('');
  const [history, setHistory]   = useState([]);
  const [lastInputType, setLastInputType] = useState('text');
  const [mainClaim, setMainClaim] = useState(null);
  const activeRequestIdRef = useRef(null);

  const [syncEnabled, setSyncEnabled] = useState(true);
  const [showMergePrompt, setShowMergePrompt] = useState(false);
  const [merging, setMerging] = useState(false);
  
  // Direct text input state
  const [pasteText, setPasteText] = useState('');

  const t = createT(uiLang);

  // ── Direct Scan Handler ─────────────────────────────────────────────────
  const handleDirectScan = async () => {
    const textToScan = pasteText.trim();
    if (!textToScan) return;
    
    if (textToScan.length < 10) {
      setErrorMsg('Text is too short. Please provide at least a sentence.');
      setView('error');
      return;
    }

    const requestId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    activeRequestIdRef.current = requestId;
    
    // Set loading state
    setLoadingText(textToScan);
    setLastInputType('text');
    setMainClaim(null);
    setView('loading');
    
    // Save loading state to storage (in case popup closes)
    chrome.storage.local.set({
      [STORAGE_KEY_RESULT]: { status: 'loading', text: textToScan, requestId, inputType: 'text', savedAt: new Date().toISOString() }
    });

    try {
      const responseLanguage = uiLang || 'en';
      const result = await verifySelectedText(textToScan, responseLanguage, token);
      
      if (activeRequestIdRef.current !== requestId) return; // Cancelled
      
      chrome.storage.local.set({
        [STORAGE_KEY_RESULT]: { status: 'done', result, requestId, savedAt: new Date().toISOString() }
      });
      
      setResult(result);
      setView('result');
      saveToHistory(result);
      setPasteText(''); // Clear input on success
    } catch (err) {
      if (activeRequestIdRef.current !== requestId) return; // Cancelled
      
      const message = err?.message || 'Something went wrong. Please try again.';
      chrome.storage.local.set({
        [STORAGE_KEY_RESULT]: { status: 'error', message, requestId, savedAt: new Date().toISOString() }
      });
      
      setErrorMsg(message);
      setView('error');
    }
  };

  // ── Sync history setting ──────────────────────────────────────────────────
  useEffect(() => {
    chrome.storage.local.get('satyascan_history_sync', (data) => {
      if (data.satyascan_history_sync !== undefined) {
        setSyncEnabled(data.satyascan_history_sync);
      }
    });
  }, []);

  const handleToggleSync = (val) => {
    setSyncEnabled(val);
    chrome.storage.local.set({ satyascan_history_sync: val });
  };

  // ── Retrieve scan history ────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      if (token && syncEnabled) {
        console.log('[Popup] Loading synced history from backend');
        const res = await fetch(`${API_URL}/api/history?page=1`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          // Filter local storage to find any guest checks (unsynced)
          chrome.storage.local.get('satyascan_history', (localData) => {
            const localHist = localData.satyascan_history || [];
            const unsynced = localHist.filter(item => !item.checkId);
            
            // Merge local unsynced checks at the top of backend checks
            const backendHist = (data.checks || []).map(check => {
              const displayScore = Math.round(check.trustScore ?? 50);
              const verdict = check.pageVerdict || check.verdict || (displayScore >= 70 ? 'Supported' : displayScore >= 40 ? 'Misleading' : 'Contradicted');
              return {
                checkId: check._id,
                claim: check.originalText || '',
                verdict,
                confidence: displayScore,
                verifiedAt: check.createdAt,
                sources: check.claims?.flatMap(c => c.sources || []) || [],
                inputType: check.inputType || 'text'
              };
            });

            const combined = [...unsynced, ...backendHist].slice(0, 20);
            setHistory(combined);
            
            // Check if we should prompt the user to merge
            if (unsynced.length > 0) {
              setShowMergePrompt(prev => {
                if (!prev) return true;
                return prev;
              });
            }
          });
          return;
        }
      }

      // Guest or sync disabled: load from local storage
      console.log('[Popup] Loading local history from storage');
      chrome.storage.local.get('satyascan_history', (data) => {
        setHistory(data.satyascan_history || []);
      });
    } catch (err) {
      console.error('Failed to load history:', err);
      // Fallback to local storage on network error
      chrome.storage.local.get('satyascan_history', (data) => {
        setHistory(data.satyascan_history || []);
      });
    }
  }, [token, syncEnabled]);

  // ── Merge History Handlers ───────────────────────────────────────────────
  const handleMergeHistory = async () => {
    setMerging(true);
    try {
      const unsynced = history.filter(item => !item.checkId);
      if (unsynced.length > 0) {
        const res = await fetch(`${API_URL}/api/history/merge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify({ history: unsynced })
        });
        
        if (res.ok) {
          console.log('[Popup] History merged successfully on backend');
        }
      }
      
      // Mark all local guest items as synced in storage
      chrome.storage.local.get('satyascan_history', (data) => {
        const localHist = data.satyascan_history || [];
        const updated = localHist.map(item => ({ ...item, checkId: item.checkId || 'synced' }));
        chrome.storage.local.set({ satyascan_history: updated });
      });

      setShowMergePrompt(false);
      loadHistory();
    } catch (err) {
      console.error('[Popup] Failed to merge history:', err);
    } finally {
      setMerging(false);
    }
  };

  const handleSkipMerge = () => {
    chrome.storage.local.get('satyascan_history', (data) => {
      const localHist = data.satyascan_history || [];
      const updated = localHist.map(item => ({ ...item, checkId: item.checkId || 'skipped' }));
      chrome.storage.local.set({ satyascan_history: updated });
    });
    setShowMergePrompt(false);
    loadHistory();
  };

  // ── Save a successful verification item ─────────────────────────────────
  const saveToHistory = useCallback(async (res) => {
    if (!res || res.success === false) return;
    try {
      chrome.storage.local.get('satyascan_history', (data) => {
        const currentHist = data.satyascan_history || [];
        const text = res.articleTitle || res.originalText || res.text || '';
        const displayScore = Math.round(res.trustScore ?? 50);
        const verdict = res.pageVerdict || res.verdict || (displayScore >= 70 ? 'Supported' : displayScore >= 40 ? 'Misleading' : 'Contradicted');
        const confidence = displayScore;
        const checkId = res.checkId || '';
        const verifiedAt = res.verifiedAt || new Date().toISOString();
        const sources = res.claims?.flatMap(c => c.sources || []) || [];
        const inputType = res.inputType || 'text';

        // Deduplicate
        if (currentHist.some(item => (item.checkId && item.checkId === checkId) || (item.claim === text && text))) {
          return;
        }

        const newItem = {
          checkId,
          claim: text,
          verdict,
          confidence,
          verifiedAt,
          sources,
          inputType
        };

        const updated = [newItem, ...currentHist].slice(0, 20);
        chrome.storage.local.set({ satyascan_history: updated }, () => {
          setHistory(updated);
          if (token && syncEnabled) {
            loadHistory();
          }
        });
      });
    } catch (err) {
      console.error('[Popup] Failed to save scan result to history:', err);
      if (err.stack) {
        console.error('[Popup] Stack trace:', err.stack);
      }
    }
  }, [token, syncEnabled, loadHistory]);

  // ── Clear local scan history ────────────────────────────────────────────
  const clearHistory = useCallback(async () => {
    chrome.storage.local.set({ satyascan_history: [] }, () => {
      setHistory([]);
    });
  }, []);

  // ── On mount: load history and hydrated states ──────────────────────────
  useEffect(() => {
    console.log('[Popup] Mount - loading history');
    loadHistory();

    console.log('[Popup] Mount - checking local storage for active result with key:', STORAGE_KEY_RESULT);
    chrome.storage.local.get(STORAGE_KEY_RESULT, (data) => {
      const saved = data[STORAGE_KEY_RESULT];
      console.log('[Popup] Mount storage retrieval:', JSON.stringify(saved));
      if (!saved) {
        console.log('[Popup] Mount - no active result in storage');
        return;
      }

      console.log('[Popup] Mount - active result status:', saved.status, 'requestId:', saved.requestId);
      if (saved.status === 'loading') {
        setLoadingText(saved.text || '');
        setLastInputType(saved.inputType || 'text');
        setMainClaim(saved.mainClaim || null);
        activeRequestIdRef.current = saved.requestId || null;
        console.log('[Popup] Mount - Set activeRequestIdRef to:', activeRequestIdRef.current);
        console.log('[Popup] Mount - Switching to LoadingView');
        setView('loading');
      } else if (saved.status === 'done' && saved.result) {
        console.log('[Popup] Mount - Stored result found. Switching to ResultView');
        setResult(saved.result);
        setView('result');
        saveToHistory(saved.result);
      } else if (saved.status === 'error') {
        console.log('[Popup] Mount - Stored error found. Switching to ErrorView');
        setErrorMsg(saved.message || 'Unknown error');
        setLastInputType(saved.inputType || 'text');
        setView('error');
      }
    });
  }, [loadHistory, saveToHistory]);

  // ── Listen for local storage state updates ──────────────────────────────
  useEffect(() => {
    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'local') return;

      console.log('[Popup] Storage change event fired. Changes:', JSON.stringify(changes));

      if (changes[STORAGE_KEY_RESULT]) {
        const newValue = changes[STORAGE_KEY_RESULT].newValue;
        console.log('[Popup] Storage change key matching. New value:', JSON.stringify(newValue));
        if (!newValue) {
          console.log('[Popup] Storage change - newValue is empty');
          return;
        }

        console.log('[Popup] Storage change - newValue.requestId:', newValue.requestId, 'activeRequestIdRef:', activeRequestIdRef.current);
        
        if (newValue.status === 'loading') {
          console.log('[Popup] Storage change status is loading. Updating activeRequestIdRef to:', newValue.requestId);
          activeRequestIdRef.current = newValue.requestId || null;
        } else if (activeRequestIdRef.current && newValue.requestId && newValue.requestId !== activeRequestIdRef.current) {
          console.log('[Popup] Storage change ignored due to requestId mismatch. New:', newValue.requestId, 'Active:', activeRequestIdRef.current);
          return;
        }

        if (newValue.status === 'loading') {
          console.log('[Popup] Storage change - status is loading. Switching to LoadingView');
          setLoadingText(newValue.text || '');
          setLastInputType(newValue.inputType || 'text');
          setMainClaim(newValue.mainClaim || null);
          setView('loading');
          if (newValue.mainClaim) {
            console.log('[STAGE 11] Popup received extracted claim SUCCESS. Claim: ' + newValue.mainClaim);
          }
        } else if (newValue.status === 'done' && newValue.result) {
          console.log('[STAGE 15] Popup receives result SUCCESS. Switching to ResultView');
          setResult(newValue.result);
          setView('result');
          saveToHistory(newValue.result);
        } else if (newValue.status === 'error') {
          console.log('[Popup] Storage change - status is error. Switching to ErrorView. Message:', newValue.message);
          setErrorMsg(newValue.message || 'Unknown error');
          setLastInputType(newValue.inputType || 'text');
          setView('error');
        }
      }

      if (changes.satyascan_history) {
        console.log('[Popup] Storage change - history updated');
        setHistory(changes.satyascan_history.newValue || []);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [saveToHistory]);

  // ── Listen for runtime messages from background service worker ───────────
  useEffect(() => {
    const handler = (message) => {
      console.log('[Popup] Runtime message received:', JSON.stringify(message));
      if (message.type === 'VERIFY_LOADING') {
        console.log('[Popup] Message VERIFY_LOADING received. Setting activeRequestIdRef to:', message.requestId);
        activeRequestIdRef.current = message.requestId || null;
        setLoadingText(message.text || '');
        setLastInputType(message.inputType || 'text');
        setMainClaim(message.mainClaim || null);
        console.log('[Popup] Message VERIFY_LOADING - Switching to LoadingView');
        setView('loading');
        if (message.mainClaim) {
          console.log('[STAGE 11] Popup received extracted claim SUCCESS. Claim: ' + message.mainClaim);
        }
      } else if (message.type === 'VERIFY_RESULT' && message.result) {
        console.log('[Popup] Message VERIFY_RESULT received. message requestId:', message.requestId, 'activeRequestIdRef:', activeRequestIdRef.current);
        if (activeRequestIdRef.current && message.requestId && message.requestId !== activeRequestIdRef.current) {
          console.log('[Popup] Mismatched VERIFY_RESULT ignored. Msg:', message.requestId, 'Active:', activeRequestIdRef.current);
          return;
        }
        console.log('[STAGE 15] Popup receives result SUCCESS. Switching to ResultView');
        setResult(message.result);
        setView('result');
        saveToHistory(message.result);
      } else if (message.type === 'VERIFY_ERROR') {
        console.log('[Popup] Message VERIFY_ERROR received. message requestId:', message.requestId, 'activeRequestIdRef:', activeRequestIdRef.current);
        if (activeRequestIdRef.current && message.requestId && message.requestId !== activeRequestIdRef.current) {
          console.log('[Popup] Mismatched VERIFY_ERROR ignored. Msg:', message.requestId, 'Active:', activeRequestIdRef.current);
          return;
        }
        console.log('[Popup] Message VERIFY_ERROR - Switching to ErrorView. Message:', message.message);
        setErrorMsg(message.message || 'Unknown error');
        setView('error');
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [saveToHistory]);

  // ── Reset to home view ───────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    chrome.storage.local.remove(STORAGE_KEY_RESULT);
    activeRequestIdRef.current = null;
    setView('home');
    setResult(null);
    setErrorMsg('');
    setLoadingText('');
    setMainClaim(null);
  }, []);

  // ── Click history card to view ───────────────────────────────────────────
  const handleHistoryCardClick = (item) => {
    const mockResult = {
      inputType: item.inputType || 'text',
      trustScore: item.confidence,
      pageVerdict: item.verdict,
      originalText: item.claim,
      verifiedAt: item.verifiedAt,
      checkId: item.checkId,
      claims: [
        {
          text: item.claim,
          verdict: item.verdict,
          confidence: item.confidence,
          sources: item.sources
        }
      ]
    };
    setResult(mockResult);
    setView('result');
  };

  const handleRetry = useCallback(() => {
    handleBack();
  }, [handleBack]);

  // ── Render view transition router ────────────────────────────────────────
  if (view === 'loading') return <LoadingView text={loadingText} onBack={handleBack} mainClaim={mainClaim} t={t} />;
  if (view === 'result' && result) {
    if (result.success === false) {
      return <ErrorView errorType={result.errorType} message={result.message} evidenceCollected={result.evidenceCollected} onBack={handleBack} onRetry={handleRetry} t={t} />;
    }
    return <ResultView result={result} onBack={handleBack} t={t} />;
  }
  if (view === 'error') return <ErrorView message={errorMsg} onBack={handleBack} onRetry={handleRetry} t={t} />;
  
  if (view === 'settings') {
    return (
      <SettingsView
        uiLang={uiLang}
        onToggleLang={onToggleLang}
        token={token}
        user={user}
        syncEnabled={syncEnabled}
        onToggleSync={handleToggleSync}
        onLogout={onLogout}
        onSignIn={onSignIn}
        onBack={handleBack}
        t={t}
      />
    );
  }

  // ─── HOME VIEW ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-grow animate-fade-in-up h-full max-h-[500px]">
      
      {/* Hero Banner card */}
      <div
        className="mx-5 mt-5 mb-4 px-4 py-3.5 rounded-xl flex items-center gap-3 bg-[#E4DFB5] border border-[#C3CC9B]"
      >
        <div
          className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center animate-spin-slow bg-[#768E56]"
          style={{ boxShadow: '0 2px 10px rgba(118,142,86,0.3)' }}
        >
          <Sparkles size={14} color="#FBE8CE" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-xs font-black text-[#232B1B] leading-tight">{t('extension.aiPoweredScanning', 'AI-Powered News Scanning')}</p>
          <p className="text-[10px] text-[#5C6650] mt-0.5 font-semibold">{t('extension.verifyIntegrity', 'Verify integrity and search sources instantly')}</p>
        </div>
      </div>

      {/* ── Profile / Account Status Section ── */}
      <div className="px-5 mb-4">
        {token && user ? (
          <div className="rounded-xl p-3 bg-[#768E56]/10 border border-[#768E56]/20 text-left flex items-start justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#768E56]/20 border border-[#768E56]/30 flex items-center justify-center text-[#768E56] font-bold text-xs shrink-0 mt-0.5">
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-black text-[#232B1B] truncate">{user.name}</p>
                  <button
                    onClick={() => setView('settings')}
                    className="text-[#5C6650] hover:text-[#232B1B] transition-colors cursor-pointer bg-transparent border-none p-0 flex items-center justify-center shrink-0"
                    title={t('extension.settings', 'Settings')}
                  >
                    <Settings size={12} strokeWidth={2.5} />
                  </button>
                  <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-[#768E56] text-[#FBE8CE]">
                    Active
                  </span>
                </div>
                <p className="text-[9px] text-[#5C6650] font-semibold truncate leading-none mt-0.5">{user.email}</p>
                <div className="flex items-center gap-1 mt-1.5 text-[8px] font-bold text-[#768E56]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#768E56] animate-pulse" />
                  <span>☁ {t('extension.syncEnabled', 'Sync Enabled')}</span>
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9px] text-[#5C6650] font-bold">{t('extension.verifiedToday', 'Verified Today')}: <span className="text-[#232B1B] font-black">{user.verifiedToday ?? 0}</span></p>
              <p className="text-[9px] text-[#5C6650] font-bold mt-0.5">{t('extension.totalReports', 'Total Reports')}: <span className="text-[#232B1B] font-black">{user.totalReports ?? 0}</span></p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl p-3 bg-[#E4DFB5]/60 border border-[#C3CC9B]/60 text-left flex items-center justify-between gap-3 shadow-sm">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-black text-[#232B1B]">{t('extension.guestMode', 'Guest Mode')}</p>
                <button
                  onClick={() => setView('settings')}
                  className="text-[#5C6650] hover:text-[#232B1B] transition-colors cursor-pointer bg-transparent border-none p-0 flex items-center justify-center shrink-0"
                  title={t('extension.settings', 'Settings')}
                >
                  <Settings size={12} strokeWidth={2.5} />
                </button>
              </div>
              <p className="text-[9px] text-[#5C6650] mt-0.5 font-semibold">{t('extension.guestModeDesc', 'Sign In to sync your verification history.')}</p>
            </div>
            <button
              onClick={onSignIn}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black btn-primary text-[#FBE8CE] cursor-pointer shrink-0"
            >
              {t('nav.login', 'Sign In')}
            </button>
          </div>
        )}
      </div>

      {/* ── Merge History Prompt ── */}
      {showMergePrompt && (
        <div className="mx-5 mb-4 p-3 rounded-xl bg-orange-50 border border-orange-200 text-left space-y-2.5 shadow-sm">
          <div className="flex items-start gap-2">
            <span className="text-orange-500 shrink-0 text-sm">💡</span>
            <div>
              <p className="text-xs font-black text-[#232B1B]">{t('extension.mergeHistory', 'Merge Local History?')}</p>
              <p className="text-[10px] text-[#5C6650] font-semibold mt-0.5">
                {t('extension.mergeHistoryDesc', 'We detected verification claims done in guest mode. Do you want to merge them with your account?')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleSkipMerge}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-gray-300 hover:bg-gray-100 transition-colors cursor-pointer bg-white"
            >
              {t('common.cancel', 'Skip')}
            </button>
            <button
              onClick={handleMergeHistory}
              disabled={merging}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-orange-500 text-white hover:bg-orange-600 transition-colors cursor-pointer"
            >
              {merging ? t('common.loading', 'Merging...') : t('extension.merge', 'Merge')}
            </button>
          </div>
        </div>
      )}

      {/* Primary Actions / Direct Input */}
      <div className="px-5 flex flex-col gap-3">
        <SectionTitle icon={<FileText size={12} />} title={t('extension.verifySelectedText', 'Paste Text to Verify')} />
        
        <div className="flex flex-col gap-2 rounded-xl bg-[#E4DFB5] p-3 border border-[#C3CC9B]">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={t('extension.verifyHint', 'Paste any news claim or text here to verify...')}
            className="w-full h-20 text-xs bg-transparent border-none outline-none resize-none text-[#232B1B] placeholder-[#5C6650]"
          />
          <div className="flex justify-between items-center pt-2 border-t border-[#C3CC9B]/50">
            <span className="text-[9px] text-[#5C6650] font-semibold">
              {pasteText.length}/10000 chars
            </span>
            <button 
              onClick={handleDirectScan}
              disabled={!pasteText.trim()}
              className="btn-primary px-4 py-1.5 text-xs font-black rounded-lg disabled:opacity-50 text-[#FBE8CE]"
            >
              Scan Now
            </button>
          </div>
        </div>
      </div>

      <div className="divider mx-5 my-4" />

      {/* Scan History (Scrollable section) */}
      <div className="px-5 flex-grow overflow-y-auto max-h-[160px] scroll-container">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle icon={<Clock size={12} />} title={t('extension.recentScans')} badge={history.length} />
          {history.length > 0 && (
            <button onClick={clearHistory} className="flex items-center gap-1 text-[10px] font-bold text-[#C62828] hover:text-red-800 transition-colors cursor-pointer">
              <Trash2 size={11} />
              {t('extension.clearAll')}
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <EmptyState
            icon={<Inbox size={18} strokeWidth={1.5} />}
            title={t('extension.noRecentScans')}
            description={t('extension.noRecentScansDesc')}
          />
        ) : (
          <div className="space-y-2">
            {history.map((item, idx) => {
              const cfg = getVerdict(item.verdict);
              return (
                <button
                  key={idx}
                  onClick={() => handleHistoryCardClick(item)}
                  className="w-full text-left rounded-xl p-3 bg-[#E4DFB5] hover:bg-[#E4DFB5]/75 border border-[#C3CC9B] transition-all flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-[#232B1B] truncate">
                      "{item.claim}"
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                      >
                        {getVerdict(item.verdict, t).label}
                      </span>
                      <span className="text-[9px] text-[#5C6650] font-medium">
                        {new Date(item.verifiedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black" style={{ color: getReliabilityColor(item.confidence) }}>
                      {item.confidence}%
                    </span>
                    <p className="text-[8px] text-[#5C6650] font-bold mt-0.5">{t('extension.reliability')}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky footer: language toggle + settings */}
      <div className="mt-auto px-5 py-4 border-t border-[#C3CC9B] bg-[#E4DFB5] flex items-center gap-2">
        {/* Language toggle */}
        <button
          type="button"
          onClick={onToggleLang}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border border-[#C3CC9B] btn-secondary shrink-0"
          title={t('extension.language')}
          aria-label="Toggle language"
        >
          <Globe size={12} strokeWidth={2.5} />
          {uiLang === 'en' ? t('extension.hindi') : t('extension.english')}
        </button>
        <button
          type="button"
          onClick={() => window.open('https://satya-scan-henna.vercel.app/', '_blank')}
          className="flex-grow flex items-center justify-center gap-2 py-2 rounded-xl transition-all duration-200 btn-primary text-[#FBE8CE] cursor-pointer shadow-sm"
          style={{ fontSize: '11px', fontWeight: 'bold', fontFamily: "'Inter', system-ui, sans-serif", borderRadius: '8px' }}
          aria-label="Visit Site"
        >
          <ExternalLink size={13} strokeWidth={2.5} />
          <span>{t('extension.visitSite', 'Visit Site')}</span>
        </button>
      </div>

    </div>
  );
}

// ─── Settings Screen Component ───────────────────────────────────────────────
function SettingsView({ uiLang, onToggleLang, token, user, syncEnabled, onToggleSync, onLogout, onSignIn, onBack, t }) {
  return (
    <div className="flex flex-col flex-grow h-full max-h-[500px] animate-fade-in-up bg-[#FBE8CE] text-left">
      {/* View Header */}
      <div className="flex items-center justify-between px-5 pt-3.5 pb-2.5 border-b border-[#C3CC9B] bg-[#E4DFB5]">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#5C6650] hover:text-[#232B1B] transition-colors font-bold cursor-pointer">
          <ArrowLeft size={13} strokeWidth={2.5} />
          {t('extension.back', 'Back')}
        </button>
        <span className="text-[10px] font-bold text-[#5C6650]/60 flex items-center gap-1">
          <Settings size={11} strokeWidth={2.5} style={{ color: '#768E56' }} />
          {t('extension.settings', 'Settings')}
        </span>
      </div>

      {/* Settings Options (Scrollable) */}
      <div className="flex-grow overflow-y-auto px-5 py-4 space-y-4 scroll-container">
        
        {/* 1. Language Section */}
        <div className="rounded-xl p-3.5 bg-[#E4DFB5] border border-[#C3CC9B]">
          <h4 className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider mb-2.5">
            {t('extension.language', 'Language')}
          </h4>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#232B1B]">
              {uiLang === 'en' ? 'English' : 'हिन्दी'}
            </span>
            <button
              onClick={onToggleLang}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#C3CC9B] text-[#5C6650] hover:text-[#232B1B] transition-colors text-xs font-bold bg-transparent cursor-pointer"
            >
              {uiLang === 'en' ? t('extension.hindi', 'हिन्दी') : t('extension.english', 'English')}
            </button>
          </div>
        </div>

        {/* 2. Account Section */}
        <div className="rounded-xl p-3.5 bg-[#E4DFB5] border border-[#C3CC9B]">
          <h4 className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider mb-2.5">
            {t('results.validationNode', 'Account')}
          </h4>
          {token && user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#768E56]/20 border border-[#768E56]/30 flex items-center justify-center text-[#768E56] font-bold text-sm">
                  {user.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-[#232B1B] truncate">{user.name}</p>
                  <p className="text-[10px] text-[#5C6650] font-semibold truncate mt-0.5">{user.email}</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="w-full text-center py-2 text-xs font-black border border-red-200 text-red-600 hover:text-red-700 hover:border-red-600 bg-transparent rounded-xl transition-colors cursor-pointer"
              >
                {t('nav.logout', 'Sign Out')}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[10px] text-[#5C6650] font-semibold leading-normal">
                {t('history.loginRequired', 'You need to be logged in to sync history.')}
              </p>
              <button
                onClick={onSignIn}
                className="w-full text-center py-2.5 text-xs font-black btn-primary text-[#FBE8CE] rounded-xl cursor-pointer shadow-sm"
              >
                {t('nav.login', 'Sign In')}
              </button>
            </div>
          )}
        </div>

        {/* 3. History Sync Section */}
        {token && (
          <div className="rounded-xl p-3.5 bg-[#E4DFB5] border border-[#C3CC9B]">
            <h4 className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider mb-2.5">
              {t('extension.syncHistory', 'History Sync')}
            </h4>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#232B1B]">
                  {syncEnabled ? t('extension.syncEnabled', 'Sync Enabled') : t('extension.syncDisabled', 'Sync Disabled')}
                </p>
                <p className="text-[9px] text-[#5C6650] font-semibold mt-0.5 leading-snug">
                  {t('extension.syncDesc', 'Keep verification history synced across all your platforms.')}
                </p>
              </div>
              <button
                onClick={() => onToggleSync(!syncEnabled)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  syncEnabled
                    ? 'bg-[#768E56] text-[#FBE8CE] hover:bg-[#5C6650]'
                    : 'border border-[#C3CC9B] text-[#5C6650] hover:text-[#232B1B] bg-transparent'
                }`}
              >
                {syncEnabled ? t('extension.disable', 'Disable') : t('extension.enable', 'Enable')}
              </button>
            </div>
          </div>
        )}

        {/* 4. Privacy Section */}
        <div className="rounded-xl p-3.5 bg-[#E4DFB5] border border-[#C3CC9B] space-y-1.5">
          <h4 className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider">
            {t('extension.privacy', 'Privacy')}
          </h4>
          <p className="text-[10px] text-[#5C6650] leading-relaxed font-semibold">
            {t('extension.privacyDesc', 'Your verification history and language preference are stored locally on this device. When logged in and sync is enabled, your checks are securely uploaded and stored in your SatyaScan account.')}
          </p>
        </div>

      </div>
    </div>
  );
}
