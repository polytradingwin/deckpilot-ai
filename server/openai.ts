import { ProxyAgent, setGlobalDispatcher } from "undici";
import type { DeckSpec, PresentationRequest } from "../src/shared/deck";

export const DEFAULT_MODEL = "gpt-5.2";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
const FALLBACK_MODELS = ["gpt-5.1", "gpt-5-mini"];
let configuredProxy: string | null = null;

const deckSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "language", "audience", "theme", "slides"],
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    language: { type: "string" },
    audience: { type: "string" },
    theme: {
      type: "object",
      additionalProperties: false,
      required: ["accent", "mood"],
      properties: {
        accent: { type: "string", enum: ["gold", "cyan", "sage"] },
        mood: { type: "string" },
      },
    },
    slides: {
      type: "array",
      minItems: 4,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["layout", "title"],
        properties: {
          layout: {
            type: "string",
            enum: ["cover", "agenda", "section", "content", "chart", "comparison", "closing"],
          },
          kicker: { type: "string" },
          title: { type: "string" },
          subtitle: { type: "string" },
          body: {
            type: "array",
            maxItems: 5,
            items: { type: "string" },
          },
          takeaway: { type: "string" },
          speakerNotes: { type: "string" },
          visual: { type: "string" },
          metric: {
            type: "object",
            additionalProperties: false,
            required: ["label", "value"],
            properties: {
              label: { type: "string" },
              value: { type: "string" },
              context: { type: "string" },
            },
          },
          chart: {
            type: "object",
            additionalProperties: false,
            required: ["title", "labels", "values"],
            properties: {
              title: { type: "string" },
              labels: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
              values: { type: "array", minItems: 3, maxItems: 6, items: { type: "number" } },
            },
          },
        },
      },
    },
  },
} as const;

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export function getAIProvider() {
  return (process.env.AI_PROVIDER || "openai").toLowerCase();
}

export function getConfiguredPrimaryModel() {
  return getAIProvider() === "anthropic"
    ? process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL
    : process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

export async function createDeckWithAI(input: PresentationRequest): Promise<DeckSpec> {
  if (getAIProvider() === "anthropic") {
    return createDeckWithAnthropic(input);
  }

  return createDeckWithOpenAI(input);
}

export async function createDeckWithOpenAI(input: PresentationRequest): Promise<DeckSpec> {
  if (process.env.MOCK_OPENAI === "1") {
    return createMockDeck(input);
  }

  configureOpenAIProxy();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local or set MOCK_OPENAI=1 for local testing.");
  }

  const models = getModelCandidates();
  const response = await createResponseWithFallback(apiKey, models, input);
  const text = extractOutputText(response);

  if (!text) {
    throw new Error("OpenAI did not return a structured deck.");
  }

  return normalizeDeck(JSON.parse(text) as DeckSpec, input);
}

export async function createDeckWithAnthropic(input: PresentationRequest): Promise<DeckSpec> {
  if (process.env.MOCK_OPENAI === "1") {
    return createMockDeck(input);
  }

  configureOpenAIProxy();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local or choose AI_PROVIDER=openai.");
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const response = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: getMaxOutputTokens(input.slides),
      temperature: 0.4,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: `${buildUserPrompt(input)}\n\nReturn only JSON. Do not wrap it in markdown.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await formatAnthropicError(response, model));
  }

  const text = extractAnthropicText((await response.json()) as AnthropicResponse);
  if (!text) {
    throw new Error("Anthropic did not return a structured deck.");
  }

  return normalizeDeck(JSON.parse(stripJsonFence(text)) as DeckSpec, input);
}

async function createResponseWithFallback(apiKey: string, models: string[], input: PresentationRequest) {
  const errors: string[] = [];

  for (const model of models) {
    try {
      return await createResponse(apiKey, model, input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${model}: ${message}`);
      if (message.includes("OPENAI_API_KEY") || message.includes("API Key")) {
        break;
      }
    }
  }

  throw new Error(`All OpenAI model candidates failed.\n${errors.join("\n")}`);
}

