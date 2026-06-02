import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Download,
  Eye,
  FileText,
  FileUp,
  Gauge,
  Languages,
  Layers,
  Lock,
  LogIn,
  Mail,
  MessageSquareText,
  Presentation,
  Shield,
  Sparkles,
  Upload,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";

type SourceType = "ppt" | "outline" | "topic";
type Purpose = "fundraising" | "sales" | "training" | "report";
type Style = "consulting" | "product" | "brand" | "academic";

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

const sourceOptions: Option<SourceType>[] = [
  {
    id: "ppt",
    title: "PowerPoint 文件",
    description: "上传旧稿，重构内容层级和视觉版式",
    icon: FileUp,
  },
  {
    id: "outline",
    title: "文稿 / 大纲",
    description: "把已有文字变成结构完整的演示",
    icon: FileText,
  },
  {
    id: "topic",
    title: "一句话主题",
    description: "从想法开始生成完整叙事框架",
    icon: Sparkles,
  },
];

const purposeOptions: Option<Purpose>[] = [
  {
    id: "fundraising",
    title: "融资路演",
    description: "市场、产品、商业模式和财务故事",
    icon: Gauge,
  },
  {
    id: "sales",
    title: "销售方案",
    description: "客户痛点、价值主张和行动建议",
    icon: Presentation,
  },
  {
    id: "training",
    title: "课程培训",
    description: "知识拆解、案例演示和课后总结",
    icon: Layers,
  },
  {
    id: "report",
    title: "内部汇报",
    description: "目标、进展、数据和下一步计划",
    icon: MessageSquareText,
  },
];

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

