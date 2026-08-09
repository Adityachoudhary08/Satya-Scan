import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye, FileText, CircleCheckBig, CircleX, TriangleAlert,
  ShieldQuestion, BadgeCheck, ExternalLink, Search, ShieldCheck, ChevronDown
} from 'lucide-react';

const VISUAL_CONFIG = {
  Real: {
    color: '#2E7D32',
    bg: 'rgba(46, 125, 50, 0.10)',
    border: 'rgba(46, 125, 50, 0.25)',
    badgeBg: 'rgba(46, 125, 50, 0.15)',
    Icon: CircleCheckBig,
    label: 'Real',
  },
  'Likely Real': {
    color: '#5F7A38', bg: 'rgba(95, 122, 56, 0.10)', border: 'rgba(95, 122, 56, 0.25)', badgeBg: 'rgba(95, 122, 56, 0.15)', Icon: BadgeCheck, label: 'Likely Real',
  },
  'Analysis Limited': {
    color: '#5C6650', bg: 'rgba(78, 93, 76, 0.10)', border: 'rgba(78, 93, 76, 0.25)', badgeBg: 'rgba(78, 93, 76, 0.15)', Icon: ShieldQuestion, label: 'Analysis Limited',
  },
  'AI Generated': {
    color: '#C62828',
    bg: 'rgba(198, 40, 40, 0.10)',
    border: 'rgba(198, 40, 40, 0.25)',
    badgeBg: 'rgba(198, 40, 40, 0.15)',
    Icon: CircleX,
    label: 'AI Generated',
  },
  Manipulated: {
    color: '#E65100',
    bg: 'rgba(230, 81, 0, 0.10)',
    border: 'rgba(230, 81, 0, 0.25)',
    badgeBg: 'rgba(230, 81, 0, 0.15)',
    Icon: TriangleAlert,
    label: 'Manipulated',
  },
  'AI Edited': {
    color: '#E65100',
    bg: 'rgba(230, 81, 0, 0.10)',
    border: 'rgba(230, 81, 0, 0.25)',
    badgeBg: 'rgba(230, 81, 0, 0.15)',
    Icon: TriangleAlert,
    label: 'AI Edited',
  },
  Deepfake: {
    color: '#C62828',
    bg: 'rgba(198, 40, 40, 0.10)',
    border: 'rgba(198, 40, 40, 0.25)',
    badgeBg: 'rgba(198, 40, 40, 0.15)',
    Icon: CircleX,
    label: 'Deepfake',
  },
  Uncertain: {
    color: '#5C6650',
    bg: 'rgba(78, 93, 76, 0.10)',
    border: 'rgba(78, 93, 76, 0.25)',
    badgeBg: 'rgba(78, 93, 76, 0.15)',
    Icon: ShieldQuestion,
    label: 'Uncertain',
  },
};

const CLAIM_CONFIG = {
  True: {
    color: '#2E7D32',
    bg: 'rgba(46, 125, 50, 0.10)',
    border: 'rgba(46, 125, 50, 0.25)',
    Icon: CircleCheckBig,
    label: 'True',
  },
  Supported: {
    color: '#2E7D32',
    bg: 'rgba(46, 125, 50, 0.10)',
    border: 'rgba(46, 125, 50, 0.25)',
    Icon: CircleCheckBig,
    label: 'True',
  },
  False: {
    color: '#C62828',
    bg: 'rgba(198, 40, 40, 0.10)',
    border: 'rgba(198, 40, 40, 0.25)',
    Icon: CircleX,
    label: 'False',
  },
  Contradicted: {
    color: '#C62828',
    bg: 'rgba(198, 40, 40, 0.10)',
    border: 'rgba(198, 40, 40, 0.25)',
    Icon: CircleX,
    label: 'False',
  },
  Misleading: {
    color: '#E65100',
    bg: 'rgba(230, 81, 0, 0.10)',
    border: 'rgba(230, 81, 0, 0.25)',
    Icon: TriangleAlert,
    label: 'Misleading',
  },
  'Partially True': {
    color: '#D87D0A',
    bg: 'rgba(216, 125, 10, 0.10)',
    border: 'rgba(216, 125, 10, 0.25)',
    Icon: BadgeCheck,
    label: 'Partially True',
  },
  Unverified: {
    color: '#5C6650',
    bg: 'rgba(78, 93, 76, 0.10)',
    border: 'rgba(78, 93, 76, 0.25)',
    Icon: ShieldQuestion,
    label: 'Unverified',
  },
};

