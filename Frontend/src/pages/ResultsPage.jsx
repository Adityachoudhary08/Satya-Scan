import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CircleCheckBig, CircleX, BadgeCheck, TriangleAlert, ShieldQuestion,
  Newspaper, FileText, ShieldCheck, ChevronDown, ChevronUp,
  ExternalLink, ArrowLeft, Share2, Search, Scale, GitCompare,
  AlertTriangle, CheckCircle2, XCircle, Info, Eye, Layers,
  TrendingUp, Clock, Globe, Award, Zap
} from 'lucide-react';
import ShareModal from '../components/ShareModal';
import { getHistoryItem } from '../api/api';
import { useTranslation } from '../context/LanguageContext';

// ─── Verdict config ────────────────────────────────────────────────────────────

const VERDICT_CONFIG = {
  Supported:        { color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.12)', border: 'rgba(46, 125, 50, 0.22)', Icon: CircleCheckBig,  label: 'Verified',           microcopy: 'Multiple trusted sources independently support this claim.' },
  True:             { color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.12)', border: 'rgba(46, 125, 50, 0.22)', Icon: CircleCheckBig,  label: 'Verified',           microcopy: 'Multiple trusted sources independently support this claim.' },
  Contradicted:     { color: '#C62828', bg: 'rgba(198, 40, 40, 0.12)', border: 'rgba(198, 40, 40, 0.22)', Icon: CircleX,         label: 'False',              microcopy: 'Reliable evidence from independent sources contradicts this claim.' },
  False:            { color: '#C62828', bg: 'rgba(198, 40, 40, 0.12)', border: 'rgba(198, 40, 40, 0.22)', Icon: CircleX,         label: 'False',              microcopy: 'Reliable evidence from independent sources contradicts this claim.' },
  Misleading:       { color: '#E65100', bg: 'rgba(230, 81, 0, 0.12)', border: 'rgba(230, 81, 0, 0.22)', Icon: TriangleAlert,   label: 'Misleading',         microcopy: 'The claim mixes factual information with misleading context or omits key facts.' },
  PARTIALLY_TRUE:   { color: '#F57F17', bg: 'rgba(245, 127, 23, 0.12)', border: 'rgba(245, 127, 23, 0.22)', Icon: BadgeCheck,      label: 'Partially Verified', microcopy: 'Some parts are supported by evidence, but important context is missing.' },
  Unverified:       { color: '#4E5D4C', bg: 'rgba(78, 93, 76, 0.12)', border: 'rgba(78, 93, 76, 0.22)', Icon: ShieldQuestion,  label: "Couldn't Verify",    microcopy: 'There is not enough reliable evidence from trusted sources to verify this claim.' },
  // URL page-type verdicts
  Informational:    { color: '#4E5D4C', bg: 'rgba(78, 93, 76, 0.12)', border: 'rgba(78, 93, 76, 0.22)', Icon: Info,            label: 'Official Information', microcopy: 'This is authoritative information from an official or reference source. It is presented as established information, not evaluated as true or false.' },
  Opinion:          { color: '#5E35B1', bg: 'rgba(94, 53, 177, 0.12)', border: 'rgba(94, 53, 177, 0.22)', Icon: FileText,        label: 'Opinion Content',    microcopy: 'This page contains opinion or editorial content. Factual statements within have been verified separately where possible.' },
  // Image verdicts
  AUTHENTIC:           { color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.12)', border: 'rgba(46, 125, 50, 0.22)', Icon: CircleCheckBig, label: 'Authentic',          microcopy: 'This image appears to be genuine and unmodified.' },
  LIKELY_AUTHENTIC:    { color: '#00796B', bg: 'rgba(0, 121, 107, 0.12)', border: 'rgba(0, 121, 107, 0.22)', Icon: BadgeCheck,     label: 'Likely Authentic',   microcopy: 'This image is probably genuine, with no major signs of manipulation.' },
  AI_GENERATED:        { color: '#C62828', bg: 'rgba(198, 40, 40, 0.12)', border: 'rgba(198, 40, 40, 0.22)', Icon: CircleX,        label: 'AI Generated',       microcopy: 'This image was likely created entirely by artificial intelligence.' },
  LIKELY_AI_GENERATED: { color: '#E65100', bg: 'rgba(230, 81, 0, 0.12)', border: 'rgba(230, 81, 0, 0.22)', Icon: TriangleAlert,  label: 'Likely AI Generated',microcopy: 'This image shows strong signs of being AI-generated.' },
  DEEPFAKE:            { color: '#C62828', bg: 'rgba(198, 40, 40, 0.12)', border: 'rgba(198, 40, 40, 0.22)', Icon: CircleX,        label: 'Deepfake Detected',  microcopy: 'This image shows clear signs of deepfake manipulation.' },
  MANIPULATED:         { color: '#C62828', bg: 'rgba(198, 40, 40, 0.12)', border: 'rgba(198, 40, 40, 0.22)', Icon: CircleX,        label: 'Manipulated',        microcopy: 'This image has been digitally altered or edited.' },
  INCONCLUSIVE:        { color: '#4E5D4C', bg: 'rgba(78, 93, 76, 0.12)', border: 'rgba(78, 93, 76, 0.22)', Icon: ShieldQuestion, label: 'Inconclusive',       microcopy: 'The analysis could not reach a definitive conclusion.' },
};

function getVerdict(v, t) {
  const label = t ? t(`verdict.${v}`, VERDICT_CONFIG[v]?.label || v) : (VERDICT_CONFIG[v]?.label || v);
  const microcopy = t ? t(`verdict.microcopy.${v}`, VERDICT_CONFIG[v]?.microcopy || '') : (VERDICT_CONFIG[v]?.microcopy || '');
  const base = VERDICT_CONFIG[v] || { color: '#4E5D4C', bg: 'rgba(78, 93, 76, 0.12)', border: 'rgba(78, 93, 76, 0.22)', Icon: ShieldQuestion };
  return {
    ...base,
    label,
    microcopy
  };
}

function getReliabilityColor(score) {
  if (score >= 70) return '#2E7D32';
  if (score >= 40) return '#D87D0A';
  return '#C62828';
}

function scoreToLabel(score, t) {
  if (score >= 80) return t ? t('results.scoreStrong', 'Strong') : 'Strong';
  if (score >= 60) return t ? t('results.scoreModerate', 'Moderate') : 'Moderate';
  if (score >= 40) return t ? t('results.scoreWeak', 'Weak') : 'Weak';
  return t ? t('results.scoreVeryWeak', 'Very Weak') : 'Very Weak';
}

function qualityLabel(score, t) {
  if (score >= 80) return t ? t('results.qualityHigh', 'High') : 'High';
  if (score >= 60) return t ? t('results.qualityModerate', 'Moderate') : 'Moderate';
  if (score >= 40) return t ? t('results.qualityLow', 'Low') : 'Low';
  return t ? t('results.qualityVeryLow', 'Very Low') : 'Very Low';
}

