import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, FileText, Link2, Image, Video, Trash2, ChevronLeft, ChevronRight, History, Lock } from 'lucide-react';
import { getHistory, deleteHistoryItem, deleteAllHistory } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';

function getTrustColor(score) {
  if (score >= 70) return '#2E7D32';
  if (score >= 40) return '#D87D0A';
  return '#C62828';
}

function getVerdictSummary(claims = [], inputType, imageVerdict, visualAuthenticity, ocrClaimVerification, check = {}) {
  if (inputType === 'image') {
    const vStatus = visualAuthenticity?.status || imageVerdict?.replace(/_/g, ' ') || 'Visual analysis';
    const oVerdict = ocrClaimVerification?.verdict ? ` · Text: ${ocrClaimVerification.verdict}` : '';
    return `Image: ${vStatus}${oVerdict}`;
  }
  if (inputType === 'video') {
    const vStatus = imageVerdict || (check.deepfakePercentage > 0 ? `${check.deepfakePercentage}% Flagged` : 'Analyzed');
    const fStats = check.totalFramesAnalyzed ? ` · ${check.deepfakeFrames || 0}/${check.totalFramesAnalyzed} frames` : '';
    return `Video: ${vStatus}${fStats}`;
  }
  const counts = { True: 0, Supported: 0, False: 0, Contradicted: 0, Unverified: 0, Misleading: 0 };
  claims.forEach((c) => { if (c.verdict in counts) counts[c.verdict]++; });
  const falseCount = counts.False + counts.Contradicted + counts.Misleading;
  const trueCount = counts.True + counts.Supported;
  const unverified = counts.Unverified;
  return `${trueCount} verified · ${falseCount} disputed · ${unverified} unverified`;
}

function InputTypeBadge({ type }) {
  const config = {
    text: { icon: FileText, label: 'Text', color: '#768E56' },
    url: { icon: Link2, label: 'URL', color: '#5E35B1' },
    image: { icon: Image, label: 'Image', color: '#00796B' },
    video: { icon: Video, label: 'Video', color: '#D87D0A' },
  };
  const { icon: Icon, label, color } = config[type] || config.text;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      <Icon size={10} strokeWidth={2.5} />
      {label}
    </span>
  );
}

