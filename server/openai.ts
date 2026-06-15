import { ProxyAgent, setGlobalDispatcher } from "undici";
import type { DeckSpec, PresentationRequest } from "../src/shared/deck";
import {
  compactSourceText,
  extractExplicitSourceSections,
  extractSourceAnchors,
  extractSourceOutlineUnits,
  extractUserInstructions,
  extractUserSourceMaterial,
  normalizeComparableText,
  sourceTermCovered,
} from "./sourceGrounding";
import { isOpenAIQuotaOrRateLimit } from "./userErrors";

export const DEFAULT_MODEL = "gpt-5.2";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
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
        template: {
          type: "string",
          enum: [
            "executiveDark",
            "editorialLight",
            "dataGrid",
            "productNeon",
            "warmBoardroom",
            "academicPaper",
            "creativePitch",
            "corporateClean",
            "brandGradient",
            "internalOps",
          ],
        },
        density: { type: "string", enum: ["calm", "balanced", "dense"] },
        fontStyle: { type: "string", enum: ["modernSans", "editorialSerif", "condensedImpact", "roundedHuman"] },
        paletteIntent: { type: "string", enum: ["brand", "creative", "corporate", "tech", "warm", "academic"] },
        brandPrimary: { type: "string" },
        brandSecondary: { type: "string" },
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
            enum: [
              "cover",
              "agenda",
              "section",
              "executiveSummary",
              "content",
              "chart",
              "comparison",
              "timeline",
              "matrix",
              "heroMetric",
              "splitStory",
              "threeCards",
              "beforeAfter",
              "insightGrid",
              "process",
              "caseStudy",
              "quote",
              "dashboard",
              "closing",
            ],
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
          sourceSlides: {
            type: "array",
            maxItems: 4,
            items: { type: "number" },
          },
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await createAnthropicMessage(apiKey, model, input, errors[errors.length - 1]);
      const text = extractAnthropicText(response);
      if (!text) {
        throw new Error("Anthropic did not return a structured deck.");
      }
      const draftDeck = normalizeDeck(parseDeckJson(text), input);
      const refinedDeck = await refineDeckWithAnthropic(apiKey, model, input, draftDeck);
      const deck = enforceSourceGrounding(normalizeDeck(refinedDeck || draftDeck, input), input);
      validateSourceAnchors(deck, input);
      validateSourceCoverage(deck, input);
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await createResponse(apiKey, model, input, errors[errors.length - 1]);
        const text = extractOutputText(response);
        if (!text) {
          throw new Error("OpenAI did not return a structured deck.");
        }
        const deck = enforceSourceGrounding(normalizeDeck(parseDeckJson(text), input), input);
        validateSourceAnchors(deck, input);
        validateSourceCoverage(deck, input);
        return deck;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${model}: ${message}`);
        if (isOpenAIQuotaOrRateLimit(message)) {
          throw new Error(message);
        }
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

async function refineDeckWithAnthropic(apiKey: string, model: string, input: PresentationRequest, draftDeck: DeckSpec) {
  if (process.env.CLAUDE_REFINEMENT === "0") return null;

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
      temperature: 0.25,
      system: [
        buildSystemPrompt(),
        "You are now acting as a hidden presentation creative director and quality reviewer.",
        "The user will not see your critique. Improve the JSON deck directly.",
        "Review for content logic, visual hierarchy, slide-to-slide rhythm, image placement intent, and editable PowerPoint feasibility.",
        "Avoid fixed template thinking. Keep the rendering schema, but make every slide feel specifically designed for the source material.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: buildClaudeRefinementPrompt(input, draftDeck),
        },
      ],
    }),
  });

  if (!response.ok) {
    console.warn(await formatAnthropicError(response, model));
    return null;
  }

  const text = extractAnthropicText((await response.json()) as AnthropicResponse);
  if (!text) return null;
  return parseDeckJson(text);
}

function buildClaudeRefinementPrompt(input: PresentationRequest, draftDeck: DeckSpec) {
  return [
    "Improve this draft deck JSON. Return only the complete improved JSON object, with the same schema.",
    "",
    "Source material summary:",
    compactPromptText(extractUserSourceMaterial(input.prompt), 14000),
    "",
    "Hidden review criteria:",
    "- Preserve the user's facts, entities, sequence, and conclusions.",
    "- Improve slide titles into sharp message sentences.",
    "- Make layouts less repetitive and more content-specific.",
    "- Make the deck feel layered: strong statement pages, evidence pages, visual explanation pages, and decision pages.",
    "- Use sourceSlides consistently for uploaded PPT redesigns.",
    "- Keep text short enough for editable PPT text boxes.",
    "- For images/screenshots, keep visual directions clear and reserve room for source assets.",
    "- Do not add any user-facing Claude explanation or review notes.",
    "",
    "Draft JSON:",
    JSON.stringify(draftDeck),
    "",
    "Return only JSON. No markdown.",
  ].join("\n");
}

function buildSystemPrompt() {
  if (process.env.DECKPILOT_LONG_WORKER !== "1") {
    return [
      "You are a senior presentation strategist, executive editor, and visual information designer.",
      "Create concise, business-ready PowerPoint decks with strong narrative structure, visual hierarchy, and clear decision value.",
      "Return only valid JSON that matches the supplied schema.",
      "Keep slide text short enough to fit a polished presentation. Prefer clear claims over vague slogans.",
      "Choose a visual template that fits the user's material instead of reusing the same look for every deck.",
      "Do not behave like a fixed-template deck generator. Art-direct each slide from the user's content and choose a layout rhythm that fits the page purpose.",
      "Quality bar: every slide must have one dominant message, a reason to exist, and a visual structure that makes the message easier to understand.",
    ].join("\n");
  }

  return [
    "You are a senior McKinsey-level presentation strategist, executive storyteller, and visual information designer.",
    "Build board-ready PowerPoint decks with a clear storyline, MECE structure, crisp slide titles, evidence-first claims, and executive-level language.",
    "Every slide title must be a message sentence, not a topic label.",
    "A strong deck should feel like a finished consultant/business presentation, not a generic AI outline.",
    "Select a distinct visual template based on the content, audience, and style request. Do not default to the same template every time.",
    "Do not force a standard cover-agenda-summary pattern when redesigning an uploaded deck. Preserve the source deck's intent and art-direct every slide independently.",
    "Use a narrative spine: situation, complication, insight, recommendation, proof, rollout, risks, decision.",
    "Apply design taste: restrained typography, high contrast, strong spacing, compact labels, no text dumping, no decorative clutter.",
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
    return `OpenAI quota or rate limit was reached. ${message}`;
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
  const visualDirection = pickVisualDirection(input);
  const sourceMaterial = extractUserSourceMaterial(input.prompt);
  const sourceInstructions = extractUserInstructions(input.prompt);
  const explicitSections = extractExplicitSourceSections(sourceMaterial);
  const sourceUnits = extractSourceOutlineUnits(sourceMaterial, Math.min(16, requestedSlides + 4));
  const sourceAnchors = input.sourceAnchors?.length ? input.sourceAnchors.slice(0, 24) : extractSourceAnchors(sourceMaterial, 24);

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
    `Visual direction for this generation: ${visualDirection}`,
    ...requiredAnchorPrompt(input),
    "USER SOURCE MATERIAL (authoritative; use only this as deck content):",
    sourceMaterial || "(No text provided.)",
    sourceInstructions ? "" : "",
    sourceInstructions ? "User direction (presentation intent and style only; do not treat as new source facts):" : "",
    sourceInstructions || "",
    explicitSections.length ? "" : "",
    explicitSections.length ? "Required source sections to preserve in order:" : "",
    ...explicitSections.map((section, index) => `${index + 1}. ${section.title}`),
    !explicitSections.length && sourceUnits.length ? "" : "",
    !explicitSections.length && sourceUnits.length ? "Detected source content units to preserve:" : "",
    ...(!explicitSections.length ? sourceUnits.map((unit, index) => `${index + 1}. ${unit.title}`) : []),
    sourceAnchors.length ? "" : "",
    sourceAnchors.length ? "Critical source anchors that must remain visible when relevant:" : "",
    ...(sourceAnchors.length ? [sourceAnchors.join(", ")] : []),
    "",
    "Requirements:",
    `- Produce exactly ${requestedSlides} slides.`,
    "- The source material above is authoritative. Do not replace it with a generic business story, consulting story, AI/SaaS sales story, fundraising story, or unrelated examples.",
    explicitSections.length
      ? `- The source contains ${explicitSections.length} required sections. Create at least one visible slide for every required section, in the same order.`
      : "",
    explicitSections.length
      ? "- Do not split one source section into multiple detail slides until every required source section already has at least one visible slide."
      : "",
    explicitSections.length
      ? "- Recommended allocation: cover, concise narrative map, one slide per required source section, then synthesis/closing only if slides remain."
      : "",
    !explicitSections.length && sourceUnits.length
      ? "- For paragraph or bullet source material, preserve the detected source content units. Do not replace them with a generic deck narrative."
      : "",
    sourceAnchors.length ? "- Keep the critical source anchors in visible slide text when they are facts, names, concepts, metrics, or examples from the source." : "",
    ...explicitSections.map((section) => `- Required section to cover explicitly: ${section.title}`),
    ...sourceSpecificRequirements(input),
    ...structureRequirements(input, explicitSections.length),
    "- Use chart layout when useful, with plausible placeholder data only when exact numbers are absent; label assumptions clearly in speaker notes.",
    "- Use layout plugins when they fit the source: heroMetric for one dominant claim/KPI, process for workflows, caseStudy or beforeAfter for before-after-result stories, quote for a strong strategic recommendation, dashboard for multi-KPI operating pages, splitStory for two-sided reasoning, threeCards for 3 pillars, insightGrid for 4 related insights.",
    "- Content-to-layout rules: numbers/KPIs -> heroMetric/dashboard/chart; steps/process/time -> process/timeline; pros/cons or old/new -> comparison/beforeAfter/splitStory; 3 capabilities/pillars -> threeCards; 4 findings/risks/priorities -> insightGrid/matrix; strong recommendation -> quote/closing.",
    "- Treat the template as a loose visual direction, not a rigid template. Vary composition, density, scale, image use, and rhythm slide by slide.",
    "- Dashboard cards must be short metric summaries, not pasted raw paragraphs. Keep each dashboard card value under 18 Chinese characters or 8 English words.",
    "- Never put long source sentences into metric.value. Use metric.value only for a number, short status, or compact phrase; move detail into body, takeaway, or speaker notes.",
    "- Avoid using content layout repeatedly. A premium deck should alternate large-message pages, dense evidence pages, and structured explanation pages.",
    "- Do not overfill boxes. If a sentence is long, rewrite it into a short claim and put context in speakerNotes.",
    "- Avoid generic titles like Overview, Problem, Solution, Market, Next Steps. Use full-sentence conclusions.",
    "- Each slide body should have 2 to 5 concise bullets.",
    "- Add a short takeaway to most non-cover slides.",
    "- Add a visual direction for most slides, such as process map, KPI card, comparison table, or executive summary.",
    "- Add metric when a slide benefits from a large evidence number or decision KPI.",
    "- Choose theme.template only as a hidden rendering hint for the editable PPTX engine. Do not think in fixed templates.",
    "- If the user's material mentions brand colors, VI, logo colors, primary colors, or includes obvious brand color words/hex codes, set theme.paletteIntent to brand and set theme.brandPrimary / theme.brandSecondary as hex colors.",
    "- If this is an agency/vendor-to-client presentation, campaign proposal, brand launch, sales pitch, or creative concept, prefer creativePitch or brandGradient with expressive color and bigger visual rhythm.",
    "- If this is company internal reporting, weekly/monthly review, department work summary, OKR, operation review, or management sync, prefer corporateClean, internalOps, or dataGrid with clear hierarchy and more varied but controlled colors.",
    "- Choose theme.fontStyle deliberately: modernSans for SaaS/product/business; editorialSerif for premium/brand/story; condensedImpact for bold pitch/creative; roundedHuman for internal enablement/training.",
    `- Make the selected theme and layout rhythm clearly match this visual direction: ${visualDirection}.`,
    "- Vary the template, accent, density, and layout mix according to the user's content; avoid making unrelated decks look identical.",
    "- Speaker notes should explain the presenter talk track in 1 to 3 sentences.",
    "- The deck must be directly renderable into PowerPoint.",
    "- JSON must be syntactically valid: double-quoted strings, escaped internal quotes, no raw line breaks inside strings, no trailing commas.",
  ].join("\n");
}

function requiredAnchorPrompt(input: PresentationRequest) {
  const anchors = input.sourceAnchors?.length ? input.sourceAnchors.slice(0, 24) : extractSourceAnchors(extractUserSourceMaterial(input.prompt), 24);
  if (!anchors.length) return [];
  return [
    `Required content anchors to preserve exactly: ${anchors.join(", ")}`,
    "These anchors are important facts or terms from the user's material. Keep them in slide titles, body, metrics, or speaker notes unless the user explicitly asks to remove them.",
  ];
}

function structureRequirements(input: PresentationRequest, explicitSectionCount = 0) {
  if (input.source === "ppt") {
    return [
      "- Preserve the uploaded deck's page order unless the user explicitly asks for a new order.",
      "- Use layouts that fit each original slide's purpose; do not force a cover/agenda/executive-summary pattern if the source deck does not support it.",
      "- Use richer layout plugins where appropriate: dashboard for KPI-heavy source slides, process for workflow slides, caseStudy or beforeAfter for example/outcome slides, heroMetric for a dominant number or claim, splitStory for two-side reasoning.",
      "- For each output slide, transform the corresponding source content into clearer executive language and better visual hierarchy.",
    ];
  }

  return [
    explicitSectionCount
      ? "- Start with a cover slide and a short narrative map only if there is room; never sacrifice required source sections for a generic executive summary."
      : "- Start with a cover slide, then an agenda/narrative map and an executive summary that states the recommendation.",
    explicitSectionCount ? "- For markdown or numbered source sections, preserve the source sequence and make section coverage more important than adding generic synthesis pages." : "",
    "- For decks longer than 8 slides, include section-divider slides that create a boardroom narrative arc.",
    "- Use a mix of layouts: executiveSummary for synthesis, chart for quantified evidence, dashboard for KPI pages, comparison/beforeAfter for tradeoffs, process for workflows, caseStudy for examples, timeline for rollout, matrix/insightGrid for priorities or risk mapping, threeCards for pillars, quote for decisive recommendations.",
  ];
}

function pickVisualDirection(input: PresentationRequest) {
  const directions: Record<PresentationRequest["style"], string[]> = {
    consulting: [
      "executiveDark: dark boardroom deck, cinematic cover, large claims, sparse evidence blocks, gold accent",
      "dataGrid: operating dashboard deck, visible grid system, KPI rows, dense but organized evidence",
      "warmBoardroom: premium investor memo, warm dark palette, serif-like rhythm, decision cards",
      "corporateClean: internal leadership report, bright background, blue/teal system colors, clear KPI hierarchy",
      "creativePitch: client-facing proposal, expressive blocks, bigger typography, richer color moments",
    ],
    product: [
      "productNeon: modular product UI deck, dark panels, cyan signal lines, system architecture feel",
      "dataGrid: technical operating dashboard, grid rails, compact labels, proof-led modules",
      "executiveDark: enterprise sales deck, restrained dark theme, strong product claims",
      "brandGradient: modern product launch deck, color gradients, bold positioning, demo-like composition",
    ],
    brand: [
      "editorialLight: magazine-like brand story, wide whitespace, warm paper, expressive section pages",
      "warmBoardroom: premium launch narrative, cinematic contrast, bold statement pages",
      "productNeon: modern digital campaign deck, dark interactive product feel",
      "creativePitch: agency proposal deck, expressive typography, colorful concept pages, client-facing polish",
      "brandGradient: VI-led brand deck, primary color system, gradients, emotional section rhythm",
    ],
    academic: [
      "academicPaper: research paper deck, light background, thin rules, method/evidence/conclusion rhythm",
      "editorialLight: journal-style explainer, calm whitespace, annotated evidence blocks",
      "dataGrid: evidence dashboard, matrix pages, numbered findings, compact references",
      "corporateClean: internal research readout, clean blue/gray palette, accessible summary hierarchy",
    ],
  };

  const pool = directions[input.style] || directions.consulting;
  return pool[Math.floor(Math.random() * pool.length)];
}

function sourceSpecificRequirements(input: PresentationRequest) {
  if (input.source !== "ppt") return [];

  return [
    "- This is a PPT redesign task, not a new-topic generation task.",
    "- The uploaded PPT content is the source of truth. Every output slide must be traceable to one or more source slides.",
    "- For every output slide, set sourceSlides to the original slide number(s) used to create that slide.",
    "- If the source deck includes images, logos, screenshots, diagrams, or product visuals, assume they will be reused as source assets. Write visual directions that leave room for those assets.",
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
    return Math.min(16000, Math.max(8000, clampSlideCount(slides) * 1100));
  }

  return Math.min(32000, Math.max(12000, clampSlideCount(slides) * 1400));
}

function validateSourceAnchors(deck: DeckSpec, input: PresentationRequest) {
  const anchors = input.sourceAnchors?.length ? input.sourceAnchors.slice(0, 24) : extractSourceAnchors(extractUserSourceMaterial(input.prompt), 24);
  if (!anchors.length) return;

  const deckText = normalizeComparableText(collectVisibleDeckText(deck));
  const missing = anchors.filter((anchor) => !sourceTermCovered(deckText, anchor));
  const requiredCoverage = input.sourceAnchors?.length || input.source === "ppt" ? anchors.length : Math.ceil(anchors.length * 0.72);
  const covered = anchors.length - missing.length;
  if (covered < requiredCoverage) {
    throw new Error(`Source anchor terms missing from generated deck: ${missing.join(", ")}`);
  }
}

function validateSourceCoverage(deck: DeckSpec, input: PresentationRequest) {
  const sourceMaterial = extractUserSourceMaterial(input.prompt);
  const deckText = normalizeComparableText(collectVisibleDeckText(deck));
  const sections = extractExplicitSourceSections(sourceMaterial).slice(0, 16);
  if (sections.length >= 2) {
    const missing = sections.filter((section) => !sourceTermCovered(deckText, section.title));
    if (missing.length) {
      throw new Error(`Generated deck omitted source sections: ${missing.map((section) => section.title).join(", ")}`);
    }
    return;
  }

  const units = extractSourceOutlineUnits(sourceMaterial, Math.min(12, clampSlideCount(input.slides) + 2));
  if (units.length < 2) return;
  const missing = units.filter((unit) => !sourceTermCovered(deckText, unit.title) && !unit.body.some((line) => sourceTermCovered(deckText, line)));
  const requiredCoverage = Math.ceil(units.length * 0.65);
  if (units.length - missing.length < requiredCoverage) {
    throw new Error(`Generated deck drifted away from source content: ${missing.map((unit) => unit.title).join(", ")}`);
  }
}

function collectDeckText(deck: DeckSpec) {
  return [
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
}

function collectVisibleDeckText(deck: DeckSpec) {
  return [
    deck.title,
    deck.subtitle,
    ...deck.slides.flatMap((slide) => [
      slide.kicker,
      slide.title,
      slide.subtitle,
      ...(slide.body || []),
      slide.takeaway,
      slide.metric?.label,
      slide.metric?.value,
      slide.metric?.context,
      slide.chart?.title,
      ...(slide.chart?.labels || []),
    ]),
  ]
    .filter(Boolean)
    .join("\n");
}

function parseDeckJson(text: string) {
  const base = extractJsonObject(stripJsonFence(text));
  const candidates = uniqueCandidates([
    base,
    escapeControlCharactersInStrings(base),
    repairTruncatedJson(base),
    repairTruncatedJson(escapeControlCharactersInStrings(base)),
  ]);

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
  if (first >= 0) {
    return trimmed.slice(first);
  }
  return trimmed;
}

function uniqueCandidates(candidates: string[]) {
  return Array.from(new Set(candidates.filter((candidate) => candidate.trim().length > 0)));
}

function repairTruncatedJson(text: string) {
  let output = "";
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const char of text.trim()) {
    output += char;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") stack.push("}");
    if (char === "[") stack.push("]");
    if ((char === "}" || char === "]") && stack[stack.length - 1] === char) stack.pop();
  }

  if (inString) output += '"';
  output = output.trimEnd().replace(/,\s*$/, "");

  while (stack.length) {
    const closer = stack.pop() || "";
    output = output.replace(/,\s*$/, "");
    output += closer;
  }

  return output.replace(/,\s*([}\]])/g, "$1");
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
    const fallbackSlide = sourceBackedFallbackSlide(input, slides.length);
    slides.push({
      ...fallbackSlide,
      layout: input.source === "ppt" ? "content" : fallbackLayout(slides.length, targetCount),
    });
  }

  const enhancedSlides = slides.map((slide, index) => {
    const normalizedBody = trimSlideBody(normalizeSlideBody(slide.body));
    const normalizedSlide = { ...slide, body: normalizedBody };
    return {
      ...normalizedSlide,
      layout: improveLayoutForContent(normalizedSlide, index, targetCount, input),
      sourceSlides: normalizeSourceSlides(slide.sourceSlides, index, input),
    };
  });

  return {
    title: deck.title || fallbackTitle(input, 0),
    subtitle: deck.subtitle || "AI-generated presentation",
    language: deck.language || input.language,
    audience: deck.audience || input.audience,
    theme: normalizeTheme(deck.theme, input),
    slides: enhancedSlides,
  };
}

function normalizeSourceSlides(sourceSlides: number[] | undefined, index: number, input: PresentationRequest) {
  if (input.source !== "ppt") return sourceSlides;
  const values = (sourceSlides || [index + 1])
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  return Array.from(new Set(values)).slice(0, 4);
}

function enforceSourceGrounding(deck: DeckSpec, input: PresentationRequest): DeckSpec {
  const sourceMaterial = extractUserSourceMaterial(input.prompt);
  if (!sourceMaterial) return deck;

  const slides = deck.slides.map((slide) => ({
    ...slide,
    body: slide.body ? [...slide.body] : [],
  }));
  let visibleText = normalizeComparableText(collectVisibleDeckText({ ...deck, slides }));
  const repairLines: string[] = [];

  const sections = extractExplicitSourceSections(sourceMaterial).slice(0, 12);
  if (sections.length >= 2) {
    const missingSections = sections.filter((section) => !sourceTermCovered(visibleText, section.title));
    repairLines.push(...missingSections.slice(0, 6).map((section) => `源文章节：${section.title}`));
  } else {
    const units = extractSourceOutlineUnits(sourceMaterial, Math.min(10, clampSlideCount(input.slides) + 2));
    const missingUnits = units.filter((unit) => !sourceTermCovered(visibleText, unit.title) && !unit.body.some((line) => sourceTermCovered(visibleText, line)));
    repairLines.push(...missingUnits.slice(0, 4).map((unit) => `源文要点：${unit.title}`));
  }

  const anchors = input.sourceAnchors?.length ? input.sourceAnchors.slice(0, 24) : extractSourceAnchors(sourceMaterial, 24);
  const missingAnchors = anchors.filter((anchor) => !sourceTermCovered(visibleText, anchor));
  for (let index = 0; index < missingAnchors.length; index += 6) {
    repairLines.push(`源文事实：${missingAnchors.slice(index, index + 6).join("、")}`);
  }

  if (!repairLines.length) return deck;

  const targetIndex = Math.min(Math.max(1, slides.findIndex((slide, index) => index > 0 && slide.layout !== "cover")), slides.length - 1);
  const targetSlide = slides[targetIndex] || slides[slides.length - 1];
  if (!targetSlide) return deck;

  const existingBody = targetSlide.body || [];
  targetSlide.body = [...repairLines, ...existingBody]
    .map((line) => compactPromptText(line, 96))
    .slice(0, 5);
  targetSlide.takeaway = targetSlide.takeaway || compactPromptText(repairLines[0], 92);

  visibleText = normalizeComparableText(collectVisibleDeckText({ ...deck, slides }));
  const stillMissing = anchors.filter((anchor) => !sourceTermCovered(visibleText, anchor));
  if (stillMissing.length && slides[slides.length - 1]) {
    const lastSlide = slides[slides.length - 1];
    lastSlide.body = [
      ...chunkTerms(stillMissing, 6).map((chunk) => `源文事实：${chunk.join("、")}`),
      ...(lastSlide.body || []),
    ]
      .map((line) => compactPromptText(line, 96))
      .slice(0, 5);
  }

  return { ...deck, slides };
}

function chunkTerms(terms: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < terms.length; index += size) {
    chunks.push(terms.slice(index, index + size));
  }
  return chunks;
}

function sourceBackedFallbackSlide(input: PresentationRequest, index: number): DeckSpec["slides"][number] {
  const sourceMaterial = extractUserSourceMaterial(input.prompt);
  const units = extractSourceOutlineUnits(sourceMaterial, 24);
  const unit = units[Math.max(0, index - 1) % Math.max(1, units.length)];
  if (unit) {
    return {
      layout: "content",
      title: unit.title,
      body: unit.body.length ? unit.body.slice(0, 4).map((item) => compactSourceText(item, 82)) : [unit.title],
      takeaway: compactSourceText(unit.body[0] || unit.title, 92),
    };
  }

  return {
    layout: "content",
    title: fallbackTitle(input, index),
    body: ["请补充更多源材料"],
    takeaway: "该页缺少足够来源内容，建议补充原始文案后重新生成。",
  };
}

function improveLayoutForContent(
  slide: DeckSpec["slides"][number],
  index: number,
  total: number,
  input: PresentationRequest,
): DeckSpec["slides"][number]["layout"] {
  if (index === 0 && input.source !== "ppt") return "cover";
  if (index === total - 1 && input.source !== "ppt") return "closing";
  if (slide.layout !== "content" && slide.layout !== "executiveSummary") return slide.layout;

  const text = [slide.title, slide.subtitle, ...(slide.body || []), slide.takeaway, slide.visual].filter(Boolean).join(" ");
  const hasNumber = /[\d０-９]+(?:[,.，]\d+)*(?:%|％|倍|x|X|万|亿|人|天|周|月|年|元|美元|条|次|家|页)?/.test(text);
  const hasProcess = /(流程|步骤|路径|阶段|计划|推进|落地|执行|上线|timeline|roadmap|phase|step|process)/i.test(text);
  const hasComparison = /(对比|相比|差异|权衡|取舍|before|after|versus|vs\.?|竞品|优劣|利弊|旧|新)/i.test(text);
  const hasCase = /(案例|客户|结果|成效|转化|复盘|story|case|result|outcome)/i.test(text);
  const itemCount = slide.body?.length || 0;

  if (hasComparison && hasCase) return "beforeAfter";
  if (hasComparison) return "splitStory";
  if (hasProcess) return "process";
  if (hasNumber && itemCount >= 3) return "dashboard";
  if (hasNumber) return "heroMetric";
  if (itemCount === 3) return "threeCards";
  if (itemCount >= 4) return "insightGrid";
  return slide.layout;
}

function normalizeSlideBody(body: unknown) {
  if (Array.isArray(body)) {
    return body.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof body === "string") {
    return body
      .split(/\r?\n|[；;。]\s*/)
      .map((item) => item.replace(/^[-•]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
  }
  return undefined;
}

function trimSlideBody(body: string[] | undefined) {
  if (!body?.length) return body;
  return body.slice(0, 5).map((item) => compactPromptText(item, 82));
}

function compactPromptText(value: string, maxLength: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function normalizeTheme(theme: DeckSpec["theme"] | undefined, input: PresentationRequest): DeckSpec["theme"] {
  const detectedBrandColors = detectBrandColors(input.prompt);
  const accent = theme?.accent || (input.style === "product" ? "cyan" : input.style === "academic" ? "sage" : "gold");
  const template = theme?.template || defaultTemplate(input);
  const density = theme?.density || (input.slides >= 16 ? "dense" : input.slides <= 6 ? "calm" : "balanced");
  return {
    accent,
    mood: theme?.mood || input.style,
    template,
    density,
    fontStyle: theme?.fontStyle || defaultFontStyle(template),
    paletteIntent: theme?.paletteIntent || (detectedBrandColors[0] ? "brand" : defaultPaletteIntent(template)),
    brandPrimary: normalizeHexColor(theme?.brandPrimary) || detectedBrandColors[0],
    brandSecondary: normalizeHexColor(theme?.brandSecondary) || detectedBrandColors[1],
  };
}

function detectBrandColors(text: string) {
  const colors = Array.from(new Set((text.match(/#[0-9a-fA-F]{6}\b/g) || []).map(normalizeHexColor).filter(Boolean))) as string[];
  return colors.slice(0, 2);
}

function normalizeHexColor(value: string | undefined) {
  const match = String(value || "").match(/^#?([0-9a-fA-F]{6})$/);
  return match ? match[1].toUpperCase() : undefined;
}

function defaultFontStyle(template: NonNullable<DeckSpec["theme"]["template"]>) {
  if (template === "creativePitch" || template === "brandGradient") return "condensedImpact";
  if (template === "editorialLight" || template === "academicPaper" || template === "warmBoardroom") return "editorialSerif";
  if (template === "internalOps" || template === "corporateClean") return "roundedHuman";
  return "modernSans";
}

function defaultPaletteIntent(template: NonNullable<DeckSpec["theme"]["template"]>) {
  if (template === "creativePitch" || template === "brandGradient") return "creative";
  if (template === "corporateClean" || template === "internalOps") return "corporate";
  if (template === "productNeon" || template === "dataGrid") return "tech";
  if (template === "academicPaper") return "academic";
  return "warm";
}

function defaultTemplate(input: PresentationRequest): NonNullable<DeckSpec["theme"]["template"]> {
  const options: Record<PresentationRequest["style"], NonNullable<DeckSpec["theme"]["template"]>[]> = {
    consulting: input.purpose === "fundraising"
      ? ["warmBoardroom", "executiveDark", "corporateClean", "creativePitch"]
      : ["corporateClean", "internalOps", "dataGrid", "executiveDark", "creativePitch"],
    product: input.purpose === "report" ? ["dataGrid", "corporateClean", "internalOps", "productNeon"] : ["productNeon", "brandGradient", "dataGrid", "executiveDark"],
    brand: ["creativePitch", "brandGradient", "editorialLight", "warmBoardroom", "productNeon"],
    academic: ["academicPaper", "editorialLight", "corporateClean", "dataGrid"],
  };
  const pool = options[input.style] || options.consulting;
  return pool[Math.floor(Math.random() * pool.length)] || "executiveDark";
}

function fallbackLayout(index: number, total: number): DeckSpec["slides"][number]["layout"] {
  if (index === 0) return "cover";
  if (index === 1) return "agenda";
  if (index === total - 1) return "closing";
  if (index === 2) return "executiveSummary";
  if (index % 11 === 0) return "beforeAfter";
  if (index % 10 === 0) return "splitStory";
  if (index % 9 === 0) return "caseStudy";
  if (index % 8 === 0) return "quote";
  if (index % 7 === 0) return "timeline";
  if (index % 6 === 0) return "dashboard";
  if (index % 5 === 0) return "matrix";
  if (index % 4 === 0) return "chart";
  if (index % 3 === 0) return "process";
  if (index % 2 === 0) return "threeCards";
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

function templateGuidance(style: PresentationRequest["style"]) {
  const guidance: Record<PresentationRequest["style"], string> = {
    consulting:
      "Prefer executiveDark, warmBoardroom, or dataGrid. Use restrained contrast, strong message titles, precise tables, KPI cards, and decision-ready hierarchy.",
    product:
      "Prefer productNeon or dataGrid. Use modular product panels, workflow diagrams, roadmap strips, integration maps, and crisp product proof points.",
    brand:
      "Prefer editorialLight or warmBoardroom. Use bolder cover rhythm, campaign-style section breaks, expressive but editable shapes, and strong one-line positioning.",
    academic:
      "Prefer academicPaper or editorialLight. Use paper-like whitespace, method/evidence structure, annotated matrices, and careful conclusions.",
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
      kicker: "DeckEvo",
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
    subtitle: "Generated by DeckEvo",
    language: input.language,
    audience: input.audience,
    theme: normalizeTheme({ accent: input.style === "product" ? "cyan" : input.style === "academic" ? "sage" : "gold", mood: input.style }, input),
    slides: baseSlides.slice(0, requestedSlides),
  };
}