function App() {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<SourceType>("outline");
  const [purpose, setPurpose] = useState<Purpose>("sales");
  const [style, setStyle] = useState<Style>("consulting");
  const [slides, setSlides] = useState(6);
  const [maxSlides, setMaxSlides] = useState(6);
  const [language, setLanguage] = useState("简体中文");
  const [audience, setAudience] = useState("高管 / 客户决策层");
  const [prompt, setPrompt] = useState(
    "为一家企业 AI 知识库产品制作销售方案，目标客户是大型制造企业，需要突出部署效率、数据安全和 ROI。",
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("deckpilot-presentation.pptx");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [generationId, setGenerationId] = useState("");
  const [recentGenerations, setRecentGenerations] = useState<GenerationRecord[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<UserAccount | null>(null);
  const [authError, setAuthError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginIntent, setLoginIntent] = useState<"" | "generate">("");

  const slideTitles = useMemo(() => slideMap[purpose], [purpose]);

  useEffect(() => {
    void refreshSession();
    void refreshRuntimeConfig();
  }, []);

  const refreshRuntimeConfig = async () => {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) return;
      const payload = (await response.json()) as { maxSlides?: number };
      const nextMax = Math.max(4, Math.min(30, Math.round(payload.maxSlides || 6)));
      setMaxSlides(nextMax);
      setSlides((current) => Math.min(Math.max(current, 4), nextMax));
    } catch {
      setMaxSlides(6);
    }
  };

  const refreshSession = async () => {
    try {
      const response = await fetch("/api/session");
      if (!response.ok) return;
      const payload = (await response.json()) as { user?: UserAccount | null };
      setUser(payload.user || null);
      if (payload.user) {
        setEmail(payload.user.email);
        await refreshGenerations();
      } else {
        setRecentGenerations([]);
      }
    } catch {
      setUser(null);
      setRecentGenerations([]);
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => ({}))) as { user?: UserAccount; error?: string };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "登录失败。");
      }
      setUser(payload.user);
      setLoginOpen(false);
      await refreshGenerations();
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
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setRecentGenerations([]);
    setDownloadUrl("");
    setGenerationId("");
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerated(false);
    setGenerationError("");

    try {
      if (!user) {
        setLoginIntent("generate");
        setLoginOpen(true);
        return;
      }

      if (source === "ppt" && !selectedFile) {
        throw new Error("请先上传一个 .pptx 文件。");
      }

      const formData = new FormData();
      formData.append("source", source);
      formData.append("purpose", purpose);
      formData.append("style", style);
      formData.append("slides", String(slides));
      formData.append("language", language);
      formData.append("audience", audience);
      formData.append("prompt", prompt);
      if (selectedFile) formData.append("file", selectedFile);

      const response = await fetch("/api/generate-ppt", {
        method: "POST",
        body: formData,
      });

      if (response.status === 202) {
        const payload = (await response.json().catch(() => null)) as { id?: string } | null;
        setGenerationError("正在后台生成，请稍候...");
        if (!payload?.id) {
          throw new Error("生成任务已提交，但没有返回任务编号。请刷新后重试。");
        }
        const record = await waitForQueuedGeneration(payload.id);
        await downloadGenerationRecord(record);
        setGenerationError("");
        setGenerated(true);
        await refreshGenerations();
        await refreshSession();
        return;
      }

      if (!response.ok) {
        if (response.status === 401) setLoginOpen(true);
        const payload = await response.json().catch(() => ({ error: "生成失败，请稍后重试。" }));
        throw new Error(payload.error || "生成失败，请稍后重试。");
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      const deckTitle = decodeURIComponent(response.headers.get("X-Deck-Title") || "deckpilot-presentation");
      const nextName = `${deckTitle.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").slice(0, 80) || "deckpilot-presentation"}.pptx`;
      const nextGenerationId = response.headers.get("X-Generation-Id") || "";

      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(nextUrl);
      setDownloadName(nextName);
      setGenerationId(nextGenerationId);
      setGenerated(true);
      await refreshGenerations();
      await refreshSession();
      downloadDeck(nextUrl, nextName);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "生成失败，请稍后重试。");
    } finally {
      setIsGenerating(false);
    }
  };

  const waitForQueuedGeneration = async (id: string) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      const response = await fetch(`/api/generations/${id}/status`);
      if (!response.ok) continue;
      const payload = (await response.json()) as { status?: "pending" | "ready"; record?: GenerationRecord };
      if (payload.status === "ready" && payload.record) return payload.record;
    }
    throw new Error("后台生成仍在进行中，请稍后在历史记录里下载。");
  };

  const downloadGenerationRecord = async (record: GenerationRecord) => {
    const response = await fetch(`/api/generations/${record.id}/download`);
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
      const response = await fetch("/api/generations");
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
        <a className="brand" href="#top" aria-label="DeckPilot AI 首页">
          <span className="brand-mark" />
          <span>DeckPilot AI</span>
        </a>

        <nav className="header-nav" aria-label="主导航">
          <a href="#pricing">价格</a>
          <a href="#privacy">隐私</a>
          <div className="language-switcher" aria-label="语言">
            {["EN", "简", "繁", "ES", "日"].map((item) => (
              <button className={item === "简" ? "active" : ""} key={item} type="button">
                {item}
              </button>
            ))}
          </div>
          {user ? (
            <div className="account-chip">
              <span>{user.email}</span>
              <strong>{user.creditsRemaining} credits</strong>
              <button type="button" onClick={handleLogout}>
                退出
              </button>
            </div>
          ) : (
            <button className="ghost-button" type="button" onClick={() => setLoginOpen(true)}>
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
          <h1>
            AI PPT 生成器
            <span>把任何材料变成高质量演示</span>
          </h1>
          <p className="hero-copy">
            面向销售方案、融资路演、内部汇报和课程培训。先重构叙事，再生成版式、图表和可编辑
            PowerPoint。
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
          {["现有内容", "使用场景", "输出设置"].map((label, index) => {
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
                  {step === 2 && "这份 PPT 要说服谁？"}
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
                <div className="option-grid three">
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
                  <label className="upload-zone">
                    <Upload size={22} />
                    <span>{selectedFile ? selectedFile.name : "拖入 .pptx 文件或点击上传"}</span>
                    <small>{selectedFile ? "已选择旧稿，生成时会先解析原始页面内容" : "支持 .pptx，后端会解析旧稿并重构成新演示"}</small>
                    <input
                      aria-label="上传 PPT 文件"
                      type="file"
                      accept=".pptx"
                      onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                ) : (
                  <label className="prompt-field">
                    <span>{source === "outline" ? "粘贴文稿或大纲" : "写下主题"}</span>
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
                <div className="option-grid two">
                  {purposeOptions.map((item) => (
                    <SelectButton
                      item={item}
                      key={item.id}
                      selected={purpose === item.id}
                      onClick={() => setPurpose(item.id)}
                    />
                  ))}
                </div>

                <label className="input-field">
                  <span>目标受众</span>
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

                <div className="settings-grid">
                  <label className="range-field">
                    <span>页数</span>
                    <strong>{slides} 页</strong>
                    <input
                      type="range"
                      min="4"
                      max={maxSlides}
                      value={slides}
                      onChange={(event) => setSlides(Number(event.target.value))}
                    />
                  </label>
                  <label className="input-field">
                    <span>语言</span>
                    <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                      <option>简体中文</option>
                      <option>English</option>
                      <option>繁體中文</option>
                      <option>日本語</option>
                    </select>
                  </label>
                </div>

                <div className="panel-actions split">
                  <button className="text-button" type="button" onClick={() => setStep(2)}>
                    上一步
                  </button>
                  <button className="primary-button" type="button" onClick={handleGenerate} data-generate-button="true">
                    {isGenerating ? "生成中" : generated ? "重新生成 PPT" : "生成 PPT"}
                    <Sparkles size={18} />
                  </button>
                </div>

                {generationError && <p className="error-message">{generationError}</p>}
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
                <h3>{purposeOptions.find((item) => item.id === purpose)?.title}</h3>
                <p>{language} · {slides} pages</p>
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
                  <a className="history-row" href={`/api/generations/${item.id}/download`} key={item.id}>
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
        <span>DeckPilot AI</span>
        <a href="#top">返回顶部</a>
      </footer>

      {loginOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="login-title">
          <div className="login-modal">
            <button className="icon-button" type="button" onClick={() => setLoginOpen(false)} aria-label="关闭">
              <X size={18} />
            </button>
            <Mail size={24} />
            <h2 id="login-title">输入邮箱即可试用</h2>
            <p>无需密码或验证码。邮箱只用于保存生成记录和试用额度。</p>
            <label>
              <span>邮箱</span>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleLogin();
                }}
              />
            </label>
            {authError && <p className="error-message">{authError}</p>}
            <button className="primary-button wide" type="button" onClick={handleLogin} disabled={isLoggingIn}>
              {isLoggingIn ? "登录中" : "继续"}
            </button>
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

export default App;
