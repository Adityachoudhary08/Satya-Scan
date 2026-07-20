/**
 * Prompt templates for text/URL fact verification.
 *
 * The reasoning engine (Gemini) must ONLY reason over retrieved
 * evidence — never hallucinate or use training knowledge.
 */

const { buildResponseLanguageInstruction } = require('../utils/helpers');

/**
 * Build the main fact-check verification prompt.
 * @param {string} claim             — The claim text (max ~5000 chars)
 * @param {object[]} evidenceArticles — Enriched source objects
 * @param {string} language          — 'en' | 'hi'
 * @param {object} entities          — Extracted entities { people, locations, events, ... }
 */
function buildTextVerificationPrompt(claim, evidenceArticles, language, entities = {}) {
  const languageInstruction = buildResponseLanguageInstruction(language);

  const evidenceBlock = evidenceArticles
    .map((article, i) => {
      const pub = article.source || 'Unknown';
      const rating = article.rating ? `\nOFFICIAL RATING: ${article.rating}` : '';
      const summaryText = (article.snippet || article.content || 'No content available').trim().slice(0, 300);
      return `--- EVIDENCE #${i + 1} ---
Title: ${article.title || 'Untitled'}
Publisher: ${pub}${rating}
Summary: ${summaryText}
URL: ${article.url || ''}
---`;
    })
    .join('\n\n');

  const entityContext = [
    entities.people?.length ? `People mentioned: ${entities.people.join(', ')}` : '',
    entities.locations?.length ? `Locations: ${entities.locations.join(', ')}` : '',
    entities.events?.length ? `Events: ${entities.events.join(', ')}` : '',
    entities.organisations?.length ? `Organisations: ${entities.organisations.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `You are a senior professional fact-checker at an independent investigative newsroom.
Your job is to verify the following claim using ONLY the evidence articles provided below.
NEVER use your own knowledge, memory, or training data. NEVER invent or infer facts not present in the evidence.

CLAIM TO VERIFY:
"${claim}"

${entityContext ? `ENTITIES IDENTIFIED IN CLAIM:\n${entityContext}\n` : ''}
EVIDENCE ARTICLES:
${evidenceBlock || 'No evidence articles were retrieved.'}

INSTRUCTIONS:
1. Determine the overall verdict: TRUE, FALSE, MISLEADING, PARTIALLY_TRUE, or UNVERIFIED.
2. Provide a 1-2 sentence overall summary of your findings.
3. Extract 3-5 specific verified facts from the evidence and list them in the "verifiedFacts" array.
4. Extract 3-5 key findings about the sources, contradictions, or official statements and list them in the "keyFindings" array.
5. Provide a "finalAssessment" concluding statement (2-3 sentences) summarizing the final check results.
6. Provide detailed reasoning components:
   - "evidenceSummary": Factual summary of the evidence landscape, naming publishers.
   - "crossSourceAgreement": Corroboration details between separate publications.
   - "officialConfirmation": Government statements, official gazettes, or official body releases regarding the claim.
   - "missingContext": Important details or framing omissions, or null if complete.
   - "contradictionsFound": Direct refutations by credible publishers, or null if none.
7. Evaluate the claim's verification quality across these 6 factors, providing a short justification statement for each:
   - "evidenceQuality": Overall credibility and reliability of the articles.
   - "independentSources": Diversity and independence of the publications.
   - "officialSources": Presence of official statements or government databases.
   - "recentReporting": Freshness/recency of the articles.
   - "contradictoryEvidence": Detail of any contradictions found.
   - "aiConsistency": AI consistency level.
8. Evaluate the exact stance and reason for each evidence article:
   - "index": 0-based index of the article in the list.
   - "stance": MUST be one of "Supports" (confirms), "Contradicts" (refutes), "Mentions" (mentions without confirming), "Opinion" (opinion piece), or "Unknown".
   - "summary": A concise one-sentence description of the source's main point or reporting, showing WHY they support/contradict/mention the claim.
9. Estimate a timeline for the claim and coverage (dates can be inferred from evidence dates/contents):
   - "claimPublished": Estimated date/time the claim arose or was first posted.
   - "majorCoverage": Estimated date/time major news coverage began.
   - "officialConfirmation": Estimated date/time of official statements/releases (if any, else null).
10. ${languageInstruction}

You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside JSON.

RESPONSE FORMAT:
{
  "verdict": "TRUE | FALSE | MISLEADING | PARTIALLY_TRUE | UNVERIFIED",
  "confidence": <number 0-100>,
  "summary": "<one sentence overall summary>",
  "verifiedFacts": ["<verified fact 1>", "<verified fact 2>", "<verified fact 3>"],
  "keyFindings": ["<concise key finding 1>", "<concise key finding 2>", "<concise key finding 3>"],
  "finalAssessment": "<final concluding summary assessment>",
  "evidenceSummary": "<text>",
  "crossSourceAgreement": "<text>",
  "officialConfirmation": "<text>",
  "missingContext": "<text or null>",
  "contradictionsFound": "<text or null>",
  "confidenceBreakdown": {
    "evidenceQuality": "<short explanation sentence>",
    "independentSources": "<short explanation sentence>",
    "officialSources": "<short explanation sentence>",
    "recentReporting": "<short explanation sentence>",
    "contradictoryEvidence": "<short explanation sentence>",
    "aiConsistency": "<short explanation sentence>"
  },
  "sourceConsensus": [
    {
      "index": <number>,
      "stance": "Supports | Contradicts | Mentions | Opinion | Unknown",
      "summary": "<one sentence explanation showing WHY they support/contradict/mention the claim>"
    }
  ],
  "timeline": {
    "claimPublished": "<date/time string or null>",
    "majorCoverage": "<date/time string or null>",
    "officialConfirmation": "<date/time string or null>"
  }
}`;
}

module.exports = { buildTextVerificationPrompt };