function splitReasoning(text) {
  if (!text) return [];
  if (Array.isArray(text)) {
    return text.map(s => String(s).trim()).filter(s => s.length > 5).slice(0, 5);
  }
  return String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/^[-•*]\s*/, '').trim())
    .filter(s => s.length > 5)
    .slice(0, 5);
}

function getDomain(url) {
  try { return new URL(url || '').hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

// Trusted publisher detection
const TIER1_PUBLISHERS = ['reuters', 'bbc', 'apnews', 'ap.org', 'pib.gov', 'who.int', 'cdc.gov', 'nih.gov', 'gov.in'];
const TIER2_PUBLISHERS = ['ndtv', 'thehindu', 'indianexpress', 'theguardian', 'nytimes', 'washingtonpost', 'economist', 'bloomberg', 'ft.com', 'forbes', 'cnbc', 'abc', 'cbs', 'nbc'];

function publisherReliability(src, t) {
  const s = (src.source || src.url || '').toLowerCase();
  let label = 'Moderate';
  let tier = 4;
  let reason = 'Source reliability not independently confirmed';
  let color = '#D87D0A';

  if (TIER1_PUBLISHERS.some(k => s.includes(k))) {
    label = 'Highly Trusted';
    tier = 1;
    reason = 'International wire service or official government source';
    color = '#2E7D32';
  } else if (TIER2_PUBLISHERS.some(k => s.includes(k))) {
    label = 'Trusted';
    tier = 2;
    reason = 'Established national publication with editorial standards';
    color = '#2E7D32';
  } else if (src.trusted) {
    label = 'Verified';
    tier = 3;
    reason = 'Source passed reliability checks';
    color = '#2E7D32';
  }

  // Localize labels if t is available
  if (t) {
    if (tier === 1) {
      label = t('publisherTrust.highlyTrusted', 'Highly Trusted');
      reason = t('publisherTrust.highlyTrustedReason', 'International wire service or official government source');
    } else if (tier === 2) {
      label = t('publisherTrust.trusted', 'Trusted');
      reason = t('publisherTrust.trustedReason', 'Established national publication with editorial standards');
    } else if (tier === 3) {
      label = t('publisherTrust.verified', 'Verified');
      reason = t('publisherTrust.verifiedReason', 'Source passed reliability checks');
    } else {
      label = t('publisherTrust.moderate', 'Moderate');
      reason = t('publisherTrust.moderateReason', 'Source reliability not independently confirmed');
    }
  }

  return { label, color, tier, reason };
}

function getMissingContextText(verdict, reasoning, t) {
  const bullets = splitReasoning(reasoning);
  if (verdict === 'Misleading' || verdict === 'PARTIALLY_TRUE') {
    const contextHints = t ? [
      t('results.importantContextMissingDesc', 'The claim leaves out important facts that change how it should be understood.'),
    ] : [
      'The claim is technically accurate but omits critical surrounding context that changes its meaning.',
      'Important time-frame details, qualifications, or conditions are absent from this claim.',
      'The statistic or fact cited is real, but applies to a different context than implied.',
    ];
    return bullets.length > 2 ? bullets.slice(2) : contextHints;
  }
  return null;
}

function getConfidenceExplanation(score, verdict, trustedCount, totalSources, t) {
  const level = t ? t(`results.${score >= 70 ? 'highReliability' : score >= 40 ? 'moderateReliability' : 'lowReliability'}`) : (score >= 70 ? 'High Reliability' : score >= 40 ? 'Moderate Reliability' : 'Low Reliability');
  const reasons = [];

  if (t) {
    if (trustedCount >= 3) reasons.push(t('results.reliabilityReasons.multiTrusted'));
    else if (trustedCount >= 1) reasons.push(t('results.reliabilityReasons.oneTrusted'));
    else reasons.push(t('results.reliabilityReasons.noTrusted'));

    if (totalSources >= 5) reasons.push(t('results.reliabilityReasons.manyEvidence'));
    else if (totalSources >= 2) reasons.push(t('results.reliabilityReasons.someEvidence'));
    else reasons.push(t('results.reliabilityReasons.limitedEvidence'));

    if (verdict === 'Supported' || verdict === 'True') reasons.push(t('results.reliabilityReasons.noContradictions'));
    else if (verdict === 'Contradicted' || verdict === 'False') reasons.push(t('results.reliabilityReasons.contradictions'));
    else if (verdict === 'Misleading') reasons.push(t('results.reliabilityReasons.contextGaps'));

    if (score >= 70) reasons.push(t('results.reliabilityReasons.recentSources'));
  } else {
    if (trustedCount >= 3) reasons.push('Multiple independent trusted publications agree');
    else if (trustedCount >= 1) reasons.push('At least one trusted publication found');
    else reasons.push('No established trusted publications found');

    if (totalSources >= 5) reasons.push('Wide evidence base across many sources');
    else if (totalSources >= 2) reasons.push('Evidence found from multiple sources');
    else reasons.push('Limited evidence sources available');

    if (verdict === 'Supported' || verdict === 'True') reasons.push('No credible contradictions detected');
    else if (verdict === 'Contradicted' || verdict === 'False') reasons.push('Credible sources actively contradict this claim');
    else if (verdict === 'Misleading') reasons.push('Context gaps or selective framing detected');

    if (score >= 70) reasons.push('Evidence is from recent, verifiable publications');
  }

  return { level, reasons };
}

// ─── Logo ──────────────────────────────────────────────────────────────────────

function SatyaScanLogo() {
  return (
    <div className="flex items-center gap-2">
      <img src="/SatyaScan_logo_transparent.png" alt="SatyaScan Logo" className="h-10 w-auto object-contain" />
      <span className="font-bold text-[15px] tracking-tight text-[#232B1B]">
        <span className="text-[#232B1B]">Satya</span><span className="text-[#5C6650] font-medium">Scan</span>
      </span>
    </div>
  );
}

// ─── Reliability Ring ─────────────────────────────────────────────────────────

function ReliabilityRing({ score }) {
  const color = getReliabilityColor(score);
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#C3CC9B" strokeWidth="7" />
        <motion.circle
          cx="44" cy="44" r={r}
          fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.3, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-[#232B1B] leading-none">{score}</span>
        <span className="text-[9px] text-[#5C6650] mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

// ─── Animated Bar ─────────────────────────────────────────────────────────────

function AnimatedBar({ value, color, height = 6 }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: '#C3CC9B' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
      />
    </div>
  );
}

// ─── Page Type Banner (shown for non-news URL inputs) ─────────────────────────

const PAGE_TYPE_CONFIG = {
  official:     { Icon: Award,     color: '#2E7D32', bg: 'rgba(46,125,50,0.06)',  border: 'rgba(46,125,50,0.2)',  reportLabel: 'Official Information Report' },
  reference:    { Icon: Info,      color: '#1E88E5', bg: 'rgba(30,136,229,0.06)',  border: 'rgba(30,136,229,0.2)',  reportLabel: 'Reference Information Report' },
  opinion:      { Icon: FileText,  color: '#5E35B1', bg: 'rgba(94,53,177,0.06)', border: 'rgba(94,53,177,0.2)', reportLabel: 'Opinion Content Analysis' },
  social_media: { Icon: Globe,     color: '#D87D0A', bg: 'rgba(216,125,10,0.06)', border: 'rgba(216,125,10,0.2)', reportLabel: 'Social Media Fact-Check' },
};

function PageTypeBanner({ pageType, pageTypeLabel, pageTypeDescription }) {
  const cfg = PAGE_TYPE_CONFIG[pageType];
  if (!cfg) return null;
  const { Icon, color, bg, border } = cfg;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: color + '18', border: `1px solid ${color}30` }}>
        <Icon size={13} style={{ color }} strokeWidth={2} />
      </div>
      <div>
        <p className="text-xs font-bold mb-0.5" style={{ color }}>{pageTypeLabel}</p>
        <p className="text-[11px] text-[#5C6650] leading-relaxed">{pageTypeDescription}</p>
      </div>
    </motion.div>
  );
}

