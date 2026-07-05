import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
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
  LoaderCircle,
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
import { MindMapPresenter } from "./mindmap/MindMapPresenter";
import type { MindMapGenerationRecord, MindMapSpec } from "./shared/mindmap";

type SourceType = "ppt" | "outline";
type Purpose = "fundraising" | "sales" | "training" | "report";
type Style = "consulting" | "product" | "brand" | "academic";
type DeliveryMode = "presenting" | "reading";
type PolicyPage = "terms" | "privacy" | "refund";
type ProductMode = "ppt" | "mindmap";

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

type UiLanguage = "zh" | "en";

const signedUploadLimitBytes = 50 * 1024 * 1024;
const maxPptUploadBytes = 100 * 1024 * 1024;

const deliveryPurposeMap: Record<DeliveryMode, Purpose> = {
  presenting: "sales",
  reading: "report",
};

const localizedContent = {
  zh: {
    defaultAudience: "高管 / 客户决策层",
    sourceOptions: [
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
    ] satisfies Option<SourceType>[],
    deliveryOptions: [
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
    ] satisfies Option<DeliveryMode>[],
    styleOptions: [
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
    ] satisfies Option<Style>[],
    deliverySlideMap: {
      presenting: ["开场定位与听众承诺", "现状判断与关键矛盾", "解决方案与价值证明", "行动建议与下一步"],
      reading: ["封面与摘要结论", "背景与核心信息", "证据、图表与判断", "风险、决策与后续动作"],
    } satisfies Record<DeliveryMode, string[]>,
    slideMap: {
      fundraising: ["封面与一句话定位", "市场规模与机会窗口", "产品壁垒与增长路径", "商业模型与融资计划"],
      sales: ["客户现状与核心挑战", "解决方案架构", "价值测算与成功案例", "合作路径与下一步"],
      training: ["课程目标与学习地图", "关键概念拆解", "案例演练与讨论", "复盘清单与行动计划"],
      report: ["本期目标回顾", "关键指标与进展", "风险、阻塞和资源需求", "下阶段优先级"],
    } satisfies Record<Purpose, string[]>,
    pricingPlans: [
      {
        name: "单次使用",
        note: "临时项目，快速出稿",
        price: "$2.99",
        credits: "75 credits",
        detail: "约 15 页",
        features: ["顶级 AI 引擎", "即时下载 .pptx 文件", "邮箱登录后可用"],
        cta: "立即使用",
      },
      {
        name: "月度额度包",
        note: "适合每月多次 PPT 制作",
        price: "$19.99",
        credits: "600 credits",
        detail: "约 120 页",
        features: ["一次性购买 credits", "购买后立即到账", "需要更多 credits 可加购"],
        cta: "购买",
        featured: true,
      },
      {
        name: "重度套餐",
        note: "为 PPT 制作重度用户准备",
        price: "$99.99",
        credits: "3500 credits",
        detail: "约 700 页",
        features: ["适合高频生成", "优先生成队列", "专属模板资产库"],
        cta: "购买",
      },
    ],
    qualityItems: [
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
    ],
    beforeAfterCases: [
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
    ],
    faqs: [
      {
        q: "现在能直接生成真实 PPT 文件吗？",
        a: "可以。生成按钮会调用后端接口，先让 AI 输出结构化演示内容，再生成可下载的 .pptx 文件。",
      },
      {
        q: "可以上传旧 PPT 重新设计吗？",
        a: "可以上传 .pptx。后端会提取原始页面文本，再按选择的用途、受众和风格重构成新的演示。",
      },
      {
        q: "是否支持中文、英文和双语？",
        a: "支持。系统会根据用户材料自动判断目标语言，也可以在文稿里直接写清楚语言要求。",
      },
      {
        q: "支付和账号怎么处理？",
        a: "当前使用 Stripe Checkout 处理付款。购买 credits 后会自动入账；生成 PPT 会按页数扣除 credits。",
      },
    ],
    ui: {
      homeLabel: "DeckEvo 首页",
      navLabel: "主导航",
      pricing: "价格",
      privacy: "隐私",
      language: "界面语言",
      account: "我的账户",
      logout: "退出登录",
      login: "登录",
      heroAlt: "AI 生成 PPT 的产品界面预览",
      heroEyebrow: "PPT generation for serious work",
      heroTitleTop: "你的内容",
      heroTitleBottom: "配得上更好的 PPT",
      heroCopyTop: "上传即生成PPT",
      heroCopyBottom: "背后是一套经过千份演示训练的审美判断",
      start: "开始生成",
      viewSamples: "查看样例",
      generatorLabel: "PPT 生成器",
      stepsLabel: "生成步骤",
      steps: ["上传内容", "PPT 用途", "开始生成"],
      stepHeads: ["你手上现在有什么？", "这份 PPT 是给人讲，还是给人看？", "DeckEvo 将自动决定最终风格"],
      engine: "顶级 AI 引擎",
      autoDesign: "自动设计",
      autoDesignTitle: "由 Claude 按文稿自动生成",
      autoDesignBody: "系统会根据你的内容、用途和观众自动决定页数、结构、视觉风格与版式，不再套用固定模板。",
      uploadPlaceholder: "拖入 .pptx 文件或点击上传",
      uploadSelected: "已选择旧稿，生成时会先解析原始页面内容",
      uploadHelp: "支持 .pptx，后端会解析旧稿并重构成新演示",
      uploadAria: "上传 PPT 文件",
      formatNote: "无论原始文件尺寸如何，输出统一为标准 16:9 宽屏格式。",
      promptLabel: "粘贴文稿、脚本或大纲",
      next: "下一步",
      previous: "返回",
      back: "返回",
      liveAudience: "现场听众",
      readingAudience: "阅读对象",
      generate: "生成PPT",
      regenerating: "重新生成PPT",
      generating: "生成中",
      completed: "已完成",
      previewLabel: "生成结果预览",
      currentAccount: "当前账号",
      creditsLeft: "credits 剩余",
      used: "已用",
      accountAnon: "账号",
      loginToGenerate: "登录后生成",
      accountHint: "历史记录和额度会绑定到你的邮箱。",
      autoSlidesLanguage: "AI 自动决定页数与语言",
      downloadAgain: "再次下载 .pptx",
      download: "下载 .pptx",
      recent: "最近生成",
      saved: "已保存",
      pages: "页",
      qualityTitle: "生成的不是模板填空，而是一份能汇报的 PPT",
      casesLabel: "使用前后案例",
      beforeAfter: "Before / After",
      before: "使用前",
      after: "使用后",
      galleryLabel: "PPT 样例",
      pricingTitle: "按次付费，或购买更高额度",
      recommended: "首选推荐",
      trustTitle: "为商业材料准备的隐私边界",
      trustBody: "DeckEvo 使用邮箱登录、服务端存储、第三方 AI 生成和 Stripe 支付。上传敏感材料前，请确认你有权把这些内容交给外部 AI 和云服务处理。",
      filePermission: "文件级权限",
      privateHistory: "私有生成记录",
      multilingual: "多语言输出",
      faqTitle: "上线前需要确认的关键问题",
      top: "返回顶部",
      close: "关闭",
      email: "邮箱",
      creditBalance: "Credit 余额",
      subscription: "计费方式",
      payAsYouGo: "按次付费",
      upgradeCopy: "升级包月后，你将获得更高额度和后续专属模板能力。",
      viewPricing: "查看价格",
      changeEmail: "← 换个邮箱",
      loginTitle: "登录 DeckEvo",
      codeTitle: "查收验证码",
      loginIntro: "输入邮箱后，我们会发送 6 位验证码，用于保存生成记录和试用额度。",
      sentTo: "我们刚刚发送到",
      codeLabel: "验证码",
      codeDigitLabel: "验证码第",
      digitSuffix: "位",
      resendPrefix: "没收到？检查垃圾邮件，或",
      resend: "重新发送",
      devCode: "测试验证码：",
      processing: "处理中",
      sendCode: "发送验证码",
      verifyLogin: "验证并登录",
      authFootnote: "验证码 15 分钟内有效，登录后浏览器记住你 90 天。",
      outputLanguage: "按用户材料语言自动判断",
      presentingPrompt: "PPT 用途：给人讲。请强化现场讲述节奏、转场、演讲逻辑和一页一个关键结论。",
      readingPrompt: "PPT 用途：给人看。请强化自解释结构、摘要结论、信息完整性和可独立阅读的页面层级。",
      presentingAudience: "现场讲述",
      readingAudienceMode: "异步阅读",
      noBody: "(用户未输入正文)",
      errors: {
        requestCode: "验证码发送失败。",
        login: "登录失败。",
        needPpt: "请先上传一个 .pptx 文件。",
        queued: "正在后台生成，请稍候...",
        noJobId: "生成任务已提交，但没有返回任务编号。请刷新后重试。",
        failed: "生成失败，请稍后重试。",
        busy: "服务正在重启或繁忙，已自动重试一次但仍失败，请重新点击生成。",
        uploading: "正在上传 PPT 文件...",
        maxUpload: "PPT 文件不能超过 100MB。",
        uploadUrl: "创建上传地址失败，请稍后重试。",
        uploadFailed: "PPT 文件上传失败，请稍后重试。",
        queuedStillRunning: "后台生成仍在进行中，请稍后在历史记录里下载。",
        downloadFailed: "PPT 已生成，但下载失败，请稍后在历史记录里下载。",
        justNow: "刚刚",
      },
    },
  },
  en: {
    defaultAudience: "Executives / client decision makers",
    sourceOptions: [
      {
        id: "ppt",
        title: "PowerPoint file",
        description: "Upload an existing deck and rebuild hierarchy and visual structure",
        icon: FileUp,
      },
      {
        id: "outline",
        title: "Script or outline",
        description: "Paste a script, draft, notes, or structured outline",
        icon: FileText,
      },
    ] satisfies Option<SourceType>[],
    deliveryOptions: [
      {
        id: "presenting",
        title: "Present live",
        description: "For talks, pitches, business reviews, or sales conversations",
        icon: Presentation,
      },
      {
        id: "reading",
        title: "Send to read",
        description: "For async reading, decision memos, or follow-up materials",
        icon: Eye,
      },
    ] satisfies Option<DeliveryMode>[],
    styleOptions: [
      {
        id: "consulting",
        title: "Consulting minimal",
        description: "Whitespace, clear hierarchy, and precise charts",
        icon: BadgeCheck,
      },
      {
        id: "product",
        title: "Tech product",
        description: "Dark interfaces, modular layouts, and data panels",
        icon: WandSparkles,
      },
      {
        id: "brand",
        title: "Brand launch",
        description: "Strong covers, emotional visuals, and story rhythm",
        icon: Eye,
      },
      {
        id: "academic",
        title: "Academic rigor",
        description: "Definitions, methods, evidence chains, and conclusions",
        icon: Lock,
      },
    ] satisfies Option<Style>[],
    deliverySlideMap: {
      presenting: ["Opening promise", "Current state and tension", "Solution and value proof", "Action plan and next step"],
      reading: ["Cover and executive summary", "Context and core message", "Evidence, charts, and judgment", "Risks, decisions, and next actions"],
    } satisfies Record<DeliveryMode, string[]>,
    slideMap: {
      fundraising: ["Cover and one-line position", "Market size and timing", "Product moat and growth path", "Business model and funding plan"],
      sales: ["Client context and core challenge", "Solution architecture", "Value model and proof", "Collaboration path and next step"],
      training: ["Learning goal and roadmap", "Core concepts", "Case practice and discussion", "Review checklist and action plan"],
      report: ["Goal review", "Key metrics and progress", "Risks, blockers, and resources", "Next-stage priorities"],
    } satisfies Record<Purpose, string[]>,
    pricingPlans: [
      {
        name: "One-off",
        note: "Fast output for a temporary project",
        price: "$2.99",
        credits: "75 credits",
        detail: "About 15 slides",
        features: ["Top-tier AI engine", "Instant .pptx download", "Email login required"],
        cta: "Start now",
      },
      {
        name: "Monthly pack",
        note: "For recurring PPT work during the month",
        price: "$19.99",
        credits: "600 credits",
        detail: "About 120 slides",
        features: ["One-time credit purchase", "Credits added after payment", "Add more credits when needed"],
        cta: "Buy credits",
        featured: true,
      },
      {
        name: "Heavy use",
        note: "For high-volume PPT production",
        price: "$99.99",
        credits: "3500 credits",
        detail: "About 700 slides",
        features: ["For frequent generation", "Priority generation queue", "Dedicated template library"],
        cta: "Buy credits",
      },
    ],
    qualityItems: [
      {
        title: "Narrative first, layout second",
        body: "The system turns raw material into claims, evidence, and transitions before building slide structure.",
      },
      {
        title: "Every slide has a job",
        body: "Covers, outlines, arguments, charts, cases, and conclusions are separated for real presentations and client conversations.",
      },
      {
        title: "Editable PPTX delivery",
        body: "The output is organized with PowerPoint text boxes, shapes, and charts, so you can keep editing later.",
      },
    ],
    beforeAfterCases: [
      {
        title: "Operating review",
        before: "Before: metrics were stacked together and the main judgment was hard to find.",
        after: "After: the deck leads with the operating judgment, then explains trend, gap, and next action.",
        result: "From raw data into a board-ready management story.",
      },
      {
        title: "Fundraising pitch",
        before: "Before: product, market, and finance were mixed without a clear story line.",
        after: "After: opportunity, moat, growth, business model, and funding plan are sequenced clearly.",
        result: "From stitched material into a story investors can follow.",
      },
      {
        title: "Sales proposal",
        before: "Before: too many product features and not enough client pain or ROI.",
        after: "After: the deck frames the client problem first, then solution, value model, and collaboration path.",
        result: "From product explanation into decision material.",
      },
    ],
    faqs: [
      {
        q: "Can DeckEvo generate a real PPT file?",
        a: "Yes. The generator calls the backend, asks AI for structured presentation content, and returns a downloadable .pptx file.",
      },
      {
        q: "Can I upload an old PPT and redesign it?",
        a: "Yes. You can upload a .pptx file. The backend extracts the original slide text and rebuilds it by purpose, audience, and source content.",
      },
      {
        q: "Does it support Chinese, English, and bilingual decks?",
        a: "Yes. The system follows the language of your material, and you can also state a language requirement in the source text.",
      },
      {
        q: "How do payment and accounts work?",
        a: "Payments are processed with Stripe Checkout. Purchased credits are added automatically, and PPT generation deducts credits based on slide count.",
      },
    ],
    ui: {
      homeLabel: "DeckEvo home",
      navLabel: "Main navigation",
      pricing: "Pricing",
      privacy: "Privacy",
      language: "Interface language",
      account: "My account",
      logout: "Log out",
      login: "Log in",
      heroAlt: "Product preview of an AI-generated PPT interface",
      heroEyebrow: "PPT generation for serious work",
      heroTitleTop: "Your content",
      heroTitleBottom: "deserves a better PPT",
      heroCopyTop: "Upload and generate a PPT",
      heroCopyBottom: "Powered by an aesthetic system trained on thousands of presentations",
      start: "Start generating",
      viewSamples: "View examples",
      generatorLabel: "PPT generator",
      stepsLabel: "Generation steps",
      steps: ["Upload content", "PPT purpose", "Generate"],
      stepHeads: ["What material do you have?", "Is this deck for presenting or reading?", "DeckEvo will choose the final style"],
      engine: "Premium AI engine",
      autoDesign: "Auto design",
      autoDesignTitle: "Claude generates from the source material",
      autoDesignBody: "DeckEvo will decide slide count, structure, visual style, and layout from your content, purpose, and audience instead of applying a fixed template.",
      uploadPlaceholder: "Drop a .pptx file or click to upload",
      uploadSelected: "Existing deck selected. We will parse and rebuild the original slides.",
      uploadHelp: "Supports .pptx. The backend parses the deck and reconstructs a new presentation.",
      uploadAria: "Upload PPT file",
      formatNote: "Regardless of the original file size, the output is standardized to 16:9 widescreen.",
      promptLabel: "Paste a script, draft, or outline",
      next: "Next",
      previous: "Back",
      back: "Back",
      liveAudience: "Live audience",
      readingAudience: "Readers",
      generate: "Generate PPT",
      regenerating: "Regenerate PPT",
      generating: "Generating",
      completed: "Completed",
      previewLabel: "Generation result preview",
      currentAccount: "Current account",
      creditsLeft: "credits left",
      used: "Used",
      accountAnon: "Account",
      loginToGenerate: "Log in to generate",
      accountHint: "History and credits will be connected to your email.",
      autoSlidesLanguage: "AI decides slide count and language",
      downloadAgain: "Download .pptx again",
      download: "Download .pptx",
      recent: "Recent generations",
      saved: "Saved",
      pages: "slides",
      qualityTitle: "Not template filling, but a presentation you can actually use",
      casesLabel: "Before and after examples",
      beforeAfter: "Before / After",
      before: "Before",
      after: "After",
      galleryLabel: "PPT examples",
      pricingTitle: "Pay once, or buy higher capacity",
      recommended: "Recommended",
      trustTitle: "Privacy boundaries for business material",
      trustBody: "DeckEvo uses email login, server-side storage, third-party AI generation, and Stripe payments. Before uploading sensitive material, confirm you are allowed to process it with external AI and cloud services.",
      filePermission: "File-level permissions",
      privateHistory: "Private generation history",
      multilingual: "Multilingual output",
      faqTitle: "Key questions before launch",
      top: "Back to top",
      close: "Close",
      email: "Email",
      creditBalance: "Credit balance",
      subscription: "Billing",
      payAsYouGo: "Pay as you go",
      upgradeCopy: "Upgrade to monthly for higher credits and dedicated template capabilities later.",
      viewPricing: "View pricing",
      changeEmail: "← Change email",
      loginTitle: "Log in to DeckEvo",
      codeTitle: "Check your verification code",
      loginIntro: "Enter your email and we will send a 6-digit code to save your generation history and trial credits.",
      sentTo: "We just sent it to",
      codeLabel: "Verification code",
      codeDigitLabel: "Verification code digit",
      digitSuffix: "",
      resendPrefix: "Didn't get it? Check spam, or",
      resend: "Resend",
      devCode: "Test code: ",
      processing: "Processing",
      sendCode: "Send code",
      verifyLogin: "Verify and log in",
      authFootnote: "The code is valid for 15 minutes. This browser will remember you for 90 days after login.",
      outputLanguage: "Automatically follow the user's source language",
      presentingPrompt: "PPT purpose: present live. Strengthen spoken rhythm, transitions, presentation logic, and one key takeaway per slide.",
      readingPrompt: "PPT purpose: send to read. Strengthen self-explanatory structure, executive summary, information completeness, and readable hierarchy.",
      presentingAudience: "live presentation",
      readingAudienceMode: "async reading",
      noBody: "(The user did not provide body text)",
      errors: {
        requestCode: "Failed to send verification code.",
        login: "Login failed.",
        needPpt: "Please upload a .pptx file first.",
        queued: "Generating in the background. Please wait...",
        noJobId: "The generation job was submitted but no job ID was returned. Refresh and try again.",
        failed: "Generation failed. Please try again later.",
        busy: "The service is restarting or busy. It retried once and still failed. Please click generate again.",
        uploading: "Uploading PPT file...",
        maxUpload: "PPT files cannot exceed 100MB.",
        uploadUrl: "Failed to create an upload URL. Please try again later.",
        uploadFailed: "PPT file upload failed. Please try again later.",
        queuedStillRunning: "Background generation is still running. Please download it later from history.",
        downloadFailed: "The PPT was generated, but download failed. Please download it later from history.",
        justNow: "Just now",
      },
    },
  },
} as const;

