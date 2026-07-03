/* Lightweight vanilla-JS/SVG chart library — no external dependencies.
   Dark-surface, single-accent (Spotify green) palette matching the site.
   Every chart redraws on container resize so text stays legible at any width. */

(function () {
  const NS = "http://www.w3.org/2000/svg";
  const COLOR = {
    green: "#1DB954",
    greenBright: "#1ed760",
    grey: "#8a8f98",
    neutral: "#e9e9e9",
    axis: "#5a5a5a",
    grid: "#242424",
    text: "#b3b3b3",
  };

  const _measureCanvas = document.createElement("canvas");
  const _measureCtx = _measureCanvas.getContext("2d");
  function textWidth(str, font) {
    _measureCtx.font = font;
    return _measureCtx.measureText(str).width;
  }
  function wrapWords(text, maxWidth, font, maxLines) {
    const words = text.split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (textWidth(test, font) > maxWidth && cur) {
        lines.push(cur);
        cur = w;
        if (maxLines && lines.length === maxLines - 1) {
          cur = words.slice(words.indexOf(w)).join(" ");
          break;
        }
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function multilineText(x, y, lines, lineHeight, attrs) {
    const t = svgEl("text", Object.assign({ x, y }, attrs));
    lines.forEach((line, i) => {
      const tspan = svgEl("tspan", { x, dy: i === 0 ? 0 : lineHeight });
      tspan.textContent = line;
      t.appendChild(tspan);
    });
    return t;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  /* ---------- shared tooltip ---------- */
  const tip = document.createElement("div");
  tip.className = "chart-tooltip";
  document.body.appendChild(tip);

  function showTip(html, evt) {
    tip.innerHTML = html;
    tip.style.opacity = "1";
    moveTip(evt);
  }
  function moveTip(evt) {
    const pad = 14;
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    const rect = tip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = evt.clientY - rect.height - pad;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideTip() {
    tip.style.opacity = "0";
  }

  function scaleLinear(domain, range) {
    const [d0, d1] = domain, [r0, r1] = range;
    const m = (r1 - r0) / (d1 - d0 || 1);
    const f = (v) => r0 + (v - d0) * m;
    f.invert = (v) => d0 + (v - r0) / m;
    return f;
  }

  function niceStep(span, targetTicks) {
    const raw = span / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    return step * mag;
  }

  function ticksFor(min, max, target) {
    const step = niceStep(max - min, target);
    const start = Math.ceil(min / step) * step;
    const out = [];
    for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
    return out;
  }

  /* axis with hover explanation on the title label */
  function axisBottom(svg, x, y0, ticks, opts) {
    const g = svgEl("g", { class: "axis" });
    svg.appendChild(g);
    if (ticks.length) {
      g.appendChild(svgEl("line", { x1: x(ticks[0]), y1: y0, x2: x(ticks[ticks.length - 1]), y2: y0, stroke: COLOR.axis }));
    }
    ticks.forEach((t) => {
      const px = x(t);
      g.appendChild(svgEl("line", { x1: px, y1: y0, x2: px, y2: y0 + 5, stroke: COLOR.axis }));
      const label = svgEl("text", { x: px, y: y0 + 18, "text-anchor": "middle", class: "chart-tick" });
      label.textContent = opts && opts.fmt ? opts.fmt(t) : t;
      g.appendChild(label);
    });
    if (opts && opts.title) {
      const title = svgEl("text", {
        x: (x.rangeMid !== undefined ? x.rangeMid : 0), y: y0 + 40, "text-anchor": "middle", class: "chart-axis-title",
      });
      title.textContent = opts.title + "  ⓘ";
      title.addEventListener("mouseenter", (e) => showTip(opts.explain || opts.title, e));
      title.addEventListener("mousemove", moveTip);
      title.addEventListener("mouseleave", hideTip);
      g.appendChild(title);
    }
    return g;
  }

  function axisLeft(svg, x0, y, ticks, opts) {
    const g = svgEl("g", { class: "axis" });
    svg.appendChild(g);
    ticks.forEach((t) => {
      const py = y(t);
      g.appendChild(svgEl("line", { x1: x0 - 5, y1: py, x2: x0, y2: py, stroke: COLOR.axis }));
      g.appendChild(svgEl("line", { x1: x0, y1: py, x2: opts && opts.gridTo !== undefined ? opts.gridTo : x0, y2: py, stroke: COLOR.grid }));
      const label = svgEl("text", { x: x0 - 10, y: py + 4, "text-anchor": "end", class: "chart-tick" });
      label.textContent = opts && opts.fmt ? opts.fmt(t) : t;
      g.appendChild(label);
    });
    if (opts && opts.title) {
      const title = svgEl("text", {
        x: x0, y: (opts.titleY !== undefined ? opts.titleY : 14), "text-anchor": "start", class: "chart-axis-title",
      });
      title.textContent = opts.title + "  ⓘ";
      title.addEventListener("mouseenter", (e) => showTip(opts.explain || opts.title, e));
      title.addEventListener("mousemove", moveTip);
      title.addEventListener("mouseleave", hideTip);
      g.appendChild(title);
    }
    return g;
  }

  function panelBg(svg, x, y, w, h) {
    svg.appendChild(svgEl("rect", { x, y, width: w, height: h, fill: "none" }));
  }

  function chartTitle(svg, cx, y, text) {
    const t = svgEl("text", { x: cx, y, "text-anchor": "middle", class: "chart-title" });
    t.textContent = text;
    svg.appendChild(t);
  }

  /* ---------- histogram bar group (used by fig1 & fig2) ---------- */
  function histBars(svg, edges, counts, xScale, yScale, y0, color, opts) {
    const g = svgEl("g");
    svg.appendChild(g);
    for (let i = 0; i < counts.length; i++) {
      const x1 = xScale(edges[i]), x2 = xScale(edges[i + 1]);
      const yTop = yScale(counts[i]);
      const rect = svgEl("rect", {
        x: Math.min(x1, x2), y: yTop, width: Math.max(1, Math.abs(x2 - x1) - (opts && opts.gap ? 1 : 0)),
        height: Math.max(0, y0 - yTop), fill: color, opacity: opts && opts.opacity ? opts.opacity : 1,
      });
      const binLabel = (opts && opts.binFmt) ? opts.binFmt(edges[i], edges[i + 1]) : `${edges[i]}–${edges[i + 1]}`;
      const valLabel = (opts && opts.valFmt) ? opts.valFmt(counts[i]) : counts[i];
      rect.addEventListener("mouseenter", (e) => {
        rect.setAttribute("opacity", 1);
        showTip(`<b>${binLabel}</b><br>${opts && opts.valName ? opts.valName : "count"}: ${valLabel}`, e);
      });
      rect.addEventListener("mousemove", moveTip);
      rect.addEventListener("mouseleave", (e) => { rect.setAttribute("opacity", opts && opts.opacity ? opts.opacity : 1); hideTip(); });
      g.appendChild(rect);
    }
    return g;
  }

  /* ================= FIG 1 — EDA distributions ================= */
  function renderFig1(container) {
    const W = container.clientWidth;
    const cellW = W / 2, cellH = Math.max(220, cellW * 0.62);
    const H = cellH * 2;
    container.innerHTML = "";
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg" });
    container.appendChild(svg);

    const specs = [
      { key: "popularity", title: "Popularity (0–100)", color: COLOR.green, xTitle: "popularity", xExplain: "Spotify's popularity score: 0–100, weighted toward recent plays.", xFmt: (v) => v, domain: [0, 100] },
      { key: "duration", title: "Duration (sec, clipped at 600)", color: COLOR.neutral, xTitle: "seconds", xExplain: "Track length in seconds. Clipped at 600s (10 min) for display only.", xFmt: (v) => v, domain: [0, 600] },
      { key: "energy", title: "Energy", color: COLOR.green, xTitle: "energy (0–1)", xExplain: "Spotify audio feature, 0–1: perceptual intensity and activity (loud, fast, noisy scores high).", xFmt: (v) => v.toFixed(1), domain: [0, 1] },
      { key: "danceability", title: "Danceability", color: COLOR.neutral, xTitle: "danceability (0–1)", xExplain: "Spotify audio feature, 0–1: how suitable a track is for dancing, from tempo, rhythm stability, and beat strength.", xFmt: (v) => v.toFixed(1), domain: [0, 1] },
    ];

    const pad = { l: 56, r: 18, t: 34, b: 54 };
    specs.forEach((spec, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const ox = col * cellW, oy = row * cellH;
      const data = CHART_DATA.fig1[spec.key];
      const plotW = cellW - pad.l - pad.r, plotH = cellH - pad.t - pad.b;
      const x = scaleLinear(spec.domain, [ox + pad.l, ox + pad.l + plotW]);
      x.rangeMid = ox + pad.l + plotW / 2;
      const maxCount = Math.max(...data.counts);
      const y = scaleLinear([0, maxCount * 1.12], [oy + pad.t + plotH, oy + pad.t]);

      chartTitle(svg, ox + cellW / 2, oy + 18, spec.title);
      const xt = ticksFor(spec.domain[0], spec.domain[1], 5);
      const yt = ticksFor(0, maxCount, 4);
      axisBottom(svg, x, oy + pad.t + plotH, xt, { title: spec.xTitle, explain: spec.xExplain, fmt: spec.xFmt });
      axisLeft(svg, ox + pad.l, y, yt, { gridTo: ox + pad.l + plotW, fmt: (v) => v >= 1000 ? (v / 1000) + "k" : v });

      histBars(svg, data.edges, data.counts, x, y, oy + pad.t + plotH, spec.color, {
        opacity: 0.92, valName: "tracks", binFmt: (a, b) => `${spec.xFmt(a)}–${spec.xFmt(b)}`,
      });

      if (spec.key === "popularity") {
        const zx = x(2), zy = y(data.counts[0]);
        const note = svgEl("text", { x: zx + 14, y: zy - 6, class: "chart-annot" });
        note.textContent = `${CHART_DATA.fig1.n_zero_popularity.toLocaleString()} tracks at exactly 0`;
        svg.appendChild(note);
      }
    });
  }

  /* ================= FIG 2 — group comparison ================= */
  function renderFig2(container) {
    const W = container.clientWidth;
    const stacked = W < 640;
    const panelW = stacked ? W : W / 2;
    const panelH = stacked ? Math.max(300, W * 0.72) : Math.max(320, W * 0.36);
    const H = stacked ? panelH * 2 + 20 : panelH;
    container.innerHTML = "";
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg" });
    container.appendChild(svg);

    const pad = { l: 58, r: 24, t: 40, b: 56 };

    /* panel A: overlaid density histograms */
    (function () {
      const ox = 0, oy = 0;
      const plotW = panelW - pad.l - pad.r, plotH = panelH - pad.t - pad.b;
      const x = scaleLinear([0, 100], [ox + pad.l, ox + pad.l + plotW]);
      x.rangeMid = ox + pad.l + plotW / 2;
      const solo = CHART_DATA.fig2.solo_density, feat = CHART_DATA.fig2.featured_density;
      const maxD = Math.max(...solo.counts, ...feat.counts) * 1.1;
      const y = scaleLinear([0, maxD], [oy + pad.t + plotH, oy + pad.t]);

      chartTitle(svg, ox + pad.l + plotW / 2, oy + 20, "Popularity distribution by group");
      axisBottom(svg, x, oy + pad.t + plotH, ticksFor(0, 100, 5), { title: "popularity", explain: "Spotify's popularity score: 0–100, weighted toward recent plays." });
      axisLeft(svg, ox + pad.l, y, ticksFor(0, maxD, 4), { gridTo: ox + pad.l + plotW, fmt: (v) => v.toFixed(2), title: "density", titleY: oy + pad.t - 12, explain: "Probability density, not raw counts — the area under each curve sums to 1, so groups of different sizes (66,682 solo vs. 23,058 featured) can be compared on the same shape." });

      histBars(svg, solo.edges, solo.counts, x, y, oy + pad.t + plotH, COLOR.grey, { opacity: 0.55, valName: "density", valFmt: (v) => v.toFixed(4) });
      histBars(svg, feat.edges, feat.counts, x, y, oy + pad.t + plotH, COLOR.green, { opacity: 0.6, valName: "density", valFmt: (v) => v.toFixed(4) });

      const lg = svgEl("g", { transform: `translate(${ox + pad.l + plotW - 140}, ${oy + pad.t + 6})` });
      [["Solo (n=66,682)", COLOR.grey], ["Featured (n=23,058)", COLOR.green]].forEach(([label, col], i) => {
        lg.appendChild(svgEl("rect", { x: 0, y: i * 18, width: 12, height: 12, fill: col, opacity: 0.8 }));
        const t = svgEl("text", { x: 18, y: i * 18 + 10, class: "chart-legend" });
        t.textContent = label;
        lg.appendChild(t);
      });
      svg.appendChild(lg);
    })();

    /* panel B: boxplot */
    (function () {
      const ox = stacked ? 0 : panelW, oy = stacked ? panelH + 20 : 0;
      const plotW = panelW - pad.l - pad.r, plotH = panelH - pad.t - pad.b;
      const y = scaleLinear([0, 100], [oy + pad.t + plotH, oy + pad.t]);
      const catX = scaleLinear([0, 1], [ox + pad.l + plotW * 0.22, ox + pad.l + plotW * 0.78]);

      chartTitle(svg, ox + pad.l + plotW / 2, oy + 20, "Featured tracks sit slightly higher");
      axisLeft(svg, ox + pad.l, y, ticksFor(0, 100, 5), { gridTo: ox + pad.l + plotW, title: "popularity", titleY: oy + pad.t - 12, explain: "Spotify's popularity score: 0–100, weighted toward recent plays." });

      [["Solo", CHART_DATA.fig2.solo_box, 0, COLOR.grey], ["Featured", CHART_DATA.fig2.featured_box, 1, COLOR.green]].forEach(([label, s, pos, color]) => {
        const cx = catX(pos);
        const boxW = plotW * 0.22;
        svg.appendChild(svgEl("line", { x1: cx, y1: y(s.min), x2: cx, y2: y(s.q1), stroke: COLOR.axis }));
        svg.appendChild(svgEl("line", { x1: cx, y1: y(s.q3), x2: cx, y2: y(s.max), stroke: COLOR.axis }));
        const box = svgEl("rect", { x: cx - boxW / 2, y: y(s.q3), width: boxW, height: Math.max(1, y(s.q1) - y(s.q3)), fill: color, opacity: 0.75, stroke: color });
        box.addEventListener("mouseenter", (e) => showTip(`<b>${label}</b><br>max: ${s.max.toFixed(0)}<br>q3: ${s.q3.toFixed(0)}<br>median: ${s.median.toFixed(0)}<br>q1: ${s.q1.toFixed(0)}<br>min: ${s.min.toFixed(0)}<br>n = ${s.n.toLocaleString()}`, e));
        box.addEventListener("mousemove", moveTip);
        box.addEventListener("mouseleave", hideTip);
        svg.appendChild(box);
        svg.appendChild(svgEl("line", { x1: cx - boxW / 2, y1: y(s.median), x2: cx + boxW / 2, y2: y(s.median), stroke: "#e07b28", "stroke-width": 2 }));
        const lbl = svgEl("text", { x: cx, y: oy + pad.t + plotH + 22, "text-anchor": "middle", class: "chart-tick" });
        lbl.textContent = label;
        svg.appendChild(lbl);
        const med = svgEl("text", { x: cx + boxW / 2 + 8, y: y(s.median) + 4, class: "chart-annot" });
        med.textContent = `median ${s.median.toFixed(0)}`;
        svg.appendChild(med);
      });
    })();
  }

  /* ================= FIG 3 — genre decomposition ================= */
  function renderFig3(container) {
    const W = container.clientWidth;
    const stacked = W < 640;
    const leftW = stacked ? W : W * 0.36;
    const rightW = stacked ? W : W - leftW;
    const leftH = stacked ? Math.max(280, W * 0.66) : Math.max(360, W * 0.42);
    const rightH = stacked ? Math.max(320, W * 0.85) : leftH;
    const H = stacked ? leftH + rightH + 20 : leftH;
    container.innerHTML = "";
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg" });
    container.appendChild(svg);

    const pad = { l: 56, r: 20, t: 40, b: 60 };

    /* panel A: 3-bar decomposition */
    (function () {
      const plotW = leftW - pad.l - pad.r, plotH = leftH - pad.t - pad.b;
      const bars = CHART_DATA.fig3.bars;
      const items = [["Raw gap\n(featured − solo)", bars.raw, COLOR.neutral], ["Genre\ncomposition", bars.composition, COLOR.green], ["Within-genre\ngap", bars.within, COLOR.grey]];
      const maxV = bars.raw * 1.18;
      const y = scaleLinear([0, maxV], [pad.t + plotH, pad.t]);
      const bw = plotW / 3 * 0.55;

      chartTitle(svg, pad.l + plotW / 2, 18, stacked ? "Raw gap ≈ genre composition" : "Raw gap ≈ genre composition");
      axisLeft(svg, pad.l, y, ticksFor(0, maxV, 5), { gridTo: pad.l + plotW, fmt: (v) => v.toFixed(1), title: "points", titleY: pad.t - 12, explain: "Popularity points on Spotify's 0–100 scale." });

      items.forEach(([label, val, color], i) => {
        const cx = pad.l + plotW * ((i + 0.5) / 3);
        const rect = svgEl("rect", { x: cx - bw / 2, y: y(val), width: bw, height: pad.t + plotH - y(val), fill: color, opacity: 0.9 });
        rect.addEventListener("mouseenter", (e) => { rect.setAttribute("opacity", 1); showTip(`<b>${label.replace("\n", " ")}</b><br>${val >= 0 ? "+" : ""}${val.toFixed(2)} points`, e); });
        rect.addEventListener("mousemove", moveTip);
        rect.addEventListener("mouseleave", (e) => { rect.setAttribute("opacity", 0.9); hideTip(); });
        svg.appendChild(rect);
        const vt = svgEl("text", { x: cx, y: y(val) - 8, "text-anchor": "middle", class: "chart-annot-strong" });
        vt.textContent = (val >= 0 ? "+" : "") + val.toFixed(2);
        svg.appendChild(vt);
        label.split("\n").forEach((line, li) => {
          const lt = svgEl("text", { x: cx, y: pad.t + plotH + 20 + li * 13, "text-anchor": "middle", class: "chart-tick" });
          lt.textContent = line;
          svg.appendChild(lt);
        });
      });
    })();

    /* panel B: genre scatter */
    (function () {
      const ox = stacked ? 0 : leftW, oy = stacked ? leftH + 20 : 0;
      const plotW = rightW - pad.l - pad.r, plotH = rightH - pad.t - pad.b;
      const genres = CHART_DATA.fig3.genres;
      const x = scaleLinear([0, Math.max(...genres.map((g) => g.feat_share)) * 1.05], [ox + pad.l, ox + pad.l + plotW]);
      x.rangeMid = ox + pad.l + plotW / 2;
      const y = scaleLinear([0, Math.max(...genres.map((g) => g.mean_pop)) * 1.08], [oy + pad.t + plotH, oy + pad.t]);
      const rScale = scaleLinear([0, Math.sqrt(Math.max(...genres.map((g) => g.n)))], [2.5, 15]);

      chartTitle(svg, ox + pad.l + plotW / 2, oy + 18, "Genre landscape (bubble size = tracks)");
      axisBottom(svg, x, oy + pad.t + plotH, ticksFor(0, x.invert(ox + pad.l + plotW), 5), { title: "featured-artist share (%)", explain: "Share of tracks in this genre that credit a featured artist." });
      axisLeft(svg, ox + pad.l, y, ticksFor(0, y.invert(oy + pad.t), 5), { gridTo: ox + pad.l + plotW, title: "mean popularity", titleY: oy + pad.t - 12, explain: "Average Spotify popularity score of tracks in this genre." });

      genres.forEach((g) => {
        const c = svgEl("circle", { cx: x(g.feat_share), cy: y(g.mean_pop), r: rScale(Math.sqrt(g.n)), fill: COLOR.green, opacity: 0.5, stroke: "#0a0a0a", "stroke-width": 0.6 });
        c.addEventListener("mouseenter", (e) => { c.setAttribute("opacity", 0.9); showTip(`<b>${g.genre}</b><br>featured share: ${g.feat_share.toFixed(1)}%<br>mean popularity: ${g.mean_pop.toFixed(1)}<br>n = ${g.n.toLocaleString()} tracks`, e); });
        c.addEventListener("mousemove", moveTip);
        c.addEventListener("mouseleave", (e) => { c.setAttribute("opacity", 0.5); hideTip(); });
        svg.appendChild(c);
      });
    })();
  }

  /* ================= FIG 4 — forest plot ================= */
  function renderFig4(container) {
    const W = container.clientWidth;
    const rows = CHART_DATA.fig4.rows;
    const pad = { l: 16, r: 24, t: 20, b: 50 };
    const labelFont = "600 11px Segoe UI, Helvetica Neue, Arial, sans-serif";
    const labelW = Math.max(110, Math.min(280, W * 0.34));
    const lineH = 13;
    const minRowH = 40;

    /* wrap each row's label to fit labelW, then size that row's height to its line count */
    const wrapped = rows.map((r) => wrapWords(r.label, labelW - 4, labelFont, 3));
    const rowHeights = wrapped.map((lines) => Math.max(minRowH, lines.length * lineH + 22));
    const rowY = [];
    let acc = pad.t;
    rowHeights.forEach((h) => { rowY.push(acc); acc += h; });
    const H = acc + pad.b;

    container.innerHTML = "";
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg" });
    container.appendChild(svg);

    const plotX0 = pad.l + labelW, plotX1 = W - pad.r;
    const allLo = Math.min(...rows.map((r) => r.lo), 0), allHi = Math.max(...rows.map((r) => r.hi));
    const span = allHi - allLo;
    const x = scaleLinear([allLo - span * 0.06, allHi + span * 0.12], [plotX0, plotX1]);
    x.rangeMid = (plotX0 + plotX1) / 2;

    const colorFor = (g) => g === "raw" ? COLOR.neutral : g === "spec" ? COLOR.green : COLOR.grey;

    const zeroX = x(0);
    svg.appendChild(svgEl("line", { x1: zeroX, y1: pad.t - 6, x2: zeroX, y2: acc, stroke: "#cc4444", "stroke-dasharray": "4,3", "stroke-width": 1.2 }));

    rows.forEach((r, i) => {
      const rowH = rowHeights[i];
      const cy = rowY[i] + rowH / 2;
      const lines = wrapped[i];
      const label = multilineText(pad.l, cy - ((lines.length - 1) * lineH) / 2 + 4, lines, lineH, { class: "chart-tick", "text-anchor": "start" });
      svg.appendChild(label);

      const color = colorFor(r.group);
      const line = svgEl("line", { x1: x(r.lo), y1: cy, x2: x(r.hi), y2: cy, stroke: color, "stroke-width": 2.4 });
      svg.appendChild(line);
      const dot = svgEl("circle", { cx: x(r.coef), cy, r: 5.5, fill: color });
      const hit = svgEl("rect", { x: x(r.lo) - 4, y: cy - rowH / 2, width: x(r.hi) - x(r.lo) + 8, height: rowH, fill: "transparent" });
      const tipContent = `<b>${r.label}</b><br>estimate: ${r.coef >= 0 ? "+" : ""}${r.coef.toFixed(2)}<br>95% CI: [${r.lo.toFixed(2)}, ${r.hi.toFixed(2)}]`;
      [dot, hit].forEach((el) => {
        el.addEventListener("mouseenter", (e) => { dot.setAttribute("r", 7); showTip(tipContent, e); });
        el.addEventListener("mousemove", moveTip);
        el.addEventListener("mouseleave", (e) => { dot.setAttribute("r", 5.5); hideTip(); });
      });
      svg.appendChild(hit);
      svg.appendChild(dot);

      const vt = svgEl("text", { x: x(r.coef), y: cy - 12, "text-anchor": "middle", class: "chart-annot-strong" });
      vt.textContent = (r.coef >= 0 ? "+" : "") + r.coef.toFixed(2);
      svg.appendChild(vt);
    });

    axisBottom(svg, x, acc, ticksFor(x.invert(plotX0), x.invert(plotX1), 6), {
      fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(2),
      title: "estimated effect on popularity (0–100 scale), 95% CI",
      explain: "The featured-artist coefficient's point estimate and 95% confidence interval, in points on Spotify's 0–100 popularity scale.",
    });
  }

  /* ---------- boot ---------- */
  const registry = [
    ["chart-fig1", renderFig1],
    ["chart-fig2", renderFig2],
    ["chart-fig3", renderFig3],
    ["chart-fig4", renderFig4],
  ];

  function renderAll() {
    registry.forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) fn(el);
    });
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderAll, 150);
  });

  document.addEventListener("DOMContentLoaded", renderAll);
})();
