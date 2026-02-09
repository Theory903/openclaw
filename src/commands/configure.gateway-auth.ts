import type { OpenClawConfig, GatewayAuthConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import { note } from "../terminal/note.js";
import { promptAuthChoiceGrouped } from "./auth-choice-prompt.js";
import { applyAuthChoice, resolvePreferredProviderForAuthChoice } from "./auth-choice.js";
import {
  applyModelAllowlist,
  applyModelFallbacksFromSelection,
  applyPrimaryModel,
  promptDefaultModel,
  promptModelAllowlist,
} from "./model-picker.js";

type GatewayAuthChoice = "token" | "password";

const ANTHROPIC_OAUTH_MODEL_KEYS = [
  "anthropic/claude-opus-4-6",
  "anthropic/claude-opus-4-5",
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
];

export function buildGatewayAuthConfig(params: {
  existing?: GatewayAuthConfig;
  mode: GatewayAuthChoice;
  token?: string;
  password?: string;
}): GatewayAuthConfig | undefined {
  const allowTailscale = params.existing?.allowTailscale;
  const base: GatewayAuthConfig = {};
  if (typeof allowTailscale === "boolean") {
    base.allowTailscale = allowTailscale;
  }

  if (params.mode === "token") {
    return { ...base, mode: "token", token: params.token };
  }
  return { ...base, mode: "password", password: params.password };
}

export async function promptAuthConfig(
  cfg: OpenClawConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  // Check for existing keys to bypass prompt ("share keys" logic)
  let initialAuthChoice: string | undefined;

  /* eslint-disable no-process-env */
  if (process.env.ANTHROPIC_API_KEY) {
    initialAuthChoice = "apiKey";
  } else if (process.env.OPENAI_API_KEY) {
    initialAuthChoice = "openai-api-key";
  } else if (process.env.OPENROUTER_API_KEY) {
    initialAuthChoice = "openrouter-api-key";
  } else if (process.env.GEMINI_API_KEY) {
    initialAuthChoice = "gemini-api-key";
  }
  /* eslint-enable no-process-env */

  let authChoice: string;
  if (initialAuthChoice) {
    // Auto-select provider if key is present
    authChoice = initialAuthChoice;
    note(
      `Detected existing API key for ${authChoice}. Using it directly.`,
      "Auth Auto-Configuration",
    );
  } else {
    authChoice = await promptAuthChoiceGrouped({
      prompter,
      store: ensureAuthProfileStore(undefined, {
        allowKeychainPrompt: false,
      }),
      includeSkip: true,
    });
  }

  let next = cfg;
  if (authChoice !== "skip") {
    const applied = await applyAuthChoice({
      authChoice: authChoice as any,
      config: next,
      prompter,
      runtime,
      setDefaultModel: true,
    });
    next = applied.config;
  } else {
    const modelSelection = await promptDefaultModel({
      config: next,
      prompter,
      allowKeep: true,
      ignoreAllowlist: true,
      preferredProvider: resolvePreferredProviderForAuthChoice(authChoice as any),
    });
    if (modelSelection.model) {
      next = applyPrimaryModel(next, modelSelection.model);
    }
  }

  const anthropicOAuth =
    authChoice === "setup-token" || authChoice === "token" || authChoice === "oauth";

  const allowlistSelection = await promptModelAllowlist({
    config: next,
    prompter,
    allowedKeys: anthropicOAuth ? ANTHROPIC_OAUTH_MODEL_KEYS : undefined,
    initialSelections: anthropicOAuth ? ["anthropic/claude-opus-4-6"] : undefined,
    message: anthropicOAuth ? "Anthropic OAuth models" : undefined,
  });
  if (allowlistSelection.models) {
    next = applyModelAllowlist(next, allowlistSelection.models);
    next = applyModelFallbacksFromSelection(next, allowlistSelection.models);
  }

  return next;
}
