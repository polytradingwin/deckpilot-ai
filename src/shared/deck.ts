export type SourceType = "ppt" | "outline" | "topic";
export type Purpose = "fundraising" | "sales" | "training" | "report";
export type VisualStyle = "consulting" | "product" | "brand" | "academic";

export type PresentationRequest = {
  source: SourceType;
  purpose: Purpose;
  style: VisualStyle;
  slides: number;
  language: string;
  audience: string;
  prompt: string;
};

export type DeckSpec = {
  title: string;
  subtitle: string;
  language: string;
  audience: string;
  theme: {
    accent: "gold" | "cyan" | "sage";
    mood: string;
  };
  slides: DeckSlide[];
};

export type DeckSlide = {
  layout: "cover" | "agenda" | "section" | "content" | "chart" | "comparison" | "closing";
  kicker?: string;
  title: string;
  subtitle?: string;
  body?: string[];
  takeaway?: string;
  speakerNotes?: string;
  visual?: string;
  metric?: {
    label: string;
    value: string;
    context?: string;
  };
  chart?: {
    title: string;
    labels: string[];
    values: number[];
  };
};
