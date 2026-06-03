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
            enum: ["cover", "agenda", "section", "executiveSummary", "content", "chart", "comparison", "timeline", "matrix", "closing"],
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

  return createDeckWithOpenAIModels(apiKey, getModelCandidates(), input);
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
  const errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await createAnthropicMessage(apiKey, model, input, errors[errors.length - 1]);
      const text = extractAnthropicText(response);
      if (!text) {
        throw new Error("Anthropic did not return a structured deck.");
      }
      const deck = normalizeDeck(parseDeckJson(text), input);
      validateSourceAnchors(deck, input);
      return deck;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      if (message.includes("ANTHROPIC_API_KEY") || message.includes("API key")) break;
    }
  }

  throw new Error(`Anthropic generation failed.\n${errors.join("\n")}`);
}

async function createDeckWithOpenAIModels(apiKey: string, models: string[], input: PresentationRequest) {
  const errors: string[] = [];

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await createResponse(apiKey, model, input, errors[errors.length - 1]);
        const text = extractOutputText(response);
        if (!text) {
          throw new Error("OpenAI did not return a structured deck.");
        }
        const deck = normalizeDeck(parseDeckJson(text), input);
        validateSourceAnchors(deck, input);
        return deck;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${model}: ${message}`);
        if (message.includes("OPENAI_API_KEY") || message.includes("API Key")) {
          break;
        }
      }
    }
  }

  throw new Error(`All OpenAI model candidates failed.\n${errors.join("\n")}`);
}

async function createResponse(apiKey: string, model: string, input: PresentationRequest, previousError?: string): Promise<OpenAIResponse> {
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
          content: buildUserPrompt(input, previousError),
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

async function createAnthropicMessage(apiKey: string, model: string, input: PresentationRequest, previousError?: string) {
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
      temperature: previousError ? 0.2 : 0.4,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: `${buildUserPrompt(input, previousError)}\n\nReturn only JSON. Do not wrap it in markdown.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await formatAnthropicError(response, model));
  }

  return (await response.json()) as AnthropicResponse;
}

