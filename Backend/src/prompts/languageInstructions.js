/** Shared response-language contract for every Gemini prompt. */
function buildResponseLanguageInstruction(selectedLanguage) {
  const language = selectedLanguage === 'hi' ? 'Hindi' : 'English';
  return `Generate the ENTIRE response in ${language}.
Do not mix English and Hindi.
If selectedLanguage is 'hi', write fluent natural Hindi in Devanagari script.
Do NOT translate publisher names, website names, URLs, official organization names, or proper nouns.
Keep JSON keys and required enum values exactly as specified, but write every human-readable explanation, summary, reason, finding, recommendation, missing-context entry, contradiction, and bullet point in ${language}.`;
}
module.exports = { buildResponseLanguageInstruction };
