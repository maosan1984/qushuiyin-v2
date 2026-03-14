export function extractFirstHttpUrl(input) {
  const text = String(input || "");
  const matched = text.match(/https?:\/\/[^\s]+/i);
  if (!matched) {
    return "";
  }

  // Trim common trailing punctuation copied with share text.
  return matched[0].replace(/[),.;!?'"`]+$/g, "");
}
