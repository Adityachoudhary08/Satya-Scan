/**
 * urlTypePrompts.js
 *
 * Specialized Gemini prompt builders for non-news URL page types.
 * Used ONLY by the URL verification path in textVerificationService.js.
 *
 * Does NOT modify or import from textVerification.js.
 * The existing buildTextVerificationPrompt() is still used for 'news' pages.
 *
 * Page types handled here:
 *   official     → authoritative org/gov page
 *   reference    → educational / encyclopedia page
 *   opinion      → blog / editorial / opinion column
 *   social_media → social media post
 */

// ─── Shared helpers ───────────────────────────────────────────────────────────

function buildEvidenceBlock(evidenceArticles) {
  if (!evidenceArticles || evidenceArticles.length === 0) return '';
  return evidenceArticles
    .map((article, i) => {
      const pub = article.source || 'Unknown';
      const rating = article.rating ? `\nOFFICIAL RATING: ${article.rating}` : '';
      const stance = article.stance || 'Unknown';
      const summaryText = (article.snippet || article.content || 'No content available').trim().slice(0, 300);
      return `--- RELATED SOURCE #${i + 1} ---\nTitle: ${article.title || 'Untitled'}\nPublisher: ${pub}${rating}\nSummary: ${summaryText}\nStance: ${stance}\nURL: ${article.url || ''}\n---`;
    })
    .join('\n\n');
}

function buildEntityContext(entities = {}) {
  return [
    entities.people?.length ? `People mentioned: ${entities.people.join(', ')}` : '',
    entities.locations?.length ? `Locations: ${entities.locations.join(', ')}` : '',
    entities.events?.length ? `Events: ${entities.events.join(', ')}` : '',
    entities.organisations?.length ? `Organisations: ${entities.organisations.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const { buildResponseLanguageInstruction } = require('../utils/helpers');

function languageInstruction(language) {
  return buildResponseLanguageInstruction(language);
}

// ─── Official Government / Organization Page ──────────────────────────────────

function buildOfficialPagePrompt(pageText, evidenceArticles, language, entities = {}) {
  const evidenceBlock = buildEvidenceBlock(evidenceArticles);
  const entityContext = buildEntityContext(entities);
  const langInstruction = languageInstruction(language);

  return `You are analyzing an official government or authoritative organization webpage.

CRITICAL RULE: This is an OFFICIAL INFORMATIONAL PAGE. You MUST NOT label it as True, False, or Misleading.
Official pages publish authoritative information — they are the source, not the claim.
Your role is to SUMMARIZE what this page says and present it clearly.

PAGE CONTENT (from official source):
"${pageText}"

${entityContext ? `CONTEXT:\n${entityContext}\n` : ''}${evidenceBlock ? `RELATED COVERAGE FROM OTHER PUBLISHERS:\n${evidenceBlock}\n` : ''}

INSTRUCTIONS:
1. Write a clear 2-3 sentence summary of what this official page communicates. Be factual and neutral.
2. Extract 2-3 specific verified facts from this page.
3. Extract 2-3 key findings regarding the page content and news corroboration.
4. Provide a "finalAssessment" concluding statement (2-3 sentences).
5. The verdict MUST be "INFORMATIONAL" — never True, False, Misleading, or Partially True.
6. Write like a journalist summarizing a government press release — clear, factual, no judgment.
7. ${langInstruction}

You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside JSON.

RESPONSE FORMAT:
{
  "verdict": "INFORMATIONAL",
  "confidence": <number 75-100>,
  "summary": "<2-3 sentence factual summary of what this official page says — no judgment>",
  "verifiedFacts": ["<verified fact 1>", "<verified fact 2>"],
  "keyFindings": ["<key finding 1>", "<key finding 2>"],
  "finalAssessment": "<final concluding summary assessment>",
  "evidenceSummary": "<detailed summary of the official page content>",
  "crossSourceAgreement": "<overview of corroboration by other publishers>",
  "officialConfirmation": "<this is the official page itself, summarize its authoritative status>",
  "missingContext": "<details of missing context or null>",
  "contradictionsFound": "<state if any contradicting reports found, or state that none were found, or null>",
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
      "index": <number: 0-based index of the related source above>,
      "stance": "Supports | Contradicts | Mentions | Opinion | Unknown",
      "summary": "<one sentence explanation showing WHY they support/contradict/mention this page>"
    }
  ],
  "timeline": {
    "claimPublished": "<date/time string or null>",
    "majorCoverage": "<date/time string or null>",
    "officialConfirmation": "<date/time string or null>"
  }
}`;
}

// ─── Reference / Knowledge Page ───────────────────────────────────────────────

function buildReferencePagePrompt(pageText, evidenceArticles, language, entities = {}) {
  const evidenceBlock = buildEvidenceBlock(evidenceArticles);
  const entityContext = buildEntityContext(entities);
  const langInstruction = languageInstruction(language);

  return `You are analyzing an educational reference page — for example, a Wikipedia article, Britannica entry, or encyclopedia page.

