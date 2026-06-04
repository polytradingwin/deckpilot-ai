import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import JSZip from "jszip";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileText,
  FileUp,
  Languages,
  Lock,
  LogIn,
  Mail,
  Presentation,
  Shield,
  Sparkles,
  Upload,
  UserCircle,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";

type SourceType = "ppt" | "outline";
type Purpose = "fundraising" | "sales" | "training" | "report";
type Style = "consulting" | "product" | "brand" | "academic";
type DeliveryMode = "presenting" | "reading";
type PolicyPage = "terms" | "privacy" | "refund";

type Option<T extends string> = {
  id: T;
  title: string;
  description: string;
  icon: LucideIcon;
};

type GenerationRecord = {
  id: string;
  title: string;
  filename: string;
  createdAt: string;
  slideCount: number;
  source: SourceType;
  purpose: Purpose;
  style: Style;
  language: string;
  audience: string;
  size: number;
  creditCost: number;
};

type UserAccount = {
  id: string;
  email: string;
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
};

const signedUploadLimitBytes = 50 * 1024 * 1024;
const maxPptUploadBytes = 100 * 1024 * 1024;

const sourceOptions: Option<SourceType>[] = [
  {
    id: "ppt",
    title: "PowerPoint 文件",
    description: "上传旧稿，重构内容层级和视觉版式",
    icon: FileUp,
  },
  {
    id: "outline",
    title: "文稿或大纲",
    description: "粘贴脚本、文稿或结构化大纲",
    icon: FileText,
  },
];

const deliveryOptions: Option<DeliveryMode>[] = [
  {
    id: "presenting",
    title: "给人讲",
    description: "用于现场演讲、路演、汇报或销售沟通",
    icon: Presentation,
  },
  {
    id: "reading",
    title: "给人看",
    description: "用于异步阅读、决策材料或会后发送",
    icon: Eye,
  },
];

const deliveryPurposeMap: Record<DeliveryMode, Purpose> = {
  presenting: "sales",
  reading: "report",
};

const deliverySlideMap: Record<DeliveryMode, string[]> = {
  presenting: ["开场定位与听众承诺", "现状判断与关键矛盾", "解决方案与价值证明", "行动建议与下一步"],
  reading: ["封面与摘要结论", "背景与核心信息", "证据、图表与判断", "风险、决策与后续动作"],
};

const styleOptions: Option<Style>[] = [
  {
    id: "consulting",
    title: "咨询级极简",
    description: "留白、信息层级和精确图表",
    icon: BadgeCheck,
  },
  {
    id: "product",
    title: "科技产品",
    description: "深色界面、模块化布局和数据面板",
    icon: WandSparkles,
  },
  {
    id: "brand",
    title: "品牌发布",
    description: "强视觉封面、情绪图和故事节奏",
    icon: Eye,
  },
  {
    id: "academic",
    title: "学术严谨",
    description: "定义、方法、证据链和结论",
    icon: Lock,
  },
];

const slideMap: Record<Purpose, string[]> = {
  fundraising: [
    "封面与一句话定位",
    "市场规模与机会窗口",
    "产品壁垒与增长路径",
    "商业模型与融资计划",
  ],
  sales: [
    "客户现状与核心挑战",
    "解决方案架构",
    "价值测算与成功案例",
    "合作路径与下一步",
  ],
  training: [
    "课程目标与学习地图",
    "关键概念拆解",
    "案例演练与讨论",
    "复盘清单与行动计划",
  ],
  report: [
    "本期目标回顾",
    "关键指标与进展",
    "风险、阻塞和资源需求",
    "下阶段优先级",
  ],
};

const pricingPlans = [
  {
    name: "单次使用",
    note: "临时项目，快速出稿",
    price: "$2.99",
    credits: "75 credits",
    detail: "约 15 页",
    features: ["顶级 AI 引擎", "即时下载 .pptx 文件", "无需注册账号"],
    cta: "立即使用",
  },
  {
    name: "包月订阅",
    note: "每月大型 PPT 制作专属",
    price: "$19.99",
    credits: "600 credits",
    detail: "约 120 页",
    features: ["credits 用不完持续累积", "品牌风格记忆", "需要更多 credits 可加购"],
    cta: "订阅",
    featured: true,
  },
  {
    name: "重度套餐",
    note: "为 PPT 制作重度用户准备",
    price: "$99.99",
    credits: "3500 credits",
    detail: "约 700 页",
    features: ["团队协作席位", "优先生成队列", "专属模板资产库"],
    cta: "联系开通",
  },
];