export default function HistoryPage() {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [checks, setChecks] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    setLoading(true);
    setError('');
    getHistory(page)
      .then(({ data }) => {
        setChecks(data.checks || []);
        setPagination(data.pagination);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load history'))
      .finally(() => setLoading(false));
  }, [page, isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#FBE8CE] flex flex-col items-center justify-center text-center px-4 pt-20 font-sans">
        <div className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl max-w-sm w-full text-center py-12 px-6 shadow-xl">
          <Lock size={36} className="mx-auto mb-4 text-[#5C6650]/60" strokeWidth={1.5} />
          <p className="text-[#232B1B] mb-6 font-medium">{t('history.loginRequired')}</p>
          <Link to="/login" className="inline-block bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE] font-bold text-sm px-6 py-2.5 rounded-xl transition-all shadow-md shadow-[#232B1B]/10 no-underline">
            {t('history.loginLink')} →
          </Link>
        </div>
      </div>
    );
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm(t('history.deleteConfirm') || 'Delete this check?')) return;
    setDeletingId(id);
    try {
      await deleteHistoryItem(id);
      setChecks((prev) => prev.filter((c) => c._id !== id));
      if (pagination && pagination.totalCount) {
        setPagination((prev) => ({
          ...prev,
          totalCount: Math.max(0, prev.totalCount - 1),
        }));
      }
    } catch {
      alert(t('history.deleteFailed') || 'Failed to delete history item');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (checks.length === 0) return;
    if (!confirm(t('history.clearAllConfirm') || 'Are you sure you want to delete all verification history? This cannot be undone.')) return;
    setClearingAll(true);
    try {
      await deleteAllHistory();
      setChecks([]);
      setPagination(null);
    } catch {
      alert(t('history.clearFailed') || 'Failed to clear all history');
    } finally {
      setClearingAll(false);
    }
  };

  const handleClick = (check) => {
    if (check.inputType === 'video') {
      navigate('/video-analysis', { state: { preloadedResult: check } });
      return;
    }
    navigate(`/results/${check._id}`);
  };

  return (
    <div className="min-h-screen bg-[#FBE8CE] text-[#232B1B] font-sans pt-20">
      <div className="max-w-[1150px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Header with Clear All Button */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-[#768E56]/15 border border-[#768E56]/25">
                <History size={20} style={{ color: '#768E56' }} strokeWidth={2} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#232B1B] tracking-tight">
                {t('history.title')}
              </h1>
            </div>
            <p className="text-sm text-[#5C6650] max-w-lg">
              {pagination && pagination.totalCount > 0
                ? `${pagination.totalCount} saved ${pagination.totalCount === 1 ? 'analysis' : 'analyses'} — tap any report to reopen it`
                : 'Your saved verification reports'}
            </p>
            <div className="w-16 h-1 bg-[#768E56] rounded-full mt-4" />
          </div>

          {!loading && checks.length > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleClearAll}
              disabled={clearingAll}
              className="self-start sm:self-center flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs sm:text-sm font-bold shadow-sm transition-all hover:shadow cursor-pointer disabled:opacity-50"
            >
              <Trash2 size={16} className="text-red-600" />
              <span>{clearingAll ? (t('history.clearing') || 'Clearing...') : (t('history.clearAll') || 'Clear All History')}</span>
            </motion.button>
          )}
        </motion.div>

        {loading && (
          <div className="flex items-center justify-center gap-3 py-20 text-[#5C6650] font-medium">
            <span className="w-5 h-5 border-2 border-[#C3CC9B] border-t-[#768E56] rounded-full animate-spin" />
            {t('history.loading')}…
          </div>
        )}

        {error && (
          <div className="rounded-2xl p-4 mb-6 bg-[#C62828]/10 border border-[#C62828]/20 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {!loading && checks.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl text-center py-16 px-6 shadow-sm"
          >
            <FileText size={40} className="mx-auto mb-4 text-[#5C6650]/40" strokeWidth={1.5} />
            <p className="text-[#5C6650] mb-4 font-medium">{t('history.empty')}</p>
            <Link
              to="/analyze"
              className="inline-block bg-[#232B1B] hover:bg-[#343F29] text-[#FBE8CE] font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-md shadow-[#232B1B]/10 no-underline"
            >
              {t('history.emptyLink')} →
            </Link>
          </motion.div>
        )}

        {/* History cards */}
        <div className="space-y-3">
          {checks.map((check, i) => {
            const displayScore = check.inputType === 'image'
              ? Math.round(check.imageConfidence ?? check.trustScore ?? 0)
              : Math.round(check.trustScore ?? 0);
            const scoreColor = getTrustColor(displayScore);

            return (
              <motion.div
                key={check._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                role="button"
                tabIndex={0}
                onClick={() => handleClick(check)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(check); }}
                className="group bg-[#E4DFB5] border border-[#C3CC9B] rounded-2xl p-5 shadow-sm cursor-pointer hover:border-[#768E56]/50 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#768E56]/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                      <InputTypeBadge type={check.inputType} />
                      {check.language && check.language !== 'unknown' && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#768E56]/15 text-[#768E56] border border-[#768E56]/25">
                          {check.language}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#5C6650]/60 font-medium">
                        <Clock size={10} />
                        {new Date(check.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-[#232B1B] text-sm font-medium leading-snug line-clamp-2 mb-1.5">
                      {check.originalText?.slice(0, 160)}{check.originalText?.length > 160 ? '…' : ''}
                    </p>

                    <p className="text-[#5C6650]/70 text-xs">
                      {getVerdictSummary(check.claims, check.inputType, check.imageVerdict, check.visualAuthenticity, check.ocrClaimVerification, check)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <div className="text-center">
                      <span className="text-2xl sm:text-3xl font-extrabold tabular-nums" style={{ color: scoreColor }}>
                        {displayScore}
                      </span>
                      <p className="text-[10px] text-[#5C6650]/60 font-medium mt-0.5">{t('history.trust')}</p>
                    </div>

                    <button
                      onClick={(e) => handleDelete(check._id, e)}
                      disabled={deletingId === check._id}
                      className="flex items-center gap-1.5 text-xs text-red-700/80 hover:text-red-700 bg-red-50/70 hover:bg-red-100/80 px-2.5 py-1.5 rounded-lg border border-red-200/80 disabled:opacity-50 font-semibold transition-all"
                      aria-label={t('history.delete')}
                      title={t('history.delete')}
                    >
                      <Trash2 size={13} className="text-red-600" />
                      <span>{deletingId === check._id ? t('history.deleting') : t('history.delete')}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 mt-10">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex items-center gap-1 bg-[#E4DFB5] hover:bg-[#E4DFB5]/70 text-[#232B1B] border border-[#C3CC9B] font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-40 transition-all"
            >
              <ChevronLeft size={14} />
              {t('history.prev')}
            </button>
            <span className="text-[#5C6650] text-sm font-medium px-2">
              {t('history.page')} {pagination.page} {t('history.of')} {pagination.totalPages}
            </span>
            <button
              disabled={page === pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex items-center gap-1 bg-[#E4DFB5] hover:bg-[#E4DFB5]/70 text-[#232B1B] border border-[#C3CC9B] font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-40 transition-all"
            >
              {t('history.next')}
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