CRITICAL RULE: This is EDUCATIONAL REFERENCE CONTENT, not a news claim.
Reference pages provide established knowledge. You MUST NOT evaluate them as True, False, or Misleading.
Your job is to summarize the educational content clearly and helpfully.

PAGE CONTENT (from reference/encyclopedia source):
"${pageText}"

${entityContext ? `CONTEXT:\n${entityContext}\n` : ''}${evidenceBlock ? `ADDITIONAL RELATED SOURCES:\n${evidenceBlock}\n` : ''}

INSTRUCTIONS:
1. Write a 2-3 sentence plain-language summary of the topic this reference page covers.
2. Extract 2-3 specific verified facts from the reference text.
3. Extract 2-3 key findings from this page content.
4. Provide a "finalAssessment" concluding statement (2-3 sentences).
5. The verdict MUST be "INFORMATIONAL" — never True, False, Misleading, or Partially True.
6. Write clearly at a level a general audience can understand.
7. ${langInstruction}

You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside JSON.

RESPONSE FORMAT:
{
  "verdict": "INFORMATIONAL",
  "confidence": <number 75-100>,
  "summary": "<2-3 sentence plain-language summary of the topic and key information on this reference page>",
  "verifiedFacts": ["<verified fact 1>", "<verified fact 2>"],
  "keyFindings": ["<key finding 1>", "<key finding 2>"],
  "finalAssessment": "<final concluding summary assessment>",
  "evidenceSummary": "<summary of reference page content>",
  "crossSourceAgreement": "<statement about agreement with related sources>",
  "contradictionsFound": "<state if any contradicting reports found, or state that none were found, or null>",
  "officialConfirmation": "<this is a reference source, note if it cites official or academic records>",
  "missingContext": "<details of missing context or null>",
  "contradictionsFound": "<details of contradicting reports, or null>",
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
      "index": <number: 0-based index of the related source above>,
      "stance": "Supports | Contradicts | Mentions | Opinion | Unknown",
      "summary": "<one sentence explanation showing WHY they support/contradict/mention this page>"
    }
  ],
  "timeline": {
    "claimPublished": "<date/time string or null>",
    "majorCoverage": "<date/time string or null>",
    "officialConfirmation": "<date/time string or null>"
  }
}`;
}

// ─── Blog / Opinion Content ───────────────────────────────────────────────────

function buildOpinionPagePrompt(pageText, evidenceArticles, language, entities = {}) {
  const evidenceBlock = buildEvidenceBlock(evidenceArticles);
  const entityContext = buildEntityContext(entities);
  const langInstruction = languageInstruction(language);

  return `You are analyzing an opinion column, editorial, or blog post.

CONTEXT: Opinion and editorial content expresses the author's personal views and arguments.
Your job is to:
  1. Clearly identify this as opinion/editorial content.
  2. Separate the author's opinions from factual claims.
  3. Verify only the factual claims using the evidence provided.
  4. Always return verdict "OPINION" at the top level.

PAGE CONTENT (opinion/blog):
"${pageText}"

${entityContext ? `ENTITIES IDENTIFIED:\n${entityContext}\n` : ''}${evidenceBlock ? `EVIDENCE FROM INDEPENDENT SOURCES:\n${evidenceBlock}\n` : ''}

INSTRUCTIONS:
1. Write a 2-3 sentence summary: state clearly this is an opinion piece, what argument it makes, and whether its factual underpinnings are supported.
2. Extract 2-3 verified facts mentioned in the post.
3. Extract 2-3 key findings regarding facts and news coverage.
4. Provide a "finalAssessment" concluding statement (2-3 sentences).
5. The overall verdict MUST be "OPINION".
6. Write like a human journalist — cite publishers by name.
7. ${langInstruction}

You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside JSON.

