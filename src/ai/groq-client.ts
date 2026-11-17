const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const GROQ_KEY_STORAGE = 'realvault_groq_key';

function resolveClientApiKey(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = window.localStorage.getItem(GROQ_KEY_STORAGE)?.trim();
      if (saved) return saved;
    } catch {
      // Ignore storage access restrictions.
    }
  }
  const envKey = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_GROQ_API_KEY;
  return typeof envKey === 'string' ? envKey.trim() : '';
}

function getEndpointConfig(): {
  modelsUrl: string;
  chatUrl: string;
  headers: Record<string, string>;
} {
  const clientKey = resolveClientApiKey();
  if (clientKey) {
    return {
      modelsUrl: `${GROQ_BASE_URL}/models`,
      chatUrl: `${GROQ_BASE_URL}/chat/completions`,
      headers: {
        Authorization: `Bearer ${clientKey}`,
        'Content-Type': 'application/json',
      },
    };
  }
  return {
    modelsUrl: '/api/groq?action=models',
    chatUrl: '/api/groq',
    headers: {
      'Content-Type': 'application/json',
    },
  };
}

export function saveUserGroqKey(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const clean = key.trim();
    if (clean) {
      window.localStorage.setItem(GROQ_KEY_STORAGE, clean);
    } else {
      window.localStorage.removeItem(GROQ_KEY_STORAGE);
    }
    modelsDiscovered = false;
  } catch {
    // Ignore storage failure.
  }
}

export function hasCustomGroqKey(): boolean {
  return resolveClientApiKey().length > 0;
}

export interface GroqToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface GroqToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export type GroqContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | GroqContentPart[] | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: GroqToolCall[];
    };
  }>;
}

const PREFERRED_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'qwen/qwen3.8-27b',
];

const VISION_MODEL = 'qwen/qwen3.8-27b';

let availableChatModels: string[] = [...PREFERRED_MODELS];
let modelsDiscovered = false;

export async function discoverGroqModel(): Promise<string> {
  if (modelsDiscovered && availableChatModels.length > 0) {
    return availableChatModels[0];
  }
  modelsDiscovered = true;
  try {
    const cfg = getEndpointConfig();
    const res = await fetch(cfg.modelsUrl, {
      method: 'GET',
      headers: cfg.headers,
    });
    if (res.ok) {
      const payload = (await res.json()) as { data?: Array<{ id?: string }> };
      const available = new Set(
        (payload.data ?? []).map((entry) => entry.id).filter(Boolean) as string[],
      );
      const ranked = PREFERRED_MODELS.filter((candidate) => available.has(candidate));
      if (ranked.length > 0) {
        availableChatModels = ranked;
      }
    }
  } catch {
    // Fall back cleanly to default model list.
  }
  return availableChatModels[0] ?? PREFERRED_MODELS[0];
}

export async function groqChatWithTools(
  messages: GroqMessage[],
  tools?: GroqToolDefinition[],
  maxTokens = 480,
): Promise<{ content: string; toolCalls: GroqToolCall[]; modelUsed: string }> {
  await discoverGroqModel();
  const candidates =
    availableChatModels.length > 0 ? availableChatModels : PREFERRED_MODELS;
  const cfg = getEndpointConfig();

  let lastErrorText = '';
  for (const model of candidates) {
    const isReasoningModel = model.startsWith('openai/gpt-oss-');
    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: isReasoningModel ? Math.max(480, maxTokens) : maxTokens,
      temperature: 0.3,
    };

    if (isReasoningModel) {
      body.reasoning_effort = 'low';
    }
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const res = await fetch(cfg.chatUrl, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify(body),
    });

    if (res.status === 429 || res.status === 400) {
      lastErrorText = `HTTP ${res.status} on ${model}`;
      continue;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 140)}`);
    }

    const data = (await res.json()) as GroqChatResponse;
    const msg = data.choices?.[0]?.message;
    return {
      content: msg?.content?.trim() ?? '',
      toolCalls: msg?.tool_calls ?? [],
      modelUsed: model,
    };
  }

  throw new Error(`Groq rate limited across fallback models (${lastErrorText})`);
}

export async function groqVisionAnalyze(
  imageDataUrl: string,
  instructionPrompt: string,
  maxTokens = 360,
): Promise<string> {
  const cfg = getEndpointConfig();
  let lastErrorText = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(cfg.chatUrl, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: instructionPrompt },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (res.status === 429 || res.status === 502 || res.status === 503) {
      lastErrorText = `HTTP ${res.status}`;
      await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq Vision HTTP ${res.status}: ${errText.slice(0, 140)}`);
    }

    const data = (await res.json()) as GroqChatResponse;
    return data.choices?.[0]?.message?.content?.trim() ?? '{}';
  }

  throw new Error(`Groq Vision unavailable after retries (${lastErrorText})`);
}

export function speakNarration(text: string, enabled: boolean): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(trimmed.slice(0, 240));
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore browser speech synthesis failures.
  }
}
