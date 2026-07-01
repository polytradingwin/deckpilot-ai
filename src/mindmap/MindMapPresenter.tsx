import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from "react";
import type { MindMapNode, MindMapSpec } from "../shared/mindmap";

type MindMapPresenterProps = {
  spec: MindMapSpec;
  immersive?: boolean;
};

type MapItem = {
  id: string;
  parentId?: string;
  badge?: string;
  title: string;
  subtitle?: string;
  detail?: string;
  accent: string;
  surface: string;
  soft: string;
  depth: 0 | 1 | 2;
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
};

const stage = {
  width: 3200,
  baseHeight: 1100,
  rootX: 480,
  mainX: 1320,
  childX: 2200,
  topPadding: 260,
  bottomPadding: 300,
};

const rootTone = {
  accent: "#e1b451",
  surface: "#0e3b44",
  soft: "rgba(225, 180, 81, 0.18)",
};

const nodeTones = [
  { accent: "#e0a431", surface: "#f9f7ef", soft: "rgba(224, 164, 49, 0.16)" },
  { accent: "#8fb7aa", surface: "#f5faf5", soft: "rgba(143, 183, 170, 0.18)" },
  { accent: "#d18b6a", surface: "#fbf5ef", soft: "rgba(209, 139, 106, 0.16)" },
  { accent: "#7fa0b8", surface: "#f3f7fb", soft: "rgba(127, 160, 184, 0.18)" },
  { accent: "#b5a065", surface: "#faf7ef", soft: "rgba(181, 160, 101, 0.18)" },
  { accent: "#a3aa80", surface: "#f7f8ef", soft: "rgba(163, 170, 128, 0.18)" },
];

