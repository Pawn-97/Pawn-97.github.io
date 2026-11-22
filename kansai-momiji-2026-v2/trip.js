"use strict";
/* ============================================================
   紅葉狩 · 渲染与交互
   同一份数据 → 长卷（滚动）与手帖（翻书）两种阅读模式
   ============================================================ */
(function () {
  const TRIP = window.TRIP;
  const REF = window.TRIP_REF;
  if (!TRIP || !REF) return;

  const LS_KEY = "kansai2026.read.v1";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------------- 状态 ---------------- */
  const narrow = window.matchMedia("(max-width:760px)");
  const reduce = window.matchMedia("(prefers-reduced-motion:reduce)");
  const state = { mode: narrow.matches ? "book" : "scroll", d5: "nara", kimono: "shop", sound: true, page: "cover", explicit: false };
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    if (saved.d5 === "nara" || saved.d5 === "osaka") state.d5 = saved.d5;
    if (saved.kimono === "shop" || saved.kimono === "hotel") state.kimono = saved.kimono;
    if (typeof saved.sound === "boolean") state.sound = saved.sound;
    if (saved.mode === "book" || saved.mode === "scroll") { state.mode = saved.mode; state.explicit = true; }
    if (typeof saved.page === "string") state.page = saved.page;
  } catch (e) { /* 首次访问或存储不可用 */ }
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ d5: state.d5, kimono: state.kimono, sound: state.sound, mode: state.explicit ? state.mode : null, page: state.page }));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  /* ---------------- 色彩归属 ---------------- */
  const DAY_ACC = { d0: "kin", d1: "aka", d2: "aka", d3: "aka", d4: "aka", d5: "kaki", d6: "ai", d7: "ai" };
  const REF_ACC = { prep: "kin", stay: "aka", rail: "ai", insurance: "fuji", nara: "koke", osaka: "kaki", pace: "aka", guides: "ai", budget: "kin" };
  const ACC_HEX = { kin: "#a8842c", aka: "#c00000", ai: "#2b4a7d", koke: "#4a6b3f", kaki: "#c26a12", fuji: "#8e3b6b" };
  const BAR_HUES = ["#c00000", "#c26a12", "#a8842c", "#4a6b3f", "#2b4a7d", "#8e3b6b", "#8f0000", "#3a3630"];

  /* ---------------- 页面清单 ---------------- */
  const dayById = {};
  TRIP.days.forEach(d => { dayById[d.id] = d; });
  const refById = {};
  REF.forEach(r => { refById[r.id] = r; });

  const P = {};
  P.cover = { id: "cover", kind: "cover", acc: "aka", chip: "表紙", sub: "封面", title: "紅葉狩 · 关西七日" };
  TRIP.days.forEach(d => {
    P[d.id] = { id: d.id, kind: "day", acc: DAY_ACC[d.id], chip: "D" + d.n, sub: d.date.replace("月", "/").replace("日", ""), title: d.title };
  });
  REF.forEach(r => {
    P[r.id] = { id: r.id, kind: "ref", acc: REF_ACC[r.id], chip: r.label, sub: r.en, title: r.title };
  });

  const BOOK_ORDER = ["cover"].concat(TRIP.days.map(d => d.id), ["prep", "stay", "rail", "insurance", "nara", "osaka", "pace", "guides", "budget"]);
  const SCROLL_ORDER = ["prep", "stay", "rail", "insurance"].concat(TRIP.days.map(d => d.id), ["nara", "osaka", "pace", "guides", "budget"]);

  /* ---------------- 内容解析 ---------------- */
  function resolveDay(d) {
    let m = d;
    if (d.variants) m = Object.assign({}, d, d.variants[state.d5]);
    const slots = (m.slots || []).filter(s => !s.only || s.only === state[d.branch]);
    return { meta: m, slots: slots, extras: m.extras || d.extras || [] };
  }
  function dayTitle(d) { return resolveDay(d).meta.title; }

  /* ---------------- HTML 片段 ---------------- */
  const NK = { warn: "注意", tip: "提示", ok: "已定", cost: "费用" };
  function noteHTML(k, b) {
    return '<div class="note ' + k + '"><span class="nk">' + (NK[k] || "提示") + "</span>" + b + "</div>";
  }
  function notesHTML(s) {
    let h = "";
    ["warn", "ok", "tip"].forEach(k => { (s[k] || []).forEach(x => { h += noteHTML(k, x); }); });
    (s.opt || []).forEach(x => { h += '<div class="note tip"><span class="nk">可选</span>' + x + "</div>"; });
    if (s.picks && s.picks.length) h += '<ul class="picks">' + s.picks.map(p => "<li>" + (p.b || p) + "</li>").join("") + "</ul>";
    return h;
  }
  function slotHTML(s) {
    let h = "";
    if (s.eve) {
      const parts = String(s.eve).split(" · ");
      h += '<div class="eve">' + parts[0] + "<span>" + parts.slice(1).join(" · ") + "</span></div>";
    }
    h += '<div class="slot' + (s.star ? " keyed" : "") + (s.only ? " soft" : "") + '">';
    h += '<div class="t">' + s.t + "</div>";
    h += '<div class="s-b"><p>' + (s.star ? '<span class="star">★</span> ' : "") + s.b + (s.free ? '<span class="free">' + s.free + "</span>" : "") + "</p>";
    h += notesHTML(s) + "</div></div>";
    return h;
  }
  function extrasHTML(extras) {
    if (!extras || !extras.length) return "";
    let h = '<div class="extras"><h4>弹性与备选</h4>';
    extras.forEach(x => {
      h += '<div class="extra"><h5>' + x.h + "</h5><p>" + x.b + "</p>" + notesHTML(x) + "</div>";
    });
    return h + "</div>";
  }
  function starsHTML(n) {
    let h = '<span class="stars">';
    for (let i = 1; i <= 3; i++) h += i <= n ? "★" : '<span class="off">★</span>';
    return h + "</span>";
  }
  function subtitle(h, en) {
    return '<h4 class="sub-title">' + h + (en ? "<small>" + en + "</small>" : "") + "</h4>";
  }
  function tableHTML(b) {
    const num = b.num || [];
    let h = '<div class="tbl' + (b.cls ? " " + b.cls : "") + '"><table><thead><tr>';
    b.head.forEach((c, i) => { h += "<th" + (num.indexOf(i) >= 0 ? ' class="num"' : "") + ">" + c + "</th>"; });
    h += "</tr></thead><tbody>";
    b.rows.forEach((r, ri) => {
      h += "<tr" + (b.total === ri ? ' class="total"' : "") + ">";
      r.forEach((c, i) => {
        h += '<td data-label="' + String(b.head[i] || "").replace(/<[^>]*>/g, "") + '"' + (num.indexOf(i) >= 0 ? ' class="num"' : "") + ">" + c + "</td>";
      });
      h += "</tr>";
    });
    return h + "</tbody></table></div>";
  }
  function listHTML(b) {
    return '<ul class="tick' + (b.cross ? " cross" : "") + '">' + b.items.map(x => "<li>" + x + "</li>").join("") + "</ul>";
  }
  function blockHTML(b) {
    switch (b.t) {
      case "p": return '<div class="block">' + (b.h ? subtitle(b.h, b.en) : "") + '<p class="sec-note" style="margin-bottom:0">' + b.b + "</p></div>";
      case "note": return '<div class="block">' + noteHTML(b.k, b.b) + "</div>";
      case "list": return '<div class="block">' + (b.h ? subtitle(b.h, b.en) : "") + listHTML(b) + "</div>";
      case "cols": return '<div class="block cols">' + b.items.map(c => "<div>" + (c.h ? "<h4>" + c.h + (c.en ? "<small>" + c.en + "</small>" : "") + "</h4>" : "") + listHTML({ items: c.list || c.items || [], cross: c.cross }) + "</div>").join("") + "</div>";
      case "table": return '<div class="block">' + (b.h ? subtitle(b.h, b.en) : "") + tableHTML(b) + "</div>";
      case "steps": return '<div class="block">' + (b.h ? subtitle(b.h, b.en) : "") + '<ol class="steps">' + b.items.map(x => "<li>" + x + "</li>").join("") + "</ol></div>";
      case "route": return '<div class="block"><div class="route">' + b.b + "</div></div>";
      case "links": return '<div class="block"><div class="links">' + b.items.map(l => '<a href="' + l.url + '" target="_blank" rel="noopener">' + l.label + "</a>").join("") + "</div></div>";
      case "bars": return '<div class="block"><div class="bars">' + b.items.map((x, i) =>
        '<div class="lbl' + (x.alt ? " alt" : "") + '">' + x.label + "<small>" + x.sub + "</small></div>" +
        '<div class="bar' + (x.alt ? " alt" : "") + '"><i data-w="' + x.w + '%" style="background:' + BAR_HUES[i % BAR_HUES.length] + '"></i></div>' +
        '<div class="steps">' + x.steps + "</div>").join("") + "</div></div>";
      case "pick": return '<div class="block">' + (b.h ? subtitle(b.h, b.en) : "") + '<div class="pick">' + b.options.map(o =>
        '<div class="opt-card' + (o.good ? " good" : "") + '"><span class="tag">' + o.tag + "</span><h5>" + o.title + "</h5><dl>" +
        o.rows.map(r => "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>").join("") +
        '</dl><div class="verdict">' + o.verdict + "</div></div>").join("") + "</div></div>";
      default: return "";
    }
  }
  function branchHTML(d, mini) {
    if (!d.branch || !d.branchOptions) return "";
    const opts = d.branchOptions;
    return '<div class="branch' + (mini ? " mini" : "") + '" role="group" aria-label="' + d.branchLabel + '">' +
      opts.map(o => '<button type="button" data-branch="' + d.branch + '" data-val="' + o.key + '" aria-pressed="' + (state[d.branch] === o.key) + '">' +
        o.label + "<small>" + o.hint + "</small></button>").join("") + "</div>";
  }
  function dayBodyHTML(d, forBook) {
    const r = resolveDay(d);
    const m = r.meta;
    let h = "";
    if (d.branch && d.branchOptions && !forBook) {
      h += '<div class="day-branch"><span class="bk">' + d.branchLabel + "</span>" + branchHTML(d) +
        '<div class="bh" style="font-size:11.5px;color:var(--ink-60);margin-top:8px;line-height:1.7">' +
        (d.branch === "d5" ? "切换后，本页时刻表、D6 傍晚安排与预算差额会一起变。" : "切换后，今天傍晚与明天清晨的安排会一起变。") + "</div></div>";
    }
    h += '<div class="timeline">' + r.slots.map(slotHTML).join("") + "</div>";
    h += extrasHTML(r.extras);
    return h;
  }
  function daySideHTML(d) {
    const m = resolveDay(d).meta;
    let h = '<div class="cell"><span class="k">强度</span>' + starsHTML(m.effort) + "</div>";
    if (m.steps) h += '<div class="cell"><span class="k">步数</span>' + m.steps + "</div>";
    h += '<div class="cell"><span class="k">起床</span><b>' + m.wake + "</b></div>";
    h += '<div class="cell"><span class="k">住宿</span>' + m.stayShort + "</div>";
    h += '<div class="cell"><span class="k">原则</span>' + m.principle + "</div>";
    return h;
  }
  function dayHeadHTML(d, big) {
    const m = resolveDay(d).meta;
    const circle = big ? "day-circle" : "p-num";
    let h = '<div class="' + (big ? "day-head" : "p-head") + '">';
    h += '<div class="' + circle + '"><span class="n">' + d.n + '</span><span class="d">DAY</span></div>';
    h += '<div class="' + (big ? "day-titles" : "p-titles") + '">';
    h += '<div class="date">' + d.date + " · " + d.dow + " · 宿 " + m.stay + "</div>";
    h += "<" + (big ? "h3" : "h2") + ">" + m.title + "</" + (big ? "h3" : "h2") + ">";
    h += '<div class="' + (big ? "route-line" : "rt") + '">' + m.route + "</div>";
    h += "</div></div>";
    if (!big) {
      h += '<div class="p-chips">' +
        '<span class="p-chip">强度 ' + starsHTML(m.effort) + "</span>" +
        (m.steps ? '<span class="p-chip"><b>' + m.steps + "</b> 步</span>" : "") +
        '<span class="p-chip">起床 <b>' + m.wake + "</b></span>" +
        '<span class="p-chip">' + m.principle + "</span></div>";
      if (d.branch && d.branchOptions) {
        h += '<div class="p-branch"><span class="bk">' + d.branchLabel + "</span>" + branchHTML(d) +
          '<div class="bh">' + (d.branch === "d5" ? "A 去奈良看鹿，B 直接去大阪购物。切换后本页与 D6 傍晚、预算差额一起变。" : "按你预约凭证上的还衣方式选；切换后今晚与明早的安排一起变。") + "</div></div>";
      }
    }
    return h;
  }

  /* ---------------- 倒计时 ---------------- */
  function tripClock() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dep = new Date(2026, 10, 29);
    const ret = new Date(2026, 11, 5);
    const pre = new Date(2026, 10, 28);
    const day = 86400000;
    if (today < pre) return { n: Math.round((dep - today) / day), label: "距出发", unit: "天", sub: "2026.11.29 · 9C6565 10:45 浦东T2", todayId: null };
    if (today.getTime() === pre.getTime()) return { n: 0, label: "今晚", unit: "前晚", sub: "11/28 宿浦东机场旁 · 明早 08:00 班车", todayId: "d0" };
    if (today >= dep && today <= ret) {
      const idx = Math.round((today - dep) / day) + 1;
      const id = "d" + idx;
      return { n: idx, label: "旅程第", unit: "天", sub: "今天 " + (today.getMonth() + 1) + "/" + today.getDate() + " · 已为你翻到今天", todayId: dayById[id] ? id : null };
    }
    return { n: Math.round((today - ret) / day), label: "旅程结束", unit: "天", sub: "2026.11.29 — 12.05 · 回顾模式", todayId: null };
  }

  /* ---------------- 封面 / HERO ---------------- */
  function updatesHTML() {
    return '<div class="updates"><h2>本次更新 · ' + TRIP.meta.updated + "</h2><ul>" +
      TRIP.meta.highlights.map(x => "<li>" + x + "</li>").join("") + "</ul></div>";
  }
  function metaRowsHTML() {
    let h = '<div class="cover-meta">';
    h += '<div><span class="k">Dates</span><span class="v"><b>' + TRIP.meta.span + "</b>（含 11/28 前晚）</span></div>";
    h += '<div><span class="k">Route</span><span class="v">' + TRIP.meta.route + "</span></div>";
    TRIP.meta.flights.forEach(f => { h += '<div><span class="k">' + f.k + '</span><span class="v">' + f.v + "</span></div>"; });
    TRIP.meta.hotels.forEach(x => { h += '<div><span class="k">' + x.k + '</span><span class="v">' + x.v + "</span></div>"; });
    h += '<div><span class="k">Note</span><span class="v">' + TRIP.meta.flightNote + "。时刻与票价按 <b>" + TRIP.meta.updated + "</b> 核对，标 ⚠ 项行前请复核。</span></div>";
    return h + "</div>";
  }
  function coverHTML() {
    const c = tripClock();
    let leaves = "";
    for (let i = 0; i < 6; i++) {
      const left = 8 + i * 16, dur = 15 + (i % 3) * 6, delay = -i * 4.2, size = 14 + (i % 3) * 7;
      leaves += '<svg viewBox="0 0 100 100" fill="currentColor" style="left:' + left + "%;width:" + size + "px;height:" + size + "px;animation-duration:" + dur + "s;animation-delay:" + delay + 's;color:' + ["#c00000", "#c26a12", "#a8842c"][i % 3] + '"><path d="M50 96 L46 70 L20 88 L30 62 L4 64 L24 48 L6 34 L32 38 L26 10 L44 30 L50 2 L56 30 L74 10 L68 38 L94 34 L76 48 L96 64 L70 62 L80 88 L54 70 Z"/></svg>';
    }
    return '<div class="cover"><div class="wash"><i></i><i></i><i></i></div><div class="leaf-fall" aria-hidden="true">' + leaves + "</div>" +
      '<h1 class="cover-word"><span class="l1">紅葉</span><span class="l2">狩り</span></h1>' +
      '<p class="cover-sub"><b>关西红叶季七日</b> · 两人 · 京都四晚 → 奈良（可换大阪）→ 大阪两晚</p>' +
      '<div class="countdown"><span class="cd-n">' + c.n + '</span><span class="cd-b"><b>' + c.label + " " + c.n + " " + c.unit + "</b>" + c.sub + "</span></div>" +
      metaRowsHTML() + updatesHTML() +
      '<div class="cover-cta"><button class="btn" type="button" data-go="' + (c.todayId || "d0") + '">开始翻阅<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
      '<button class="btn ghost" type="button" data-toc>目录</button>' +
      '<a class="btn ghost" href="checklist.html">行前清单</a></div>' +
      '<p class="p-end">左右滑动翻页 · 上下滚动读当天</p></div>';
  }
  function heroHTML() {
    const c = tripClock();
    return '<header class="hero" id="top"><div class="wash"><i></i><i></i><i></i></div>' +
      '<svg class="hero-leaf" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true"><path d="M50 96 L46 70 L20 88 L30 62 L4 64 L24 48 L6 34 L32 38 L26 10 L44 30 L50 2 L56 30 L74 10 L68 38 L94 34 L76 48 L96 64 L70 62 L80 88 L54 70 Z"/></svg>' +
      '<div class="hero-stage"><h1 class="hero-word"><span class="l1">紅葉</span><span class="l2">狩り</span></h1>' +
      '<div class="hero-circle">七日</div></div>' +
      '<div class="hero-meta rv in"><div><span class="k">Dates · 日期</span><strong>' + TRIP.meta.span + '</strong></div>' +
      '<div><span class="k">Route · 路线</span><strong>' + TRIP.meta.route + '</strong></div>' +
      '<div><span class="k">Who · 人数</span><strong>两人</strong></div>' +
      '<div><span class="k">Countdown</span><strong>' + c.label + " " + c.n + " " + c.unit + '</strong></div>' +
      '<div><span class="k">Pace · 节奏</span><strong>每天中午回酒店休息</strong></div></div>' +
      '<div class="hero-flights rv in rv-d1">' +
      TRIP.meta.flights.map(f => "<span><b>" + f.k + "</b>　" + f.v + "</span>").join("") +
      "<span>⚠ " + TRIP.meta.flightNote + "</span>" +
      TRIP.meta.hotels.map(h => "<span>🏨 <b>" + h.k + "</b>　" + h.v + "</span>").join("") +
      "<span>📅 时刻与票价按 <b>" + TRIP.meta.updated + "</b> 更新核对，标 ⚠ 项行前请复核</span></div>" +
      updatesHTML() +
      '<div class="hero-cta rv in rv-d2"><button class="btn" type="button" data-mode="book">切换到手帖模式<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h7v14H4zM13 5h7v14h-7z"/></svg></button>' +
      '<a class="btn ghost" href="#d0">从 D0 开始读</a><a class="btn ghost" href="checklist.html">行前清单</a></div></header>';
  }

  /* ---------------- 长卷渲染 ---------------- */
  function renderScroll() {
    const root = $("#scrollRoot");
    let h = heroHTML();
    h += "<main>";
    SCROLL_ORDER.forEach((id, i) => {
      const p = P[id];
      if (p.kind === "day") {
        const d = dayById[id];
        if (id === "d0") {
          h += '<section id="days" data-acc="aka"><div class="sec-label rv">Day by Day<span>逐日</span></div>' +
            '<h2 class="sec-title rv">逐日行程（含 11/28 前晚）</h2>' +
            '<p class="sec-note rv">节奏安排：<b>上午排主要景点</b>（人少、体力好）→ <b>午餐后回酒店午休</b> → 下午再出门逛街／穿和服 → 傍晚看夜枫 → 回酒店泡 B1 大浴场。<b>餐饮全部自行安排</b>，本计划只保留时间窗口与动线。<b>12/3 有 A／B 两条线</b>，在 D5 章节顶部切换。</p>' +
            '<div class="block rv"><div class="route">D2  西北  酒店 ─步行3分→ 五条 ─乌丸线1站→ 京都 ─JR16分→ 嵯峨岚山\n          回程  阪急岚山 ─28分→ 阪急乌丸 ─步行7分→ 酒店\nD3  东南  酒店 ─步行15分→ 京阪清水五条 ─京阪2站→ 东福寺8:30\n          ─步行→ 三十三間堂(可选) ─步行→ 京都站午餐 ─地铁1站→ 酒店午休\n          下午  地铁到四条 → 锦市场→寺町 → Ookini祇园店15:30着装\n          → 花见小路→八坂神社→白川巽桥(蓝调) → 还衣(二选一) → 晚餐\nD4  东山  酒店 ─打车8分→ 清水寺6:30 ─二年坂空街→ 打车回酒店早餐\n          ─地铁+东西线→ 醍醐寺10:00 ─京都站午餐 ─酒店午休1.5小时\n          ─地铁→ 蹴上（南禅寺 → インクライン → 永观堂夜枫）\nD5  A线  酒店 ─地铁1站→ 近铁京都 ─近铁35–50分→ 近铁奈良(寄存行李)\n          → 兴福寺·鹿·东大寺·春日大社参道 ─步行1km→ JR奈良 ─50分→ JR大阪\n    B线  酒店 ─步行→ 西本願寺 ─地铁1站→ 京都站午餐 ─JR新快速29分→ JR大阪\n          → 梅田百货群 → 空中庭园(日落) → 新梅田食道街 → 友都八喜</div>' +
            '<p class="note tip" style="margin-top:14px"><span class="nk">红叶</span><b>11/22 复核</b>：岚山・天龙寺・东福寺・清水寺<b>已见顷</b>；永观堂约五成、预测 11/23 见顷；高台寺约五成；醍醐寺偏晚。东福寺最先过峰，已提前到 D3 清晨；永观堂、醍醐寺放在 D4 正好。出发前再按实况微调一次。</p></div>';
        }
        h += '<article class="day rv" id="' + d.id + '" data-acc="' + p.acc + '">' + dayHeadHTML(d, true) +
          '<div class="day-body"><aside class="day-side">' + daySideHTML(d) + "</aside><div>" + dayBodyHTML(d, false) + "</div></div></article>";
        if (id === "d7") h += "</section>";
      } else {
        const r = refById[id];
        h += '<section id="' + r.id + '" data-acc="' + p.acc + '"><div class="sec-label rv">' + r.en + "<span>" + r.cn + "</span></div>" +
          '<h2 class="sec-title rv">' + r.title + '</h2><p class="sec-note rv">' + r.note + "</p>" +
          r.blocks.map(b => '<div class="rv">' + blockHTML(b) + "</div>").join("") + "</section>";
      }
      if (i === 3 || i === 11) h += '<div class="divider rv"><svg viewBox="0 0 100 100" fill="currentColor"><path d="M50 96 L46 70 L20 88 L30 62 L4 64 L24 48 L6 34 L32 38 L26 10 L44 30 L50 2 L56 30 L74 10 L68 38 L94 34 L76 48 L96 64 L70 62 L80 88 L54 70 Z"/></svg></div>';
    });
    h += '<footer class="site"><div class="mark">紅葉狩り · <em>关西红叶季七日</em></div>' +
      "<div>2026.11.29 — 12.05 ｜ sequence KYOTO GOJO 4 晚 + 阪急 RESPIRE 2 晚 ｜ 两人</div>" +
      "<div>时刻与票价按 " + TRIP.meta.updated + " 更新核对，标 ⚠ 项行前请复核</div></footer></main>";
    root.innerHTML = h;

    const nav = $("#daynav");
    nav.innerHTML = SCROLL_ORDER.map(id => {
      const p = P[id];
      if (p.kind === "day") {
        const d = dayById[id];
        return '<a href="#' + id + '" data-nav="' + id + '"><small>' + d.date.replace("月", "/").replace("日", "") + "</small>D" + d.n + "</a>";
      }
      return '<a href="#' + id + '" data-nav="' + id + '"><small>参考</small>' + p.chip + "</a>";
    }).join("");
  }

  /* ---------------- 手帖渲染 ---------------- */
  function pageInner(id) {
    const p = P[id];
    if (p.kind === "cover") return coverHTML();
    if (p.kind === "day") {
      const d = dayById[id];
      const i = BOOK_ORDER.indexOf(id);
      const nxt = P[BOOK_ORDER[i + 1]];
      let h = dayHeadHTML(d, false) + dayBodyHTML(d, true);
      h += '<div class="p-foot">' + (nxt ? '<button class="nextbtn" type="button" data-go="' + nxt.id + '"><span><span class="nx-k">翻到下一页</span><span class="nx-t">' +
        (nxt.kind === "day" ? "D" + dayById[nxt.id].n + " · " + dayTitle(dayById[nxt.id]) : nxt.title) +
        '</span></span><span class="nx-a"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></button>' : "") +
        '<p class="p-end">紅葉狩り · ' + TRIP.meta.span + " · 第 " + (i + 1) + " / " + BOOK_ORDER.length + " 页</p></div>";
      return h;
    }
    const r = refById[id];
    const i = BOOK_ORDER.indexOf(id);
    const nxt = P[BOOK_ORDER[i + 1]];
    let h = '<div class="p-head" style="border-bottom-width:2px"><div class="p-titles"><div class="date">' + r.en + " · " + r.cn + "</div><h2>" + r.title + '</h2><div class="rt">' + r.note + "</div></div></div>";
    h += r.blocks.map(blockHTML).join("");
    h += '<div class="p-foot">' + (nxt ? '<button class="nextbtn" type="button" data-go="' + nxt.id + '"><span><span class="nx-k">翻到下一页</span><span class="nx-t">' +
      (nxt.kind === "day" ? "D" + dayById[nxt.id].n + " · " + dayTitle(dayById[nxt.id]) : nxt.title) +
      '</span></span><span class="nx-a"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></button>' : "") +
      '<p class="p-end">紅葉狩り · 第 ' + (i + 1) + " / " + BOOK_ORDER.length + " 页</p></div>";
    return h;
  }

  let pageEls = {};
  function renderBook() {
    const stage = $("#stage");
    $$(".page", stage).forEach(n => n.remove());
    pageEls = {};
    BOOK_ORDER.forEach(id => {
      const p = P[id];
      const el = document.createElement("div");
      el.className = "page";
      el.dataset.id = id;
      el.dataset.acc = p.acc;
      el.setAttribute("role", "region");
      el.setAttribute("aria-label", p.title);
      el.innerHTML = '<div class="page-in">' + pageInner(id) + "</div>";
      stage.appendChild(el);
      pageEls[id] = el;
      el.addEventListener("scroll", () => { if (currentId() === id) updateProgress(el); }, { passive: true });
    });
    const chips = $("#chips");
    chips.innerHTML = BOOK_ORDER.map(id => {
      const p = P[id];
      const sub = p.kind === "day" ? dayById[id].date.replace("月", "/").replace("日", "") : (p.kind === "cover" ? "封面" : "参考");
      return '<button type="button" class="chip' + (p.kind === "ref" ? " ref" : "") + '" data-go="' + id + '" style="--chipacc:' + ACC_HEX[p.acc] + '" aria-current="false"><b>' +
        (p.kind === "day" ? "D" + dayById[id].n : p.chip) + "</b><small>" + sub + "</small></button>";
    }).join("");
    buildTOC();
  }

  function buildTOC() {
    const days = BOOK_ORDER.filter(id => P[id].kind === "day");
    const refs = BOOK_ORDER.filter(id => P[id].kind === "ref");
    const item = id => {
      const p = P[id];
      const n = p.kind === "day" ? dayById[id].n : (p.kind === "cover" ? "表" : "▸");
      const t = p.kind === "day" ? dayTitle(dayById[id]) : p.title;
      const s = p.kind === "day" ? dayById[id].date + " · " + dayById[id].dow + " · " + resolveDay(dayById[id]).meta.stayShort : p.sub;
      return '<button type="button" class="toc-item" data-go="' + id + '" style="--acc:' + ACC_HEX[p.acc] + ';--acc-soft:' + ACC_HEX[p.acc] + '18" aria-current="false">' +
        '<span class="ti-n">' + n + '</span><span class="ti-b"><span class="ti-t">' + t + '</span><span class="ti-s">' + s + '</span></span><span class="ti-a">›</span></button>';
    };
    $("#tocBody").innerHTML =
      '<div class="toc-grp"><h3>封面</h3><div class="toc-list">' + item("cover") + "</div></div>" +
      '<div class="toc-grp"><h3>逐日 · 左右翻页</h3><div class="toc-list">' + days.map(item).join("") + "</div></div>" +
      '<div class="toc-grp"><h3>参考章节</h3><div class="toc-list">' + refs.map(item).join("") + "</div></div>";
  }

  /* ---------------- 手帖导航 ---------------- */
  let idx = 0, animating = false, drag = null, suppressClick = 0;
  const stage = () => $("#stage");
  function currentId() { return BOOK_ORDER[idx]; }
  function elOf(i) { return pageEls[BOOK_ORDER[i]]; }

  function updateBar() {
    const id = currentId(), p = P[id];
    const bar = $("#stageBar");
    bar.style.setProperty("--acc", ACC_HEX[p.acc]);
    $("#sbId").textContent = p.kind === "day" ? "D" + dayById[id].n + " · " + dayById[id].date.replace("月", "/").replace("日", "") : (p.kind === "cover" ? "紅葉狩" : p.chip);
    $("#sbT").textContent = p.kind === "cover" ? TRIP.meta.span : p.title;
    const bb = $("#sbBranch");
    const d = p.kind === "day" ? dayById[id] : null;
    bb.innerHTML = d && d.branch && d.branchOptions ? branchHTML(d, true) : "";
    $("#prevBtn").disabled = idx === 0;
    $("#nextBtn").disabled = idx === BOOK_ORDER.length - 1;
    $("#pgNow").textContent = (idx + 1) + " / " + BOOK_ORDER.length;
    $$("#chips .chip").forEach(c => c.setAttribute("aria-current", String(c.dataset.go === id)));
    $$("#tocBody .toc-item").forEach(c => c.setAttribute("aria-current", String(c.dataset.go === id)));
    const chip = $('#chips .chip[data-go="' + id + '"]');
    if (chip && chip.scrollIntoView) chip.scrollIntoView({ block: "nearest", inline: "center", behavior: reduce.matches ? "auto" : "smooth" });
    updateProgress(elOf(idx));
    animateBars(elOf(idx));
    state.page = id; save();
    try { if (history.replaceState) history.replaceState(null, "", "#" + id); } catch (e) { /* file:// 下忽略 */ }
  }
  function updateProgress(el) {
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    $("#sbProg").style.width = (max > 4 ? clamp(el.scrollTop / max, 0, 1) * 100 : 0) + "%";
  }
  function animateBars(el) {
    if (!el) return;
    $$(".bars .bar i", el).forEach(b => { b.style.width = b.dataset.w; });
  }

  function setOn(i) {
    BOOK_ORDER.forEach((id, k) => {
      const el = pageEls[id];
      el.classList.toggle("on", k === i);
      el.classList.remove("under", "turning", "settling", "anim");
      el.style.transform = "";
      el.style.removeProperty("--gloss");
      if (k === i) { el.removeAttribute("aria-hidden"); } else { el.setAttribute("aria-hidden", "true"); }
    });
    idx = i;
    updateBar();
  }

  function goTo(id, opts) {
    const target = BOOK_ORDER.indexOf(id);
    if (target < 0) return;
    if (state.mode !== "book") { state.page = id; setMode("book", true); return; }
    if (target === idx) { if (opts && opts.top) elOf(idx).scrollTop = 0; return; }
    if (animating) return;
    flipTo(target, !(opts && opts.instant));
  }

  function flipTo(target, animate) {
    const forward = target > idx;
    const out = elOf(idx), inc = elOf(target);
    if (!animate || reduce.matches) { setOn(target); inc.scrollTop = 0; playPaper(); return; }
    animating = true;
    hideHint();
    if (forward) {
      inc.classList.add("under"); inc.style.transform = "none"; inc.scrollTop = 0;
      out.classList.remove("on"); out.classList.add("turning", "settling", "anim");
      void out.offsetWidth;
      out.style.transform = "rotateY(-97deg)";
    } else {
      inc.classList.add("under", "turning"); inc.style.transform = "rotateY(-97deg)"; inc.scrollTop = 0;
      void inc.offsetWidth;
      inc.classList.add("settling", "anim");
      inc.style.transform = "rotateY(0deg)";
    }
    playPaper();
    window.setTimeout(() => {
      animating = false;
      setOn(target);
    }, 480);
  }

  /* ---------------- 拖拽翻页 ---------------- */
  function dragPrepare(dx) {
    const forward = dx < 0;
    const ni = forward ? idx + 1 : idx - 1;
    drag.forward = forward;
    drag.has = ni >= 0 && ni < BOOK_ORDER.length;
    drag.out = elOf(idx);
    drag.inc = drag.has ? elOf(ni) : null;
    drag.target = ni;
    if (!drag.has) { drag.out.classList.add("turning"); return; }
    if (forward) {
      drag.inc.classList.add("under"); drag.inc.style.transform = "none"; drag.inc.scrollTop = 0;
      drag.out.classList.remove("on"); drag.out.classList.add("turning");
    } else {
      drag.inc.classList.add("under", "turning"); drag.inc.style.transform = "rotateY(-97deg)"; drag.inc.scrollTop = 0;
    }
  }
  function dragMove(dx) {
    const w = stage().clientWidth || 1;
    let p = clamp(Math.abs(dx) / (w * 0.78), 0, 1);
    if (!drag.has) p = Math.min(p, 0.09);
    drag.p = p;
    const gloss = (Math.sin(p * Math.PI) * 0.8).toFixed(3);
    if (!drag.has) {
      drag.out.style.transform = "rotateY(" + (-14 * p * (drag.forward ? 1 : -1)) + "deg)";
      drag.out.style.setProperty("--gloss", gloss);
      return;
    }
    if (drag.forward) {
      drag.out.style.transform = "rotateY(" + (-97 * p) + "deg)";
      drag.out.style.setProperty("--gloss", gloss);
    } else {
      drag.inc.style.transform = "rotateY(" + (-97 * (1 - p)) + "deg)";
      drag.inc.style.setProperty("--gloss", gloss);
    }
  }
  function dragEnd(dx, dt, forceCancel) {
    const p = drag.p || 0;
    const v = Math.abs(dx) / Math.max(dt, 1);
    const commit = !forceCancel && drag.has && (p > 0.3 || (v > 0.45 && p > 0.08));
    const out = drag.out, inc = drag.inc, forward = drag.forward, target = drag.target, had = drag.has;
    animating = true;
    if (commit) {
      hideHint();
      const mover = forward ? out : inc;
      mover.classList.add("settling", "anim");
      void mover.offsetWidth;
      mover.style.transform = forward ? "rotateY(-97deg)" : "rotateY(0deg)";
      playPaper();
      window.setTimeout(() => { animating = false; setOn(target); }, 470);
    } else {
      const mover = had ? (forward ? out : inc) : out;
      mover.classList.add("settling");
      void mover.offsetWidth;
      mover.style.transform = had ? (forward ? "rotateY(0deg)" : "rotateY(-97deg)") : "rotateY(0deg)";
      window.setTimeout(() => {
        animating = false;
        if (!had) { out.classList.remove("turning", "anim"); out.classList.add("on"); out.style.transform = ""; out.style.removeProperty("--gloss"); }
        else if (forward) { out.classList.remove("turning", "anim"); out.classList.add("on"); out.style.transform = ""; out.style.removeProperty("--gloss"); inc.classList.remove("under"); inc.style.transform = ""; }
        else { inc.classList.remove("turning", "under", "anim"); inc.style.transform = ""; inc.style.removeProperty("--gloss"); }
        updateBar();
      }, 470);
    }
    suppressClick = performance.now() + 380;
    drag = null;
  }

  function bindStage() {
    const st = stage();
    st.addEventListener("pointerdown", e => {
      if (animating || state.mode !== "book") return;
      if (e.target.closest("a,button,input,select,textarea")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), id: e.pointerId, axis: null, p: 0 };
    });
    st.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.axis) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          drag.axis = "x";
          try { st.setPointerCapture(e.pointerId); } catch (err) { }
          dragPrepare(dx);
        } else if (Math.abs(dy) > 10) { drag = null; return; }
        else return;
      }
      if (drag.axis !== "x") return;
      if (e.cancelable) e.preventDefault();
      dragMove(dx);
    });
    const finish = e => {
      if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
      if (drag.axis !== "x") { drag = null; return; }
      dragEnd(e.clientX - drag.x0, performance.now() - drag.t0);
    };
    st.addEventListener("pointerup", finish);
    st.addEventListener("pointercancel", e => {
      if (!drag) return;
      if (drag.axis === "x") dragEnd(0, 1, true);
      else drag = null;
    });
    st.addEventListener("click", e => {
      if (performance.now() < suppressClick) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    st.addEventListener("dragstart", e => e.preventDefault());
  }

  /* ---------------- 音效（纸张与轻触） ---------------- */
  let ac = null, master = null, noiseBuf = null;
  function audio() {
    if (ac) return ac;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = state.sound ? 0.9 : 0;
    master.connect(ac.destination);
    const len = Math.floor(ac.sampleRate * 0.3);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return ac;
  }
  function playPaper() {
    if (!state.sound) return;
    const c = audio(); if (!c) return;
    if (c.state === "suspended") c.resume();
    const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1750; bp.Q.value = 0.75;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.3);
    const th = c.createOscillator(); th.type = "sine"; th.frequency.value = 104;
    const tg = c.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    th.connect(tg); tg.connect(master); th.start(t); th.stop(t + 0.12);
  }
  function playTick() {
    if (!state.sound) return;
    const c = audio(); if (!c) return;
    if (c.state === "suspended") c.resume();
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = 940;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.07);
  }

  /* ---------------- 模式切换 ---------------- */
  function setMode(m, keep) {
    if (state.mode === m && !keep) return;
    state.mode = m; state.explicit = true;
    document.body.classList.toggle("mode-book", m === "book");
    document.body.classList.toggle("mode-scroll", m === "scroll");
    $("#bookRoot").hidden = m !== "book";
    $("#scrollRoot").hidden = m !== "scroll";
    $("#daynav").hidden = m !== "scroll";
    $("#modeBtn").setAttribute("aria-pressed", String(m === "book"));
    $("#modeLabel").textContent = m === "book" ? "手帖" : "长卷";
    $("#modeIcon").innerHTML = m === "book"
      ? '<path d="M4 5h7v14H4zM13 5h7v14h-7z"/>'
      : '<path d="M4 6h16M4 12h16M4 18h10"/>';
    if (m === "book") {
      const id = keep ? state.page : (nearestScrollId() || state.page);
      const i = BOOK_ORDER.indexOf(id);
      setOn(i >= 0 ? i : 0);
      if (!keep) showHint();
    } else {
      const id = keep ? state.page : currentId();
      const target = document.getElementById(id === "cover" ? "top" : id);
      if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 62, behavior: "auto" });
      observeScroll();
    }
    save();
    playTick();
  }
  function nearestScrollId() {
    let best = null, bestD = Infinity;
    SCROLL_ORDER.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const d = Math.abs(el.getBoundingClientRect().top - 70);
      if (d < bestD) { bestD = d; best = id; }
    });
    return best;
  }

  /* ---------------- 分支切换 ---------------- */
  function setBranch(key, val) {
    if (state[key] === val) return;
    state[key] = val; save(); playTick();
    const affected = key === "d5" ? ["d5", "d6"] : ["d3", "d4"];
    affected.forEach(id => {
      const d = dayById[id];
      if (pageEls[id]) {
        const keep = pageEls[id].scrollTop;
        pageEls[id].innerHTML = '<div class="page-in">' + pageInner(id) + "</div>";
        pageEls[id].scrollTop = Math.min(keep, Math.max(0, pageEls[id].scrollHeight - pageEls[id].clientHeight));
      }
    });
    renderScroll();
    observeScroll();
    if (state.mode === "book") { updateBar(); animateBars(elOf(idx)); }
    buildTOC();
    $$("#tocBody .toc-item").forEach(c => c.setAttribute("aria-current", String(c.dataset.go === currentId())));
    toast(key === "d5" ? (val === "osaka" ? "已切到 B 方案：12/3 直接去大阪购物" : "已切到 A 方案：12/3 去奈良看鹿") : (val === "hotel" ? "已切到酒店／次日返还：今晚可穿着和服逛" : "已切到当日回店还：18:00 前回到店里"));
  }
  let toastT = 0;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    window.clearTimeout(toastT);
    toastT = window.setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------------- 提示 ---------------- */
  let hintT = 0;
  function showHint() {
    const h = $("#hint");
    if (!h || sessionStorage.getItem("kansai.hint") === "1") return;
    h.classList.remove("gone");
    window.clearTimeout(hintT);
    hintT = window.setTimeout(hideHint, 6500);
  }
  function hideHint() {
    const h = $("#hint");
    if (!h) return;
    h.classList.add("gone");
    try { sessionStorage.setItem("kansai.hint", "1"); } catch (e) { }
  }

  /* ---------------- 滚动揭示 / 视差 / 导航高亮 ---------------- */
  let io = null, nio = null, raf = 0;
  function observeScroll() {
    if (io) io.disconnect();
    io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    $$("#scrollRoot .rv").forEach(el => io.observe(el));
    if (nio) nio.disconnect();
    const links = $$("#daynav a");
    const map = new Map();
    links.forEach(a => { const t = document.getElementById(a.dataset.nav); if (t) map.set(t, a); });
    nio = new IntersectionObserver(es => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        const a = map.get(e.target);
        if (!a) return;
        links.forEach(l => l.classList.remove("cur"));
        a.classList.add("cur");
        if (state.mode === "scroll") { state.page = a.dataset.nav; }
      });
    }, { rootMargin: "-25% 0px -60% 0px" });
    map.forEach((_, t) => nio.observe(t));
    $$("#scrollRoot .bars .bar i").forEach(b => {
      const o = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting) { e.target.style.width = e.target.dataset.w; o.unobserve(e.target); } });
      }, { threshold: 0.3 });
      o.observe(b);
    });
  }
  function parallax() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const leaf = $(".hero-leaf");
      if (leaf && state.mode === "scroll") {
        const y = window.scrollY;
        leaf.style.transform = "rotate(" + (18 + y * 0.018) + "deg) translate3d(0," + (y * 0.12) + "px,0)";
      }
    });
  }

  /* ---------------- 目录 ---------------- */
  function openTOC() { $("#toc").classList.add("open"); document.body.style.overflow = "hidden"; playTick(); }
  function closeTOC() { $("#toc").classList.remove("open"); document.body.style.overflow = ""; }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    document.addEventListener("click", e => {
      const go = e.target.closest("[data-go]");
      if (go) {
        e.preventDefault();
        closeTOC();
        const id = go.dataset.go;
        if (state.mode === "book") goTo(id, { top: true });
        else {
          const t = document.getElementById(id === "cover" ? "top" : id);
          if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 62, behavior: reduce.matches ? "auto" : "smooth" });
        }
        return;
      }
      const br = e.target.closest("[data-branch]");
      if (br) { e.preventDefault(); setBranch(br.dataset.branch, br.dataset.val); return; }
      const md = e.target.closest("[data-mode]");
      if (md) { e.preventDefault(); setMode(md.dataset.mode); return; }
      if (e.target.closest("[data-toc]")) { e.preventDefault(); openTOC(); return; }
      if (e.target.closest("[data-toc-close]")) { e.preventDefault(); closeTOC(); return; }
      const snd = e.target.closest("[data-sound]");
      if (snd) {
        e.preventDefault();
        state.sound = !state.sound; save();
        if (master) master.gain.value = state.sound ? 0.9 : 0;
        syncSound();
        if (state.sound) playTick();
        toast(state.sound ? "音效已开：翻页会有纸张声" : "音效已关");
        return;
      }
      if (e.target.closest("#prevBtn")) { if (idx > 0) flipTo(idx - 1, true); return; }
      if (e.target.closest("#nextBtn")) { if (idx < BOOK_ORDER.length - 1) flipTo(idx + 1, true); return; }
      if (e.target.closest("#curl")) { if (idx < BOOK_ORDER.length - 1) flipTo(idx + 1, true); return; }
      if (e.target.closest("#todayBtn")) { const c = tripClock(); goTo(c.todayId || "d0", { top: true }); return; }
      if (e.target.closest(".toc-bg")) { closeTOC(); return; }
    });

    $("#modeBtn").addEventListener("click", () => setMode(state.mode === "book" ? "scroll" : "book"));

    document.addEventListener("keydown", e => {
      const t = e.target;
      if (t && t.matches && t.matches("input,textarea,select")) return;
      if (e.key === "Escape") { closeTOC(); return; }
      if (state.mode !== "book") return;
      if ($("#toc").classList.contains("open")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); if (idx < BOOK_ORDER.length - 1) flipTo(idx + 1, true); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (idx > 0) flipTo(idx - 1, true); }
      else if (e.key === "Home") { e.preventDefault(); goTo("cover", { top: true }); }
      else if (e.key === "End") { e.preventDefault(); goTo(BOOK_ORDER[BOOK_ORDER.length - 1], { top: true }); }
    });

    window.addEventListener("scroll", parallax, { passive: true });
    window.addEventListener("resize", () => {
      if (state.mode === "book") updateProgress(elOf(idx));
    });
    narrow.addEventListener("change", () => {
      if (state.explicit) return;
      const want = narrow.matches ? "book" : "scroll";
      if (want === state.mode) return;
      state.mode = want;
      setMode(want, true);
      state.explicit = false;
      save();
    });
    bindStage();
  }

  function syncSound() {
    const b = $("#soundBtn");
    b.setAttribute("aria-pressed", String(state.sound));
    b.classList.toggle("off", !state.sound);
    b.setAttribute("aria-label", state.sound ? "关闭音效" : "开启音效");
    b.title = state.sound ? "音效：开（点击关闭）" : "音效：关（点击开启）";
    b.innerHTML = state.sound
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>';
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    renderScroll();
    renderBook();
    bind();
    syncSound();

    const hash = (location.hash || "").slice(1);
    let startId = state.page;
    if (hash && P[hash]) startId = hash;
    else {
      const c = tripClock();
      if (c.todayId && !state.explicit) startId = c.todayId;
    }
    if (!P[startId]) startId = "cover";
    state.page = startId;

    document.body.classList.toggle("mode-book", state.mode === "book");
    document.body.classList.toggle("mode-scroll", state.mode === "scroll");
    $("#bookRoot").hidden = state.mode !== "book";
    $("#scrollRoot").hidden = state.mode !== "scroll";
    $("#daynav").hidden = state.mode !== "scroll";
    $("#modeBtn").setAttribute("aria-pressed", String(state.mode === "book"));
    $("#modeLabel").textContent = state.mode === "book" ? "手帖" : "长卷";
    $("#modeIcon").innerHTML = state.mode === "book" ? '<path d="M4 5h7v14H4zM13 5h7v14h-7z"/>' : '<path d="M4 6h16M4 12h16M4 18h10"/>';

    const c = tripClock();
    $("#todayBtn").hidden = !c.todayId;

    setOn(BOOK_ORDER.indexOf(startId));
    observeScroll();
    if (state.mode === "book") { showHint(); }
    else if (hash && P[hash]) {
      const t = document.getElementById(hash === "cover" ? "top" : hash);
      if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 62, behavior: "auto" });
    }
    save();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();