const policyContent: Record<PolicyPage, { title: string; updated: string; sections: Array<{ heading: string; body: string }> }> = {
  terms: {
    title: "Terms of Service",
    updated: "Last updated: June 28, 2026",
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
        heading: "Payments and Credits",
        body: "Paid credit packs are processed through Stripe Checkout. Credits are added after successful payment and are consumed when PPT generation jobs are accepted or completed according to the displayed product rules. Credit packs are one-time purchases unless a separate subscription product is clearly offered.",
      },
      {
        heading: "Your Content",
        body: "You keep your rights in the materials you upload. By using the service, you allow DeckEvo and its service providers to process those materials only as needed to generate, store, deliver, secure, and support your presentations.",
      },
      {
        heading: "Generated Output",
        body: "Generated slides may contain mistakes, omissions, design defects, or inaccurate facts. You should review all generated slides, facts, charts, and recommendations before using them in business, academic, legal, financial, medical, or public settings.",
      },
      {
        heading: "Acceptable Use",
        body: "Do not upload illegal, infringing, confidential third-party, malicious, regulated, abusive, or harmful content. We may restrict access when usage threatens the service, other users, payment partners, or our infrastructure.",
      },
      {
        heading: "Service Changes",
        body: "DeckEvo is an evolving product. Features, models, pricing, credit rules, and output quality may change. We will try to avoid disrupting paid usage, but we may suspend abusive or risky activity.",
      },
      {
        heading: "Contact",
        body: "For service questions, contact service@deckevo.com.",
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated: June 28, 2026",
    sections: [
      {
        heading: "Data We Process",
        body: "We process your email address, uploaded files, prompts, generated decks, generation history, credit usage, payment status, and technical request data so the product can generate PPT files, store history, manage quota, and support the service.",
      },
      {
        heading: "Service Providers",
        body: "Your content may be sent to configured AI providers for generation and to storage, database, email, payment, and infrastructure providers for file delivery, history persistence, login, billing, and security. Current provider categories include AI generation, Supabase storage/database, Resend email, Stripe payments, Canva integration, and hosting infrastructure.",
      },
      {
        heading: "Payments",
        body: "Card details are handled by Stripe Checkout. DeckEvo does not store full card numbers. We store payment status, Stripe session identifiers, and credit records so purchases can be fulfilled and audited.",
      },
      {
        heading: "Retention",
        body: "Generation records and files are retained so you can download previous decks and so we can support refunds, abuse prevention, and payment reconciliation. You can request deletion by contacting service@deckevo.com from the account email.",
      },
      {
        heading: "Security",
        body: "We use account sessions, server-side storage, and access checks to protect generated files. No online service can guarantee absolute security, so avoid uploading materials you are not allowed to share with an AI service.",
      },
      {
        heading: "International Processing",
        body: "Because our providers may operate in multiple regions, your information may be processed outside your country or region. Do not upload materials that your organization prohibits from being processed by external AI or cloud providers.",
      },
      {
        heading: "Contact",
        body: "Privacy, access, correction, export, or deletion requests can be sent to service@deckevo.com.",
      },
    ],
  },
  refund: {
    title: "Refund Policy",
    updated: "Last updated: June 28, 2026",
    sections: [
      {
        heading: "Paid Credits",
        body: "DeckEvo sells prepaid credits for PPT generation. Credits are added after successful Stripe payment and are consumed when generation jobs are accepted or completed according to the product rules shown in the app.",
      },
      {
        heading: "Refund Window",
        body: "Refund requests should be submitted within 7 days of purchase. We will review failed generations, duplicate charges, accidental duplicate purchases, and cases where credits were charged but no downloadable PPT was produced.",
      },
      {
        heading: "Non-refundable Cases",
        body: "Downloaded and successfully generated decks, used credits, custom work, excessive use, or abuse of the service may not be refundable unless required by applicable law.",
      },
      {
        heading: "Processing",
        body: "Approved refunds are returned through Stripe to the original payment method when possible. Bank or card network processing time may vary.",
      },
      {
        heading: "Contact",
        body: "Refund questions can be sent to service@deckevo.com with your account email, payment date, and Stripe receipt or order reference.",
      },
    ],
  },
};

