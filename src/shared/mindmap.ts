export type MindMapDeliveryMode = "presenting" | "reading";
export type MindMapStyle = "business-premium" | "tech" | "minimal-consulting";

export type MindMapRequest = {
  prompt: string;
  audience: string;
  deliveryMode: MindMapDeliveryMode;
  style: MindMapStyle;
};

export type MindMapMetric = {
  label: string;
  value: string;
  note?: string;
};

export type MindMapVisual = {
  type: "metric-card" | "bar-chart" | "timeline" | "list" | "none";
  data?: Array<{ label: string; value: string | number }>;
};

export type MindMapNode = {
  title: string;
  subtitle?: string;
  insight?: string;
  visual?: MindMapVisual;
  children: Array<{
    title: string;
    subtitle?: string;
    detail?: string;
  }>;
};

export type MindMapSpec = {
  title: string;
  subtitle: string;
  style: MindMapStyle;
  audience: string;
  deliveryMode: MindMapDeliveryMode;
  summary: {
    headline: string;
    keyMetrics: MindMapMetric[];
    conclusion: string;
  };
  nodes: MindMapNode[];
  completeReport: Array<{
    heading: string;
    body: string[];
  }>;
};

export type MindMapGenerationRecord = {
  id: string;
  title: string;
  createdAt: string;
  audience: string;
  deliveryMode: MindMapDeliveryMode;
  style: MindMapStyle;
  nodeCount: number;
  size: number;
  creditCost: number;
};