function normalizeVisualStatus(status) {
  const s = String(status || '').toUpperCase().trim().replace(/[\s-]+/g, '_');
  if (s === 'REAL' || s === 'AUTHENTIC') return 'Real';
  if (s === 'LIKELY_AUTHENTIC' || s === 'LIKELY_REAL') return 'Likely Real';
  if (s === 'AI_GENERATED' || s === 'LIKELY_AI_GENERATED' || s === 'SYNTHETIC') return 'AI Generated';
  if (s === 'MANIPULATED' || s === 'EDITED' || s === 'ALTERED') return 'Manipulated';
  if (s === 'DEEPFAKE' || s === 'FACE_SWAP') return 'Deepfake';
  if (s === 'ANALYSIS_LIMITED' || s === 'LIMITED_ANALYSIS') return 'Analysis Limited';
  return 'Analysis Limited';
}

function normalizeClaimVerdict(verdict) {
  const v = String(verdict || '').toUpperCase().trim();
  if (v === 'TRUE' || v === 'SUPPORTED') return 'True';
  if (v === 'FALSE' || v === 'CONTRADICTED') return 'False';
  if (v === 'MISLEADING') return 'Misleading';
  if (v === 'PARTIALLY_TRUE' || v === 'PARTIAL') return 'Partially True';
  return 'Unverified';
}

