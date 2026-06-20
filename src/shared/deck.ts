export type SourceType = "ppt" | "outline";
export type Purpose = "fundraising" | "sales" | "training" | "report";
export type VisualStyle = "consulting" | "product" | "brand" | "academic";
export type DeckTemplate =
  | "executiveDark"
  | "editorialLight"
  | "dataGrid"
  | "productNeon"
  | "warmBoardroom"
  | "academicPaper"
  | "creativePitch"
  | "corporateClean"
  | "brandGradient"
  | "internalOps"
  | "smartisanKeynote";
export type FontStyle = "modernSans" | "editorialSerif" | "condensedImpact" | "roundedHuman";
export type PaletteIntent = "brand" | "creative" | "corporate" | "tech" | "warm" | "academic";

export type PresentationRequest = {
  source: SourceType;
  purpose: Purpose;
  style: VisualStyle;
  slides: number;
  language: string;
  audience: string;
  prompt: string;
  sourceAnchors?: string[];
};

export type DeckSpec = {
  title: string;
  subtitle: string;
  language: string;
  audience: string;
  theme: {
    accent: "gold" | "cyan" | "sage";
    mood: string;
    template?: DeckTemplate;
    density?: "calm" | "balanced" | "dense";
    fontStyle?: FontStyle;
    paletteIntent?: PaletteIntent;
    brandPrimary?: string;
    brandSecondary?: string;
  };
  slides: DeckSlide[];
};

export type DeckSlide = {
  layout:
    | "cover"
    | "agenda"
    | "section"
    | "executiveSummary"
    | "content"
    | "chart"
    | "comparison"
    | "timeline"
    | "matrix"
    | "heroMetric"
    | "splitStory"
    | "threeCards"
    | "beforeAfter"
    | "insightGrid"
    | "process"
    | "caseStudy"
    | "quote"
    | "dashboard"
    | "claudeCanvas"
    | "closing";
  kicker?: string;
  title: string;
  subtitle?: string;
  body?: string[];
  takeaway?: string;
  speakerNotes?: string;
  visual?: string;
  sourceSlides?: number[];
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