const qualityItems = [
  {
    title: "先重写叙事，再做版式",
    body: "系统先把内容拆成观点、证据和过渡，再生成页面结构，避免把长文直接塞进模板。",
  },
  {
    title: "每页都有信息角色",
    body: "封面、目录、论证、图表、案例、结论分工清晰，适合真实汇报和客户沟通。",
  },
  {
    title: "交付可编辑 PPTX",
    body: "结果按 PowerPoint 的文本框、形状和图表组织，后续改字、换图、调色都方便。",
  },
];

const beforeAfterCases = [
  {
    title: "经营月报",
    before: "原稿：指标堆叠、结论不突出，领导需要自己从数据里找重点。",
    after: "生成后：先给经营判断，再用趋势、差异和下一步动作展开。",
    result: "从数据罗列变成可汇报的经营结论。",
  },
  {
    title: "融资路演",
    before: "原稿：产品、市场、财务混在一起，故事线不够清楚。",
    after: "生成后：按机会、壁垒、增长、商业模型和融资计划重排。",
    result: "从材料拼接变成投资人能跟上的叙事。",
  },
  {
    title: "销售方案",
    before: "原稿：功能介绍太多，客户痛点和 ROI 没有被放大。",
    after: "生成后：先框定客户问题，再展示方案架构、价值测算和合作路径。",
    result: "从产品说明变成客户决策材料。",
  },
];

const faqs = [
  {
    q: "现在能直接生成真实 PPT 文件吗？",
    a: "可以。生成按钮会调用后端接口，先让 OpenAI 输出结构化演示内容，再生成可下载的 .pptx 文件。",
  },
  {
    q: "可以上传旧 PPT 重新设计吗？",
    a: "可以上传 .pptx。后端会提取原始页面文本，再按选择的用途、受众和风格重构成新的演示。",
  },
  {
    q: "是否支持中文、英文和双语？",
    a: "支持。生成向导里已包含语言选项，适合后续把语言参数传给生成服务。",
  },
  {
    q: "支付和账号怎么处理？",
    a: "页面保留了价格、登录和订阅入口。等域名、支付和用户系统确定后，可以把这些入口连接到真实服务。",
  },
];