function getDomain(url) {
  try {
    return new URL(url || '').hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Left Card: Image Authenticity
 * Analyzes ONLY image pixels. Ignores all text.
 */
function ImageAuthenticityCard({ visual }) {
  const [findingsOpen, setFindingsOpen] = useState(true);
  const rawStatus = visual?.status || 'Uncertain';
  const status = normalizeVisualStatus(rawStatus);
  const cfg = VISUAL_CONFIG[status] || VISUAL_CONFIG.Uncertain;
  const { Icon } = cfg;
  const confidence = typeof visual?.confidence === 'number'
    ? Math.max(0, Math.min(100, Math.round(visual.confidence)))
    : 50;

  const rawEvidence = Array.isArray(visual?.evidence) ? visual.evidence : [];
  const evidence = rawEvidence.filter(Boolean);
  const sourceLabel = visual?.analysisMode === 'gemini_vision' ? 'Gemini Vision'
    : visual?.analysisMode === 'local_fallback' ? 'Local Fallback' : 'Limited Analysis';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl overflow-hidden bg-[#E4DFB5] border flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow h-full"
      style={{ borderColor: cfg.border }}
    >
      {/* Top accent line */}
      <div className="h-1.5 w-full" style={{ background: cfg.color }} />

      <div className="p-6 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-5 pb-3.5 border-b border-[#C3CC9B]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <Eye size={16} style={{ color: cfg.color }} strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#232B1B] tracking-tight leading-none">
                Image Authenticity
              </h2>
              <p className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider mt-1">
                Visual Forensics Only
              </p>
            </div>
          </div>

          <span
            className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0"
            style={{ background: cfg.badgeBg, color: cfg.color, border: `1px solid ${cfg.border}` }}
          >
            {sourceLabel}
          </span>
        </div>

        {/* Status Section */}
        <div className="mb-5">
          <p className="text-[11px] font-bold text-[#5C6650] uppercase tracking-wider mb-2">
            Status:
          </p>
          <div
            className="flex items-center gap-3 p-3.5 rounded-xl transition-all"
            style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'white', border: `1px solid ${cfg.border}` }}
            >
              <Icon size={22} style={{ color: cfg.color }} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight leading-none" style={{ color: cfg.color }}>
                {status}
              </p>
            </div>
          </div>
        </div>

        {/* Confidence Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
            <span className="text-[#5C6650] uppercase tracking-wider">Confidence:</span>
            <span className="text-sm font-black" style={{ color: cfg.color }}>
              {confidence}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden bg-[#C3CC9B]">
            <motion.div
              className="h-full rounded-full"
              style={{ background: cfg.color }}
              initial={{ width: 0 }}
              animate={{ width: `${confidence}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Dedicated "WHY THIS VERDICT?" Section with numbered findings */}
        <div className="mt-5 pt-4 border-t border-[#C3CC9B]">
          <button type="button" onClick={() => setFindingsOpen((open) => !open)} className="w-full flex items-center justify-between gap-2 mb-3 text-left">
            <h3 className="text-xs font-black text-[#232B1B] uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-3.5 rounded-full" style={{ background: cfg.color }} />
              {status === 'Real' || status === 'Likely Real' ? 'AUTHENTICITY INDICATORS' : 'WHY THIS VERDICT?'}
            </h3>
            <span className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: cfg.badgeBg, color: cfg.color, border: `1px solid ${cfg.border}` }}
            >
              {evidence.length} Forensic {evidence.length === 1 ? 'Finding' : 'Findings'}
            </span>
            <ChevronDown size={15} className={`transition-transform ${findingsOpen ? 'rotate-180' : ''}`} style={{ color: cfg.color }} />
            </span>
          </button>

          {findingsOpen && evidence.length > 0 ? (
            <ol className="space-y-2.5">
              {evidence.map((item, idx) => (
                <motion.li
                  key={idx}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * idx }}
                  className="flex items-start gap-3 p-3 rounded-xl bg-[#F6F4EB] border border-[#C3CC9B]/80 text-xs text-[#232B1B] leading-relaxed shadow-xs"
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5 text-white"
                    style={{ background: cfg.color }}
                  >
                    {idx + 1}
                  </span>
                  <span className="font-medium text-[#232B1B] pt-0.5">{item}</span>
                </motion.li>
              ))}
            </ol>
          ) : findingsOpen ? (
            <div className="p-3.5 rounded-xl bg-[#F6F4EB] border border-[#C3CC9B]/80 text-xs text-[#5C6650] italic">
              Standard optical sensor characteristics detected without generative anomalies.
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Right Card: Text Claim Verification
 * Analyzes ONLY text extracted through OCR.
 * Displayed ONLY when a meaningful factual claim is present.
 */
function TextClaimVerificationCard({ ocr }) {
  const extractedText = ocr?.extractedText || '';
  const rawVerdict = ocr?.verdict || 'Unverified';
  const verdict = normalizeClaimVerdict(rawVerdict);
  const cfg = CLAIM_CONFIG[verdict] || CLAIM_CONFIG.Unverified;
  const { Icon } = cfg;

  const confidence = typeof ocr?.confidence === 'number'
    ? Math.max(0, Math.min(100, Math.round(ocr.confidence)))
    : 50;

  const reason = ocr?.reason || 'No reliable sources confirm this claim.';
  const sources = Array.isArray(ocr?.sources) ? ocr.sources.filter(Boolean) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 }}
      className="rounded-2xl overflow-hidden bg-[#E4DFB5] border flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow h-full"
      style={{ borderColor: cfg.border }}
    >
      {/* Top accent line */}
      <div className="h-1.5 w-full" style={{ background: cfg.color }} />

      <div className="p-6 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-5 pb-3.5 border-b border-[#C3CC9B]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <Search size={16} style={{ color: cfg.color }} strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#232B1B] tracking-tight leading-none">
                Text Claim Verification
              </h2>
              <p className="text-[10px] font-bold text-[#5C6650] uppercase tracking-wider mt-1">
                OCR Fact-Check Pipeline
              </p>
            </div>
          </div>

          <span
            className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0"
            style={{ background: 'rgba(118, 142, 86, 0.15)', color: '#232B1B', border: '1px solid rgba(118, 142, 86, 0.3)' }}
          >
            <FileText size={10} className="inline mr-1 -mt-0.5" />
            OCR Text
          </span>
        </div>

        {/* Extracted Text Section */}
        <div className="mb-5">
          <p className="text-[11px] font-bold text-[#5C6650] uppercase tracking-wider mb-2">
            Extracted Text:
          </p>
          <div className="p-3.5 rounded-xl bg-[#FBE8CE] border border-[#C3CC9B]">
            <p className="text-xs sm:text-sm font-semibold text-[#232B1B] leading-relaxed italic break-words">
              "{extractedText}"
            </p>
          </div>
        </div>

        {/* Verdict Section */}
        <div className="mb-5">
          <p className="text-[11px] font-bold text-[#5C6650] uppercase tracking-wider mb-2">
            Verdict:
          </p>
          <div
            className="flex items-center gap-3 p-3.5 rounded-xl transition-all"
            style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'white', border: `1px solid ${cfg.border}` }}
            >
              <Icon size={22} style={{ color: cfg.color }} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight leading-none" style={{ color: cfg.color }}>
                {verdict}
              </p>
            </div>
          </div>
        </div>

        {/* Confidence Section */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
            <span className="text-[#5C6650] uppercase tracking-wider">Confidence:</span>
            <span className="text-sm font-black" style={{ color: cfg.color }}>
              {confidence}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden bg-[#C3CC9B]">
            <motion.div
              className="h-full rounded-full"
              style={{ background: cfg.color }}
              initial={{ width: 0 }}
              animate={{ width: `${confidence}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Reason Section */}
        <div className="mb-5">
          <p className="text-[11px] font-bold text-[#5C6650] uppercase tracking-wider mb-1.5">
            Reason:
          </p>
          <div className="p-3 rounded-xl bg-[#FBE8CE] border border-[#C3CC9B]">
            <p className="text-xs text-[#232B1B] leading-relaxed font-medium">
              {reason}
            </p>
          </div>
        </div>

        {/* Sources Section */}
        <div className="mt-auto pt-4 border-t border-[#C3CC9B]">
          <p className="text-[11px] font-bold text-[#5C6650] uppercase tracking-wider mb-2">
            Sources ({sources.length}):
          </p>
          {sources.length > 0 ? (
            <ul className="space-y-1.5">
              {sources.slice(0, 5).map((src, idx) => {
                const url = src.url || src;
                const title = src.title || (typeof url === 'string' ? getDomain(url) || url : 'Independent Source');
                const domain = typeof url === 'string' ? getDomain(url) : '';

                return (
                  <li key={idx}>
                    <a
                      href={typeof url === 'string' ? url : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#FBE8CE]/50 hover:bg-[#FBE8CE] border border-[#C3CC9B]/60 text-xs text-[#232B1B] hover:text-[#768E56] transition-colors no-underline group"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <ExternalLink size={11} className="shrink-0 text-[#768E56]" />
                        <span className="truncate font-semibold">{title}</span>
                      </div>
                      {domain && (
                        <span className="text-[10px] text-[#5C6650] shrink-0 font-mono">
                          {domain}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[11px] text-[#5C6650] italic">
              No external sources confirm this claim.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Dual-Card Image Analysis View
 *
 * Case 1 & 2 (Meaningful Factual Claim Present):
 * Desktop: Side-by-side [ Image Authenticity | Text Claim Verification ]
 *
 * Case 3 (Image Only / No meaningful claim / Non-claim text):
 * Shows ONLY [ Image Authenticity ]
 */
export default function ImageDualAnalysis({ result }) {
  // Extract visual data (Left Card)
  const visual = result?.visualAuthenticity || {
    status: result?.imageVerdict || result?.verdict || 'Uncertain',
    confidence: result?.imageConfidence ?? result?.confidence ?? 50,
    evidence: result?.findings || result?.evidence || [],
  };

  // Extract OCR fact-check data (Right Card)
  const ocr = result?.ocrClaimVerification || {
    hasMeaningfulClaim: result?.hasMeaningfulClaim ?? !!(result?.extractedText || result?.claims?.[0]?.text),
    hasText: !!(result?.extractedText || result?.claims?.[0]?.text),
    extractedText: result?.extractedText || result?.claims?.[0]?.text || null,
    verdict: result?.claimVerdict || result?.claims?.[0]?.verdict || 'Unverified',
    confidence: result?.claimConfidence ?? result?.claims?.[0]?.confidence ?? (result?.extractedText ? 50 : 0),
    reason: result?.claimReason || result?.claims?.[0]?.reasoning || result?.aiReasoning || 'No reliable sources confirm this claim.',
    sources: result?.sources || result?.claims?.[0]?.sources || [],
  };

  // Determine if Text Claim Verification card should be rendered
  const showClaimCard = !!(
    (ocr.hasMeaningfulClaim ?? true) &&
    ocr.hasText &&
    ocr.extractedText &&
    ocr.extractedText.trim().length > 3
  );

  return (
    <div className="space-y-6">
      {showClaimCard ? (
        /* Case 1 & 2: Two cards side-by-side */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          <ImageAuthenticityCard visual={visual} />
          <TextClaimVerificationCard ocr={ocr} />
        </div>
      ) : (
        /* Case 3: Image only (no text/meaningful claim) - Show ONLY Image Authenticity */
        <div className="max-w-2xl mx-auto w-full">
          <ImageAuthenticityCard visual={visual} />
        </div>
      )}

      {/* Subtle footer notice confirming domain independence */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl p-3.5 bg-[#E4DFB5]/60 border border-[#C3CC9B] flex items-center gap-2.5 text-xs text-[#5C6650]"
      >
        <ShieldCheck size={15} className="text-[#768E56] shrink-0" />
        <p className="leading-relaxed">
          <strong className="text-[#232B1B]">Independent Domains:</strong>{' '}
          {result?.crossAnalysisExplanation || 'Image authenticity evaluates pixel forensics only. Text claim verification evaluates extracted words against independent fact sources.'}
        </p>
      </motion.div>
    </div>
  );
}