const zhPolicyContent: typeof policyContent = {
  terms: {
    title: "服务条款",
    updated: "最后更新：2026 年 6 月 28 日",
    sections: [
      {
        heading: "服务内容",
        body: "DeckEvo 帮助用户把上传的 PowerPoint 文件、文稿、大纲和相关指令转化为可编辑的演示文稿文件。你需要确认上传材料属于你本人，或你已经取得合法使用授权。",
      },
      {
        heading: "账户",
        body: "DeckEvo 使用邮箱验证码登录，用于绑定生成历史、额度和下载记录。你需要对自己邮箱会话下的使用行为负责。",
      },
      {
        heading: "支付与 credits",
        body: "付费额度包通过 Stripe Checkout 处理。付款成功后 credits 会自动入账，并在系统接受或完成 PPT 生成任务时按页面规则扣除。除非页面明确标注为订阅产品，当前 credits 套餐均为一次性购买。",
      },
      {
        heading: "你的内容",
        body: "你保留上传材料的相关权利。使用本服务即表示你允许 DeckEvo 及其服务提供商在生成、存储、交付、保障安全和提供支持所需范围内处理这些材料。",
      },
      {
        heading: "生成结果",
        body: "AI 生成内容可能存在错误、遗漏、排版缺陷或事实不准确。你在商业、学术、法律、金融、医疗或公开场景使用前，应自行审核所有幻灯片、事实、图表和建议。",
      },
      {
        heading: "可接受使用",
        body: "不得上传违法、侵权、未经授权的第三方机密、恶意、受监管、高风险、滥用或有害内容。如使用行为影响服务、其他用户、支付合作方或基础设施安全，我们可能限制访问。",
      },
      {
        heading: "服务变更",
        body: "DeckEvo 仍在持续迭代。功能、模型、价格、credits 规则和输出质量可能调整。我们会尽量避免影响已付费使用，但可能暂停滥用或高风险行为。",
      },
      {
        heading: "联系",
        body: "服务问题可联系 service@deckevo.com。",
      },
    ],
  },
  privacy: {
    title: "隐私政策",
    updated: "最后更新：2026 年 6 月 28 日",
    sections: [
      {
        heading: "我们处理的数据",
        body: "我们会处理你的邮箱地址、上传文件、提示词、生成的 PPT、生成历史、credits 使用记录、支付状态和技术请求数据，用于生成 PPT、保存历史、管理额度和提供服务支持。",
      },
      {
        heading: "服务提供商",
        body: "你的内容可能会发送给配置的 AI 服务商用于生成，并发送给存储、数据库、邮件、支付和基础设施服务商用于文件交付、历史记录、登录、计费和安全。目前涉及的服务类别包括 AI 生成、Supabase 存储/数据库、Resend 邮件、Stripe 支付、Canva 集成和托管基础设施。",
      },
      {
        heading: "支付",
        body: "银行卡信息由 Stripe Checkout 处理。DeckEvo 不保存完整银行卡号。我们会保存支付状态、Stripe session 标识和 credits 记录，用于完成入账和审计。",
      },
      {
        heading: "保留与删除",
        body: "生成记录和文件会被保留，以便你下载历史文件、申请退款、处理滥用和核对支付。你可以使用账户邮箱联系 service@deckevo.com 申请删除。",
      },
      {
        heading: "安全",
        body: "我们使用账户会话、服务端存储和访问校验来保护生成文件。任何在线服务都不能保证绝对安全，请不要上传你所在组织禁止交给外部 AI 或云服务处理的材料。",
      },
      {
        heading: "跨境处理",
        body: "由于服务提供商可能在多个地区运营，你的信息可能会在你所在国家或地区之外被处理。",
      },
      {
        heading: "联系",
        body: "隐私、访问、更正、导出或删除请求可发送至 service@deckevo.com。",
      },
    ],
  },
  refund: {
    title: "退款政策",
    updated: "最后更新：2026 年 6 月 28 日",
    sections: [
      {
        heading: "付费 credits",
        body: "DeckEvo 销售用于 PPT 生成的预付 credits。Stripe 付款成功后 credits 会入账，并在系统接受或完成生成任务时按产品规则扣除。",
      },
      {
        heading: "退款窗口",
        body: "退款请求应在购买后 7 天内提交。我们会审核生成失败、重复扣款、误重复购买，以及已扣 credits 但没有可下载 PPT 的情况。",
      },
      {
        heading: "不退款情形",
        body: "已成功生成并下载的 PPT、已使用 credits、定制工作、过度使用或滥用服务的情况，除非适用法律另有要求，可能不支持退款。",
      },
      {
        heading: "处理方式",
        body: "审核通过的退款会尽可能通过 Stripe 原路退回。银行或卡组织处理时间可能不同。",
      },
      {
        heading: "联系",
        body: "退款问题请使用账户邮箱发送至 service@deckevo.com，并提供付款日期和 Stripe 收据或订单信息。",
      },
    ],
  },
};

