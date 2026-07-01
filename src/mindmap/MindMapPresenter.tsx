import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import type { MindMapNode, MindMapSpec } from "../shared/mindmap";

type MindMapPresenterProps = {
  spec: MindMapSpec;
  immersive?: boolean;
};

type MapItem = {
  id: string;
  parentId?: string;
  title: string;
  subtitle?: string;
  detail?: string;
  depth: 0 | 1 | 2;
  x: number;
  y: number;
};

const stage = {
  width: 2300,
  baseHeight: 900,
  rootX: 360,
  mainX: 940,
  childX: 1540,
  topPadding: 190,
  bottomPadding: 220,
};

export function MindMapPresenter({ spec, immersive = false }: MindMapPresenterProps) {
  const model = useMemo(() => buildMapModel(spec), [spec]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(immersive ? 0.86 : 0.62);
  const [viewport, setViewport] = useState({
    width: immersive ? window.innerWidth : 720,
    height: immersive ? Math.max(520, window.innerHeight - 88) : 520,
  });
  const wheelBuffer = useRef(0);
  const wheelLockUntil = useRef(0);
  const wheelResetTimer = useRef<number | null>(null);
  const visibleItems = model.items.slice(0, activeIndex + 1);
  const active = visibleItems[visibleItems.length - 1] || model.items[0];
  const displayItems = visibleItems.map((item, index) => ({ item, index }));
  const visibleIds = new Set(displayItems.map((entry) => entry.item.id));
  const visibleLinks = model.links.filter((link) => visibleIds.has(link.from) && visibleIds.has(link.to));
  const viewportHeight = viewport.height;
  const viewportWidth = viewport.width;
  const translateX = viewportWidth / 2 - active.x * zoom;
  const translateY = viewportHeight / 2 - active.y * zoom;

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

  return (
    <div className={`mindmap-presenter ${immersive ? "immersive" : ""}`} aria-label="MindMap preview">
      <div className="mindmap-stage" style={{ height: viewportHeight }} onWheel={handleWheel}>
        {!immersive && (
          <div className="mindmap-deck-heading">
            <span>{spec.subtitle || spec.audience}</span>
            <h3>{spec.summary.headline || spec.title}</h3>
          </div>
        )}
        <div className="mindmap-zoom">
          <button type="button" onClick={() => setZoom((value) => clamp(Number((value - 0.08).toFixed(2)), 0.46, 1.18))}>
            -
          </button>
          <button type="button" onClick={() => setZoom((value) => clamp(Number((value + 0.08).toFixed(2)), 0.46, 1.18))}>
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
                }}
                onClick={() => setActiveIndex(index)}
              >
                {item.subtitle && <span>{item.subtitle}</span>}
                <strong>{item.title}</strong>
                {item.detail && <small>{item.detail}</small>}
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
      height: Math.max(270, Math.max(1, children.length) * 132 + 112),
    };
  });
  const laneGap = 96;
  const lanesHeight = lanes.reduce((sum, lane) => sum + lane.height, 0) + Math.max(0, lanes.length - 1) * laneGap;
  const worldHeight = Math.max(stage.baseHeight, lanesHeight + stage.topPadding + stage.bottomPadding);
  const root: MapItem = {
    id: "root",
    title: buildCoverTitle(spec),
    subtitle: compactMetricLine(spec),
    detail: buildCoverDetail(spec),
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
    mainItems.push({
      id: mainId,
      parentId: "root",
      title: compactNodeText(node.title, 28),
      subtitle: compactNodeText(node.subtitle, 18),
      detail: compactNodeText(node.insight, 56),
      depth: 1,
      x: stage.mainX,
      y: mainY,
    });
    links.push({ from: "root", to: mainId });

    const childGap = 132;
    const childStartY = mainY - ((children.length - 1) * childGap) / 2;
    children.forEach((child, childIndex) => {
      const childId = `${mainId}-child-${childIndex}`;
      childItems.push({
        id: childId,
        parentId: mainId,
        title: compactNodeText(child.title, 22),
        subtitle: compactNodeText(child.subtitle, 14),
        detail: compactNodeText(child.detail, 40),
        depth: 2,
        x: stage.childX + (childIndex % 2) * 110,
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
  if (item.depth === 0) return { width: 540, height: item.detail ? 176 : 142 };
  if (item.depth === 1) return { width: 380, height: item.detail ? 152 : 118 };
  return { width: 300, height: item.detail ? 104 : 78 };
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