async function createResponse(apiKey: string, model: string, input: PresentationRequest): Promise<OpenAIResponse> {
  const response = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com"}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            buildSystemPrompt(),
          ].join("\n"),
        },
        {
          role: "user",
          content: buildUserPrompt(input),
        },
      ],
      max_output_tokens: getMaxOutputTokens(input.slides),
      text: {
        format: {
          type: "json_schema",
          name: "deck_spec",
          strict: false,
          schema: deckSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await formatOpenAIError(response, model));
  }

  return (await response.json()) as OpenAIResponse;
}

function buildSystemPrompt() {
  return [
    "You are a senior McKinsey-level presentation strategist, executive storyteller, and visual information designer.",
    "Build board-ready PowerPoint decks with a clear storyline, MECE structure, crisp slide titles, evidence-first claims, and executive-level language.",
    "Every slide title must be a message sentence, not a topic label.",
    "Use the user's material faithfully. When data is missing, mark assumptions as plausible placeholders instead of inventing false facts.",
    "Design for editable PowerPoint: short text, strong hierarchy, one key message per slide, and layouts that can be rendered as shapes, text, and simple charts.",
    "Return only valid JSON matching the supplied deck structure. No markdown, no prose outside JSON.",
  ].join("\n");
}

export function getModelCandidates() {
  const configured = process.env.OPENAI_MODEL_CANDIDATES
    ? process.env.OPENAI_MODEL_CANDIDATES.split(",").map((item) => item.trim())
    : [process.env.OPENAI_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS];

  return Array.from(new Set(configured.filter(Boolean)));
}

export function configureOpenAIProxy() {
  const proxy = process.env.OPENAI_HTTPS_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxy || proxy === configuredProxy) {
    return;
  }

  const normalized = proxy.includes("://") ? proxy : `http://${proxy}`;
  setGlobalDispatcher(new ProxyAgent(normalized));
  configuredProxy = proxy;
}

async function formatOpenAIError(response: Response, model: string) {
  const fallback = `OpenAI API request failed with ${response.status}.`;
  let message = fallback;

  try {
    const body = (await response.json()) as { error?: { message?: string; type?: string; code?: string } };
    message = body.error?.message || fallback;
  } catch {
    message = fallback;
  }

  if (response.status === 401) {
    return "OpenAI API Key is invalid. Check OPENAI_API_KEY in .env.local.";
  }
  if (response.status === 403) {
    return `OpenAI rejected this request. Confirm the API key can access model ${model} and the selected project has API access. ${message}`;
  }
  if (response.status === 404) {
    return `OpenAI model is not available for this key: ${model}. Change OPENAI_MODEL in .env.local.`;
  }
  if (response.status === 429) {
    return `OpenAI rate limit or quota was reached. Check billing, project limits, and usage. ${message}`;
  }

  return `OpenAI API request failed: ${message}`;
}

async function formatAnthropicError(response: Response, model: string) {
  const fallback = `Anthropic API request failed with ${response.status}.`;
  try {
    const body = (await response.json()) as { error?: { message?: string; type?: string } };
    return `Anthropic API request failed for ${model}: ${body.error?.message || fallback}`;
  } catch {
    return fallback;
  }
}

function extractOutputText(response: OpenAIResponse) {
  if (response.output_text) {
    return response.output_text;
  }

  return response.output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("")
    .trim();
}

function extractAnthropicText(response: AnthropicResponse) {
  return response.content
    ?.filter((item) => item.type === "text" || !item.type)
    .map((item) => item.text || "")
    .join("")
    .trim();
}

function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function buildUserPrompt(input: PresentationRequest) {
  const requestedSlides = clampSlideCount(input.slides);

  return [
    `Source type: ${input.source}`,
    `Use case: ${input.purpose}`,
    `Visual style: ${input.style}`,
    `Requested slides: ${requestedSlides}`,
    `Language: ${input.language}`,
    `Audience: ${input.audience}`,
    "User material:",
    input.prompt || "(No text provided.)",
    "",
    "Requirements:",
    `- Produce exactly ${requestedSlides} slides.`,
    "- Start with a cover slide and an agenda/narrative map, then build the argument with evidence, implications, and decisions.",
    "- For decks longer than 8 slides, include section-divider slides that create a boardroom narrative arc.",
    "- Use chart layout when useful, with plausible placeholder data only when exact numbers are absent.",
    "- Avoid generic titles like Overview, Problem, Solution, Market, Next Steps. Use full-sentence conclusions.",
    "- Each slide body should have 2 to 5 concise bullets.",
    "- Add a short takeaway to most non-cover slides.",
    "- Add a visual direction for most slides, such as process map, KPI card, comparison table, or executive summary.",
    "- Add metric when a slide benefits from a large evidence number or decision KPI.",
    "- Speaker notes should explain the presenter talk track in 1 to 3 sentences.",
    "- The deck must be directly renderable into PowerPoint.",
  ].join("\n");
}