RESPONSE FORMAT:
{
  "verdict": "OPINION",
  "confidence": <number 0-100>,
  "summary": "<2-3 sentences: this is an opinion piece arguing [X]. Its factual claims [brief assessment].>",
  "verifiedFacts": ["<verified fact 1>", "<verified fact 2>"],
  "keyFindings": ["<key finding 1>", "<key finding 2>"],
  "finalAssessment": "<final concluding summary assessment>",
  "evidenceSummary": "<summary of the opinion and its key claims>",
  "crossSourceAgreement": "<statement about corroboration of factual assertions in this opinion column>",
  "contradictionsFound": "<state if any contradicting reports found, or state that none were found, or null>",
  "officialConfirmation": "<this is opinion content, check if it references any official statements/documents>",
  "missingContext": "<details of missing context or null>",
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
      "index": <number: 0-based index of the related source above>,
      "stance": "Supports | Contradicts | Mentions | Opinion | Unknown",
      "summary": "<one sentence explanation showing WHY they support/contradict/mention this page>"
    }
  ],
  "timeline": {
    "claimPublished": "<date/time string or null>",
    "majorCoverage": "<date/time string or null>",
    "officialConfirmation": "<date/time string or null>"
  }
}`;
}

// ─── Social Media Post ────────────────────────────────────────────────────────

function buildSocialMediaPrompt(pageText, evidenceArticles, language, entities = {}) {
  const evidenceBlock = buildEvidenceBlock(evidenceArticles);
  const entityContext = buildEntityContext(entities);
  const langInstruction = languageInstruction(language);

  return `You are a professional fact-checker analyzing a social media post.

Your job is to:
  1. Extract the individual factual claims made in this post.
  2. Verify each claim against the evidence provided.
  3. Return a clear, evidence-based verdict.

Write like a human journalist fact-checking a viral post — cite publishers by name, never "Source 1" or "Evidence #1".

SOCIAL MEDIA POST CONTENT:
"${pageText}"

${entityContext ? `ENTITIES IDENTIFIED:\n${entityContext}\n` : ''}${evidenceBlock ? `EVIDENCE FROM VERIFIED SOURCES:\n${evidenceBlock}\n` : 'No supporting evidence was retrieved.'}

INSTRUCTIONS:
1. Write a concise 2-sentence summary of what the post claims and what the evidence shows.
2. Extract 2-3 verified facts.
3. Extract 2-3 key findings.
4. Provide a "finalAssessment" concluding statement (2-3 sentences).
5. Determine the overall verdict (TRUE, FALSE, MISLEADING, PARTIALLY_TRUE, UNVERIFIED).
6. ${langInstruction}

You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside JSON.

RESPONSE FORMAT:
{
  "verdict": "TRUE | FALSE | MISLEADING | PARTIALLY_TRUE | UNVERIFIED",
  "confidence": <number 0-100>,
  "summary": "<2 sentences: what this social media post claims and what the evidence shows>",
  "verifiedFacts": ["<verified fact 1>", "<verified fact 2>"],
  "keyFindings": ["<key finding 1>", "<key finding 2>"],
  "finalAssessment": "<final concluding summary assessment>",
  "reasoning": {
    "evidenceSummary": "<summary of the social media post claims and associated coverage>",
    "crossSourceAgreement": "<statement about consensus between publications fact-checking this post>",
    "contradictionsFound": "<state if any contradicting reports found, or state that none were found>",
    "officialConfirmation": "<state if official channels have verified, debunked, or commented on this viral claim>",
    "missingContext": "<details of missing context or null>",
    "aiReasoning": "<logical reason for the overall verdict based on evidence>"
  },
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
      "index": <number: 0-based index of the related source above>,
      "stance": "Supports | Contradicts | Mentions | Opinion | Unknown",
      "summary": "<one sentence explanation showing WHY they support/contradict/mention this page>"
    }
  ],
  "timeline": {
    "claimPublished": "<date/time string or null>",
    "majorCoverage": "<date/time string or null>",
    "officialConfirmation": "<date/time string or null>"
  }
}`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

function buildUrlTypePrompt(pageText, evidenceArticles, language, entities, pageType) {
  switch (pageType) {
    case 'official':
      return buildOfficialPagePrompt(pageText, evidenceArticles, language, entities);
    case 'reference':
      return buildReferencePagePrompt(pageText, evidenceArticles, language, entities);
    case 'opinion':
      return buildOpinionPagePrompt(pageText, evidenceArticles, language, entities);
    case 'social_media':
      return buildSocialMediaPrompt(pageText, evidenceArticles, language, entities);
    default:
      throw new Error(`Unknown pageType for URL prompt: ${pageType}`);
  }
}

module.exports = { buildUrlTypePrompt };
