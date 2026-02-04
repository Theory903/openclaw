// Defaults for agent metadata when upstream does not supply them.
// Model id uses pi-ai's built-in Anthropic catalog.
export const DEFAULT_PROVIDER = "google";
export const DEFAULT_MODEL = "gemini-3-flash-preview";
// Context window: Gemini 3 Flash supports ~1M tokens.
export const DEFAULT_CONTEXT_TOKENS = 1_000_000;