const localizedPolicyContent: Record<UiLanguage, typeof policyContent> = {
  zh: zhPolicyContent,
  en: policyContent,
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
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("zh");
  const content = localizedContent[uiLanguage];
  const { ui } = content;
  const [productMode, setProductMode] = useState<ProductMode>("ppt");
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<SourceType>("outline");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("presenting");
  const autoStyle: Style = "consulting";
  const [audience, setAudience] = useState<string>(content.defaultAudience);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("deckevo-presentation.pptx");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceSlideCount, setSourceSlideCount] = useState<number | null>(null);
  const [generationId, setGenerationId] = useState("");
  const [recentGenerations, setRecentGenerations] = useState<GenerationRecord[]>([]);
  const [mindMapSpec, setMindMapSpec] = useState<MindMapSpec | null>(null);
  const [mindMapRecord, setMindMapRecord] = useState<MindMapGenerationRecord | null>(null);
  const [recentMindMaps, setRecentMindMaps] = useState<MindMapGenerationRecord[]>([]);
  const [mindMapStageOpen, setMindMapStageOpen] = useState(false);
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
  const [checkoutPlan, setCheckoutPlan] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const purpose = deliveryPurposeMap[deliveryMode];
  const inferredSlides = source === "ppt" ? sourceSlideCount || 12 : estimateOutlineSlides(prompt);
  const outputLanguage = ui.outputLanguage;
  const accountName = user?.email.split("@")[0] || "";
  const sourceOptions = content.sourceOptions;
  const deliveryOptions = content.deliveryOptions;
  const pricingPlans = content.pricingPlans;
  const faqs = content.faqs;
  const currentPolicyContent = localizedPolicyContent[uiLanguage];
  const pricingPlanIds = ["starter", "monthly", "pro"];
  const modeText =
    uiLanguage === "zh"
      ? {
          ppt: "PPT 生成",
          mindmap: "动态脑图汇报",
          mindmapIntro: "粘贴文稿后，AI 会拆成标准 JSON 并生成动态脑图演示。",
          mindmapPrompt: "粘贴文稿，生成动态脑图汇报",
          mindmapGenerate: "生成脑图",
          mindmapRegenerate: "重新生成脑图",
          openMindMap: "查看动态脑图",
          presentMindMap: "全屏汇报",
          exportSummary: "导出一页摘要 PDF",
          exportFull: "导出完整内容 PDF",
          resultReady: "脑图已生成，可以查看或导出。",
          recentMindMaps: "最近脑图",
          nodes: "节点",
          mindmapStepHeads: ["输入要拆解的文稿", "这份脑图是给人讲，还是给人看？", "生成动态脑图汇报"],
          mindmapSteps: ["输入文稿", "汇报对象", "生成脑图"],
          mindmapNeedPrompt: "请先输入文稿内容。",
        }
      : {
          ppt: "PPT generator",
          mindmap: "Dynamic MindMap report",
          mindmapIntro: "Paste source text and AI will turn it into standard JSON for a dynamic mindmap report.",
          mindmapPrompt: "Paste source text for a dynamic mindmap report",
          mindmapGenerate: "Generate MindMap",
          mindmapRegenerate: "Regenerate MindMap",
          openMindMap: "Open dynamic MindMap",
          presentMindMap: "Present fullscreen",
          exportSummary: "Export one-page summary PDF",
          exportFull: "Export full report PDF",
          resultReady: "MindMap is ready. You can view or export it.",
          recentMindMaps: "Recent MindMaps",
          nodes: "nodes",
          mindmapStepHeads: ["Enter source material", "Is this for presenting or reading?", "Generate dynamic MindMap report"],
          mindmapSteps: ["Source text", "Audience", "Generate"],
          mindmapNeedPrompt: "Please enter source material first.",
        };
  const stepHeadsForMode = productMode === "mindmap" ? modeText.mindmapStepHeads : ui.stepHeads;
  const stepsForMode = productMode === "mindmap" ? modeText.mindmapSteps : ui.steps;
  const currentStepHeads = stepHeadsForMode.slice(0, 2);
  const currentSteps = stepsForMode.slice(0, 2);
  const billingText =
    uiLanguage === "zh"
      ? {
          paying: "正在跳转支付",
          success: "付款成功，credits 已到账。",
          cancelled: "付款已取消，未扣款。",
          failed: "支付入口暂时不可用，请稍后再试。",
          loginFirst: "请先登录邮箱，再购买 credits。",
        }
      : {
          paying: "Opening checkout",
          success: "Payment completed. Credits have been added.",
          cancelled: "Payment cancelled. No charge was made.",
          failed: "Checkout is temporarily unavailable. Please try again later.",
          loginFirst: "Log in with email before buying credits.",
        };

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (step > currentSteps.length) {
      setStep(currentSteps.length);
    }
  }, [currentSteps.length, step]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const checkout = query.get("checkout");
    const sessionId = query.get("session_id");
    if (!checkout) return;

    const cleanUrl = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, "", cleanUrl);

    if (checkout === "cancelled") {
      setCheckoutMessage(billingText.cancelled);
      return;
    }
    if (checkout !== "success" || !sessionId) return;

    setCheckoutMessage("");
    void (async () => {
      try {
        const response = await apiFetch(`/api/billing/checkout-status?session_id=${encodeURIComponent(sessionId)}`);
        const payload = (await response.json().catch(() => ({}))) as { user?: UserAccount; error?: string };
        if (!response.ok) throw new Error(payload.error || billingText.failed);
        if (payload.user) setUser(payload.user);
        await refreshSession();
        setCheckoutMessage(billingText.success);
      } catch (error) {
        setCheckoutMessage(error instanceof Error ? error.message : billingText.failed);
      }
    })();
  }, [billingText.cancelled, billingText.failed, billingText.success]);

  useEffect(() => {
    setAudience((current) => {
      if (current === localizedContent.zh.defaultAudience || current === localizedContent.en.defaultAudience) {
        return content.defaultAudience;
      }
      return current;
    });
  }, [content.defaultAudience]);

  useEffect(() => {
    if (authStep !== "code" || resendCountdown <= 0) return;
    const timer = window.setTimeout(() => setResendCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [authStep, resendCountdown]);

  useEffect(() => {
    if (!mindMapStageOpen) return;

    document.body.classList.add("mindmap-presenting");
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMindMapStageOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("mindmap-presenting");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mindMapStageOpen]);

  const refreshSession = async () => {
    try {
      const response = await apiFetch("/api/session");
      if (!response.ok) return;
      const payload = (await response.json()) as { user?: UserAccount | null };
      setUser(payload.user || null);
      if (payload.user) {
        setEmail(payload.user.email);
        void refreshGenerations();
        void refreshMindMaps();
      } else {
        setRecentGenerations([]);
        setRecentMindMaps([]);
      }
    } catch {
      setUser(null);
      setRecentGenerations([]);
      setRecentMindMaps([]);
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
        throw new Error(payload.error || ui.errors.requestCode);
      }
      setDevLoginCode(payload.devCode || "");
      setVerificationCode("");
      setResendCountdown(60);
      setAuthStep("code");
      window.setTimeout(() => codeInputRefs.current[0]?.focus(), 60);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : ui.errors.requestCode);
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
        throw new Error(payload.error || ui.errors.login);
      }
      setUser(payload.user);
      closeLogin();
      void refreshGenerations();
      void refreshMindMaps();
      if (loginIntent === "generate") {
        setLoginIntent("");
        window.setTimeout(() => {
          document.querySelector<HTMLButtonElement>('[data-generate-button="true"]')?.click();
        }, 100);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : ui.errors.login);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setRecentGenerations([]);
    setRecentMindMaps([]);
    setDownloadUrl("");
    setGenerationId("");
    setMindMapSpec(null);
    setMindMapRecord(null);
    setAccountMenuOpen(false);
    setAccountOpen(false);
  };

  const startCheckout = async (planId: string) => {
    setCheckoutMessage("");
    if (!user) {
      setCheckoutMessage(billingText.loginFirst);
      openLogin();
      return;
    }

    setCheckoutPlan(planId);
    try {
      const response = await apiFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: planId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || billingText.failed);
      window.location.href = payload.url;
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : billingText.failed);
      setCheckoutPlan("");
    }
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

      if (productMode === "mindmap") {
        await generateMindMapReport();
        return;
      }

      if (source === "ppt" && !selectedFile) {
        throw new Error(ui.errors.needPpt);
      }

      const response = await submitGenerationRequest();

      if (response.status === 202) {
        const payload = (await response.json().catch(() => null)) as { id?: string } | null;
        setGenerationError(ui.errors.queued);
        if (!payload?.id) {
          throw new Error(ui.errors.noJobId);
        }
        const record = await waitForQueuedGeneration(payload.id);
        await downloadGenerationRecord(record);
        setGenerationError(ui.completed);
        setGenerated(true);
        await refreshGenerations();
        await refreshSession();
        return;
      }

      if (!response.ok) {
        if (response.status === 401) openLogin();
        const payload = await response.json().catch(() => ({ error: ui.errors.failed }));
        if ([502, 503, 504].includes(response.status)) {
          throw new Error(ui.errors.busy);
        }
        throw new Error(payload.error || ui.errors.failed);
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
      setGenerationError(ui.completed);
      await refreshGenerations();
      await refreshSession();
      downloadDeck(nextUrl, nextName);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : ui.errors.failed);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateMindMapReport = async () => {
    const sourceText = prompt.trim();
    if (sourceText.length < 8) {
      throw new Error(modeText.mindmapNeedPrompt);
    }

    const response = await apiFetch("/api/generate-mindmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: sourceText,
        audience,
        deliveryMode,
        style: "business-premium",
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      record?: MindMapGenerationRecord;
      spec?: MindMapSpec;
      user?: UserAccount | null;
      error?: string;
    };
    if (!response.ok || !payload.record || !payload.spec) {
      if (response.status === 401) openLogin();
      throw new Error(payload.error || ui.errors.failed);
    }

    setMindMapRecord(payload.record);
    setMindMapSpec(payload.spec);
    setGenerated(true);
    setGenerationError(ui.completed);
    if (payload.user) setUser(payload.user);
    await refreshMindMaps();
    await refreshSession();
  };

  const submitGenerationRequest = async () => {
    const deliveryPrompt =
      deliveryMode === "presenting"
        ? ui.presentingPrompt
        : ui.readingPrompt;
    const generationAudience = `${audience}; ${deliveryMode === "presenting" ? ui.presentingAudience : ui.readingAudienceMode}`;
    const generationPrompt = [
      "USER_SOURCE_MATERIAL_START",
      prompt.trim() || ui.noBody,
      "USER_SOURCE_MATERIAL_END",
      "",
      deliveryPrompt,
    ].join("\n");
    const submitDirectFileGeneration = () => {
      const formData = new FormData();
      formData.append("source", source);
      formData.append("purpose", purpose);
      formData.append("style", autoStyle);
      formData.append("slides", String(inferredSlides));
      formData.append("language", outputLanguage);
      formData.append("audience", generationAudience);
      formData.append("prompt", generationPrompt);
      if (selectedFile) formData.append("file", selectedFile);
      setGenerationError(ui.errors.queued);
      return generationApiFetch({
        method: "POST",
        body: formData,
      });
    };

    if (source === "ppt" && selectedFile) {
      if (selectedFile.size > signedUploadLimitBytes) {
        setGenerationError(ui.errors.uploading);
        return submitDirectFileGeneration();
      }

      setGenerationError(ui.errors.uploading);
      const sourceFile = await uploadSourcePptx(selectedFile).catch(() => null);
      if (!sourceFile) {
        return submitDirectFileGeneration();
      }
      setGenerationError(ui.errors.queued);
      return generationApiFetch({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          purpose,
          style: autoStyle,
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
    formData.append("style", autoStyle);
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
      throw new Error(ui.errors.maxUpload);
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
      throw new Error(payload.error || ui.errors.uploadUrl);
    }

    const uploaded = await fetch(payload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
      body: file,
    });

    if (!uploaded.ok) {
      throw new Error(ui.errors.uploadFailed);
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
        throw new Error(payload.error || ui.errors.failed);
      }
      if (payload.status === "ready" && payload.record) return payload.record;
    }
    throw new Error(ui.errors.queuedStillRunning);
  };

  const downloadGenerationRecord = async (record: GenerationRecord) => {
    const response = await apiFetch(`/api/generations/${record.id}/download`);
    if (!response.ok) {
      throw new Error(ui.errors.downloadFailed);
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

  const refreshMindMaps = async () => {
    try {
      const response = await apiFetch("/api/mindmaps");
      if (!response.ok) return;
      const payload = (await response.json()) as { records?: MindMapGenerationRecord[] };
      setRecentMindMaps(payload.records?.slice(0, 5) || []);
    } catch {
      setRecentMindMaps([]);
    }
  };

  const loadMindMap = async (id: string) => {
    const response = await apiFetch(`/api/mindmaps/${id}`);
    const payload = (await response.json().catch(() => ({}))) as {
      record?: MindMapGenerationRecord;
      spec?: MindMapSpec;
      error?: string;
    };
    if (!response.ok || !payload.record || !payload.spec) {
      setGenerationError(payload.error || ui.errors.failed);
      return;
    }
    setProductMode("mindmap");
    setMindMapRecord(payload.record);
    setMindMapSpec(payload.spec);
    setGenerated(true);
    setGenerationError(ui.completed);
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

  const switchProductMode = (mode: ProductMode) => {
    setProductMode(mode);
    setStep(1);
    setGenerated(false);
    setGenerationError("");
    if (mode === "ppt") {
      setMindMapSpec(null);
      setMindMapRecord(null);
    } else {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl("");
      setGenerationId("");
    }
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label={ui.homeLabel}>
          <span className="brand-mark" />
          <span>DeckEvo</span>
        </a>

        <nav className="header-nav" aria-label={ui.navLabel}>
          <a href="#pricing">{ui.pricing}</a>
          <button className="nav-link-button" type="button" onClick={() => setLegalPage("privacy")}>
            {ui.privacy}
          </button>
          <div className="language-switcher" aria-label={ui.language}>
            <button className={uiLanguage === "en" ? "active" : ""} type="button" onClick={() => setUiLanguage("en")}>
              EN
            </button>
            <button className={uiLanguage === "zh" ? "active" : ""} type="button" onClick={() => setUiLanguage("zh")}>
              中文
            </button>
          </div>
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
                    {ui.account}
                  </button>
                  <button type="button" onClick={handleLogout}>
                    {ui.logout}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="ghost-button" type="button" onClick={openLogin}>
              <LogIn size={16} />
              {ui.login}
            </button>
          )}
        </nav>
      </header>

      <section className="hero" id="top">
        <img className="hero-media" src="/assets/hero-product.png" alt={ui.heroAlt} />
        <div className="hero-shade" />
        <div className="hero-content">
          <p className="eyebrow">{ui.heroEyebrow}</p>
          <h1 className="hero-title">
            <span>{ui.heroTitleTop}</span>
            <span>{ui.heroTitleBottom}</span>
          </h1>
          <p className="hero-copy">
            <span>{ui.heroCopyTop}</span>
            <span>{ui.heroCopyBottom}</span>
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={scrollToGenerator}>
              {ui.start}
              <ArrowRight size={18} />
            </button>
            <a className="secondary-link" href="#gallery">
              {ui.viewSamples}
            </a>
          </div>
        </div>
      </section>

      <section className="generator-section" id="generator" aria-label={ui.generatorLabel}>
        <div className="product-mode-switch" aria-label="DeckEvo generation mode">
          <button className={productMode === "ppt" ? "active" : ""} type="button" onClick={() => switchProductMode("ppt")}>
            <Presentation size={18} />
            {modeText.ppt}
          </button>
          <button className={productMode === "mindmap" ? "active" : ""} type="button" onClick={() => switchProductMode("mindmap")}>
            <Sparkles size={18} />
            {modeText.mindmap}
          </button>
        </div>
        {productMode === "mindmap" && <p className="mode-intro">{modeText.mindmapIntro}</p>}

        <div className="stepper" aria-label={ui.stepsLabel}>
          {currentSteps.map((label, index) => {
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

        <div className="generator-shell generator-single">
          <div className="generator-workspace">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Step {step}</p>
                <h2>{currentStepHeads[step - 1]}</h2>
              </div>
              <span className="status-pill">
                <Sparkles size={14} />
                {ui.engine}
              </span>
            </div>

            {step === 1 && (
              <div className="step-body">
                {productMode === "ppt" ? (
                  <>
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
                          <span>{selectedFile ? selectedFile.name : ui.uploadPlaceholder}</span>
                          <small>{selectedFile ? ui.uploadSelected : ui.uploadHelp}</small>
                          <input
                            aria-label={ui.uploadAria}
                            type="file"
                            accept=".pptx"
                            onChange={(event) => void handlePptxFileChange(event.target.files?.[0] ?? null)}
                          />
                        </label>
                        {selectedFile && <p className="format-note">{ui.formatNote}</p>}
                      </>
                    ) : (
                      <label className="prompt-field">
                        <span>{ui.promptLabel}</span>
                        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
                      </label>
                    )}
                  </>
                ) : (
                  <label className="prompt-field">
                    <span>{modeText.mindmapPrompt}</span>
                    <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
                  </label>
                )}

                <div className="panel-actions">
                  <button className="primary-button" type="button" onClick={() => setStep(2)}>
                    {ui.next}
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
                  <span>{deliveryMode === "presenting" ? ui.liveAudience : ui.readingAudience}</span>
                  <input value={audience} onChange={(event) => setAudience(event.target.value)} />
                </label>

                <div className="panel-actions split">
                  <button className="text-button" type="button" onClick={() => setStep(1)}>
                    {ui.previous}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    data-generate-button="true"
                  >
                    {isGenerating
                      ? ui.generating
                      : productMode === "mindmap"
                        ? generated
                          ? modeText.mindmapRegenerate
                          : modeText.mindmapGenerate
                        : generated
                          ? ui.regenerating
                          : ui.generate}
                    {isGenerating ? <LoaderCircle className="spin-icon" size={18} /> : <Sparkles size={18} />}
                  </button>
                </div>

                {generationError && <p className={`status-message ${generated ? "complete" : "pending"}`}>{generationError}</p>}
                {productMode === "ppt" && generated && (
                  <div className="mindmap-result-card deck-result-card" id="deck-result">
                    <strong>{ui.saved}</strong>
                    <div className="mindmap-result-actions deck-result-actions">
                      <button
                        className="download-button"
                        type="button"
                        disabled={!downloadUrl || isGenerating}
                        onClick={() => downloadDeck()}
                      >
                        <Download size={17} />
                        {downloadUrl ? ui.downloadAgain : ui.download}
                      </button>
                    </div>
                  </div>
                )}
                {productMode === "mindmap" && mindMapRecord && mindMapSpec && (
                  <>
                    <div className="mindmap-result-card" id="mindmap-result">
                      <strong>{modeText.resultReady}</strong>
                      <div className="mindmap-result-actions">
                        <a
                          className="download-button secondary-export"
                          href="#mindmap-result"
                          onClick={(event) => {
                            event.preventDefault();
                            void document.documentElement.requestFullscreen?.().catch(() => undefined);
                            setMindMapStageOpen(true);
                          }}
                        >
                          <Eye size={17} />
                          {modeText.presentMindMap}
                        </a>
                        <a
                          className="download-button"
                          href={apiPath(`/api/mindmaps/${mindMapRecord.id}/summary`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={17} />
                          {modeText.exportSummary}
                        </a>
                        <a
                          className="download-button secondary-export"
                          href={apiPath(`/api/mindmaps/${mindMapRecord.id}/full`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={17} />
                          {modeText.exportFull}
                        </a>
                        <a
                          className="download-button secondary-export"
                          href={apiPath(`/api/mindmaps/${mindMapRecord.id}/offline`)}
                          download
                        >
                          <Download size={17} />
                          {uiLanguage === "zh" ? "下载离线 HTML" : "Download offline HTML"}
                        </a>
                      </div>
                    </div>
                    <div className="mindmap-main-presenter">
                      <MindMapPresenter spec={mindMapSpec} />
                    </div>
                  </>
                )}
              </div>
            )}

          </div>

        </div>
      </section>

      <section className="case-placeholder-section" id="gallery" aria-label={ui.casesLabel}>
        <div className="case-placeholder-grid" aria-hidden="true">
          <div />
          <div />
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="section-heading centered">
          <p className="section-kicker">{ui.pricing}</p>
          <h2>{ui.pricingTitle}</h2>
        </div>

        <div className="pricing-grid">
          {pricingPlans.map((plan, index) => {
            const isFeatured = "featured" in plan && plan.featured;
            const planId = pricingPlanIds[index] || pricingPlanIds[0];
            const isCheckingOut = checkoutPlan === planId;
            return (
              <article className={`pricing-card ${isFeatured ? "featured" : ""}`} key={plan.name}>
                {isFeatured && <span className="plan-badge">{ui.recommended}</span>}
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
                <button
                  className={isFeatured ? "primary-button wide" : "outline-button"}
                  type="button"
                  onClick={() => void startCheckout(planId)}
                  disabled={isCheckingOut}
                >
                  {isCheckingOut ? billingText.paying : plan.cta}
                </button>
              </article>
            );
          })}
        </div>
        {checkoutMessage && <p className="billing-message">{checkoutMessage}</p>}
      </section>

      <section className="trust-section" id="privacy">
        <div className="trust-copy">
          <p className="section-kicker">Privacy</p>
          <h2>{ui.trustTitle}</h2>
          <p>{ui.trustBody}</p>
        </div>
        <div className="trust-list">
          <span>
            <Shield size={18} />
            {ui.filePermission}
          </span>
          <span>
            <Lock size={18} />
            {ui.privateHistory}
          </span>
          <span>
            <Languages size={18} />
            {ui.multilingual}
          </span>
        </div>
      </section>

      <section className="faq-section">
        <div className="section-heading">
          <p className="section-kicker">FAQ</p>
          <h2>{ui.faqTitle}</h2>
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
            {uiLanguage === "zh" ? "条款" : "Terms"}
          </button>
          <button type="button" onClick={() => setLegalPage("privacy")}>
            {uiLanguage === "zh" ? "隐私" : "Privacy"}
          </button>
          <button type="button" onClick={() => setLegalPage("refund")}>
            {uiLanguage === "zh" ? "退款" : "Refund"}
          </button>
        </div>
        <a href="#top">{ui.top}</a>
      </footer>

      {legalPage && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="policy-title">
          <div className="legal-modal">
            <button className="icon-button" type="button" onClick={() => setLegalPage(null)} aria-label={ui.close}>
              <X size={18} />
            </button>
            <p className="section-kicker">DeckEvo</p>
            <h2 id="policy-title">{currentPolicyContent[legalPage].title}</h2>
            <small>{currentPolicyContent[legalPage].updated}</small>
            <div className="policy-sections">
              {currentPolicyContent[legalPage].sections.map((section) => (
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
            <button className="icon-button" type="button" onClick={() => setAccountOpen(false)} aria-label={ui.close}>
              <X size={18} />
            </button>
            <div className="account-modal-title">
              <UserCircle size={24} />
              <h2 id="account-title">{ui.account}</h2>
            </div>
            <div className="account-detail-list">
              <div>
                <span>{ui.email}</span>
                <strong>{user.email}</strong>
              </div>
              <div>
                <span>{ui.creditBalance}</span>
                <strong>{user.creditsRemaining} credits</strong>
              </div>
              <div>
                <span>{ui.subscription}</span>
                <strong>{ui.payAsYouGo}</strong>
              </div>
            </div>
            <div className="upgrade-card">
              <p>{ui.upgradeCopy}</p>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {ui.viewPricing}
              </button>
            </div>
            <button className="account-logout" type="button" onClick={handleLogout}>
              {ui.logout}
            </button>
          </div>
        </div>
      )}

      {loginOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="login-title">
          <div className="login-modal">
            <button className="icon-button" type="button" onClick={closeLogin} aria-label={ui.close}>
              <X size={18} />
            </button>
            <Mail size={24} />
            {authStep === "code" && (
              <button className="back-button" type="button" onClick={() => setAuthStep("email")}>
                {ui.changeEmail}
              </button>
            )}
            <h2 id="login-title">{authStep === "email" ? ui.loginTitle : ui.codeTitle}</h2>
            <p>
              {authStep === "email"
                ? ui.loginIntro
                : (
                  <>
                    {ui.sentTo} <strong className="email-highlight">{email}</strong>
                  </>
                )}
            </p>
            <label>
              <span>{ui.email}</span>
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
                <div className="code-inputs" aria-label={ui.codeLabel}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <input
                      // eslint-disable-next-line react/no-array-index-key
                      key={index}
                      ref={(element) => {
                        codeInputRefs.current[index] = element;
                      }}
                      aria-label={`${ui.codeDigitLabel} ${index + 1}${ui.digitSuffix}`}
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
                  {ui.resendPrefix}
                  <button type="button" onClick={handleRequestCode} disabled={isLoggingIn || resendCountdown > 0}>
                    {resendCountdown > 0 ? `${ui.resend} (${resendCountdown}s)` : ui.resend}
                  </button>
                </p>
              </>
            )}
            {devLoginCode && <p className="dev-code">{ui.devCode}{devLoginCode}</p>}
            {authError && <p className="error-message">{authError}</p>}
            <button
              className="primary-button wide"
              type="button"
              onClick={authStep === "email" ? handleRequestCode : handleVerifyLogin}
              disabled={isLoggingIn}
            >
              {isLoggingIn ? ui.processing : authStep === "email" ? ui.sendCode : ui.verifyLogin}
            </button>
            {authStep === "code" && (
              <p className="auth-footnote">{ui.authFootnote}</p>
            )}
          </div>
        </div>
      )}

      {mindMapStageOpen && mindMapSpec && (
        <div className="mindmap-stage-backdrop" role="dialog" aria-modal="true" aria-label={modeText.openMindMap}>
          <button
            className="mindmap-stage-close"
            type="button"
            onClick={() => {
              setMindMapStageOpen(false);
              if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
            }}
            aria-label={ui.close}
          >
            <X size={30} />
          </button>
          <MindMapPresenter spec={mindMapSpec} immersive />
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

function formatGenerationTime(value: string, uiLanguage: UiLanguage) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return localizedContent[uiLanguage].ui.errors.justNow;
  return date.toLocaleString(uiLanguage === "zh" ? "zh-CN" : "en-US", {
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
  const headings = text.match(/^#{1,3}\s*\d+[.、\s].+$/gm) || text.match(/^#{1,3}\s+.+$/gm) || [];
  if (headings.length >= 4) {
    return Math.max(6, Math.min(30, headings.length + 2));
  }

  const compactLength = text.replace(/\s+/g, "").length;
  if (compactLength <= 120) return 6;
  if (compactLength <= 500) return 8;
  if (compactLength <= 1200) return 10;
  if (compactLength <= 2200) return 14;
  if (compactLength <= 3600) return 18;
  return 24;
}

export default App;