function buildSystemPrompt() {
  if (process.env.DECKPILOT_LONG_WORKER !== "1") {
    return [
      "You are a senior presentation strategist and visual information designer.",
      "Create a concise, business-ready PowerPoint outline with strong narrative structure.",
      "Return only valid JSON that matches the supplied schema.",
      "Keep slide text short enough to fit a polished presentation. Prefer clear claims over vague slogans.",
    ].join("\n");
  }

  return [
    "You are a senior McKinsey-level presentation strategist, executive storyteller, and visual information designer.",
    "Build board-ready PowerPoint decks with a clear storyline, MECE structure, crisp slide titles, evidence-first claims, and executive-level language.",
    "Every slide title must be a message sentence, not a topic label.",
    "A strong deck should feel like a finished consultant/business presentation, not a generic AI outline.",
    "Use a narrative spine: situation, complication, insight, recommendation, proof, rollout, risks, decision.",
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

function buildUserPrompt(input: PresentationRequest, previousError?: string) {
  const requestedSlides = clampSlideCount(input.slides);

  return [
    previousError ? `Previous generation failed validation: ${previousError}` : "",
    previousError ? "Regenerate the entire JSON deck. Do not repeat the formatting mistake." : "",
    `Source type: ${input.source}`,
    `Use case: ${input.purpose}`,
    `Visual style: ${input.style}`,
    `Style guidance: ${styleGuidance(input.style)}`,
    `Requested slides: ${requestedSlides}`,
    `Language: ${input.language}`,
    `Audience: ${input.audience}`,
    ...requiredAnchorPrompt(input),
    "User material:",
    input.prompt || "(No text provided.)",
    "",
    "Requirements:",
    `- Produce exactly ${requestedSlides} slides.`,
    ...sourceSpecificRequirements(input),
    ...structureRequirements(input),
    "- Use chart layout when useful, with plausible placeholder data only when exact numbers are absent; label assumptions clearly in speaker notes.",
    "- Avoid generic titles like Overview, Problem, Solution, Market, Next Steps. Use full-sentence conclusions.",
    "- Each slide body should have 2 to 5 concise bullets.",
    "- Add a short takeaway to most non-cover slides.",
    "- Add a visual direction for most slides, such as process map, KPI card, comparison table, or executive summary.",
    "- Add metric when a slide benefits from a large evidence number or decision KPI.",
    "- Speaker notes should explain the presenter talk track in 1 to 3 sentences.",
    "- The deck must be directly renderable into PowerPoint.",
    "- JSON must be syntactically valid: double-quoted strings, escaped internal quotes, no raw line breaks inside strings, no trailing commas.",
  ].join("\n");
}

function requiredAnchorPrompt(input: PresentationRequest) {
  const anchors = extractRequiredSourceAnchors(input);
  if (!anchors.length) return [];
  return [
    `Required source anchors to preserve exactly: ${anchors.join(", ")}`,
    "These anchors come from the uploaded PPT. Keep them in the generated slide titles, body, metrics, or speaker notes unless the user explicitly asks to remove them.",
  ];
}

function structureRequirements(input: PresentationRequest) {
  if (input.source === "ppt") {
    return [
      "- Preserve the uploaded deck's page order unless the user explicitly asks for a new order.",
      "- Use layouts that fit each original slide's purpose; do not force a cover/agenda/executive-summary pattern if the source deck does not support it.",
      "- For each output slide, transform the corresponding source content into clearer executive language and better visual hierarchy.",
    ];
  }

  return [
    "- Start with a cover slide, then an agenda/narrative map and an executive summary that states the recommendation.",
    "- For decks longer than 8 slides, include section-divider slides that create a boardroom narrative arc.",
    "- Use a mix of layouts: executiveSummary for synthesis, chart for quantified evidence, comparison for tradeoffs, timeline for rollout, matrix for priorities or risk mapping.",
  ];
}

function sourceSpecificRequirements(input: PresentationRequest) {
  if (input.source !== "ppt") return [];

  return [
    "- This is a PPT redesign task, not a new-topic generation task.",
    "- The uploaded PPT content is the source of truth. Every output slide must be traceable to one or more source slides.",
    "- Keep the same domain, project names, product names, data points, decisions, risks, and timeline from the uploaded PPT.",
    "- If the user asks for a different style, change narrative quality and visual structure, not the underlying content.",
    "- Do not invent a new company, new product, new market, new fundraising story, or unrelated AI/SaaS scenario unless it exists in the uploaded source material.",
    "- In speaker notes, mention which source slide(s) each output slide is based on.",
  ];
}

function getMaxOutputTokens(slides: number) {
  const configured = Number(process.env.AI_MAX_OUTPUT_TOKENS);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(32000, Math.round(configured));
  }

  if (process.env.DECKPILOT_LONG_WORKER !== "1") {
    return Math.min(6000, Math.max(3500, clampSlideCount(slides) * 550));
  }

  return Math.min(32000, Math.max(8000, clampSlideCount(slides) * 950));
}

function validateSourceAnchors(deck: DeckSpec, input: PresentationRequest) {
  if (input.source !== "ppt") return;
  const anchors = extractRequiredSourceAnchors(input);
  if (!anchors.length) return;

  const deckText = [
    deck.title,
    deck.subtitle,
    ...deck.slides.flatMap((slide) => [
      slide.kicker,
      slide.title,
      slide.subtitle,
      ...(slide.body || []),
      slide.takeaway,
      slide.speakerNotes,
      slide.visual,
      slide.metric?.label,
      slide.metric?.value,
      slide.metric?.context,
      slide.chart?.title,
      ...(slide.chart?.labels || []),
    ]),
  ]
    .filter(Boolean)
    .join("\n");

  const missing = anchors.filter((anchor) => !deckText.includes(anchor));
  if (missing.length) {
    throw new Error(`Source anchor terms missing from generated deck: ${missing.join(", ")}`);
  }
}

function extractRequiredSourceAnchors(input: PresentationRequest) {
  if (input.source !== "ppt") return [];
  const text = input.prompt || "";
  const anchors = new Set<string>();

  for (const match of text.matchAll(/\b(?:RAG|ROI|RBAC|ABAC|SSO|AD|API|ERP|MES|PLM|CRM|EHS|CIO|CEO|AI)\b/g)) {
    anchors.add(match[0]);
  }
  for (const match of text.matchAll(/\b\d+\s*(?:天|周|个月|月|年|days?|weeks?|months?|years?)\b/gi)) {
    anchors.add(match[0].replace(/\s+/g, " "));
  }
  for (const match of text.matchAll(/\b\d+\s*[–-]\s*\d+\s*(?:天|周|个月|月|年|days?|weeks?|months?|years?)\b/gi)) {
    anchors.add(match[0].replace(/\s+/g, " "));
  }

  return Array.from(anchors).slice(0, 16);
}

function parseDeckJson(text: string) {
  const candidates = [extractJsonObject(stripJsonFence(text))];
  candidates.push(escapeControlCharactersInStrings(candidates[0]));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as DeckSpec;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Model returned invalid JSON.");
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

function escapeControlCharactersInStrings(text: string) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      output += char;
      continue;
    }

    if (inString && char === "\n") {
      output += "\\n";
      continue;
    }

    if (inString && char === "\r") {
      output += "\\r";
      continue;
    }

    if (inString && char === "\t") {
      output += "\\t";
      continue;
    }

    output += char;
  }

  return output;
}