function getMaxOutputTokens(slides: number) {
  const configured = Number(process.env.AI_MAX_OUTPUT_TOKENS);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(32000, Math.round(configured));
  }

  return Math.min(24000, Math.max(6000, clampSlideCount(slides) * 700));
}

function normalizeDeck(deck: DeckSpec, input: PresentationRequest): DeckSpec {
  const targetCount = clampSlideCount(input.slides);
  const slides = Array.isArray(deck.slides) ? deck.slides.slice(0, targetCount) : [];

  while (slides.length < Math.min(targetCount, 4)) {
    slides.push({
      layout: slides.length === 0 ? "cover" : "content",
      title: fallbackTitle(input, slides.length),
      body: ["补充核心观点", "完善证据链", "明确下一步行动"],
    });
  }

  return {
    title: deck.title || fallbackTitle(input, 0),
    subtitle: deck.subtitle || "AI-generated presentation",
    language: deck.language || input.language,
    audience: deck.audience || input.audience,
    theme: deck.theme || { accent: "gold", mood: input.style },
    slides,
  };
}

function clampSlideCount(count: number) {
  if (!Number.isFinite(count)) return 12;
  return Math.max(4, Math.min(30, Math.round(count)));
}

function fallbackTitle(input: PresentationRequest, index: number) {
  const labels: Record<PresentationRequest["purpose"], string> = {
    fundraising: "融资路演方案",
    sales: "销售方案",
    training: "培训课程",
    report: "内部汇报",
  };

  return index === 0 ? labels[input.purpose] : `${labels[input.purpose]} ${index + 1}`;
}

function createMockDeck(input: PresentationRequest): DeckSpec {
  const title = fallbackTitle(input, 0);
  const requestedSlides = clampSlideCount(input.slides);
  const baseSlides: DeckSpec["slides"] = [
    {
      layout: "cover",
      kicker: "DeckPilot AI",
      title,
      subtitle: `${input.audience} · ${input.language}`,
      body: ["用清晰叙事压缩信息密度", "把材料转化成可汇报结构"],
    },
    {
      layout: "agenda",
      kicker: "Narrative",
      title: "本次演示的主线",
      body: ["现状与关键问题", "方案与能力路径", "价值证明与执行计划", "下一步决策建议"],
    },
    {
      layout: "chart",
      kicker: "Evidence",
      title: "价值提升来自三个杠杆",
      body: ["减少重复制作时间", "提升信息一致性", "缩短决策沟通链路"],
      chart: {
        title: "Impact score",
        labels: ["效率", "一致性", "安全", "转化"],
        values: [82, 74, 68, 79],
      },
      takeaway: "优先把高频场景产品化，能最快形成可见收益。",
    },
    {
      layout: "comparison",
      kicker: "Before / After",
      title: "从零散材料到完整汇报",
      body: ["输入：旧 PPT、文稿、大纲或一句话主题", "处理：重构叙事、生成页面、统一风格", "输出：可编辑 PowerPoint 文件"],
    },
    {
      layout: "closing",
      kicker: "Next",
      title: "建议下一步",
      body: ["确认目标受众和页数", "接入生成 API 与文件存储", "补齐账号、支付和历史记录"],
      takeaway: "先跑通生成链路，再优化模板质量和商业闭环。",
    },
  ];

  while (baseSlides.length < requestedSlides) {
    baseSlides.splice(baseSlides.length - 1, 0, {
      layout: "content",
      kicker: "Detail",
      title: `补充页面 ${baseSlides.length}`,
      body: ["核心观点", "支撑证据", "业务影响", "执行建议"],
    });
  }

  return {
    title,
    subtitle: "Generated by DeckPilot AI",
    language: input.language,
    audience: input.audience,
    theme: { accent: input.style === "product" ? "cyan" : input.style === "academic" ? "sage" : "gold", mood: input.style },
    slides: baseSlides.slice(0, requestedSlides),
  };
}
