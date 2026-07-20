const mongoose = require('mongoose');

const sourceSchema = new mongoose.Schema(
  {
    url: String,
    title: String,
    source: String,
    trusted: { type: Boolean, default: false },
    snippet: String,
  },
  { _id: false }
);

const claimSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    verdict: {
      type: String,
      default: 'Unverified',
    },
    confidence: { type: Number, min: 0, max: 100 },
    reasoning: String,
    sourceCount: { type: Number, default: 0 },
    trustedSourceCount: { type: Number, default: 0 },
    sources: [sourceSchema],
  },
  { _id: false }
);

const checkSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    inputType: {
      type: String,
      enum: ['text', 'url', 'image', 'page'],
      required: true,
    },
    originalText: { type: String, maxlength: 15000 },

    // ─── Text/URL verification fields ────────────────────────
    trustScore: { type: Number, min: 0, max: 100 },
    aiScore: { type: Number, min: 0, max: 100 },
    aiReasoning: String,
    sourceScore: { type: Number, min: 0, max: 100 },
    claims: [claimSchema],
    pageType: String,
    pageTypeLabel: String,
    pageTypeDescription: String,
    pageVerdict: String,

    // ─── Page analysis fields ────────────────────────────────
    politicalBias: String,
    suspiciousStatements: [
      {
        statement: String,
        reason: String,
      }
    ],
    missingContext: [String],
    recommendation: String,
    articleTitle: String,
    pageTitle: String,
    metaDescription: String,

    // ─── Image verification fields ───────────────────────────
    imageVerdict: {
      type: String,
      enum: [
        'AUTHENTIC', 'LIKELY_AUTHENTIC', 'AI_GENERATED',
        'LIKELY_AI_GENERATED', 'DEEPFAKE', 'MANIPULATED', 'INCONCLUSIVE',
      ],
    },
    aiProbability: { type: Number, min: 0, max: 100 },
    deepfakeProbability: { type: Number, min: 0, max: 100 },
    manipulationProbability: { type: Number, min: 0, max: 100 },
    metadataIntegrity: String,
    findings: [String],
    imageSummary: String,
    imageConfidence: { type: Number, min: 0, max: 100 },

    // ─── Common fields ───────────────────────────────────────
    language: String,
    detectedLanguage: String,
    responseLanguage: String,
    selectedLanguage: String,
    processingTime: String,

    // ─── Enriched Phase 5 & 6 fields ─────────────────────────
    reasoning: mongoose.Schema.Types.Mixed,
    confidenceBreakdown: mongoose.Schema.Types.Mixed,
    sourceConsensus: mongoose.Schema.Types.Mixed,
    evidenceMetrics: mongoose.Schema.Types.Mixed,
    supportCount: Number,
    contradictCount: Number,
    neutralCount: Number,
    unknownCount: Number,
    verifiedFacts: [String],
    keyFindings: [String],
    finalAssessment: String,
    timeline: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

// Index for efficient history queries
checkSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Check', checkSchema);