function normalizeDeck(deck: DeckSpec, input: PresentationRequest): DeckSpec {
  const targetCount = clampSlideCount(input.slides);
  const slides = Array.isArray(deck.slides) ? deck.slides.slice(0, targetCount) : [];

  if (input.source !== "ppt" && slides[0] && slides[0].layout !== "cover") {
    slides[0] = { ...slides[0], layout: "cover" };
  }

  if (input.source !== "ppt" && targetCount >= 5 && slides[1] && !["agenda", "executiveSummary"].includes(slides[1].layout)) {
    slides[1] = { ...slides[1], layout: "agenda" };
  }

  while (slides.length < targetCount) {
    slides.push({
      layout: input.source === "ppt" ? "content" : fallbackLayout(slides.length, targetCount),
      title: fallbackTitle(input, slides.length),
      body: ["补充核心观点", "完善证据链", "明确下一步行动"],
      takeaway: "该页用于补足完整叙事结构，建议后续用真实业务数据替换占位内容。",
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

function fallbackLayout(index: number, total: number): DeckSpec["slides"][number]["layout"] {
  if (index === 0) return "cover";
  if (index === 1) return "agenda";
  if (index === total - 1) return "closing";
  if (index === 2) return "executiveSummary";
  if (index % 7 === 0) return "timeline";
  if (index % 5 === 0) return "matrix";
  if (index % 4 === 0) return "chart";
  return "content";
}

function styleGuidance(style: PresentationRequest["style"]) {
  const guidance: Record<PresentationRequest["style"], string> = {
    consulting: "dense executive logic, clean hypothesis-led pages, quantified implications, sober visual hierarchy",
    product: "product narrative, capability modules, workflow diagrams, adoption path, proof points and user value",
    brand: "launch story, visual hooks, emotional positioning, audience promise, campaign-ready phrasing",
    academic: "definition, method, evidence chain, limitations, conclusion, rigorous but readable argument",
  };
  return guidance[style];
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
      layout: "executiveSummary",
      kicker: "Executive summary",
      title: "建议优先把高频汇报场景产品化",
      body: ["先覆盖销售、融资、培训和内部汇报四类高频场景", "用统一模板体系保证输出稳定性", "用后台长任务承载 20-30 页复杂生成"],
      metric: { label: "Target output", value: "30 页", context: "稳定后台生成上限" },
      takeaway: "产品竞争力来自稳定输出、可编辑文件和接近人工顾问的叙事质量。",
    },
    {
      layout: "comparison",
      kicker: "Before / After",
      title: "从零散材料到完整汇报",
      body: ["输入：旧 PPT、文稿、大纲或一句话主题", "处理：重构叙事、生成页面、统一风格", "输出：可编辑 PowerPoint 文件"],
    },
    {
      layout: "timeline",
      kicker: "Rollout",
      title: "上线节奏应先跑通生成闭环，再扩展商业闭环",
      body: ["第 1 阶段：登录、历史记录、文件存储和稳定生成", "第 2 阶段：高质量模板、长任务 Worker 和模型切换", "第 3 阶段：支付限额、域名、监控和增长分析"],
      takeaway: "先保证用户能拿到高质量 PPT，再逐步引入付费限制。",
    },
    {
      layout: "matrix",
      kicker: "Priority",
      title: "功能优先级应围绕生成成功率和成稿质量排序",
      body: ["高价值 / 低复杂：模型提示词和模板升级", "高价值 / 高复杂：长任务 Worker 和支付限制", "低价值 / 低复杂：基础文案优化", "低价值 / 高复杂：过早做复杂团队协作"],
      takeaway: "当前阶段最值得投入的是稳定生成和模板质量。",
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
      layout: fallbackLayout(baseSlides.length, requestedSlides),
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