const policyContent: Record<PolicyPage, { title: string; updated: string; sections: Array<{ heading: string; body: string }> }> = {
  terms: {
    title: "Terms of Service",
    updated: "Last updated: June 4, 2026",
    sections: [
      {
        heading: "Service",
        body: "DeckEvo helps users transform uploaded PowerPoint files, scripts, outlines, and related instructions into editable presentation files. You are responsible for making sure the materials you upload are yours or that you have permission to use them.",
      },
      {
        heading: "Account",
        body: "A verified email login is used to keep your generation history, quota, and downloads connected to your account. You are responsible for activity under your email session.",
      },
      {
        heading: "Generated Output",
        body: "AI output can contain mistakes. You should review all generated slides, facts, charts, and recommendations before using them in business, academic, legal, financial, or public settings.",
      },
      {
        heading: "Acceptable Use",
        body: "Do not upload illegal, infringing, confidential third-party, malicious, or abusive content. We may restrict access when usage threatens the service, other users, or our infrastructure.",
      },
      {
        heading: "Contact",
        body: "For service questions, contact service@deckevo.com.",
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated: June 4, 2026",
    sections: [
      {
        heading: "Data We Process",
        body: "We process your email address, uploaded files, prompts, generated decks, usage records, and technical request data so the product can generate PPT files, store history, and manage quota.",
      },
      {
        heading: "AI and Storage Providers",
        body: "Your content may be sent to configured AI providers for generation and to storage/database providers for file delivery and history persistence. We use this data to operate the product, not to sell personal information.",
      },
      {
        heading: "Retention",
        body: "Generation records and files are retained so you can download previous decks. You can request deletion by contacting service@deckevo.com from the account email.",
      },
      {
        heading: "Security",
        body: "We use account sessions, server-side storage, and access checks to protect generated files. No online service can guarantee absolute security, so avoid uploading materials you are not allowed to share with an AI service.",
      },
      {
        heading: "Contact",
        body: "Privacy requests can be sent to service@deckevo.com.",
      },
    ],
  },
  refund: {
    title: "Refund Policy",
    updated: "Last updated: June 4, 2026",
    sections: [
      {
        heading: "Current Status",
        body: "Payment is not live yet, so there are no paid purchases to refund at this stage. Trial credits are provided for product testing and may change before commercial launch.",
      },
      {
        heading: "After Payment Launch",
        body: "When paid plans are enabled, refund requests should be submitted within 7 days of purchase. We will review failed generations, duplicate charges, and cases where credits were charged but no downloadable PPT was produced.",
      },
      {
        heading: "Non-refundable Cases",
        body: "Downloaded and successfully generated decks, used credits, custom work, or abuse of the service may not be refundable unless required by applicable law.",
      },
      {
        heading: "Contact",
        body: "Refund questions can be sent to service@deckevo.com with your account email and order reference once payment is live.",
      },
    ],
  },
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function apiPath(path: string) {
  return `${apiBaseUrl}${path}`;
}

function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(apiPath(path), {
    credentials: "include",
    ...init,
  });
}

async function generationApiFetch(init: RequestInit) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await apiFetch("/api/generate-ppt", init);
      if (![502, 503, 504].includes(response.status) || attempt === 1) {
        return response;
      }
    } catch (error) {
      if (attempt === 1) throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
  return apiFetch("/api/generate-ppt", init);
}

function App() {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<SourceType>("outline");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("presenting");
  const [style, setStyle] = useState<Style>("consulting");
  const [audience, setAudience] = useState("高管 / 客户决策层");
  const [prompt, setPrompt] = useState(
    "为一家企业 AI 知识库产品制作销售方案，目标客户是大型制造企业，需要突出部署效率、数据安全和 ROI。",
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("deckevo-presentation.pptx");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceSlideCount, setSourceSlideCount] = useState<number | null>(null);
  const [generationId, setGenerationId] = useState("");
  const [recentGenerations, setRecentGenerations] = useState<GenerationRecord[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [authStep, setAuthStep] = useState<"email" | "code">("email");
  const [devLoginCode, setDevLoginCode] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [authError, setAuthError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginIntent, setLoginIntent] = useState<"" | "generate">("");
  const [legalPage, setLegalPage] = useState<PolicyPage | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const purpose = deliveryPurposeMap[deliveryMode];
  const slideTitles = useMemo(() => deliverySlideMap[deliveryMode] || slideMap[purpose], [deliveryMode, purpose]);
  const inferredSlides = source === "ppt" ? sourceSlideCount || 12 : estimateOutlineSlides(prompt);
  const outputLanguage = "按用户材料语言自动判断";
  const accountName = user?.email.split("@")[0] || "";

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (authStep !== "code" || resendCountdown <= 0) return;
    const timer = window.setTimeout(() => setResendCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [authStep, resendCountdown]);

  const refreshSession = async () => {
    try {
      const response = await apiFetch("/api/session");
      if (!response.ok) return;
      const payload = (await response.json()) as { user?: UserAccount | null };
      setUser(payload.user || null);
      if (payload.user) {
        setEmail(payload.user.email);
        void refreshGenerations();
      } else {
        setRecentGenerations([]);
      }
    } catch {
      setUser(null);
      setRecentGenerations([]);
    }
  };

  const openLogin = () => {
    setAuthError("");
    setDevLoginCode("");
    setVerificationCode("");
    setResendCountdown(0);
    setAuthStep("email");
    setLoginOpen(true);
  };

  const closeLogin = () => {
    setLoginOpen(false);
    setAuthError("");
  };

  const handleRequestCode = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError("");
    setDevLoginCode("");

    try {
      const response = await apiFetch("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => ({}))) as { devCode?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "验证码发送失败。");
      }
      setDevLoginCode(payload.devCode || "");
      setVerificationCode("");
      setResendCountdown(60);
      setAuthStep("code");
      window.setTimeout(() => codeInputRefs.current[0]?.focus(), 60);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "验证码发送失败。");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerifyLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError("");

    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: verificationCode }),
      });
      const payload = (await response.json().catch(() => ({}))) as { user?: UserAccount; error?: string };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "登录失败。");
      }
      setUser(payload.user);
      closeLogin();
      void refreshGenerations();
      if (loginIntent === "generate") {
        setLoginIntent("");
        window.setTimeout(() => {
          document.querySelector<HTMLButtonElement>('[data-generate-button="true"]')?.click();
        }, 100);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "登录失败。");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setRecentGenerations([]);
    setDownloadUrl("");
    setGenerationId("");
    setAccountMenuOpen(false);
    setAccountOpen(false);
  };

  const handlePptxFileChange = async (file: File | null) => {
    setSelectedFile(file);
    setSourceSlideCount(null);
    if (!file) return;

    try {
      setSourceSlideCount(await countPptxSlides(file));
    } catch {
      setSourceSlideCount(null);
    }
  };

  const updateVerificationDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const chars = verificationCode.padEnd(6, " ").split("");
    chars[index] = digit || " ";
    const nextCode = chars.join("").replace(/\s/g, "");
    setVerificationCode(nextCode);
    if (digit && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleVerificationKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
    if (event.key === "Enter") void handleVerifyLogin();
  };

  const handleVerificationPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setVerificationCode(pasted);
    codeInputRefs.current[Math.min(5, pasted.length)]?.focus();
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerated(false);
    setGenerationError("");

    try {
      if (!user) {
        setLoginIntent("generate");
        openLogin();
        return;
      }

      if (source === "ppt" && !selectedFile) {
        throw new Error("请先上传一个 .pptx 文件。");
      }

      const response = await submitGenerationRequest();

      if (response.status === 202) {
        const payload = (await response.json().catch(() => null)) as { id?: string } | null;
        setGenerationError("正在后台生成，请稍候...");
        if (!payload?.id) {
          throw new Error("生成任务已提交，但没有返回任务编号。请刷新后重试。");
        }
        const record = await waitForQueuedGeneration(payload.id);
        await downloadGenerationRecord(record);
        setGenerationError("已完成");
        setGenerated(true);
        await refreshGenerations();
        await refreshSession();
        return;
      }

      if (!response.ok) {
        if (response.status === 401) openLogin();
        const payload = await response.json().catch(() => ({ error: "生成失败，请稍后重试。" }));
        if ([502, 503, 504].includes(response.status)) {
          throw new Error("服务正在重启或繁忙，已自动重试一次但仍失败，请重新点击生成。");
        }
        throw new Error(payload.error || "生成失败，请稍后重试。");
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      const deckTitle = decodeURIComponent(response.headers.get("X-Deck-Title") || "deckevo-presentation");
      const nextName = `${deckTitle.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").slice(0, 80) || "deckevo-presentation"}.pptx`;
      const nextGenerationId = response.headers.get("X-Generation-Id") || "";

      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(nextUrl);
      setDownloadName(nextName);
      setGenerationId(nextGenerationId);
      setGenerated(true);
      setGenerationError("已完成");
      await refreshGenerations();
      await refreshSession();
      downloadDeck(nextUrl, nextName);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "生成失败，请稍后重试。");
    } finally {
      setIsGenerating(false);
    }
  };

  const submitGenerationRequest = async () => {
    const deliveryPrompt =
      deliveryMode === "presenting"
        ? "PPT 用途：给人讲。请强化现场讲述节奏、转场、演讲逻辑和一页一个关键结论。"
        : "PPT 用途：给人看。请强化自解释结构、摘要结论、信息完整性和可独立阅读的页面层级。";
    const generationAudience = `${audience}；${deliveryMode === "presenting" ? "现场讲述" : "异步阅读"}`;
    const generationPrompt = [deliveryPrompt, prompt].filter(Boolean).join("\n\n");

    if (source === "ppt" && selectedFile) {
      if (selectedFile.size > signedUploadLimitBytes) {
        setGenerationError("正在上传 PPT 文件...");
        const formData = new FormData();
        formData.append("source", source);
        formData.append("purpose", purpose);
        formData.append("style", style);
        formData.append("slides", String(inferredSlides));
        formData.append("language", outputLanguage);
        formData.append("audience", generationAudience);
        formData.append("prompt", generationPrompt);
        formData.append("file", selectedFile);
        setGenerationError("正在后台生成，请稍候...");
        return generationApiFetch({
          method: "POST",
          body: formData,
        });
      }

      setGenerationError("正在上传 PPT 文件...");
      const sourceFile = await uploadSourcePptx(selectedFile);
      setGenerationError("正在后台生成，请稍候...");
      return generationApiFetch({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          purpose,
          style,
          slides: inferredSlides,
          language: outputLanguage,
          audience: generationAudience,
          prompt: generationPrompt,
          sourceFile,
        }),
      });
    }

    const formData = new FormData();
    formData.append("source", source);
    formData.append("purpose", purpose);
    formData.append("style", style);
    formData.append("slides", String(inferredSlides));
    formData.append("language", outputLanguage);
    formData.append("audience", generationAudience);
    formData.append("prompt", generationPrompt);

    return generationApiFetch({
      method: "POST",
      body: formData,
    });
  };

  const uploadSourcePptx = async (file: File) => {
    if (file.size > maxPptUploadBytes) {
      throw new Error("PPT 文件不能超过 100MB。");
    }

    const signed = await apiFetch("/api/uploads/pptx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        size: file.size,
        contentType: file.type || "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    });

    const payload = (await signed.json().catch(() => ({}))) as {
      uploadUrl?: string;
      storedFilename?: string;
      originalName?: string;
      error?: string;
    };
    if (!signed.ok || !payload.uploadUrl || !payload.storedFilename) {
      throw new Error(payload.error || "创建上传地址失败，请稍后重试。");
    }

    const uploaded = await fetch(payload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
      body: file,
    });

    if (!uploaded.ok) {
      throw new Error("PPT 文件上传失败，请稍后重试。");
    }

    return {
      storedFilename: payload.storedFilename,
      originalName: payload.originalName || file.name,
    };
  };

  const waitForQueuedGeneration = async (id: string) => {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      const response = await apiFetch(`/api/generations/${id}/status`);
      if (!response.ok) continue;
      const payload = (await response.json()) as { status?: "pending" | "queued" | "running" | "ready" | "failed"; record?: GenerationRecord; error?: string };
      if (payload.status === "failed") {
        throw new Error(payload.error || "生成失败，请稍后重试。");
      }
      if (payload.status === "ready" && payload.record) return payload.record;
    }
    throw new Error("后台生成仍在进行中，请稍后在历史记录里下载。");
  };

  const downloadGenerationRecord = async (record: GenerationRecord) => {
    const response = await apiFetch(`/api/generations/${record.id}/download`);
    if (!response.ok) {
      throw new Error("PPT 已生成，但下载失败，请稍后在历史记录里下载。");
    }

    const blob = await response.blob();
    const nextUrl = URL.createObjectURL(blob);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(nextUrl);
    setDownloadName(record.filename);
    setGenerationId(record.id);
    downloadDeck(nextUrl, record.filename);
  };

  const refreshGenerations = async () => {
    try {
      const response = await apiFetch("/api/generations");
      if (!response.ok) return;
      const payload = (await response.json()) as { records?: GenerationRecord[] };
      setRecentGenerations(payload.records?.slice(0, 5) || []);
    } catch {
      setRecentGenerations([]);
    }
  };

  const downloadDeck = (url = downloadUrl, name = downloadName) => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const scrollToGenerator = () => {
    document.getElementById("generator")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="DeckEvo 首页">
          <span className="brand-mark" />
          <span>DeckEvo</span>
        </a>

        <nav className="header-nav" aria-label="主导航">
          <a href="#pricing">价格</a>
          <button className="nav-link-button" type="button" onClick={() => setLegalPage("privacy")}>
            隐私
          </button>
          {user ? (
            <div className="account-menu-wrap">
              <button className="account-chip" type="button" onClick={() => setAccountMenuOpen((open) => !open)}>
                <span>{accountName}</span>
                <strong>{user.creditsRemaining} cr</strong>
                <ChevronDown size={14} />
              </button>
              {accountMenuOpen && (
                <div className="account-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(true);
                      setAccountMenuOpen(false);
                    }}
                  >
                    我的账户
                  </button>
                  <button type="button" onClick={handleLogout}>
                    退出登录
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="ghost-button" type="button" onClick={openLogin}>
              <LogIn size={16} />
              登录
            </button>
          )}
        </nav>
      </header>

      <section className="hero" id="top">
        <img className="hero-media" src="/assets/hero-product.png" alt="AI 生成 PPT 的产品界面预览" />
        <div className="hero-shade" />
        <div className="hero-content">
          <p className="eyebrow">PPT generation for serious work</p>
          <h1 className="hero-title">
            <span>你的内容</span>
            <span>配得上更好的 PPT</span>
          </h1>
          <p className="hero-copy">
            <span>上传即生成PPT</span>
            <span>背后是一套经过千份演示训练的审美判断</span>
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={scrollToGenerator}>
              开始生成
              <ArrowRight size={18} />
            </button>
            <a className="secondary-link" href="#gallery">
              查看样例
            </a>
          </div>
        </div>
      </section>

      <section className="generator-section" id="generator" aria-label="PPT 生成器">
        <div className="stepper" aria-label="生成步骤">
          {["上传内容", "PPT 用途", "输出设置"].map((label, index) => {
            const number = index + 1;
            return (
              <button
                className={step === number ? "active" : step > number ? "complete" : ""}
                key={label}
                type="button"
                onClick={() => setStep(number)}
              >
                <span>{number}</span>
                {label}
              </button>
            );
          })}
        </div>

        <div className="generator-shell">
          <div className="generator-workspace">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Step {step}</p>
                <h2>
                  {step === 1 && "你手上现在有什么？"}
                  {step === 2 && "这份 PPT 是给人讲，还是给人看？"}
                  {step === 3 && "最终希望是什么风格？"}
                </h2>
              </div>
              <span className="status-pill">
                <Sparkles size={14} />
                顶级 AI 引擎
              </span>
            </div>

            {step === 1 && (
              <div className="step-body">
                <div className="option-grid two source-choice-grid">
                  {sourceOptions.map((item) => (
                    <SelectButton
                      item={item}
                      key={item.id}
                      selected={source === item.id}
                      onClick={() => setSource(item.id)}
                    />
                  ))}
                </div>

                {source === "ppt" ? (
                  <>
                    <label className="upload-zone">
                      <Upload size={22} />
                      <span>{selectedFile ? selectedFile.name : "拖入 .pptx 文件或点击上传"}</span>
                      <small>{selectedFile ? "已选择旧稿，生成时会先解析原始页面内容" : "支持 .pptx，后端会解析旧稿并重构成新演示"}</small>
                      <input
                        aria-label="上传 PPT 文件"
                        type="file"
                        accept=".pptx"
                        onChange={(event) => void handlePptxFileChange(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    {selectedFile && <p className="format-note">无论原始文件尺寸如何，输出统一为标准 16:9 宽屏格式。</p>}
                  </>
                ) : (
                  <label className="prompt-field">
                    <span>粘贴文稿、脚本或大纲</span>
                    <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
                  </label>
                )}

                <div className="panel-actions">
                  <button className="primary-button" type="button" onClick={() => setStep(2)}>
                    下一步
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="step-body">
                <div className="option-grid two purpose-choice-grid">
                  {deliveryOptions.map((item) => (
                    <SelectButton
                      item={item}
                      key={item.id}
                      selected={deliveryMode === item.id}
                      onClick={() => setDeliveryMode(item.id)}
                    />
                  ))}
                </div>

                <label className="input-field">
                  <span>{deliveryMode === "presenting" ? "现场听众" : "阅读对象"}</span>
                  <input value={audience} onChange={(event) => setAudience(event.target.value)} />
                </label>

                <div className="panel-actions split">
                  <button className="text-button" type="button" onClick={() => setStep(1)}>
                    上一步
                  </button>
                  <button className="primary-button" type="button" onClick={() => setStep(3)}>
                    下一步
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="step-body">
                <div className="option-grid two">
                  {styleOptions.map((item) => (
                    <SelectButton
                      item={item}
                      key={item.id}
                      selected={style === item.id}
                      onClick={() => setStyle(item.id)}
                    />
                  ))}
                </div>

                <div className="panel-actions split">
                  <button className="outline-button back-action" type="button" onClick={() => setStep(2)}>
                    返回
                  </button>
                  <button className="primary-button" type="button" onClick={handleGenerate} data-generate-button="true">
                    {isGenerating ? "生成中" : generated ? "重新生成 PPT" : "生成 PPT"}
                    <Sparkles size={18} />
                  </button>
                </div>

                {generationError && <p className={`status-message ${generated ? "complete" : "pending"}`}>{generationError}</p>}
              </div>
            )}
          </div>

          <aside className="preview-pane" aria-label="生成结果预览">
            <div className="preview-topline">
              <span>Deck preview</span>
              <strong>{generated ? "Ready" : isGenerating ? "Generating" : "Draft"}</strong>
            </div>
            <div className="credit-panel">
              {user ? (
                <>
                  <span>当前账号</span>
                  <strong>{user.creditsRemaining} credits 剩余</strong>
                  <small>
                    已用 {user.creditsUsed} / {user.creditsTotal}
                  </small>
                </>
              ) : (
                <>
                  <span>账号</span>
                  <strong>登录后生成</strong>
                  <small>历史记录和额度会绑定到你的邮箱。</small>
                </>
              )}
            </div>
            <div className={`deck-canvas ${isGenerating ? "loading" : ""}`}>
              <div className="deck-cover">
                <span>{styleOptions.find((item) => item.id === style)?.title}</span>
                <h3>{deliveryOptions.find((item) => item.id === deliveryMode)?.title}</h3>
                <p>AI 自动决定页数与语言</p>
              </div>
              <div className="chart-row">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="slide-list">
              {slideTitles.map((title, index) => (
                <div className="slide-row" key={title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{title}</p>
                  {generated && <Check size={16} />}
                </div>
              ))}
            </div>

            <button className="download-button" type="button" disabled={!downloadUrl || isGenerating} onClick={() => downloadDeck()}>
              <Download size={17} />
              {downloadUrl ? "再次下载 .pptx" : "下载 .pptx"}
            </button>

            {recentGenerations.length > 0 && (
              <div className="history-list" aria-label="最近生成">
                <div className="history-heading">
                  <span>最近生成</span>
                  {generationId && <strong>已保存</strong>}
                </div>
                {recentGenerations.map((item) => (
                  <a className="history-row" href={apiPath(`/api/generations/${item.id}/download`)} key={item.id}>
                    <span>{item.title}</span>
                    <small>
                      {item.slideCount} 页 · {formatGenerationTime(item.createdAt)}
                    </small>
                  </a>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>

      <section className="quality-section" id="gallery">
        <div className="section-heading">
          <p className="section-kicker">Quality system</p>
          <h2>生成的不是模板填空，而是一份能汇报的 PPT</h2>
        </div>
        <div className="quality-grid">
          {qualityItems.map((item, index) => (
            <article className="quality-item" key={item.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>

        <div className="case-gallery" aria-label="使用前后案例">
          {beforeAfterCases.map((item) => (
            <article className="case-card" key={item.title}>
              <div className="case-card-head">
                <span>Before / After</span>
                <h3>{item.title}</h3>
              </div>
              <div className="case-compare">
                <div>
                  <small>使用前</small>
                  <p>{item.before}</p>
                </div>
                <div>
                  <small>使用后</small>
                  <p>{item.after}</p>
                </div>
              </div>
              <strong>{item.result}</strong>
            </article>
          ))}
        </div>

        <div className="gallery-strip" aria-label="PPT 样例">
          <SlideThumb tone="gold" title="Market" />
          <SlideThumb tone="cyan" title="Strategy" />
          <SlideThumb tone="sage" title="Metrics" />
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="section-heading centered">
          <p className="section-kicker">价格</p>
          <h2>按次付费，或订阅更高额度</h2>
        </div>

        <div className="pricing-grid">
          {pricingPlans.map((plan) => (
            <article className={`pricing-card ${plan.featured ? "featured" : ""}`} key={plan.name}>
              {plan.featured && <span className="plan-badge">首选推荐</span>}
              <h3>{plan.name}</h3>
              <p>{plan.note}</p>
              <div className="price">{plan.price}</div>
              <strong>{plan.credits}</strong>
              <small>{plan.detail}</small>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
              <button className={plan.featured ? "primary-button wide" : "outline-button"} type="button">
                {plan.cta}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="trust-section" id="privacy">
        <div className="trust-copy">
          <p className="section-kicker">Privacy</p>
          <h2>为商业材料准备的隐私边界</h2>
          <p>
            页面已按后续生产化接入预留隐私说明、登录入口和文件上传边界。真实服务上线时，文件解析、生成记录和支付
            都应接入独立权限控制。
          </p>
        </div>
        <div className="trust-list">
          <span>
            <Shield size={18} />
            文件级权限
          </span>
          <span>
            <Lock size={18} />
            私有生成记录
          </span>
          <span>
            <Languages size={18} />
            多语言输出
          </span>
        </div>
      </section>

      <section className="faq-section">
        <div className="section-heading">
          <p className="section-kicker">FAQ</p>
          <h2>上线前需要确认的关键问题</h2>
        </div>
        <div className="faq-list">
          {faqs.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <div>
          <span>DeckEvo</span>
          <small>service@deckevo.com</small>
        </div>
        <div className="footer-links">
          <button type="button" onClick={() => setLegalPage("terms")}>
            Terms
          </button>
          <button type="button" onClick={() => setLegalPage("privacy")}>
            Privacy
          </button>
          <button type="button" onClick={() => setLegalPage("refund")}>
            Refund
          </button>
        </div>
        <a href="#top">返回顶部</a>
      </footer>

      {legalPage && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="policy-title">
          <div className="legal-modal">
            <button className="icon-button" type="button" onClick={() => setLegalPage(null)} aria-label="关闭">
              <X size={18} />
            </button>
            <p className="section-kicker">DeckEvo</p>
            <h2 id="policy-title">{policyContent[legalPage].title}</h2>
            <small>{policyContent[legalPage].updated}</small>
            <div className="policy-sections">
              {policyContent[legalPage].sections.map((section) => (
                <section key={section.heading}>
                  <h3>{section.heading}</h3>
                  <p>{section.body}</p>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {accountOpen && user && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="account-title">
          <div className="account-modal">
            <button className="icon-button" type="button" onClick={() => setAccountOpen(false)} aria-label="关闭">
              <X size={18} />
            </button>
            <div className="account-modal-title">
              <UserCircle size={24} />
              <h2 id="account-title">我的账户</h2>
            </div>
            <div className="account-detail-list">
              <div>
                <span>邮箱</span>
                <strong>{user.email}</strong>
              </div>
              <div>
                <span>Credit 余额</span>
                <strong>{user.creditsRemaining} credits</strong>
              </div>
              <div>
                <span>订阅</span>
                <strong>按次付费</strong>
              </div>
            </div>
            <div className="upgrade-card">
              <p>升级包月后，你将获得更高额度和后续专属模板能力。</p>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                查看价格
              </button>
            </div>
            <button className="account-logout" type="button" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </div>
      )}

      {loginOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="login-title">
          <div className="login-modal">
            <button className="icon-button" type="button" onClick={closeLogin} aria-label="关闭">
              <X size={18} />
            </button>
            <Mail size={24} />
            {authStep === "code" && (
              <button className="back-button" type="button" onClick={() => setAuthStep("email")}>
                ← 换个邮箱
              </button>
            )}
            <h2 id="login-title">{authStep === "email" ? "登录 DeckEvo" : "查收验证码"}</h2>
            <p>
              {authStep === "email"
                ? "输入邮箱后，我们会发送 6 位验证码，用于保存生成记录和试用额度。"
                : (
                  <>
                    我们刚刚发送到 <strong className="email-highlight">{email}</strong>
                  </>
                )}
            </p>
            <label>
              <span>邮箱</span>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                disabled={authStep === "code"}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleRequestCode();
                }}
              />
            </label>
            {authStep === "code" && (
              <>
                <div className="code-inputs" aria-label="验证码">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <input
                      // eslint-disable-next-line react/no-array-index-key
                      key={index}
                      ref={(element) => {
                        codeInputRefs.current[index] = element;
                      }}
                      aria-label={`验证码第 ${index + 1} 位`}
                      inputMode="numeric"
                      maxLength={1}
                      value={verificationCode[index] || ""}
                      onChange={(event) => updateVerificationDigit(index, event.target.value)}
                      onKeyDown={(event) => handleVerificationKeyDown(index, event)}
                      onPaste={handleVerificationPaste}
                    />
                  ))}
                </div>
                <p className="resend-line">
                  没收到？检查垃圾邮件，或
                  <button type="button" onClick={handleRequestCode} disabled={isLoggingIn || resendCountdown > 0}>
                    {resendCountdown > 0 ? `重新发送 (${resendCountdown}s)` : "重新发送"}
                  </button>
                </p>
              </>
            )}
            {devLoginCode && <p className="dev-code">测试验证码：{devLoginCode}</p>}
            {authError && <p className="error-message">{authError}</p>}
            <button
              className="primary-button wide"
              type="button"
              onClick={authStep === "email" ? handleRequestCode : handleVerifyLogin}
              disabled={isLoggingIn}
            >
              {isLoggingIn ? "处理中" : authStep === "email" ? "发送验证码" : "验证并登录"}
            </button>
            {authStep === "code" && (
              <p className="auth-footnote">验证码 15 分钟内有效，登录后浏览器记住你 90 天。</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function SelectButton<T extends string>({
  item,
  selected,
  onClick,
}: {
  item: Option<T>;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <button className={`select-button ${selected ? "selected" : ""}`} type="button" onClick={onClick}>
      <Icon size={22} />
      <strong>{item.title}</strong>
      <span>{item.description}</span>
    </button>
  );
}

function SlideThumb({ tone, title }: { tone: "gold" | "cyan" | "sage"; title: string }) {
  return (
    <article className={`slide-thumb ${tone}`}>
      <div>
        <span>{title}</span>
        <strong />
        <strong />
      </div>
      <div className="mini-chart">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function formatGenerationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function countPptxSlides(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const count = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;
  return Math.max(4, Math.min(30, count || 12));
}

function estimateOutlineSlides(text: string) {
  const compactLength = text.replace(/\s+/g, "").length;
  if (compactLength <= 120) return 6;
  if (compactLength <= 500) return 8;
  if (compactLength <= 1200) return 10;
  if (compactLength <= 2200) return 14;
  if (compactLength <= 3600) return 18;
  return 24;
}

export default App;
