const { verifyText } = require('./src/services/textVerificationService');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function runBenchmark() {
  console.log("Connecting to MongoDB at:", process.env.MONGO_URI ? "URI loaded" : "not found");
  if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY is not loaded.");
    process.exit(1);
  }
  
  await mongoose.connect(process.env.MONGO_URI);
  
  const testClaim = "NASA discovered a new Earth-like planet in July 2026";
  console.log(`\n--- BENCHMARK RUN 1 (Cold - Direct API Run) ---`);
  console.log(`Claim: "${testClaim}"`);
  
  let start = Date.now();
  let result = await verifyText(testClaim, 'text', 'en');
  let elapsed = (Date.now() - start) / 1000;
  
  console.log("\n================ RESULTS 1 ================");
  console.log("Verdict:", result.verdict);
  console.log("Confidence:", result.confidence);
  console.log("Processing Time:", result.processingTime);
  console.log("Total Elapsed Time:", elapsed.toFixed(2) + " seconds");
  console.log("isCached:", !!result.isCached);
  console.log("===========================================");

  // Save the result to database so that Run 2 hits the cache
  const CheckModel = require('./src/models/Check');
  const mockCheckDoc = {
    inputType: 'text',
    originalText: testClaim,
    trustScore: result.trustScore,
    aiScore: result.aiScore,
    aiReasoning: result.aiReasoning,
    sourceScore: result.sourceCredibility,
    language: result.language,
    detectedLanguage: result.detectedLanguage,
    responseLanguage: result.responseLanguage,
    processingTime: result.processingTime,
    reasoning: result.reasoning,
    confidenceBreakdown: result.confidenceBreakdown,
    sourceConsensus: result.sourceConsensus,
    evidenceMetrics: result.evidenceMetrics,
    supportCount: result.supportCount,
    contradictCount: result.contradictCount,
    neutralCount: result.neutralCount,
    unknownCount: result.unknownCount,
    verifiedFacts: result.verifiedFacts,
    keyFindings: result.keyFindings,
    finalAssessment: result.finalAssessment,
    timeline: result.timeline,
    claims: result.claims?.map(c => ({
      text: c.text,
      verdict: c.verdict,
      confidence: c.confidence,
      reasoning: c.reasoning,
      sourceCount: c.sourceCount,
      trustedSourceCount: c.trustedSourceCount,
      sources: c.sources?.map(s => ({
        url: s.url,
        title: s.title,
        source: s.source,
        trusted: s.trusted
      }))
    })) || []
  };
  await CheckModel.create(mockCheckDoc);
  console.log("Mock Check saved to database for cache testing.");

  console.log(`\n--- BENCHMARK RUN 2 (Warm - Database Cache Run) ---`);
  start = Date.now();
  const Check = require('./src/models/Check');
  const normalizedClaim = testClaim.trim().toLowerCase().replace(/[^\w\s\u0900-\u097F]/g, '');
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const recentChecks = await Check.find({
    createdAt: { $gte: yesterday },
    inputType: 'text'
  }).lean();

  const match = recentChecks.find(check => {
    const checkText = check.originalText || '';
    const checkNorm = checkText.trim().toLowerCase().replace(/[^\w\s\u0900-\u097F]/g, '');
    return checkNorm === normalizedClaim;
  });

  if (match) {
    console.log("CACHE HIT: Successfully matched claim in DB!");
    const cachedVerdict = match.pageVerdict || (match.trustScore >= 70 ? 'Supported' : match.trustScore >= 40 ? 'Misleading' : 'Contradicted');
    console.log("Verdict from cache:", cachedVerdict);
  } else {
    console.log("CACHE MISS");
  }
  
  elapsed = (Date.now() - start) / 1000;
  console.log("\n================ RESULTS 2 ================");
  console.log("Total Elapsed Time:", elapsed.toFixed(3) + " seconds");
  console.log("===========================================");
  
  await mongoose.disconnect();
}

runBenchmark().catch(err => {
  console.error("Benchmark failed:", err);
});
