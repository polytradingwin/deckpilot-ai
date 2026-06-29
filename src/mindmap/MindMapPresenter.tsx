import { useMemo, useState } from "react";
import type { MindMapSpec } from "../shared/mindmap";

type MindMapPresenterProps = {
  spec: MindMapSpec;
};

export function MindMapPresenter({ spec }: MindMapPresenterProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const nodes = useMemo(() => spec.nodes, [spec.nodes]);
  const activeNode = nodes[activeIndex] || nodes[0];

  if (!activeNode) {
    return null;
  }

  const go = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + nodes.length) % nodes.length);
  };

  return (
    <div className="mindmap-presenter" aria-label="MindMap preview">
      <div className="mindmap-orbit" aria-hidden="true">
        {nodes.slice(0, 8).map((node, index) => (
          <button
            className={`orbit-node node-${index} ${index === activeIndex ? "active" : ""}`}
            key={`${node.title}-${index}`}
            type="button"
            onClick={() => setActiveIndex(index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{node.title}</strong>
          </button>
        ))}
        <div className="orbit-core">
          <span>Core</span>
          <strong>{spec.title}</strong>
        </div>
      </div>

      <div className="mindmap-focus">
        <div>
          <small>{String(activeIndex + 1).padStart(2, "0")} / {String(nodes.length).padStart(2, "0")}</small>
          <h3>{activeNode.title}</h3>
          {activeNode.subtitle && <p>{activeNode.subtitle}</p>}
        </div>
        {activeNode.insight && <blockquote>{activeNode.insight}</blockquote>}
        <div className="mindmap-child-grid">
          {activeNode.children.slice(0, 5).map((child) => (
            <article key={`${activeNode.title}-${child.title}`}>
              <strong>{child.title}</strong>
              {(child.subtitle || child.detail) && <span>{child.subtitle || child.detail}</span>}
            </article>
          ))}
        </div>
        <div className="mindmap-controls">
          <button type="button" onClick={() => go(-1)}>上一节点</button>
          <button type="button" onClick={() => go(1)}>下一节点</button>
        </div>
      </div>
    </div>
  );
}
