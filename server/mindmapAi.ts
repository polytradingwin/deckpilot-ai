import { configureOpenAIProxy, getAIProvider, getConfiguredPrimaryModel } from "./openai";
import type { MindMapNode, MindMapRequest, MindMapSpec, MindMapStyle } from "../src/shared/mindmap";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string }>;
  }>;
};

type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
    name?: string;
    input?: unknown;
  }>;
};

const MINDMAP_TOOL_NAME = "return_mindmap_spec";
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 180000);

const mindMapSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "style", "audience", "deliveryMode", "summary", "nodes", "completeReport"],
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    style: { type: "string", enum: ["business-premium", "tech", "minimal-consulting"] },
    audience: { type: "string" },
    deliveryMode: { type: "string", enum: ["presenting", "reading"] },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "keyMetrics", "conclusion"],
      properties: {
        headline: { type: "string" },
        keyMetrics: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "value"],
            properties: {
              label: { type: "string" },
              value: { type: "string" },
              note: { type: "string" },
            },
          },
        },
        conclusion: { type: "string" },
      },
    },
    nodes: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "children"],
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          insight: { type: "string" },
          visual: {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            properties: {
              type: { type: "string", enum: ["metric-card", "bar-chart", "timeline", "list", "none"] },
              data: {
                type: "array",
                maxItems: 6,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "value"],
                  properties: {
                    label: { type: "string" },
                    value: { oneOf: [{ type: "string" }, { type: "number" }] },
                  },
                },
              },
            },
          },
          children: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title"],
              properties: {
                title: { type: "string" },
                subtitle: { type: "string" },
                detail: { type: "string" },
              },
            },
          },
        },
      },
    },
    completeReport: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: {
          heading: { type: "string" },
          body: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
        },
      },
    },
  },
} as const;

export async function createMindMapWithAI(input: MindMapRequest): Promise<MindMapSpec> {
  if (process.env.MOCK_OPENAI === "1") {
    return normalizeMindMapSpec(createMockMindMap(input), input);
  }

  configureOpenAIProxy();
  const provider = getAIProvider();
  const spec = provider === "anthropic" ? await createMindMapWithAnthropic(input) : await createMindMapWithOpenAI(input);
  return normalizeMindMapSpec(spec, input);
}

