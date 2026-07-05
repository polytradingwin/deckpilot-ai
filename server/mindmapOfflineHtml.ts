import type { MindMapSpec } from "../src/shared/mindmap";

export function renderMindMapOfflineHtml(spec: MindMapSpec) {
  const payload = JSON.stringify(spec).replace(/</g, "\\u003c");
  const title = escapeHtml(spec.title || "DeckEvo MindMap");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} - DeckEvo 离线脑图</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f8f6ef;
      --ink: #0c1726;
      --muted: #61706c;
      --gold: #d9ad4d;
      --teal: #0f3d46;
      --line: rgba(91, 103, 99, 0.32);
      --shadow: 0 24px 70px rgba(40, 45, 42, 0.14);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      overflow: hidden;
      color: var(--ink);
      background:
        radial-gradient(circle at 16% 18%, rgba(78,139,132,0.34), transparent 26%),
        radial-gradient(circle at 80% 68%, rgba(231,169,63,0.32), transparent 32%),
        radial-gradient(circle at 48% 44%, rgba(255,255,255,0.92), transparent 43%),
        linear-gradient(135deg, #fbfaf5 0%, #ecebe0 48%, #f7efe1 100%);
      font-family: "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", "Segoe UI", Arial, sans-serif;
    }
    .topbar {
      position: fixed;
      top: 18px;
      left: 22px;
      right: 22px;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      pointer-events: none;
    }
    .brand, .hint {
      border: 1px solid rgba(255,255,255,0.72);
      border-radius: 18px;
      background: rgba(255,255,255,0.72);
      box-shadow: 0 16px 50px rgba(48, 54, 50, 0.10);
      backdrop-filter: blur(18px);
    }
    .brand {
      max-width: 38vw;
      padding: 14px 18px;
    }
    .brand small {
      display: block;
      margin-bottom: 6px;
      color: #6a7a73;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.02em;
    }
    .brand strong {
      display: block;
      color: var(--ink);
      font-size: clamp(24px, 2.2vw, 40px);
      line-height: 1.08;
      font-weight: 900;
    }
    .hint {
      padding: 12px 16px;
      color: #65736f;
      font-size: 14px;
      font-weight: 800;
      text-align: right;
    }
    .stage {
      position: fixed;
      inset: 0;
      overflow: hidden;
      cursor: grab;
      user-select: none;
    }
    .stage.panning { cursor: grabbing; }
    .world {
      position: absolute;
      left: 0;
      top: 0;
      transform-origin: 0 0;
      transition: transform 420ms cubic-bezier(.2,.8,.2,1);
    }
    .stage.panning .world { transition: none; }
    .links {
      position: absolute;
      inset: 0;
      overflow: visible;
      pointer-events: none;
    }
    .link {
      fill: none;
      stroke: rgba(63,78,76,0.32);
      stroke-width: 10;
      stroke-linecap: round;
      filter: drop-shadow(0 10px 18px rgba(58,71,68,0.12));
    }
    .link.active {
      stroke: rgba(219,164,61,0.94);
      stroke-width: 14;
      filter: drop-shadow(0 12px 22px rgba(219,164,61,0.28));
    }
    .node {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 22px;
      min-height: 150px;
      padding: 30px 38px;
      border: 1px solid rgba(255,255,255,0.72);
      border-radius: 26px;
      color: #102d35;
      background:
        radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--node-accent, #d9ad4d) 26%, transparent), transparent 34%),
        linear-gradient(145deg, rgba(255,255,255,0.98), rgba(255,250,239,0.82) 58%, var(--node-soft, rgba(217,173,77,0.14))),
        var(--node-surface, rgba(255,255,255,0.88));
      box-shadow:
        0 30px 80px rgba(38, 52, 51, 0.18),
        0 12px 26px color-mix(in srgb, var(--node-accent, #d9ad4d) 16%, transparent),
        inset 0 0 0 1px rgba(21, 45, 51, 0.06);
      transform: translate(-50%, -50%);
      transition: transform 260ms ease, box-shadow 260ms ease, border-color 260ms ease, background 260ms ease;
      cursor: pointer;
      user-select: text;
      overflow: hidden;
    }
    .node::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 8px;
      background: linear-gradient(180deg, var(--node-accent, #d9ad4d), rgba(255,255,255,0.42));
      opacity: 0.76;
    }
    .node.depth-0 {
      color: #f8faf7;
      border-color: rgba(236,196,109,0.95);
      background:
        radial-gradient(circle at 84% 10%, rgba(255,255,255,0.14), transparent 34%),
        linear-gradient(145deg, #113d45, #12333b 58%, #0b2930);
      box-shadow:
        0 32px 90px rgba(18, 43, 48, 0.30),
        0 0 0 10px rgba(217, 173, 77, 0.20),
        inset 0 0 0 1px rgba(255,255,255,0.14);
      transform: translate(-50%, -50%) scale(1.06);
      justify-content: center;
      padding: 38px 56px;
    }
    .node.depth-2 {
      padding: 22px 30px;
      background:
        radial-gradient(circle at 92% 12%, color-mix(in srgb, var(--node-accent, #d9ad4d) 22%, transparent), transparent 32%),
        linear-gradient(135deg, rgba(255,255,255,0.94), rgba(255,250,241,0.76)),
        var(--node-soft, rgba(217,173,77,0.14));
    }
    .badge {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 999px;
      color: #102d35;
      background:
        radial-gradient(circle at 28% 20%, #fff3b6, transparent 36%),
        linear-gradient(145deg, #f6cd68, var(--node-accent, #d9ad4d) 66%, #ad7026);
      box-shadow:
        0 16px 38px color-mix(in srgb, var(--node-accent, #d9ad4d) 30%, transparent),
        inset 0 0 0 1px rgba(255,255,255,0.42);
      font-size: 24px;
      font-weight: 950;
      line-height: 1;
      text-align: center;
    }
    .node.depth-2 .badge {
      width: 52px;
      height: 52px;
      font-size: 19px;
    }
    .node-copy {
      display: grid;
      gap: 10px;
      min-width: 0;
      position: relative;
      z-index: 1;
    }
    .node.depth-0 .node-copy {
      justify-items: center;
      text-align: center;
    }
    .subtitle {
      color: color-mix(in srgb, var(--node-accent, #d9ad4d) 74%, #22444b);
      font-size: 22px;
      line-height: 1.2;
      font-weight: 950;
      outline: none;
    }
    .title {
      color: #102734;
      font-size: 42px;
      line-height: 1.12;
      font-weight: 950;
      letter-spacing: 0;
      outline: none;
    }
    .node.depth-0 .title { color: #f9fbf6; font-size: 52px; line-height: 1.16; }
    .node.depth-2 .title { font-size: 34px; }
    .detail {
      color: #52606a;
      font-size: 22px;
      line-height: 1.35;
      font-weight: 700;
      outline: none;
    }
    .node.depth-0 .subtitle { color: #f1c964; }
    .node.depth-0 .detail,
    .node.active .subtitle,
    .node.active .detail {
      color: #d8e0d4;
    }
    .node.active {
      z-index: 3;
      color: #f8faf7;
      border-color: rgba(236,196,109,0.95);
      background:
        radial-gradient(circle at 84% 10%, color-mix(in srgb, var(--node-accent, #d9ad4d) 34%, transparent), transparent 34%),
        linear-gradient(145deg, #0a4a55, #113943 58%, #061f27);
      box-shadow:
        0 32px 90px rgba(18, 43, 48, 0.30),
        0 0 0 10px rgba(217, 173, 77, 0.20),
        inset 0 0 0 1px rgba(255,255,255,0.14);
      transform: translate(-50%, -50%) scale(1.06);
    }
    .node.active .badge {
      background:
        radial-gradient(circle at 28% 20%, #fff3b6, transparent 36%),
        linear-gradient(145deg, #f8d47c, var(--node-accent, #d9ad4d) 66%, #b87324);
    }
    .node.active .title {
      color: #fffaf0;
    }
    .node.active .subtitle,
    .node.active .detail {
      color: #f1c964;
    }
    [contenteditable="true"]:focus {
      border-radius: 10px;
      box-shadow: 0 0 0 3px rgba(217,173,77,0.36);
      background: rgba(217,173,77,0.08);
    }
    .toolbar {
      position: fixed;
      left: 50%;
      bottom: 22px;
      z-index: 22;
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: min(840px, calc(100vw - 44px));
      padding: 14px 16px;
      border: 1px solid rgba(255,255,255,0.7);
      border-radius: 20px;
      background: rgba(18, 20, 20, 0.82);
      box-shadow: 0 18px 60px rgba(0,0,0,0.20);
      transform: translateX(-50%);
      backdrop-filter: blur(20px);
    }
    button {
      border: 1px solid rgba(217,173,77,0.55);
      border-radius: 14px;
      padding: 12px 18px;
      color: #f3d08a;
      background: rgba(255,255,255,0.05);
      font: inherit;
      font-size: 18px;
      font-weight: 900;
      cursor: pointer;
    }
    button:hover { background: rgba(217,173,77,0.14); }
    .range {
      flex: 1;
      accent-color: var(--gold);
    }
    .counter {
      min-width: 74px;
      color: rgba(255,255,255,0.78);
      font-weight: 900;
      text-align: right;
    }
    .zoom {
      position: fixed;
      right: 22px;
      top: 96px;
      z-index: 22;
      display: grid;
      gap: 12px;
    }
    .zoom button {
      width: 54px;
      height: 54px;
      padding: 0;
      border-radius: 50%;
      color: var(--ink);
      background: rgba(255,255,255,0.82);
      box-shadow: 0 16px 50px rgba(48,54,50,0.12);
    }
    .empty {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      color: #66736f;
      font-weight: 900;
    }
    @media (max-width: 900px) {
      .brand { max-width: 64vw; }
      .hint { display: none; }
      .toolbar { min-width: calc(100vw - 24px); gap: 8px; }
      button { padding: 10px 12px; font-size: 15px; }
    }
  </style>
</head>
<body>
  <script id="mindmap-data" type="application/json">${payload}</script>
  <div class="topbar">
    <div class="brand">
      <small>DeckEvo 离线脑图演示</small>
      <strong id="deck-title"></strong>
    </div>
    <div class="hint">滚轮翻页 · 拖拽移动 · 双击文字可编辑 · Backspace 删除节点</div>
  </div>
  <div class="zoom">
    <button type="button" id="zoom-out">-</button>
    <button type="button" id="zoom-in">+</button>
  </div>
  <main class="stage" id="stage" aria-label="DeckEvo offline mindmap presentation">
    <div class="world" id="world">
      <svg class="links" id="links"></svg>
      <div id="nodes"></div>
    </div>
  </main>
  <nav class="toolbar">
    <button type="button" id="prev">上一页</button>
    <input class="range" id="range" type="range" min="1" value="1" />
    <button type="button" id="next">下一页</button>
    <button type="button" id="fullscreen">全屏</button>
    <span class="counter" id="counter">01 / 01</span>
  </nav>
  <script>
    (function () {
      var spec = JSON.parse(document.getElementById("mindmap-data").textContent || "{}");
      var stageEl = document.getElementById("stage");
      var worldEl = document.getElementById("world");
      var linksEl = document.getElementById("links");
      var nodesEl = document.getElementById("nodes");
      var rangeEl = document.getElementById("range");
      var counterEl = document.getElementById("counter");
      var titleEl = document.getElementById("deck-title");
      var stage = { width: 4200, baseHeight: 1500, rootX: 560, mainX: 1580, childX: 2820, topPadding: 360, bottomPadding: 420 };
      var rootTone = { accent: "#f0bd53", surface: "#0b3f49", soft: "rgba(240, 189, 83, 0.20)" };
      var tones = [
        { accent: "#e7a93f", surface: "#fff4d6", soft: "rgba(231, 169, 63, 0.24)" },
        { accent: "#2f9c8f", surface: "#e9f8f2", soft: "rgba(47, 156, 143, 0.22)" },
        { accent: "#d2785d", surface: "#fff0e8", soft: "rgba(210, 120, 93, 0.22)" },
        { accent: "#507daa", surface: "#edf4ff", soft: "rgba(80, 125, 170, 0.22)" },
        { accent: "#9f7ad8", surface: "#f4efff", soft: "rgba(159, 122, 216, 0.20)" },
        { accent: "#809746", surface: "#f1f6df", soft: "rgba(128, 151, 70, 0.22)" }
      ];
      var model = buildModel(spec);
      var activeIndex = 0;
      var zoom = 0.82;
      var pan = { x: 0, y: 0 };
      var deleted = {};
      var edits = {};
      var dragging = null;
      var wheelBuffer = 0;
      var wheelLock = 0;
      var wheelTimer = 0;

      titleEl.textContent = buildCoverTitle(spec);
      rangeEl.max = String(model.items.length);
      worldEl.style.width = stage.width + "px";
      worldEl.style.height = model.height + "px";
      linksEl.setAttribute("viewBox", "0 0 " + stage.width + " " + model.height);

      function buildModel(input) {
        var items = [];
        var links = [];
        var root = {
          id: "root",
          title: buildCoverTitle(input),
          subtitle: input.subtitle || "",
          detail: buildCoverDetail(input),
          accent: rootTone.accent,
          surface: rootTone.surface,
          soft: rootTone.soft,
          depth: 0,
          x: stage.rootX,
          y: stage.topPadding + 220
        };
        items.push(root);
        var y = stage.topPadding;
        var nodes = Array.isArray(input.nodes) ? input.nodes : [];
        nodes.forEach(function (node, index) {
          var tone = tones[index % tones.length];
          var mainId = "node-" + index;
          var children = Array.isArray(node.children) ? node.children.slice(0, 5) : [];
          var clusterHeight = Math.max(500, children.length * 330);
          var mainY = y + clusterHeight / 2;
          items.push({
            id: mainId,
            parentId: "root",
            badge: "0" + (index + 1),
            title: clean(node.title),
            subtitle: clean(node.subtitle || node.insight || ""),
            detail: compactMetricLine(node),
            accent: tone.accent,
            surface: tone.surface,
            soft: tone.soft,
            depth: 1,
            x: stage.mainX,
            y: mainY
          });
          links.push({ from: "root", to: mainId });
          var childStart = y + (clusterHeight - Math.max(1, children.length) * 300) / 2 + 150;
          children.forEach(function (child, childIndex) {
            var childId = mainId + "-child-" + childIndex;
            items.push({
              id: childId,
              parentId: mainId,
              badge: String.fromCharCode(65 + childIndex),
              title: compactNodeText(child.title),
              subtitle: compactNodeText(child.subtitle || ""),
              detail: compactNodeText(child.detail || ""),
              accent: tone.accent,
              surface: "#ffffff",
              soft: tone.soft,
              depth: 2,
              x: stage.childX,
              y: childStart + childIndex * 330
            });
            links.push({ from: mainId, to: childId });
          });
          y += clusterHeight + 220;
        });
        if (!nodes.length) {
          items.push({
            id: "empty",
            parentId: "root",
            badge: "01",
            title: input.summary && input.summary.headline ? input.summary.headline : input.title || "MindMap",
            subtitle: input.summary && input.summary.conclusion ? input.summary.conclusion : "",
            detail: "",
            accent: tones[0].accent,
            surface: tones[0].surface,
            soft: tones[0].soft,
            depth: 1,
            x: stage.mainX,
            y: stage.topPadding + 220
          });
          links.push({ from: "root", to: "empty" });
          y += 580;
        }
        var byId = {};
        items.forEach(function (item) { byId[item.id] = item; });
        return { items: items, links: links, byId: byId, height: Math.max(stage.baseHeight, y + stage.bottomPadding) };
      }

      function render() {
        var all = model.items.filter(function (item) { return !deleted[item.id]; });
        if (!all.length) {
          nodesEl.innerHTML = '<div class="empty">节点已全部删除</div>';
          return;
        }
        activeIndex = clamp(activeIndex, 0, all.length - 1);
        var shown = all.slice(0, activeIndex + 1);
        var shownIds = {};
        shown.forEach(function (item) { shownIds[item.id] = true; });
        var active = applyEdits(shown[shown.length - 1]);

        linksEl.innerHTML = "";
        model.links.forEach(function (link) {
          if (!shownIds[link.from] || !shownIds[link.to]) return;
          var from = model.byId[link.from];
          var to = model.byId[link.to];
          if (!from || !to) return;
          var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("class", "link" + (link.from === active.id || link.to === active.id ? " active" : ""));
          path.setAttribute("d", linkPath(from, to));
          linksEl.appendChild(path);
        });

        nodesEl.innerHTML = "";
        shown.forEach(function (raw, index) {
          var item = applyEdits(raw);
          var size = nodeSize(item);
          var el = document.createElement("article");
          el.className = "node depth-" + item.depth + " " + (item.id === active.id ? "active" : "");
          el.style.left = item.x + "px";
          el.style.top = item.y + "px";
          el.style.width = size.width + "px";
          el.style.minHeight = size.height + "px";
          el.style.setProperty("--node-accent", item.accent);
          el.style.setProperty("--node-surface", item.surface);
          el.style.setProperty("--node-soft", item.soft);
          el.dataset.id = item.id;
          el.innerHTML =
            (item.badge ? '<span class="badge" contenteditable="true" data-field="badge">' + esc(item.badge) + '</span>' : "") +
            '<span class="node-copy">' +
            (item.subtitle ? '<span class="subtitle" contenteditable="true" data-field="subtitle">' + esc(item.subtitle) + '</span>' : "") +
            '<strong class="title" contenteditable="true" data-field="title">' + esc(item.title) + '</strong>' +
            (item.detail ? '<span class="detail" contenteditable="true" data-field="detail">' + esc(item.detail) + '</span>' : "") +
            '</span>';
          el.addEventListener("click", function (event) {
            if (event.target && event.target.closest && event.target.closest("[contenteditable=true]")) return;
            activeIndex = index;
            render();
          });
          el.querySelectorAll("[contenteditable=true]").forEach(function (field) {
            field.addEventListener("blur", function () {
              var id = el.dataset.id;
              var name = field.dataset.field;
              edits[id] = edits[id] || {};
              edits[id][name] = field.textContent.trim();
            });
          });
          nodesEl.appendChild(el);
        });

        rangeEl.max = String(all.length);
        rangeEl.value = String(activeIndex + 1);
        counterEl.textContent = pad(activeIndex + 1) + " / " + pad(all.length);
        updateTransform(active);
      }

      function updateTransform(active) {
        var viewportWidth = stageEl.clientWidth;
        var viewportHeight = stageEl.clientHeight;
        var tx = viewportWidth / 2 - active.x * zoom + pan.x;
        var ty = viewportHeight / 2 - active.y * zoom + pan.y;
        worldEl.style.transform = "translate3d(" + tx + "px," + ty + "px,0) scale(" + zoom + ")";
      }

      function go(direction) {
        var all = model.items.filter(function (item) { return !deleted[item.id]; });
        activeIndex = clamp(activeIndex + direction, 0, Math.max(0, all.length - 1));
        pan = { x: 0, y: 0 };
        render();
      }

      function deleteActive() {
        var all = model.items.filter(function (item) { return !deleted[item.id]; });
        var target = all[activeIndex];
        if (!target || target.depth === 0) return;
        deleted[target.id] = true;
        model.items.forEach(function (item) {
          var parentId = item.parentId;
          while (parentId) {
            if (parentId === target.id) {
              deleted[item.id] = true;
              break;
            }
            parentId = model.byId[parentId] && model.byId[parentId].parentId;
          }
        });
        activeIndex = Math.max(0, activeIndex - 1);
        render();
      }

      function nodeSize(item) {
        if (item.depth === 0) return { width: 960, height: 320 };
        if (item.depth === 1) return { width: 760, height: item.detail ? 290 : 235 };
        return { width: 560, height: item.detail ? 230 : 180 };
      }

      function linkPath(from, to) {
        var a = nodeSize(from);
        var b = nodeSize(to);
        var x1 = from.x + a.width / 2;
        var y1 = from.y;
        var x2 = to.x - b.width / 2;
        var y2 = to.y;
        var c1 = x1 + Math.max(180, (x2 - x1) * 0.42);
        var c2 = x2 - Math.max(180, (x2 - x1) * 0.42);
        return "M " + x1 + " " + y1 + " C " + c1 + " " + y1 + ", " + c2 + " " + y2 + ", " + x2 + " " + y2;
      }

      function applyEdits(item) {
        var patch = edits[item.id] || {};
        return Object.assign({}, item, patch);
      }

      function buildCoverTitle(input) {
        return compactNodeText(input.summary && input.summary.headline ? input.summary.headline : input.title || "动态脑图汇报", 18);
      }

      function buildCoverDetail(input) {
        var metrics = input.summary && Array.isArray(input.summary.keyMetrics) ? input.summary.keyMetrics : [];
        var metricLine = metrics.slice(0, 3).map(function (item) { return item.label + " " + item.value; }).join(" | ");
        var conclusion = input.summary && input.summary.conclusion ? input.summary.conclusion : "";
        return compactNodeText(metricLine || conclusion, 32);
      }

      function compactMetricLine(node) {
        var visual = node && node.visual && Array.isArray(node.visual.data) ? node.visual.data : [];
        if (!visual.length) return "";
        return compactNodeText(visual.slice(0, 3).map(function (item) { return item.label + " " + item.value; }).join(" | "), 52);
      }

      function clean(value) {
        return String(value || "").replace(/\\*\\*/g, "").replace(/^#+\\s*/g, "").replace(/[.…]+/g, "").trim();
      }

      function compactNodeText(value, limit) {
        var text = stripTrailingPunctuation(clean(value).replace(/\\s+/g, " "));
        var max = limit || 34;
        return text.length > max ? stripTrailingPunctuation(text.slice(0, max).trim()) : text;
      }

      function stripTrailingPunctuation(value) {
        return String(value || "").replace(/[，,。；;、:：|｜\\s]+$/g, "");
      }

      function esc(value) {
        return String(value || "").replace(/[&<>"']/g, function (char) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
        });
      }

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function pad(value) {
        return String(value).padStart(2, "0");
      }

      document.getElementById("prev").addEventListener("click", function () { go(-1); });
      document.getElementById("next").addEventListener("click", function () { go(1); });
      document.getElementById("zoom-out").addEventListener("click", function () { zoom = clamp(Number((zoom - 0.08).toFixed(2)), 0.34, 1.6); render(); });
      document.getElementById("zoom-in").addEventListener("click", function () { zoom = clamp(Number((zoom + 0.08).toFixed(2)), 0.34, 1.6); render(); });
      document.getElementById("fullscreen").addEventListener("click", function () { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); });
      rangeEl.addEventListener("input", function () { activeIndex = Number(rangeEl.value) - 1; pan = { x: 0, y: 0 }; render(); });
      stageEl.addEventListener("wheel", function (event) {
        if (Math.abs(event.deltaY) < 2) return;
        event.preventDefault();
        var now = performance.now();
        if (now < wheelLock) return;
        wheelBuffer += event.deltaY;
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(function () { wheelBuffer = 0; }, 180);
        if (Math.abs(wheelBuffer) < 70) return;
        go(wheelBuffer > 0 ? 1 : -1);
        wheelBuffer = 0;
        wheelLock = now + 260;
      }, { passive: false });
      stageEl.addEventListener("pointerdown", function (event) {
        if (event.button !== 0 || event.target.closest("button,input,[contenteditable=true]")) return;
        stageEl.setPointerCapture(event.pointerId);
        dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, baseX: pan.x, baseY: pan.y };
        stageEl.classList.add("panning");
      });
      stageEl.addEventListener("pointermove", function (event) {
        if (!dragging || dragging.id !== event.pointerId) return;
        pan = { x: dragging.baseX + event.clientX - dragging.x, y: dragging.baseY + event.clientY - dragging.y };
        var all = model.items.filter(function (item) { return !deleted[item.id]; });
        updateTransform(all[activeIndex] || model.items[0]);
      });
      stageEl.addEventListener("pointerup", stopDrag);
      stageEl.addEventListener("pointercancel", stopDrag);
      function stopDrag() {
        dragging = null;
        stageEl.classList.remove("panning");
      }
      window.addEventListener("keydown", function (event) {
        if (event.target && event.target.closest && event.target.closest("input,textarea,[contenteditable=true]")) return;
        if (event.key === "Backspace") {
          event.preventDefault();
          deleteActive();
        } else if (["ArrowDown", "ArrowRight", "PageDown", " "].indexOf(event.key) >= 0) {
          event.preventDefault();
          go(1);
        } else if (["ArrowUp", "ArrowLeft", "PageUp"].indexOf(event.key) >= 0) {
          event.preventDefault();
          go(-1);
        }
      });
      window.addEventListener("resize", render);
      render();
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