function SectionHeading({ icon: Icon, children, iconColor, badge }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[#232B1B]/90">
        <Icon size={15} style={{ color: iconColor || '#768E56' }} strokeWidth={2} />
        {children}
      </h2>
      {badge && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(118,142,86,0.12)', color: '#232B1B', border: '1px solid rgba(118,142,86,0.25)' }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── How We Verified — Transparent Pipeline ───────────────────────────────────

const PIPELINE_STEPS = [
  { icon: FileText,   labelKey: 'results.pipeline.claimSubmitted',           fallbackLabel: 'Claim Submitted',           descKey: 'results.pipeline.claimSubmittedDesc',           fallbackDesc: 'Your input is received and parsed for verifiable claims' },
  { icon: Search,     labelKey: 'results.pipeline.claimsExtracted',          fallbackLabel: 'Claims Extracted',          descKey: 'results.pipeline.claimsExtractedDesc',          fallbackDesc: 'Individual factual assertions are identified and isolated' },
  { icon: Globe,      labelKey: 'results.pipeline.sourcesRetrieved',         fallbackLabel: 'Trusted Sources Retrieved', descKey: 'results.pipeline.sourcesRetrievedDesc',         fallbackDesc: 'Relevant articles pulled from verified publication databases' },
  { icon: GitCompare, labelKey: 'results.pipeline.crossSource',              fallbackLabel: 'Cross-Source Comparison',    descKey: 'results.pipeline.crossSourceDesc',              fallbackDesc: 'Claims matched against retrieved evidence across all sources' },
  { icon: AlertTriangle, labelKey: 'results.pipeline.contradictions',        fallbackLabel: 'Contradictions Detected',    descKey: 'results.pipeline.contradictionsDesc',           fallbackDesc: 'Conflicting reports identified and flagged for review' },
  { icon: Scale,      labelKey: 'results.pipeline.evidenceWeighted',         fallbackLabel: 'Evidence Weighted',         descKey: 'results.pipeline.evidenceWeightedDesc',         fallbackDesc: 'Sources scored by publisher trust tier and publication recency' },
  { icon: ShieldCheck,labelKey: 'results.pipeline.verdictIssued',            fallbackLabel: 'Final Verdict Issued',       descKey: 'results.pipeline.verdictIssuedDesc',            fallbackDesc: 'Independent conclusion drawn from the full evidence body' },
];

function HowWeVerified() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: '#E4DFB5', border: '1px solid #C3CC9B' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#FBE8CE]/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Eye size={15} style={{ color: '#768E56' }} strokeWidth={2} />
          <span className="text-sm font-semibold text-[#232B1B]">{t('results.howWeVerified', 'How We Verified This')}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1"
            style={{ background: 'rgba(118,142,86,0.12)', color: '#232B1B', border: '1px solid rgba(118,142,86,0.25)' }}>
            {t('results.transparentMethodology', 'Transparent Methodology')}
          </span>
        </div>
        {open
          ? <ChevronUp size={14} className="text-[#5C6650]" />
          : <ChevronDown size={14} className="text-[#5C6650]" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="pipeline"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-5 pb-5 pt-2" style={{ borderTop: '1px solid #C3CC9B' }}>
              <p className="text-xs text-[#5C6650] mb-4 leading-relaxed">
                {t('results.howWeVerifiedDesc', 'SatyaScan uses a multi-stage evidence pipeline — not a single AI response. Every verdict is built on independently retrieved sources.')}
              </p>
              <div className="relative">
                {/* Vertical connector line */}
                <div className="absolute left-[17px] top-4 bottom-4 w-px"
                  style={{ background: 'linear-gradient(to bottom, rgba(118,142,86,0.4), rgba(118,142,86,0.1))' }} />

                <div className="space-y-0">
                  {PIPELINE_STEPS.map((step, i) => {
                    const Icon = step.icon;
                    const isLast = i === PIPELINE_STEPS.length - 1;
                    const label = t(step.labelKey, step.fallbackLabel);
                    const desc = t(step.descKey, step.fallbackDesc);
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.04 * i }}
                        className="flex items-start gap-3 relative"
                        style={{ paddingBottom: isLast ? 0 : '12px' }}
                      >
                        {/* Step node */}
                        <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0 z-10"
                          style={{
                            background: isLast ? 'rgba(118,142,86,0.15)' : '#E4DFB5',
                            border: `1px solid ${isLast ? '#768E56' : '#C3CC9B'}`,
                          }}>
                          <Icon size={13} style={{ color: isLast ? '#768E56' : '#5C6650' }} strokeWidth={2} />
                        </div>
                        <div className="flex-1 pt-0.5 pb-1">
                          <p className={`text-xs font-semibold mb-0.5 ${isLast ? 'text-[#768E56] font-bold' : 'text-[#232B1B]/85'}`}>
                            {label}
                          </p>
                          <p className="text-[11px] text-[#5C6650] leading-relaxed">{desc}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Evidence Consensus ───────────────────────────────────────────────────────

function PublisherPill({ name, tier }) {
  const colors = {
    1: { bg: 'rgba(46, 125, 50, 0.15)', border: 'rgba(46, 125, 50, 0.25)', text: '#2E7D32' },
    2: { bg: 'rgba(46, 125, 50, 0.1)', border: 'rgba(46, 125, 50, 0.2)', text: '#2E7D32' },
    3: { bg: 'rgba(46, 125, 50, 0.08)', border: 'rgba(46, 125, 50, 0.18)', text: '#2E7D32' },
    4: { bg: 'rgba(216, 125, 10, 0.1)', border: 'rgba(216, 125, 10, 0.2)', text: '#D87D0A' },
  };
  const style = colors[tier] || colors[4];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.text }}>
      {tier <= 2 && <CheckCircle2 size={9} strokeWidth={2.5} />}
      {name}
    </span>
  );
}

function EvidenceConsensus({ claims }) {
  const { t } = useTranslation();
  const allSrc = claims.flatMap(c => c.sources || []);
  const seenUrls = new Set();
  const unique = allSrc.filter(s => {
    const key = s.url || s.title || '';
    if (!key || seenUrls.has(key)) return false;
    seenUrls.add(key); return true;
  });

  // Split: trusted → supporting; untrusted → uncertain
  const supporting = unique.filter(s => s.trusted || TIER1_PUBLISHERS.some(k => (s.source || s.url || '').toLowerCase().includes(k)) || TIER2_PUBLISHERS.some(k => (s.source || s.url || '').toLowerCase().includes(k)));
  const uncertain = unique.filter(s => !supporting.includes(s));

  if (unique.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl p-5"
      style={{ background: '#E4DFB5', border: '1px solid #C3CC9B' }}
    >
      <SectionHeading icon={Layers} badge={`${unique.length} ${t('results.sources', 'sources')}`}>{t('results.evidenceConsensus', 'Evidence Consensus')}</SectionHeading>
      <p className="text-[11px] text-[#5C6650] mb-4 leading-relaxed">
        {t('results.evidenceConsensusDesc', 'See at a glance whether trusted, independent publications agree or disagree with this claim.')}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Supporting */}
        <div className="rounded-xl p-4" style={{ background: 'rgba(46, 125, 50, 0.06)', border: '1px solid rgba(46, 125, 50, 0.15)' }}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={13} style={{ color: '#2E7D32' }} strokeWidth={2.5} />
            <span className="text-xs font-bold" style={{ color: '#2E7D32' }}>
              {t('results.supporting', 'Supporting')} ({supporting.length})
            </span>
          </div>
          {supporting.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {supporting.slice(0, 8).map((s, i) => {
                const pub = publisherReliability(s, t);
                const name = s.source || getDomain(s.url) || 'Source';
                return <PublisherPill key={i} name={name} tier={pub.tier} />;
              })}
            </div>
          ) : (
            <p className="text-[11px] text-[#5C6650]/60 italic">{t('results.noEstablishedTrusted', 'No established trusted publications found')}</p>
          )}
        </div>

        {/* Uncertain / low-trust */}
        <div className="rounded-xl p-4" style={{ background: 'rgba(78, 93, 76, 0.06)', border: '1px solid rgba(78, 93, 76, 0.15)' }}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldQuestion size={13} className="text-[#5C6650]" strokeWidth={2} />
            <span className="text-xs font-bold text-[#5C6650]">
              {t('results.unverifiedSources', 'Unverified Sources')} ({uncertain.length})
            </span>
          </div>
          {uncertain.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {uncertain.slice(0, 8).map((s, i) => {
                const pub = publisherReliability(s, t);
                const name = s.source || getDomain(s.url) || 'Unknown';
                return <PublisherPill key={i} name={name} tier={pub.tier} />;
              })}
            </div>
          ) : (
            <p className="text-[11px] text-[#5C6650]/60 italic">{t('results.allSourcesPassed', 'All retrieved sources passed trust checks')}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Can I Trust This? Card ───────────────────────────────────────────────────

function TrustCard({ score, verdict, trustedCount, totalSources }) {
  const { t } = useTranslation();
  const { level, reasons } = getConfidenceExplanation(score, verdict, trustedCount, totalSources, t);
  const isHigh = score >= 70;
  const isMed = score >= 40 && score < 70;
  const color = getReliabilityColor(score);
  const bgColor = isHigh ? 'rgba(46, 125, 50, 0.08)' : isMed ? 'rgba(216, 125, 10, 0.08)' : 'rgba(198, 40, 40, 0.08)';
  const borderColor = isHigh ? 'rgba(46, 125, 50, 0.18)' : isMed ? 'rgba(216, 125, 10, 0.18)' : 'rgba(198, 40, 40, 0.18)';
  const TrustIcon = isHigh ? Award : isMed ? BadgeCheck : AlertTriangle;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="rounded-2xl p-5"
      style={{ background: bgColor, border: `1px solid ${borderColor}` }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: color + '15', border: `1px solid ${color}30` }}>
          <TrustIcon size={18} style={{ color }} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-[#232B1B]">{t('results.canITrustThis', 'Can I trust this result?')}</h3>
          </div>
          <p className="text-base font-black mb-2.5" style={{ color }}>
            {level}
          </p>
          <ul className="space-y-1.5">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#5C6650] leading-relaxed">
                <span className="mt-0.5 shrink-0 animate-pulse" style={{ color: color, fontSize: 10 }}>
                  {isHigh ? '✓' : isMed ? '◦' : '✕'}
                </span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Missing Context Section ──────────────────────────────────────────────────

function MissingContext({ verdict, reasoning }) {
  const { t } = useTranslation();
  const contextPoints = getMissingContextText(verdict, reasoning, t);
  if (!contextPoints || contextPoints.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22 }}
      className="rounded-2xl p-5"
      style={{ background: 'rgba(216, 125, 10, 0.08)', border: '1px solid rgba(216, 125, 10, 0.18)' }}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'rgba(216, 125, 10, 0.15)', border: '1px solid rgba(216, 125, 10, 0.25)' }}>
          <Info size={14} style={{ color: '#D87D0A' }} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-[#D87D0A] mb-1">{t('results.importantContextMissing', 'Important Context Missing')}</h3>
          <p className="text-xs text-[#5C6650] mb-3 leading-relaxed">
            {t('results.contextMissingDesc', 'This claim leaves out important facts that change how it should be understood.')}
          </p>
          <ul className="space-y-2">
            {contextPoints.slice(0, 3).map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#5C6650] leading-relaxed">
                <span className="mt-0.5 shrink-0 text-[#D87D0A]" style={{ fontSize: 10 }}>◈</span>
                {pt}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Confidence Explanation ───────────────────────────────────────────────────

function ConfidenceExplainer({ score, verdict, trustedCount, totalSources }) {
  const { t } = useTranslation();
  const { level, reasons } = getConfidenceExplanation(score, verdict, trustedCount, totalSources, t);
  const color = getReliabilityColor(score);

  return (
    <div className="rounded-xl p-4 bg-[#FBE8CE] border border-[#C3CC9B]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-[#5C6650] uppercase tracking-widest">{t('results.confidenceExplained', 'Confidence Explained')}</span>
        <span className="text-sm font-black" style={{ color }}>{level} ({score}%)</span>
      </div>
      <AnimatedBar value={score} color={color} height={5} />
      <div className="mt-3 space-y-1.5">
        {reasons.slice(0, 3).map((r, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] text-[#5C6650] leading-relaxed">
            <span style={{ color, fontSize: 9, marginTop: 3, flexShrink: 0 }}>▸</span>
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Enriched Source Card ─────────────────────────────────────────────────────

function SourceCard({ src, index }) {
  const { t } = useTranslation();
  const domain = getDomain(src.url);
  const pub = publisherReliability(src, t);
  const displayName = src.source || domain || 'Trusted Source';

  return (
    <motion.a
      href={src.url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index }}
      className="group block bg-[#FBE8CE] hover:bg-[#FBE8CE]/70 border border-[#C3CC9B] hover:border-[#9AB17A] rounded-xl p-4 transition-all duration-200 cursor-pointer no-underline"
      onClick={e => { if (!src.url) e.preventDefault(); }}
    >
      <div className="flex items-start gap-3">
        {/* Publisher icon */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: '#E4DFB5', border: '1px solid #C3CC9B' }}>
          <Newspaper size={14} style={{ color: '#768E56' }} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Publisher name + trust badge */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#232B1B] truncate">{displayName}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: pub.color + '18', color: pub.color }}>
              {pub.label}
            </span>
          </div>
          {/* Why trusted */}
          <p className="text-[10px] text-[#5C6650] mb-1.5 leading-snug">{pub.reason}</p>
          {/* Article title */}
          <p className="text-sm font-medium text-[#232B1B] leading-snug line-clamp-2 group-hover:text-[#768E56] transition-colors">
            {src.title || 'Untitled article'}
          </p>
          {/* Open link */}
          {src.url && (
            <div className="flex items-center gap-1 mt-2">
              <span className="text-[10px] text-[#5C6650] group-hover:text-[#768E56] transition-colors font-medium">{t('results.openArticle', 'Open article')}</span>
              <ExternalLink size={9} className="text-[#5C6650]/50 group-hover:text-[#768E56] transition-colors" />
            </div>
          )}
        </div>
      </div>
    </motion.a>
  );
}

// ─── Claim Card ──────────────────────────────────────────────────────────────

function ClaimCard({ claim, index }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const cfg = getVerdict(claim.verdict, t);
  const { Icon } = cfg;
  const bullets = splitReasoning(claim.reasoning);
  const trustedCount = claim.sources ? claim.sources.filter(s => publisherReliability(s, t).tier <= 2).length : 0;
  const totalSources = claim.sources?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index }}
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: cfg.border, background: '#E4DFB5' }}
    >
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 p-4 text-left transition-colors hover:bg-[#FBE8CE]/40"
      >
        <Icon size={17} style={{ color: cfg.color, marginTop: 2, flexShrink: 0 }} strokeWidth={2} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#232B1B] leading-relaxed line-clamp-2">
            {claim.text}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 mt-0.5">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
            {cfg.label}
          </span>
          {open
            ? <ChevronUp size={14} className="text-[#5C6650]" />
            : <ChevronDown size={14} className="text-[#5C6650]" />}
        </div>
      </button>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t px-5 pb-5 pt-4 space-y-4"
              style={{ borderColor: cfg.border + '40', background: '#FBE8CE' }}>

              {/* Confidence explained */}
              {typeof claim.confidence === 'number' && (
                <ConfidenceExplainer
                  score={claim.confidence}
                  verdict={claim.verdict}
                  trustedCount={trustedCount}
                  totalSources={totalSources}
                />
              )}

              {/* Why we reached this */}
              {bullets.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[#5C6650] uppercase tracking-widest mb-2.5">
                    {t('results.evidenceReasoning', 'Evidence reasoning')}
                  </p>
                  <ul className="space-y-2">
                    {bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-[#232B1B] leading-relaxed">
                        <span style={{ color: '#768E56', marginTop: 3, flexShrink: 0, fontSize: 11 }}>✓</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sources inside claim */}
              {claim.sources && claim.sources.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[#5C6650] uppercase tracking-widest mb-2.5">
                    {t('results.sourceClaimLabel', 'Sources checked')} ({claim.sources.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {claim.sources.slice(0, 4).map((src, i) => (
                      <SourceCard key={i} src={src} index={i} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Key Findings Card ────────────────────────────────────────────────────────

function KeyFindings({ keyFindings }) {
  const { t } = useTranslation();
  if (!keyFindings || keyFindings.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl p-5 bg-[#E4DFB5] border border-[#C3CC9B]"
    >
      <SectionHeading icon={Award}>{t('extension.keyFindings', 'Key Findings')}</SectionHeading>
      <ul className="space-y-3">
        {keyFindings.map((item, i) => {
          const icon = typeof item === 'string' ? '✓' : (item.icon || '✓');
          const text = typeof item === 'string' ? item : item.text;
          const colors = { '✓': '#2E7D32', '⚠': '#D87D0A', '✗': '#C62828' };
          const col = colors[icon] || '#768E56';
          return (
            <li key={i} className="flex items-start gap-3 text-sm text-[#232B1B] leading-relaxed">
              <span className="shrink-0 font-black text-base leading-none" style={{ color: col }}>{icon}</span>
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

// ─── Verified Facts Card ──────────────────────────────────────────────────────

function VerifiedFacts({ verifiedFacts }) {
  const { t } = useTranslation();
  if (!verifiedFacts || verifiedFacts.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="rounded-2xl p-5 bg-[#E4DFB5] border border-[#C3CC9B]"
    >
      <SectionHeading icon={CircleCheckBig} iconColor="#2E7D32">{t('extension.verifiedFacts', 'Verified Facts')}</SectionHeading>
      <ul className="space-y-3">
        {verifiedFacts.map((fact, i) => {
          const text = typeof fact === 'string' ? fact : (fact.text || fact);
          return (
            <li key={i} className="flex items-start gap-3 text-sm text-[#232B1B] leading-relaxed">
              <span className="shrink-0 font-black text-base leading-none text-[#2E7D32]">✓</span>
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

// ─── Final Assessment Card ────────────────────────────────────────────────────

function FinalAssessment({ finalAssessment }) {
  const { t } = useTranslation();
  if (!finalAssessment) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl p-5 bg-[#E4DFB5] border border-[#C3CC9B]"
    >
      <SectionHeading icon={Award}>{t('extension.finalAssessment', 'Final Assessment')}</SectionHeading>
      <p className="text-sm text-[#232B1B] leading-relaxed font-medium">{finalAssessment}</p>
    </motion.div>
  );
}

// ─── Timeline Card ────────────────────────────────────────────────────────────

function Timeline({ timeline }) {
  const { t } = useTranslation();
  if (!timeline || typeof timeline !== 'object' || !Object.values(timeline).some(v => v)) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22 }}
      className="rounded-2xl p-5 bg-[#E4DFB5] border border-[#C3CC9B]"
    >
      <SectionHeading icon={Clock}>{t('extension.timeline', 'Timeline')}</SectionHeading>
      <div className="space-y-4">
        {timeline.claimPublished && (
          <div className="flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#768E56] shrink-0 mt-1.5" />
            <div>
              <p className="text-[10px] font-black text-[#5C6650] uppercase tracking-wider">{t('extension.claimPublished', 'Claim First Appeared')}</p>
              <p className="text-sm font-semibold text-[#232B1B]">{timeline.claimPublished}</p>
            </div>
          </div>
        )}
        {timeline.majorCoverage && (
          <div className="flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D87D0A] shrink-0 mt-1.5" />
            <div>
              <p className="text-[10px] font-black text-[#5C6650] uppercase tracking-wider">{t('extension.majorCoverage', 'Major Media Coverage')}</p>
              <p className="text-sm font-semibold text-[#232B1B]">{timeline.majorCoverage}</p>
            </div>
          </div>
        )}
        {timeline.officialConfirmation && (
          <div className="flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2E7D32] shrink-0 mt-1.5" />
            <div>
              <p className="text-[10px] font-black text-[#5C6650] uppercase tracking-wider">{t('extension.officialConfirmationLabel', 'Official Confirmation')}</p>
              <p className="text-sm font-semibold text-[#232B1B]">{timeline.officialConfirmation}</p>
            </div>
          </div>
        )}
        {timeline.verificationCompleted && (
          <div className="flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#5C6650] shrink-0 mt-1.5" />
            <div>
              <p className="text-[10px] font-black text-[#5C6650] uppercase tracking-wider">{t('extension.verificationCompleted', 'Verification Completed')}</p>
              <p className="text-sm font-semibold text-[#232B1B]">{new Date(timeline.verificationCompleted).toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { checkId: paramCheckId } = useParams();
  const [showShare, setShowShare] = useState(false);
  const [fetchedResult, setFetchedResult] = useState(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const result = location.state?.result || fetchedResult;

  useEffect(() => {
    if (location.state?.result) return;
    if (!paramCheckId) return;

    setFetchLoading(true);
    setFetchError('');
    getHistoryItem(paramCheckId)
      .then(({ data }) => setFetchedResult(data))
      .catch((err) => setFetchError(err.response?.data?.message || 'Failed to load saved report'))
      .finally(() => setFetchLoading(false));
  }, [paramCheckId, location.state?.result]);

  if (fetchLoading) {
    return (
      <div className="min-h-screen bg-[#FBE8CE] flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="w-8 h-8 border-2 border-[#C3CC9B] border-t-[#768E56] rounded-full animate-spin" />
        <p className="text-[#5C6650] text-sm">{t('results.loadingSavedReport', 'Loading saved report…')}</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-[#FBE8CE] flex flex-col items-center justify-center gap-4 text-center px-4">
        <ShieldQuestion size={40} className="text-[#5C6650]/40" />
        <p className="text-[#C62828] text-sm font-medium">{fetchError}</p>
        <Link to="/history" className="bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE] font-bold px-5 py-2 rounded-xl text-sm no-underline transition-all">{t('results.backToHistory', '← Back to History')}</Link>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-[#FBE8CE] flex flex-col items-center justify-center gap-4 text-center px-4">
        <ShieldQuestion size={40} className="text-[#5C6650]/40" />
        <p className="text-[#5C6650] text-sm">{t('results.noResult', 'No results to display. Please run an analysis first.')}</p>
        <Link to="/analyze" className="bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE] font-bold px-5 py-2 rounded-xl text-sm no-underline transition-all">{t('results.backAnalyze', '← Back to Analyze')}</Link>
      </div>
    );
  }

  const {
    inputType, trustScore, aiLikelihood, aiScore, aiReasoning,
    sourceCredibility, detectedLanguage,
    claims = [], checkId, apiWorking,
    keyFindings = [], verifiedFacts = [], finalAssessment, timeline,
    // URL classification (only present for URL inputs)
    pageType, pageTypeLabel, pageTypeDescription, pageVerdict,
    // image
    verdict: imgVerdict, confidence: imgConf,
    aiProbability, deepfakeProbability, manipulationProbability,
    metadataIntegrity, findings = [], summary: imgSummary,
  } = result;

  const isImage = inputType === 'image';
  const isSpecialUrlType = !isImage && pageType && pageType !== 'news';

  // Determine overall verdict
  const rawVerdict = isImage
    ? imgVerdict
    : (pageVerdict || (trustScore >= 70 ? 'Supported' : trustScore >= 40 ? 'Misleading' : 'Contradicted'));
  const cfg = getVerdict(rawVerdict, t);
  const { Icon: VerdictIcon } = cfg;

  const displayScore = isImage ? Math.round(imgConf ?? 50) : Math.round(trustScore ?? 50);
  const reliabilityColor = getReliabilityColor(displayScore);

  // Stats
  const supported    = claims.filter(c => ['Supported', 'True'].includes(c.verdict)).length;
  const contradicted = claims.filter(c => ['Contradicted', 'False', 'Misleading'].includes(c.verdict)).length;
  const unverified   = claims.length - supported - contradicted;

  // Summary sentence
  const summaryBullets = splitReasoning(aiReasoning || imgSummary || '');
  const firstSummary = summaryBullets[0] || cfg.microcopy;

  // Unique sources across all claims
  const allSrc = claims.flatMap(c => c.sources || []);
  const seenUrls = new Set();
  const uniqueSources = allSrc.filter(s => {
    const key = s.url || s.title || '';
    if (!key || seenUrls.has(key)) return false;
    seenUrls.add(key);
    return true;
  }).slice(0, 8);

  // Global trust metrics
  const allTrustedCount = uniqueSources.filter(s => publisherReliability(s, t).tier <= 2).length;
  const totalSourceCount = uniqueSources.length;

  // Metrics
  const evidenceStrength = scoreToLabel(Math.round(sourceCredibility ?? 0), t);

  // Show misleading context?
  const showMissingContext = ['Misleading', 'PARTIALLY_TRUE'].includes(rawVerdict) && !isImage;

  return (
    <div className="min-h-screen bg-[#FBE8CE] text-[#232B1B] font-sans">

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-5 py-3.5 bg-[#FBE8CE]/90 backdrop-blur-lg border-b border-[#C3CC9B]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/analyze')}
            className="flex items-center gap-1.5 text-xs text-[#5C6650] hover:text-[#232B1B] transition-colors font-semibold">
            <ArrowLeft size={14} />
            {t('results.newAnalysisBtn', 'New Analysis')}
          </button>
          <span className="text-[#C3CC9B]">|</span>
          <SatyaScanLogo />
        </div>
        <div className="flex items-center gap-2">
          {/* Evidence-first tagline */}
          <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-[#5C6650]/60">
            <ShieldCheck size={10} style={{ color: '#768E56' }} />
            {t('results.independentVerification', 'Independent Verification')}
          </span>
          {checkId && (
            <button onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors bg-[#E4DFB5] hover:bg-[#E4DFB5]/70 text-[#232B1B] border border-[#C3CC9B]">
              <Share2 size={12} />
              {t('results.share', 'Share')}
            </button>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* API degraded warning */}
        {apiWorking === false && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm bg-[#D87D0A]/10 border border-[#D87D0A]/20">
            <TriangleAlert size={16} className="text-[#D87D0A] shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[#D87D0A]">{t('results.limitedAnalysis', 'Limited analysis — evidence retrieval running in fallback mode')}</p>
              <p className="text-[#5C6650] text-xs mt-0.5">{t('results.limitedAnalysisDesc', 'Results are based on partial evidence only. Manual verification is recommended.')}</p>
            </div>
          </motion.div>
        )}

        {/* ── PAGE TYPE BANNER (non-news URL inputs only) ─────────────────── */}
        {isSpecialUrlType && (
          <PageTypeBanner
            pageType={pageType}
            pageTypeLabel={pageTypeLabel}
            pageTypeDescription={pageTypeDescription}
          />
        )}

        {/* ── HERO CARD ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl overflow-hidden bg-[#E4DFB5]"
          style={{ border: `1px solid ${cfg.border}` }}
        >
          {/* Top status bar */}
          <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${cfg.color}80, ${cfg.color}20)` }} />

          <div className="p-6">
            {/* Verdict row */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {/* Label above */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#5C6650]">
                    {isImage ? t('results.imageAuthenticityReport', 'Image Authenticity Report')
                    : inputType === 'url'
                      ? (PAGE_TYPE_CONFIG[pageType] ? t(PAGE_TYPE_CONFIG[pageType].reportLabelKey, pageTypeLabel) : t('results.urlVerificationReport', 'URL Verification Report'))
                      : t('results.factCheckReport', 'Fact-Check Report')}
                  </span>
                  {detectedLanguage && detectedLanguage !== 'unknown' && detectedLanguage !== 'en' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#768E56]/15 text-[#768E56] border border-[#768E56]/25">
                      {detectedLanguage.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Main verdict */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-xl" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                    <VerdictIcon size={22} style={{ color: cfg.color }} strokeWidth={2} />
                  </div>
                  <div>
                    <h1 className="text-3xl font-black leading-none tracking-tight" style={{ color: cfg.color }}>
                      {cfg.label}
                    </h1>
                  </div>
                </div>

                {/* Microcopy */}
                <p className="text-sm text-[#5C6650] leading-relaxed mb-4 max-w-lg">{cfg.microcopy}</p>

                {/* Verification Summary */}
                {firstSummary && (
                  <div className="rounded-xl p-4 bg-[#FBE8CE] border border-[#C3CC9B]">
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck size={13} style={{ color: '#768E56', marginTop: 3, flexShrink: 0 }} />
                      <p className="text-sm text-[#232B1B] leading-relaxed">
                        <span className="font-bold text-[#232B1B]">{t('results.verificationSummary', 'Verification Summary')} — </span>
                        {firstSummary}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Score ring */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <ReliabilityRing score={displayScore} />
                <p className="text-[10px] text-[#5C6650] text-center leading-tight">
                  {t('results.overallReliability', 'Overall\nReliability').split('\n').map((p, idx) => (
                    <span key={idx}>{p}{idx === 0 && <br />}</span>
                  ))}
                </p>
              </div>
            </div>

            {/* Claim stat pills */}
            {!isImage && claims.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#C3CC9B]">
                {supported > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#2E7D32]/10 text-[#2E7D32] border border-[#2E7D32]/20">
                    <CircleCheckBig size={11} strokeWidth={2.5} />
                    {supported} {t('results.evidenceSupported', 'evidence-supported')}
                  </span>
                )}
                {contradicted > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#C62828]/10 text-[#C62828] border border-[#C62828]/20">
                    <CircleX size={11} strokeWidth={2.5} />
                    {contradicted} {t('results.disputedBySources', 'disputed by sources')}
                  </span>
                )}
                {unverified > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#5C6650]/10 text-[#5C6650] border border-[#5C6650]/20">
                    <ShieldQuestion size={11} strokeWidth={2} />
                    {unverified} {t('results.insufficientEvidence', 'insufficient evidence')}
                  </span>
                )}
                {totalSourceCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#768E56]/10 text-[#768E56] border border-[#768E56]/20">
                    <Globe size={11} strokeWidth={2} />
                    {totalSourceCount} {t('results.sourcesChecked', 'sources checked')}
                  </span>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* ── CAN I TRUST THIS? ──────────────────────────────────────────────── */}
        {!isImage && rawVerdict !== 'Informational' && (
          <TrustCard
            score={displayScore}
            verdict={rawVerdict}
            trustedCount={allTrustedCount}
            totalSources={totalSourceCount}
          />
        )}

        {/* ── MISSING CONTEXT ────────────────────────────────────────────────── */}
        {showMissingContext && (
          <MissingContext verdict={rawVerdict} reasoning={aiReasoning} />
        )}

        {/* ── KEY FINDINGS ──────────────────────────────────────────────────── */}
        {!isImage && keyFindings && keyFindings.length > 0 && (
          <KeyFindings keyFindings={keyFindings} />
        )}

        {/* ── VERIFIED FACTS ────────────────────────────────────────────────── */}
        {!isImage && verifiedFacts && verifiedFacts.length > 0 && (
          <VerifiedFacts verifiedFacts={verifiedFacts} />
        )}

        {/* ── HOW WE VERIFIED ───────────────────────────────────────────────── */}
        <HowWeVerified />

        {/* ── VERIFICATION DETAILS ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-2xl p-5 bg-[#E4DFB5] border border-[#C3CC9B]"
        >
          <SectionHeading icon={TrendingUp}>{t('results.evidenceAnalysisMetrics', 'Evidence Analysis Metrics')}</SectionHeading>

          {isImage ? (
            <div className="space-y-4">
              {[
                { label: t('results.aiGeneratedProbability', 'AI Generated Probability'), value: aiProbability ?? 0, inverse: true },
                { label: t('results.deepfakeProbability', 'Deepfake Probability'), value: deepfakeProbability ?? 0, inverse: true },
                { label: t('results.manipulationProbability', 'Manipulation Probability'), value: manipulationProbability ?? 0, inverse: true },
              ].map(({ label, value, inverse }) => {
                const color = inverse ? (value > 50 ? '#C62828' : '#2E7D32') : getReliabilityColor(value);
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-[#5C6650] font-bold">{label}</span>
                      <span className="font-bold" style={{ color }}>
                        {value > 70 ? t('results.high', 'High') : value > 40 ? t('results.moderate', 'Moderate') : t('results.low', 'Low')} ({value}%)
                      </span>
                    </div>
                    <AnimatedBar value={value} color={color} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Source credibility bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-[#5C6650] font-bold">{t('results.sourceCredibility', 'Source Credibility')}</span>
                  <span className="font-bold" style={{ color: getReliabilityColor(sourceCredibility ?? 0) }}>
                    {evidenceStrength} ({Math.round(sourceCredibility ?? 0)}%)
                  </span>
                </div>
                <AnimatedBar value={sourceCredibility ?? 0} color={getReliabilityColor(sourceCredibility ?? 0)} />
                <p className="text-[10px] text-[#5C6650]/80 mt-1">
                  {t('results.sourceCredibilityDesc', 'Based on publisher trust tier and editorial standards of retrieved sources')}
                </p>
              </div>

              {/* Overall confidence */}
              <ConfidenceExplainer
                score={displayScore}
                verdict={rawVerdict}
                trustedCount={allTrustedCount}
                totalSources={totalSourceCount}
              />

              {/* Trusted source ratio */}
              {totalSourceCount > 0 && (
                <div className="flex items-center gap-3 text-xs text-[#5C6650]">
                  <ShieldCheck size={12} style={{ color: '#768E56' }} />
                  <span>
                    {t('results.sourcesFromVerified', '{{count}} of {{total}} sources are from verified publishers')
                      .replace('{{count}}', allTrustedCount)
                      .replace('{{total}}', totalSourceCount)}
                  </span>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* ── IMAGE METADATA ────────────────────────────────────────────────── */}
        {isImage && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* Metadata status */}
            <div className="rounded-2xl p-5 bg-[#E4DFB5] border border-[#C3CC9B]">
              <SectionHeading icon={ShieldCheck}>{t('results.metadataStatus', 'Metadata Status')}</SectionHeading>
              {(() => {
                const intact = metadataIntegrity === 'INTACT';
                const stripped = metadataIntegrity === 'STRIPPED';
                const mColor = intact ? '#2E7D32' : stripped ? '#D87D0A' : '#C62828';
                const mLabel = intact ? t('results.metadataOriginal', 'Original & Intact') : stripped ? t('results.metadataRemoved', 'Metadata Removed') : t('results.metadataSuspicious', 'Suspicious');
                return (
                  <>
                    <p className="text-lg font-bold mb-1.5" style={{ color: mColor }}>{mLabel}</p>
                    <p className="text-xs text-[#5C6650] leading-relaxed">
                      {intact
                        ? t('results.metadataOriginalDesc', 'The image retains its original camera data — a strong sign of authenticity.')
                        : stripped
                        ? t('results.metadataRemovedDesc', 'Metadata was removed. Common on social media, but can sometimes indicate editing.')
                        : t('results.metadataSuspiciousDesc', 'Modified metadata was detected, which may indicate tampering.')}
                    </p>
                  </>
                );
              })()}
            </div>

            {/* Findings */}
            {findings.length > 0 && (
              <div className="rounded-2xl p-5 bg-[#E4DFB5] border border-[#C3CC9B]">
                <SectionHeading icon={FileText}>{t('results.whatWeFound', 'What We Found')}</SectionHeading>
                <ul className="space-y-2">
                  {findings.slice(0, 5).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#232B1B] leading-relaxed">
                      <span style={{ color: '#768E56', marginTop: 4, fontSize: 10, flexShrink: 0 }}>✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}

        {/* ── WHY WE REACHED THIS CONCLUSION ───────────────────────────────── */}
        {!isImage && summaryBullets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="rounded-2xl p-5 bg-[#E4DFB5] border border-[#C3CC9B]"
          >
            <SectionHeading icon={FileText}>{t('results.whyWeReached', 'Why We Reached This Conclusion')}</SectionHeading>
            <p className="text-[11px] text-[#5C6650]/60 mb-3 leading-relaxed">
              {t('results.whyWeReachedDesc', 'These conclusions are derived from cross-referencing evidence across independent sources — not from a single AI response.')}
            </p>
            <ul className="space-y-3">
              {summaryBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-[#232B1B] leading-relaxed">
                  <span className="mt-0.5 shrink-0 flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold bg-[#768E56]/20 text-[#768E56]">✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* ── FINAL ASSESSMENT ─────────────────────────────────────────────── */}
        {!isImage && finalAssessment && (
          <FinalAssessment finalAssessment={finalAssessment} />
        )}

        {/* ── TIMELINE ──────────────────────────────────────────────────────── */}
        {!isImage && timeline && (
          <Timeline timeline={timeline} />
        )}

        {/* Image summary */}
        {isImage && imgSummary && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="rounded-2xl p-5 bg-[#E4DFB5] border border-[#C3CC9B]"
          >
            <SectionHeading icon={FileText}>{t('results.analysisSummary', 'Analysis Summary')}</SectionHeading>
            <p className="text-sm text-[#232B1B] leading-relaxed">{imgSummary}</p>
          </motion.div>
        )}

        {/* ── EVIDENCE CONSENSUS ────────────────────────────────────────────── */}
        {!isImage && claims.length > 0 && (
          <EvidenceConsensus claims={claims} />
        )}

        {/* ── CLAIM BY CLAIM ────────────────────────────────────────────────── */}
        {!isImage && claims.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#232B1B]/80">
                <BadgeCheck size={15} style={{ color: '#768E56' }} strokeWidth={2} />
                {t('results.claimByClaimBreakdown', 'Claim-by-Claim Breakdown')}
              </h2>
              <span className="text-[11px] text-[#5C6650]/60 font-medium">{t('results.tapClaimForEvidence', 'Tap any claim to see evidence')}</span>
            </div>
            <div className="space-y-2.5">
              {claims.map((claim, i) => <ClaimCard key={i} claim={claim} index={i} />)}
            </div>
          </motion.div>
        )}

        {/* ── FOOTER NOTE ───────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl p-5 text-center bg-[#E4DFB5] border border-[#C3CC9B]"
        >
          <ShieldCheck size={18} style={{ color: '#768E56', margin: '0 auto 10px' }} strokeWidth={1.5} />
          <p className="text-xs font-bold text-[#232B1B] mb-1">{t('results.evidenceBasedVerification', 'Evidence-Based Verification')}</p>
          <p className="text-[11px] text-[#5C6650] leading-relaxed max-w-sm mx-auto">
            {t('results.evidenceBasedDesc', 'SatyaScan verifies claims through independent source retrieval and cross-reference analysis. You can evaluate every source used in this report.')}
          </p>
        </motion.div>

      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="mt-6 px-5 py-5 flex items-center justify-between bg-[#E4DFB5] border-t border-[#C3CC9B]">
        <SatyaScanLogo />
        <p className="text-[11px] text-[#5C6650]">{t('results.footerCopy', '© 2025 SatyaScan — Independent Verification')}</p>
      </div>

      {showShare && checkId && (
        <ShareModal checkId={checkId} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