async function createMindMapWithAnthropic(input: MindMapRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const response = await fetchWithTimeout(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getConfiguredPrimaryModel(),
      max_tokens: 12000,
      temperature: 0.35,
      system: buildSystemPrompt(),
      tools: [
        {
          name: MINDMAP_TOOL_NAME,
          description: "Return the complete DeckEvo dynamic mindmap report JSON.",
          input_schema: mindMapSchema,
        },
      ],
      tool_choice: { type: "tool", name: MINDMAP_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `${buildUserPrompt(input)}\n\nUse the ${MINDMAP_TOOL_NAME} tool to return the JSON object.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic MindMap generation failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as AnthropicResponse;
  const toolUse = payload.content?.find((item) => item.type === "tool_use" && item.name === MINDMAP_TOOL_NAME);
  if (toolUse?.input && typeof toolUse.input === "object") {
    return toolUse.input as MindMapSpec;
  }

  const text = payload.content?.map((item) => item.text || "").join("").trim();
  if (!text) throw new Error("Anthropic did not return MindMap JSON.");
  return parseJson(text) as MindMapSpec;
}

async function createMindMapWithOpenAI(input: MindMapRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const response = await fetchWithTimeout(`${process.env.OPENAI_BASE_URL || "https://api.openai.com"}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getConfiguredPrimaryModel(),
      input: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(input) },
      ],
      max_output_tokens: 12000,
      text: {
        format: {
          type: "json_schema",
          name: "mindmap_spec",
          strict: false,
          schema: mindMapSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI MindMap generation failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as OpenAIResponse;
  const text =
    payload.output_text ||
    payload.output
      ?.flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .join("")
      .trim();
  if (!text) throw new Error("OpenAI did not return MindMap JSON.");
  return parseJson(text) as MindMapSpec;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`AI provider request timed out after ${Math.round(AI_REQUEST_TIMEOUT_MS / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildSystemPrompt() {
  return [
    "You are DeckEvo's dynamic mindmap report creator.",
    "Convert the user's source material into a structured, premium, animated mindmap report JSON.",
    "The source material is the contract: preserve every important section, named item, metric, example, and conclusion.",
    "Do not create a PPT deck. Do not output markdown. Return only the required JSON.",
    "The mindmap should feel like a senior consultant explaining a complex report: clear hierarchy, strong executive summary, and complete source coverage.",
    "Avoid generic frameworks unless the source naturally requires them. Each node must be specific to the user's material.",
    "The front end will render the JSON as a dynamic mindmap and printable summary/full-report pages.",
  ].join("\n");
}

function buildUserPrompt(input: MindMapRequest) {
  return [
    `Delivery mode: ${input.deliveryMode === "presenting" ? "live presentation" : "readable async report"}`,
    `Audience: ${input.audience || "general business audience"}`,
    `Visual style: ${input.style}`,
    "",
    "Source material:",
    input.prompt.trim(),
    "",
    "Requirements:",
    "- Create 3-8 top-level nodes based on the source structure.",
    "- Use child nodes for details, examples, metrics, actions, or evidence.",
    "- Keep every explicit source section represented somewhere in nodes or completeReport.",
    "- Extract important numbers into summary.keyMetrics when present.",
    "- completeReport must contain the fuller written version, not just titles.",
    "- Use the same language as the user's source material.",
  ].join("\n");
}

function normalizeMindMapSpec(raw: MindMapSpec, input: MindMapRequest): MindMapSpec {
  const nodes = normalizeNodes(raw.nodes).slice(0, 8);
  const safeNodes = nodes.length ? nodes : createMockMindMap(input).nodes;
  const title = cleanText(raw.title) || inferTitle(input.prompt) || "动态脑图汇报";
  const subtitle = cleanText(raw.subtitle) || (input.deliveryMode === "presenting" ? "现场汇报视图" : "可阅读汇报视图");
  const summaryMetrics = Array.isArray(raw.summary?.keyMetrics)
    ? raw.summary.keyMetrics
        .map((item) => ({
          label: cleanText(item.label),
          value: cleanText(item.value),
          note: cleanText(item.note),
        }))
        .filter((item) => item.label && item.value)
        .slice(0, 6)
    : [];

  return {
    title,
    subtitle,
    style: normalizeStyle(raw.style || input.style),
    audience: cleanText(raw.audience) || input.audience,
    deliveryMode: raw.deliveryMode === "reading" || raw.deliveryMode === "presenting" ? raw.deliveryMode : input.deliveryMode,
    summary: {
      headline: cleanText(raw.summary?.headline) || title,
      keyMetrics: summaryMetrics,
      conclusion: cleanText(raw.summary?.conclusion) || safeNodes[safeNodes.length - 1]?.insight || subtitle,
    },
    nodes: safeNodes,
    completeReport: normalizeCompleteReport(raw.completeReport, safeNodes),
  };
}

function normalizeNodes(nodes: unknown): MindMapNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((node) => {
      if (!node || typeof node !== "object") return null;
      const value = node as MindMapNode;
      const title = cleanText(value.title);
      if (!title) return null;
      const children = Array.isArray(value.children)
        ? value.children
            .map((child) => ({
              title: cleanText(child.title),
              subtitle: cleanText(child.subtitle),
              detail: cleanText(child.detail),
            }))
            .filter((child) => child.title)
            .slice(0, 5)
        : [];
      return {
        title,
        subtitle: cleanText(value.subtitle),
        insight: cleanText(value.insight),
        visual: value.visual?.type
          ? {
              type: value.visual.type,
              data: Array.isArray(value.visual.data)
                ? value.visual.data
                    .map((item) => ({ label: cleanText(item.label), value: item.value }))
                    .filter((item) => item.label)
                    .slice(0, 6)
                : undefined,
            }
          : { type: "none" as const },
        children: children.length ? children : [{ title: "核心信息", detail: cleanText(value.insight) || title }],
      };
    })
    .filter(Boolean) as MindMapNode[];
}

function normalizeCompleteReport(report: unknown, nodes: MindMapNode[]) {
  if (Array.isArray(report)) {
    const normalized = report
      .map((section) => {
        if (!section || typeof section !== "object") return null;
        const value = section as { heading?: unknown; body?: unknown };
        const body = Array.isArray(value.body) ? value.body.map(cleanText).filter(Boolean).slice(0, 8) : [];
        const heading = cleanText(value.heading);
        if (!heading || !body.length) return null;
        return { heading, body };
      })
      .filter(Boolean) as Array<{ heading: string; body: string[] }>;
    if (normalized.length) return normalized;
  }

  return nodes.map((node) => ({
    heading: node.title,
    body: [node.subtitle, node.insight, ...node.children.map((child) => [child.title, child.detail].filter(Boolean).join("："))]
      .map(cleanText)
      .filter(Boolean),
  }));
}

function normalizeStyle(style: string): MindMapStyle {
  if (style === "tech" || style === "minimal-consulting" || style === "business-premium") return style;
  return "business-premium";
}

function parseJson(text: string) {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(stripped);
}

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTitle(prompt: string) {
  const firstHeading = prompt.match(/^#{1,3}\s*(.+)$/m)?.[1] || prompt.match(/^(.{4,40})$/m)?.[1];
  return cleanText(firstHeading);
}

function createMockMindMap(input: MindMapRequest): MindMapSpec {
  const title = inferTitle(input.prompt) || "动态脑图汇报";
  return {
    title,
    subtitle: input.deliveryMode === "presenting" ? "面向现场讲解的动态结构" : "面向阅读决策的结构化摘要",
    style: input.style,
    audience: input.audience,
    deliveryMode: input.deliveryMode,
    summary: {
      headline: title,
      keyMetrics: [{ label: "结构节点", value: "5" }],
      conclusion: "先抓住主线，再逐层展开证据与行动。",
    },
    nodes: [
      {
        title: "核心主题",
        subtitle: "从材料中提炼主线",
        insight: "把分散内容压缩成一条可讲、可读的汇报逻辑。",
        visual: { type: "metric-card", data: [{ label: "中心观点", value: "1" }] },
        children: [
          { title: "背景", detail: "说明为什么现在需要讨论这个主题。" },
          { title: "目标", detail: "明确本次汇报希望让听众带走什么判断。" },
        ],
      },
      {
        title: "关键信息",
        subtitle: "按重要性组织内容",
        insight: "把事实、数据和例子放到对应节点中。",
        visual: { type: "list" },
        children: [
          { title: "事实", detail: "来自原文的重要事实。" },
          { title: "证据", detail: "支撑判断的数据或案例。" },
        ],
      },
      {
        title: "行动建议",
        subtitle: "把内容落到下一步",
        insight: "让脑图不是信息罗列，而是能推动决策。",
        visual: { type: "timeline" },
        children: [
          { title: "优先事项", detail: "先做最能产生影响的动作。" },
          { title: "结论", detail: "用一句话收束整份材料。" },
        ],
      },
    ],
    completeReport: [
      { heading: "核心主题", body: ["把输入材料转化为结构化动态脑图。"] },
      { heading: "关键信息", body: ["保留原文中的事实、数字、例子和结论。"] },
      { heading: "行动建议", body: ["面向指定受众输出可讲解、可阅读的汇报内容。"] },
    ],
  };
}