export function MindMapPresenter({ spec, immersive = false }: MindMapPresenterProps) {
  const model = useMemo(() => buildMapModel(spec), [spec]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(immersive ? 0.98 : 0.44);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [viewport, setViewport] = useState({
    width: immersive ? window.innerWidth : 720,
    height: immersive ? Math.max(520, window.innerHeight - 88) : 520,
  });
  const wheelBuffer = useRef(0);
  const wheelLockUntil = useRef(0);
  const wheelResetTimer = useRef<number | null>(null);
  const drag = useRef<DragState | null>(null);
  const visibleItems = model.items.slice(0, activeIndex + 1);
  const active = visibleItems[visibleItems.length - 1] || model.items[0];
  const displayItems = visibleItems.map((item, index) => ({ item, index }));
  const visibleIds = new Set(displayItems.map((entry) => entry.item.id));
  const visibleLinks = model.links.filter((link) => visibleIds.has(link.from) && visibleIds.has(link.to));
  const viewportHeight = viewport.height;
  const viewportWidth = viewport.width;
  const translateX = viewportWidth / 2 - active.x * zoom + pan.x;
  const translateY = viewportHeight / 2 - active.y * zoom + pan.y;

  const go = (direction: -1 | 1) => {
    setActiveIndex((current) => clamp(current + direction, 0, model.items.length - 1));
  };

  useEffect(() => {
    if (!immersive) return;

    const syncViewport = () => {
      setViewport({ width: window.innerWidth, height: Math.max(520, window.innerHeight - 88) });
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, [immersive]);

  useEffect(() => {
    setActiveIndex((current) => clamp(current, 0, model.items.length - 1));
  }, [model.items.length]);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [activeIndex, model]);

  useEffect(() => {
    if (!immersive) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        go(1);
      }
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        go(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [immersive, model.items.length]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 2) return;
    event.preventDefault();

    const now = window.performance.now();
    if (now < wheelLockUntil.current) return;

    wheelBuffer.current += event.deltaY;
    if (wheelResetTimer.current) window.clearTimeout(wheelResetTimer.current);
    wheelResetTimer.current = window.setTimeout(() => {
      wheelBuffer.current = 0;
    }, 180);

    if (Math.abs(wheelBuffer.current) < 70) return;

    go(wheelBuffer.current > 0 ? 1 : -1);
    wheelBuffer.current = 0;
    wheelLockUntil.current = now + 260;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!immersive || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button,input")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: pan.x,
      baseY: pan.y,
    };
    setIsPanning(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPan({
      x: drag.current.baseX + event.clientX - drag.current.startX,
      y: drag.current.baseY + event.clientY - drag.current.startY,
    });
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    setIsPanning(false);
  };

  return (
    <div className={`mindmap-presenter ${immersive ? "immersive" : ""} ${isPanning ? "panning" : ""}`} aria-label="MindMap preview">
      <div
        className="mindmap-stage"
        style={{ height: viewportHeight }}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onWheel={handleWheel}
      >
        {!immersive && (
          <div className="mindmap-deck-heading">
            <span>{spec.subtitle || spec.audience}</span>
            <h3>{spec.summary.headline || spec.title}</h3>
          </div>
        )}
        <div className="mindmap-zoom">
          <button type="button" onClick={() => setZoom((value) => clamp(Number((value - 0.08).toFixed(2)), 0.38, 1.28))}>
            -
          </button>
          <button type="button" onClick={() => setZoom((value) => clamp(Number((value + 0.08).toFixed(2)), 0.38, 1.28))}>
            +
          </button>
        </div>
        <div
          className="mindmap-world"
          style={{
            width: stage.width,
            height: model.height,
            transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${zoom})`,
          }}
        >
          <svg className="mindmap-links" viewBox={`0 0 ${stage.width} ${model.height}`} aria-hidden="true">
            {visibleLinks.map((link) => {
              const from = model.byId.get(link.from);
              const to = model.byId.get(link.to);
              if (!from || !to) return null;
              const activeLink = link.from === active.id || link.to === active.id;
              const startX = from.x + nodeSize(from).width / 2;
              const endX = to.x - nodeSize(to).width / 2;
              const control = Math.max(90, (endX - startX) * 0.5);
              return (
                <path
                  className={activeLink ? "active" : ""}
                  d={`M ${startX} ${from.y} C ${startX + control} ${from.y}, ${endX - control} ${to.y}, ${endX} ${to.y}`}
                  key={`${link.from}-${link.to}`}
                />
              );
            })}
          </svg>

          {displayItems.map(({ item, index }) => {
            const size = nodeSize(item);
            const isActive = index === activeIndex;
            return (
              <button
                className={`map-node depth-${item.depth} ${isActive ? "active" : ""}`}
                key={item.id}
                type="button"
                style={{
                  left: item.x - size.width / 2,
                  top: item.y - size.height / 2,
                  width: size.width,
                  minHeight: size.height,
                  "--node-accent": item.accent,
                  "--node-surface": item.surface,
                  "--node-soft": item.soft,
                } as CSSProperties}
                onClick={() => setActiveIndex(index)}
              >
                {item.badge && <em className="node-badge">{item.badge}</em>}
                <span className="node-copy">
                  {item.subtitle && <span>{item.subtitle}</span>}
                  <strong>{item.title}</strong>
                  {item.detail && <small>{item.detail}</small>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mindmap-scrubber">
        <button type="button" onClick={() => go(-1)}>上一页</button>
        <input
          aria-label="MindMap node"
          max={model.items.length - 1}
          min={0}
          type="range"
          value={activeIndex}
          onChange={(event) => setActiveIndex(Number(event.target.value))}
        />
        <button type="button" onClick={() => go(1)}>下一页</button>
        <strong>
          {String(activeIndex + 1).padStart(2, "0")} / {String(model.items.length).padStart(2, "0")}
        </strong>
      </div>
    </div>
  );
}

function buildMapModel(spec: MindMapSpec) {
  const links: Array<{ from: string; to: string }> = [];
  const mainNodes = spec.nodes.length ? spec.nodes : createFallbackNodes(spec);
  const lanes = mainNodes.map((node) => {
    const children = node.children.slice(0, 5);
    return {
      node,
      children,
      height: Math.max(430, Math.max(1, children.length) * 220 + 180),
    };
  });
  const laneGap = 170;
  const lanesHeight = lanes.reduce((sum, lane) => sum + lane.height, 0) + Math.max(0, lanes.length - 1) * laneGap;
  const worldHeight = Math.max(stage.baseHeight, lanesHeight + stage.topPadding + stage.bottomPadding);
  const root: MapItem = {
    id: "root",
    title: buildCoverTitle(spec),
    subtitle: compactMetricLine(spec),
    detail: buildCoverDetail(spec),
    accent: rootTone.accent,
    surface: rootTone.surface,
    soft: rootTone.soft,
    depth: 0,
    x: stage.rootX,
    y: worldHeight / 2,
  };
  const items: MapItem[] = [root];
  const mainItems: MapItem[] = [];
  const childItems: MapItem[] = [];
  let laneTop = (worldHeight - lanesHeight) / 2;

  lanes.forEach(({ node, children, height }, nodeIndex) => {
    const mainId = `node-${nodeIndex}`;
    const mainY = laneTop + height / 2;
    const tone = nodeTones[nodeIndex % nodeTones.length];
    mainItems.push({
      id: mainId,
      parentId: "root",
      badge: String(nodeIndex + 1).padStart(2, "0"),
      title: compactNodeText(node.title, 28),
      subtitle: compactNodeText(node.subtitle, 18),
      detail: compactNodeText(node.insight, 56),
      accent: tone.accent,
      surface: tone.surface,
      soft: tone.soft,
      depth: 1,
      x: stage.mainX,
      y: mainY,
    });
    links.push({ from: "root", to: mainId });

    const childGap = 220;
    const childStartY = mainY - ((children.length - 1) * childGap) / 2;
    children.forEach((child, childIndex) => {
      const childId = `${mainId}-child-${childIndex}`;
      childItems.push({
        id: childId,
        parentId: mainId,
        badge: String.fromCharCode(65 + childIndex),
        title: compactNodeText(child.title, 22),
        subtitle: compactNodeText(child.subtitle, 14),
        detail: compactNodeText(child.detail, 40),
        accent: tone.accent,
        surface: childIndex % 2 === 0 ? tone.surface : "#ffffff",
        soft: tone.soft,
        depth: 2,
        x: stage.childX + (childIndex % 2) * 190,
        y: childStartY + childIndex * childGap,
      });
      links.push({ from: mainId, to: childId });
    });

    laneTop += height + laneGap;
  });

  items.push(...mainItems, ...childItems);

  const minY = Math.min(...items.map((item) => item.y - nodeSize(item).height / 2));
  const maxY = Math.max(...items.map((item) => item.y + nodeSize(item).height / 2));
  const shiftY = Math.max(0, 120 - minY);
  if (shiftY > 0) {
    items.forEach((item) => {
      item.y += shiftY;
    });
  }

  return {
    items,
    links,
    byId: new Map(items.map((item) => [item.id, item])),
    height: Math.max(worldHeight, maxY - minY + 240),
  };
}

function createFallbackNodes(spec: MindMapSpec): MindMapNode[] {
  return [
    {
      title: spec.summary.headline || spec.title,
      subtitle: spec.subtitle,
      insight: spec.summary.conclusion,
      visual: { type: "none" },
      children: spec.summary.keyMetrics.map((metric) => ({
        title: metric.value,
        subtitle: metric.label,
        detail: metric.note,
      })),
    },
  ];
}

function nodeSize(item: MapItem) {
  if (item.depth === 0) return { width: 900, height: item.detail ? 300 : 240 };
  if (item.depth === 1) return { width: 660, height: item.detail ? 270 : 210 };
  return { width: 520, height: item.detail ? 200 : 150 };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function compactMetricLine(spec: MindMapSpec) {
  const sourceText = collectSpecText(spec);
  const roi = extractRoi(sourceText);
  const metrics = spec.summary.keyMetrics
    .slice(0, 4)
    .map((metric) => [metric.label, metric.value].filter(Boolean).join(" "))
    .filter(Boolean);
  if (roi && !metrics.some((metric) => /ROI/i.test(metric))) metrics.push(roi);
  return compactNodeText(metrics.join(" | ") || spec.subtitle || "核心总结", 64, roi ? [roi] : []);
}

function buildCoverTitle(spec: MindMapSpec) {
  const sourceText = collectSpecText(spec);
  const roi = extractRoi(sourceText);
  const headline = spec.summary.headline || spec.title;
  const compactHeadline = compactNodeText(headline, 30, roi ? [roi] : []);
  return compactHeadline.replace(/[，,。；;]\s*$/g, "");
}

function buildCoverDetail(spec: MindMapSpec) {
  const conclusion = compactNodeText(spec.summary.conclusion || spec.subtitle, 48);
  return conclusion === spec.summary.headline ? "" : conclusion;
}

function collectSpecText(spec: MindMapSpec) {
  return [
    spec.title,
    spec.subtitle,
    spec.summary.headline,
    spec.summary.conclusion,
    ...spec.summary.keyMetrics.flatMap((metric) => [metric.label, metric.value, metric.note]),
    ...spec.nodes.flatMap((node) => [
      node.title,
      node.subtitle,
      node.insight,
      ...node.children.flatMap((child) => [child.title, child.subtitle, child.detail]),
    ]),
  ]
    .filter(Boolean)
    .join(" ");
}

function extractRoi(value: string) {
  return value.match(/ROI\s*[≈~约=：:]*\s*\d+(?:\.\d+)?\s*(?:倍|x|X)?/i)?.[0].replace(/\s+/g, "") || "";
}

function compactNodeText(value: unknown, maxLength: number, protectedTerms: string[] = []) {
  const normalized = String(value || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  const protectedTerm = protectedTerms.find((term) => term && normalized.includes(term));
  if (protectedTerm && !normalized.slice(0, maxLength).includes(protectedTerm)) {
    const headLength = Math.max(0, maxLength - protectedTerm.length - 2);
    return `${normalized.slice(0, headLength).trim()}…${protectedTerm}`;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}
