/**
 * prompts/pageAnalysis.js
 *
 * Specialized Gemini prompt builder for full-page article analysis.
 */

'use strict';

const { buildResponseLanguageInstruction } = require('../utils/helpers');

/**
 * Build the prompt to extract the main claim, secondary claims, and metadata from an article.
 *
 * @param {object} pageData - Extracted webpage content
 * @param {string} selectedLanguage - User language
 */
function buildClaimExtractionPrompt(pageData, selectedLanguage) {
  const { url, pageTitle, articleTitle, mainContent, metaDescription } = pageData;
  const langInstruction = buildResponseLanguageInstruction(selectedLanguage);
  return `You are a senior professional fact-checking system. Analyze the following webpage metadata and content and extract the SINGLE MAIN factual claim being asserted in the article.
Also extract any secondary factual claims, important entities (people, organizations), key locations, and dates mentioned in relation to the main claim.

ARTICLE DETAILS:
URL: ${url}
Title: ${articleTitle || pageTitle}
Meta Description: ${metaDescription}

ARTICLE BODY (SAMPLE):
"${mainContent}"

INSTRUCTIONS:
1. Extract the main claim, secondary claims, entities, locations, and dates.
2. ${langInstruction}

You MUST respond with ONLY a valid JSON object in the exact format shown below. No markdown formatting, no code block backticks (do NOT wrap the response in \`\`\`json), no comments, and no explanation outside the JSON object.

RESPONSE FORMAT:
{
  "mainClaim": "The single primary factual claim being asserted in the article (1 clear, stand-alone sentence)",
  "secondaryClaims": ["Any other supporting factual claims that require validation (max 2)"],
  "entities": ["Important people, organizations, or products mentioned (max 5)"],
  "locations": ["Key countries, cities, or areas mentioned (max 3)"],
  "dates": ["Key dates mentioned (max 3)"]
}
`;
}

/**
 * Build the main fact-check and content analysis prompt for a full article.
 *
 * @param {object} pageData       - Extracted webpage content
 * @param {object[]} evidenceArticles - Search results
 * @param {string} language       - Response language ('en' | 'hi')
 */
function buildPageVerificationPrompt(pageData, evidenceArticles, language) {
  const { url, pageTitle, articleTitle, mainClaim, secondaryClaims } = pageData;
  
  const languageInstruction = buildResponseLanguageInstruction(language);

  // Build evidence block
  const evidenceBlock = evidenceArticles
    .map((article, i) => {
      const pub = article.source || 'Unknown';
      const factCheckLabel = article.isFactCheck
        ? `\n⚑ OFFICIAL FACT-CHECK — treat this as the highest-priority evidence`
        : '';
      const rating = article.rating ? `\nOFFICIAL RATING: ${article.rating}` : '';
      return `--- EVIDENCE #${i + 1} (Publisher: ${pub})${factCheckLabel} ---
Title: ${article.title || 'Untitled'}
Publisher: ${pub}${rating}
Content: ${article.content || article.snippet || 'No content available'}
---`;
    })
    .join('\n\n');

  return `You are a senior professional fact-checker, political analyst, and media editor.
Your job is to analyze and verify the credibility of the MAIN CLAIM of the article below using ONLY the evidence articles provided.
NEVER use your own knowledge, memory, or training data to confirm unverified facts. NEVER invent or infer facts not present in the evidence.

ARTICLE DETAILS TO VERIFY:
URL: ${url}
Article Title: ${articleTitle || pageTitle}
Main Claim: "${mainClaim}"
Secondary Claims: ${JSON.stringify(secondaryClaims || [])}

EVIDENCE ARTICLES FOR FACT-VERIFICATION:
${evidenceBlock || 'No evidence articles were retrieved.'}

═══════════════════════════════
ANALYSIS INSTRUCTIONS
═══════════════════════════════
1. Verify the Main Claim (and secondary claims) against the retrieved evidence.
2. Determine:
   - "verdict": Overall credibility verdict for the main claim. Use one of: TRUE | FALSE | MISLEADING | PARTIALLY_TRUE | OPINION | INFORMATIONAL
   - "trustScore": Credibility score from 0 to 100 based on accuracy of the main claim and source reliability.
   - "summary": A 2-3 sentence summary of the main claim and its factual verification status.
   - "politicalBias": The political alignment of the source. Use one of: Left | Left-Center | Least Biased (Center) | Right-Center | Right | Not Applicable
   - "claims": Evaluate the Main Claim (and any secondary claims if relevant) as claims. For each claim, evaluate its verdict (Supported | Contradicted | Unverified | Misleading), confidence (0-100), reasoning (1-2 sentences), and reference the supporting/contradicting source indices.
   - "suspiciousStatements": Identify any suspicious, highly controversial, unverified, or exaggerated statements in the article text (max 2). List each statement and the reason.
   - "missingContext": List 1 to 2 important details or contexts that were omitted, downplayed, or framed selectively.
   - "recommendation": A final recommendation to the user on how to evaluate this claim.
3. Refer to publishers by name (e.g. "Reuters", "BBC News"), never by index numbers like "Evidence #1" in user-facing text.
4. ${languageInstruction}

You MUST respond with ONLY a valid JSON object. No markdown, no code blocks, no explanation outside JSON.

RESPONSE FORMAT:
{
  "verdict": "TRUE | FALSE | MISLEADING | PARTIALLY_TRUE | OPINION | INFORMATIONAL",
  "trustScore": <number 0-100>,
  "confidence": <number 0-100>,
  "summary": "<2-3 sentences summary>",
  "politicalBias": "Left | Left-Center | Least Biased (Center) | Right-Center | Right | Not Applicable",
  "claims": [
    {
      "text": "<claim text>",
      "verdict": "Supported | Contradicted | Unverified | Misleading",
      "confidence": <number 0-100>,
      "reasoning": "<1-2 sentences explanation>",
      "supportingSources": [<0-based indices of supporting evidence articles>],
      "contradictingSources": [<0-based indices of contradicting evidence articles>]
    }
  ],
  "suspiciousStatements": [
    {
      "statement": "<suspicious statement from article>",
      "reason": "<why it is suspicious or contradicts evidence>"
    }
  ],
  "missingContext": [
    "<omitted detail or framing bias>"
  ],
  "recommendation": "<factual advice/recommendation>"
}
`;
}

module.exports = {
  buildClaimExtractionPrompt,
  buildPageVerificationPrompt
};
