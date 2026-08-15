/**
 * data/*.json → dist/*.html 을 굽는다.
 *
 * 프레임워크를 안 쓴다. node 기본만 쓴다. 의존성이 없으니 깨질 데가 적다.
 * 데이터가 비어 있어도 페이지는 나온다 — 빈 칸에는 "아직 없다" 와 무엇을 채워야 하는지가 뜬다.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { loadAll, buildTasks, unitPrice, itemTotal, planCost, distanceM } from "./tasks.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const d = loadAll();
const LIMIT = d.config.limits.monthlyTotalMax;
const COMFORT = d.config.limits.monthlyTotalComfort;
const tasks = buildTasks(d);

const num = (n) => Number(n).toLocaleString("ko-KR");
const won = (n) => (n == null ? null : `${num(n)}원`);
const man = (n) => (n == null ? null : `${num(n)}만원`);
const wonMan = (n) => (n == null ? null : n >= 10000 ? `${num(Math.round(n / 10000))}만원` : `${num(n)}원`);

/* ── 뼈대 ─────────────────────────────────────────────────────── */

const NAV = [
  ["/", "개요"], ["/listings", "자리"], ["/gear", "장비"],
  ["/interior", "인테리어"], ["/plan", "예산"], ["/log", "일지"],
];

const CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--body);
  font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  font-size:15px;line-height:1.72;letter-spacing:-0.01em;-webkit-font-smoothing:antialiased}
:root{--bg:#EAF1F3;--card:#FFFFFF;--stroke:#D9E5E8;--title:#0F262C;--body:#40565C;--muted:#8CA3A9;--accent:#0E7490;--flag:#9E4A3A}
a{color:inherit}
h1,h2,h3,h4{color:var(--title);margin:0;font-weight:700;letter-spacing:-0.025em;line-height:1.34}
p{margin:0}
.n,.mono{font-family:Inter,Pretendard,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:-0.02em}

.wrap{max-width:1060px;margin:0 auto;padding:0 26px}
.top{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--stroke)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:20px;height:60px}
.mark{display:flex;align-items:baseline;gap:9px;text-decoration:none}
.mark b{font-size:14.5px;color:var(--title);letter-spacing:-0.02em}
.mark span{font-family:Inter,sans-serif;font-size:10px;letter-spacing:.18em;color:var(--muted);text-transform:uppercase}
nav{display:flex;gap:2px;flex-wrap:wrap}
nav a{text-decoration:none;font-size:13.5px;color:var(--body);padding:5px 11px;border-radius:99px;white-space:nowrap}
nav a:hover{color:var(--title)}
nav a[aria-current]{background:var(--title);color:#fff}

main{padding:56px 0 96px}
section{margin-bottom:56px}
.eyebrow{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-bottom:14px;letter-spacing:.02em}
.eyebrow .n{color:var(--accent);font-weight:600}
h1{font-size:clamp(26px,4.2vw,36px);margin-bottom:14px}
.lede{font-size:16.5px;color:var(--body);max-width:62ch}
h2{font-size:21px;margin-bottom:10px}
h3{font-size:16.5px}

.band{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.band span{background:#fff;border:1px solid var(--stroke);border-radius:99px;padding:5px 13px;font-size:12.5px;color:var(--body)}
.band span b{color:var(--title);font-weight:600}

.card{background:var(--card);border:1px solid var(--stroke);border-radius:14px;padding:22px 24px}
.grid{display:grid;gap:14px}
.g3{grid-template-columns:repeat(3,1fr)}
.g2{grid-template-columns:repeat(2,1fr)}
@media(max-width:820px){.g3,.g2{grid-template-columns:1fr}}

.stat .lab{font-size:12.5px;color:var(--muted);margin-bottom:6px}
.big{display:flex;align-items:baseline;gap:5px}
.big .v{font-family:Inter,sans-serif;font-size:34px;font-weight:600;color:var(--title);line-height:1.1;letter-spacing:-0.03em}
.big .v.none{font-size:17px;font-weight:400;color:var(--muted);letter-spacing:0}
.big .u{font-size:13px;color:var(--muted)}
.stat .sub{font-size:12.5px;color:var(--muted);margin-top:7px}

.concl{background:#fff;border:1px solid var(--stroke);border-left:3px solid var(--accent);border-radius:0 14px 14px 0;padding:18px 22px}
.concl b{color:var(--title)}

.empty{border:1px dashed #C4D5DA;border-radius:14px;padding:30px 24px;text-align:center;color:var(--muted);font-size:14px;background:rgba(255,255,255,.5)}
.empty b{display:block;color:var(--title);font-size:15px;margin-bottom:6px;font-weight:600}

.rows{display:flex;flex-direction:column;gap:12px}
.rowc{background:#fff;border:1px solid var(--stroke);border-radius:14px;padding:18px 22px}
.rowc .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}
.rowc .why{font-size:14px;color:var(--body);margin-top:8px;max-width:74ch}
.meta{font-size:12.5px;color:var(--muted);margin-top:3px}

.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.tag{font-size:11.5px;border:1px solid var(--stroke);border-radius:6px;padding:2px 8px;color:var(--body);background:#F7FAFB}
.tag.on{border-color:var(--accent);color:var(--accent)}
.tag.flag{border-color:#E3CBC5;color:var(--flag);background:#FCF6F4}

.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;margin-top:16px;border-top:1px solid var(--stroke);padding-top:14px}
.facts div .k{font-size:11.5px;color:var(--muted)}
.facts div .v{font-size:14.5px;color:var(--title);font-weight:500}
@media(max-width:640px){.facts{grid-template-columns:repeat(2,1fr);gap:12px 2px}}

.src{display:inline-block;margin-top:14px;font-size:12.5px;color:var(--accent);text-decoration:none;border-bottom:1px solid rgba(14,116,144,.28)}
.src:hover{border-bottom-color:var(--accent)}

.filters{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:18px;padding:16px 20px;background:#fff;border:1px solid var(--stroke);border-radius:14px}
.fgrp{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.fgrp .fl{font-size:12px;color:var(--muted);margin-right:2px}
.chip{font-size:12.5px;border:1px solid var(--stroke);background:#fff;color:var(--body);border-radius:99px;padding:4px 12px;cursor:pointer;font-family:inherit}
.chip[aria-pressed="true"]{background:var(--title);border-color:var(--title);color:#fff}

.strip{height:66px;margin:8px 0 10px;background:#fff;border:1px solid var(--stroke);border-radius:12px;padding:0 18px}
.track{position:relative;height:100%}
.track .ax{position:absolute;top:44%;left:0;right:0;height:1px;background:var(--stroke)}
.track .mk{position:absolute;top:calc(44% + 9px);transform:translateX(-50%);font-size:11px;color:var(--muted);white-space:nowrap}
.track .dot{position:absolute;top:44%;transform:translate(-50%,-50%);width:9px;height:9px;border-radius:50%;background:var(--accent);border:2px solid #fff;box-shadow:0 0 0 1px var(--accent)}
.track .dot.over{background:var(--flag);box-shadow:0 0 0 1px var(--flag)}

table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-weight:500;color:var(--muted);font-size:12px;padding:0 10px 8px 0;border-bottom:1px solid var(--stroke)}
td{padding:9px 10px 9px 0;border-bottom:1px solid #EEF4F5;color:var(--body);vertical-align:top}
td.r,th.r{text-align:right;padding-right:0}
tr:last-child td{border-bottom:0}

.qbox{min-width:212px;align-self:flex-start;background:#F7FAFB;border:1px solid var(--stroke);border-radius:10px;padding:14px 16px}
.qbox .lab{font-size:11.5px;color:var(--muted)}
.qbox .amt{font-family:Inter,sans-serif;font-size:22px;font-weight:600;color:var(--title);letter-spacing:-0.02em}
.qbox .amt.none{font-size:14px;font-weight:400;color:var(--muted);letter-spacing:0}
.qlist{margin-top:10px;font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:3px}
.qlist a{color:var(--body);text-decoration:none;border-bottom:1px solid var(--stroke)}

.plan{display:flex;flex-direction:column;height:100%}
.plan .nm{font-size:18px;color:var(--title);font-weight:700}
.plan .tl{font-size:13px;color:var(--muted);margin-top:3px}
.plan .amt{font-family:Inter,sans-serif;font-size:29px;font-weight:600;color:var(--title);margin:16px 0 2px;letter-spacing:-0.03em}
.plan ul{margin:12px 0 0;padding-left:16px;font-size:13px}
.plan li{margin-bottom:4px}

.tl-item{display:grid;grid-template-columns:96px 1fr;gap:18px;padding:16px 0;border-bottom:1px solid var(--stroke)}
.tl-item:last-child{border-bottom:0}
.tl-item .dt{font-family:Inter,sans-serif;font-size:12.5px;color:var(--muted)}
@media(max-width:640px){.tl-item{grid-template-columns:1fr;gap:4px}}

footer{border-top:1px solid var(--stroke);padding:26px 0 60px;font-size:12.5px;color:var(--muted)}
footer a{color:var(--body)}

@media(max-width:680px){
  .wrap{padding:0 18px}
  /* 좁은 화면에서 머리말이 붙어 있으면 화면을 너무 많이 먹는다. 그냥 흘려보낸다. */
  .top{position:static}
  .top .wrap{height:auto;min-height:52px;flex-wrap:wrap;gap:4px 14px;padding-top:11px;padding-bottom:11px}
  .mark b{white-space:nowrap}
  .mark span{display:none}
  nav a{padding:4px 9px;font-size:13px}
  main{padding:34px 0 72px}
  section{margin-bottom:42px}
  .card,.rowc{padding:18px}
  .rowc .hd{gap:10px}
  .rowc .hd>div:last-child{text-align:left !important}
  .rowc .hd .big{justify-content:flex-start !important}
  .qbox{width:100%}
}
`;

function page({ title, path, body }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 구의동 스튜디오</title>
<meta name="description" content="신용보증기금 광진지점에서 걸어갈 거리에 팟캐스트 스튜디오를 잡는 계획. 자리·장비·인테리어·예산을 한군데 모았습니다.">
<meta property="og:title" content="${esc(title)} · 구의동 스튜디오">
<meta property="og:description" content="사무실에서 걸어갈 거리에 스튜디오를 잡는 계획.">
<meta name="robots" content="noindex">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<style>${CSS}</style>
</head>
<body>
<header class="top"><div class="wrap">
  <a class="mark" href="/"><b>구의동 스튜디오</b><span>Studio Hunt</span></a>
  <nav>${NAV.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
</div></header>
<main class="wrap">${body}</main>
<footer class="wrap">
  마지막 갱신 ${esc(d.config.updatedAt)} · 매물 ${d.listings.length}건 · 대관 시세 ${d.market.rates.length}건 ·
  숫자는 조사한 것만 싣습니다. 비어 있는 칸은 아직 안 본 것입니다.
</footer>
</body></html>`;
}

const sec = (n, label) => `<div class="eyebrow"><span class="n">${n}</span> · ${esc(label)}</div>`;
const empty = (t, s) => `<div class="empty"><b>${esc(t)}</b>${esc(s)}</div>`;

/* ── 개요 ─────────────────────────────────────────────────────── */

const live = d.listings.filter((l) => l.status !== "rejected" && l.status !== "closed");
const priced = [...d.gear, ...d.interior].filter((x) => unitPrice(x).price != null);
const needed = [...d.gear, ...d.interior].filter((x) => ["필수", "권장", "1안", "2안"].includes(x.need));
const cheapest = live.map((l) => l.rent + (l.maintenance ?? 0)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)[0] ?? null;

function statCard(lab, v, u, sub) {
  const none = v === "—" || v === "조사 전";
  return `<div class="card stat"><div class="lab">${esc(lab)}</div>
    <div class="big"><span class="v${none ? " none" : ""}">${esc(none ? "아직 없음" : v)}</span>${u && !none ? `<span class="u">${esc(u)}</span>` : ""}</div>
    <div class="sub">${esc(sub)}</div></div>`;
}

const planLine = (p) => {
  const c = planCost(p, d.gear, d.interior);
  const amt = c.counted === 0 ? "조사 전" : `${wonMan(c.sum)}${c.missing ? " +" : ""}`;
  return `<a class="card plan" style="text-decoration:none" href="/plan">
    <div class="nm">${esc(p.name)}</div><div class="tl">${esc(p.tagline)}</div>
    <div class="amt">${esc(amt)}</div>
    <div class="sub" style="font-size:12.5px;color:var(--muted)">${c.missing ? `${c.missing}개 품목은 아직 시세를 안 걷었습니다` : "장비 · 인테리어 합계"}</div>
    <p class="why" style="margin-top:14px">${esc(p.for)}</p>
  </a>`;
};

const indexBody = `
<section>
  ${sec("01", "무엇을 하려는가")}
  <h1>사무실에서 걸어갈 거리에<br>스튜디오를 잡습니다</h1>
  <p class="lede">신용보증기금 광진지점이 사무실입니다. 여기서 걸어 다닐 자리에 방을 하나 얻어
  팟캐스트를 찍고, 남는 시간에는 빌려줍니다. 잘 수도 있으면 자취방 월세까지 하나로 합칩니다.</p>
  <div class="band">
    <span>기준점 <b>${esc(d.config.anchor.roadAddress)}</b></span>
    <span>월 고정비 <b>${LIMIT}만원</b>까지</span>
    <span>걸어서 <b>${d.config.reach.walkMinMax}분</b> 안</span>
    <span>수준 <b>팟캐스트</b></span>
  </div>
</section>

<section>
  ${sec("02", "지금까지")}
  <div class="grid g3">
    ${statCard("보고 있는 자리", String(live.length), "건", live.length ? `가장 싼 곳 월 ${man(cheapest)}` : "아직 한 건도 안 걷었습니다")}
    ${statCard("시세를 채운 물건", `${priced.length}`, `/ ${needed.length}`, "필요한 물건 중 값을 아는 것")}
    ${statCard("남은 확인거리", String(tasks.length), "건", tasks[0] ? tasks[0].title : "없습니다")}
  </div>
</section>

<section>
  ${sec("03", "세 가지 안")}
  <h2>어디까지 만들지 먼저 정합니다</h2>
  <p class="lede" style="margin-bottom:18px">셋 다 팟캐스트를 찍을 수 있습니다. 차이는 앵글 수와, 남이 와서 쓸 수 있느냐입니다.</p>
  <div class="grid g3">${d.plans.map(planLine).join("")}</div>
</section>

<section>
  ${sec("04", "자리에 거는 조건")}
  <div class="rows">
    ${d.config.requirements.map((r) => `<div class="rowc">
      <div class="hd"><h3>${esc(r.label)}</h3><span class="tag${r.level === "필수" ? " on" : ""}">${esc(r.level)}</span></div>
      <p class="why">${esc(r.detail)}</p></div>`).join("")}
  </div>
</section>

<section>
  ${sec("05", "아직 모르는 것")}
  <h2>이걸 모르면 계약을 못 합니다</h2>
  <div class="rows" style="margin-top:16px">
    ${d.config.openQuestions.map((q) => `<div class="rowc">
      <div class="hd"><h3>${esc(q.q)}</h3><span class="tag${q.status === "미확인" ? " flag" : ""}">${esc(q.status)}</span></div>
      <p class="why">${esc(q.why)}</p>
      ${q.answer ? `<p class="why" style="color:var(--title);margin-top:10px"><b>${esc(q.answer)}</b></p>` : ""}
    </div>`).join("")}
  </div>
</section>

<section>
  ${sec("06", "다음에 할 일")}
  <div class="rows">
    ${tasks.filter((t) => t.area !== "확인").slice(0, 5).map((t) => `<div class="rowc">
      <div class="hd"><h3>${esc(t.title)}</h3><span class="tag">${esc(t.area)}</span></div>
      <p class="why">${esc(t.detail)}</p></div>`).join("")}
  </div>
  <div class="concl" style="margin-top:18px">이 목록은 데이터의 빈 칸에서 저절로 나옵니다.
  위의 <b>아직 모르는 것</b>까지 더하면 지금 남은 일이 ${tasks.length}건입니다.</div>
</section>`;

/* ── 자리 ─────────────────────────────────────────────────────── */

const ANCHOR = d.config.anchor.geo;
const distOf = (l) => distanceM(ANCHOR, l.geo);
// 좌표만 있는 자리도 거를 수 있어야 한다. 사람이 보통 분당 70m 정도 걷는다.
const walkish = (l) => l.commute?.walkMin ?? (distOf(l) != null ? Math.round(distOf(l) / 70) : null);

function listingCard(l) {
  const monthly = l.rent + (l.maintenance ?? 0);
  const over = monthly > LIMIT;
  const walk = l.commute?.walkMin;
  const dist = distOf(l);
  const reach = walk != null ? `걸어서 ${walk}분`
    : dist != null ? `직선 ${dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`}`
    : l.commute?.transitMin != null ? `${l.commute.transitMin}분`
    : "—";
  const tags = [];
  if (l.livable === "가능") tags.push(["잘 수 있음", "on"]);
  else if (l.livable === "불가") tags.push(["잘 수 없음", "flag"]);
  else if (l.livable === "회색") tags.push(["잘 수 있는지 애매", "flag"]);
  else tags.push(["용도 미확인", ""]);
  if (l.noiseRisk && l.noiseRisk !== "미확인") tags.push([`소음 ${l.noiseRisk}`, l.noiseRisk === "높음" ? "flag" : ""]);
  if (over) tags.push(["예산 초과", "flag"]);
  else if (COMFORT != null && monthly <= COMFORT) tags.push(["예산 안쪽", "on"]);
  if (l.status !== "candidate") tags.push([({ shortlist: "추림", contacted: "연락함", visited: "가봄", rejected: "거름", closed: "나감" })[l.status] ?? l.status, ""]);

  return `<article class="rowc" data-walk="${walkish(l) ?? ""}" data-cost="${monthly}" data-dep="${l.deposit}" data-live="${esc(l.livable)}" data-status="${esc(l.status)}">
    <div class="hd">
      <div><h3>${esc(l.title)}</h3><p class="meta">${esc(l.kind)} · ${esc(l.address)}${l.addressDetail ? ` ${esc(l.addressDetail)}` : ""}</p></div>
      <div style="text-align:right">
        <div class="big" style="justify-content:flex-end"><span class="v">${num(monthly)}</span><span class="u">만원/월</span></div>
        <div class="meta">보증금 ${man(l.deposit)}${l.maintenance != null ? ` · 관리비 ${man(l.maintenance)} 포함` : " · 관리비 미확인"}</div>
      </div>
    </div>
    <div class="facts">
      <div><div class="k">지점까지</div><div class="v">${esc(reach)}</div></div>
      <div><div class="k">면적</div><div class="v">${l.areaM2 != null ? `${l.areaM2}㎡` : "—"}</div></div>
      <div><div class="k">층</div><div class="v">${l.floor != null ? `${esc(String(l.floor))}층${l.totalFloors ? ` / ${l.totalFloors}` : ""}` : "—"}</div></div>
      <div><div class="k">천장</div><div class="v">${l.ceilingM != null ? `${l.ceilingM}m` : "—"}</div></div>
    </div>
    <div class="tags">${tags.map(([t, c]) => `<span class="tag ${c}">${esc(t)}</span>`).join("")}</div>
    ${l.notes ? `<p class="why">${esc(l.notes)}</p>` : ""}
    ${(l.unresolved ?? []).length ? `<p class="meta" style="margin-top:8px">못 채운 칸 — ${esc(l.unresolvedNote ?? "")}</p>` : ""}
    ${l.rejectReason ? `<p class="why" style="color:var(--flag)">거른 이유 — ${esc(l.rejectReason)}</p>` : ""}
    ${l.source?.url ? `<a class="src" href="${esc(l.source.url)}" target="_blank" rel="noreferrer noopener">${esc(l.source.site)}에서 본 화면 (${esc(l.source.seenAt)})</a>` : ""}
  </article>`;
}

const walks = live.map(walkish).filter((n) => Number.isFinite(n));
const STRIP_MAX = 30;
const strip = walks.length ? `
<div class="strip"><div class="track">
  <div class="ax"></div>
  ${[0, 10, 20, 30].map((m, i, a) => {
    const tx = i === 0 ? "translateX(0)" : i === a.length - 1 ? "translateX(-100%)" : "translateX(-50%)";
    return `<div class="mk" style="left:${(m / STRIP_MAX) * 100}%;transform:${tx}">${m === 0 ? "지점" : `${m}분`}</div>`;
  }).join("")}
  ${live.filter((l) => Number.isFinite(walkish(l))).map((l) => {
    const m = walkish(l);
    const p = Math.min(m / STRIP_MAX, 1) * 100;
    const over = l.rent + (l.maintenance ?? 0) > LIMIT;
    return `<div class="dot${over ? " over" : ""}" style="left:${p}%" title="${esc(l.title)} · ${l.commute?.walkMin != null ? `걸어서 ${m}분` : `직선거리로 약 ${m}분`}"></div>`;
  }).join("")}
</div></div>
<p class="meta" style="margin:0 0 24px">점 하나가 자리 하나입니다. 왼쪽일수록 사무실에서 가깝고, 붉은 점은 월 ${LIMIT}만원을 넘습니다.
길찾기 시간이 없는 자리는 직선거리를 분당 70m로 환산해 찍습니다.</p>` : "";

const listingsBody = `
<section>
  ${sec("01", "자리")}
  <h1>지점에서 걸어갈 거리</h1>
  <p class="lede">걸어서 ${d.config.reach.walkMinMax}분 안이면 1순위, 대중교통 ${d.config.reach.transitMinMax}분 안이면 후보로 둡니다.
  월세와 관리비를 더해 ${LIMIT}만원을 넘으면 붉게 칠합니다.</p>
</section>
<section>
${live.length === 0 ? empty("아직 걷은 자리가 없습니다", "네이버부동산·직방·다방·피터팬·당근을 돌면서 조건에 맞는 매물을 담으면 여기에 쌓입니다.") : `
  ${strip}
  <div class="filters">
    <div class="fgrp"><span class="fl">거리</span>
      <button class="chip" data-f="walk" data-v="10" aria-pressed="false">10분 안</button>
      <button class="chip" data-f="walk" data-v="15" aria-pressed="false">15분 안</button></div>
    <div class="fgrp"><span class="fl">월 고정비</span>
      <button class="chip" data-f="cost" data-v="${COMFORT ?? LIMIT}" aria-pressed="false">${COMFORT ?? LIMIT}만원 안</button>
      <button class="chip" data-f="cost" data-v="${LIMIT}" aria-pressed="false">${LIMIT}만원 안</button></div>
    <div class="fgrp"><span class="fl">보증금</span>
      <button class="chip" data-f="dep" data-v="3000" aria-pressed="false">3,000만 안</button>
      <button class="chip" data-f="dep" data-v="5000" aria-pressed="false">5,000만 안</button></div>
    <div class="fgrp"><span class="fl">잠</span>
      <button class="chip" data-f="live" data-v="가능" aria-pressed="false">잘 수 있는 곳만</button></div>
    <div class="fgrp"><span class="fl">진행</span>
      <button class="chip" data-f="status" data-v="shortlist" aria-pressed="false">추린 것만</button></div>
  </div>
  <div class="rows" id="list">${live.slice().sort((a, b) => (walkish(a) ?? 999) - (walkish(b) ?? 999)).map(listingCard).join("")}</div>
  <p class="meta" id="cnt" style="margin-top:14px"></p>`}
</section>
${d.listings.filter((l) => l.status === "rejected").length ? `
<section>
  ${sec("02", "거른 자리")}
  <p class="lede" style="margin-bottom:16px">같은 매물을 두 번 줍지 않으려고 남겨 둡니다.</p>
  <div class="rows">${d.listings.filter((l) => l.status === "rejected").map(listingCard).join("")}</div>
</section>` : ""}
<script>
(function(){
  var f={},cards=[].slice.call(document.querySelectorAll('#list .rowc'));
  if(!cards.length)return;
  var cnt=document.getElementById('cnt');
  function apply(){
    var n=0;
    cards.forEach(function(c){
      var ok=true;
      if(f.walk&&(!c.dataset.walk||+c.dataset.walk>+f.walk))ok=false;
      if(f.cost&&+c.dataset.cost>+f.cost)ok=false;
      if(f.dep&&+c.dataset.dep>+f.dep)ok=false;
      if(f.live&&c.dataset.live!==f.live)ok=false;
      if(f.status&&c.dataset.status!==f.status)ok=false;
      c.style.display=ok?'':'none'; if(ok)n++;
    });
    cnt.textContent=n+'건 보이는 중 (전체 '+cards.length+'건)';
  }
  document.querySelectorAll('.chip').forEach(function(b){
    b.addEventListener('click',function(){
      var k=b.dataset.f,v=b.dataset.v,on=b.getAttribute('aria-pressed')==='true';
      document.querySelectorAll('.chip[data-f="'+k+'"]').forEach(function(o){o.setAttribute('aria-pressed','false')});
      if(on){delete f[k]}else{f[k]=v;b.setAttribute('aria-pressed','true')}
      apply();
    });
  });
  apply();
})();
</script>`;

/* ── 물건(장비·인테리어) 공통 ─────────────────────────────────── */

function itemCard(it) {
  const u = unitPrice(it);
  const tot = itemTotal(it);
  return `<article class="rowc">
    <div class="hd" style="align-items:stretch">
      <div style="flex:1 1 380px">
        <h3>${esc(it.name)}${it.qty > 1 ? ` <span class="meta" style="font-weight:400">${it.qty}개</span>` : ""}</h3>
        <p class="meta">${esc(it.spec)}</p>
        <p class="why">${esc(it.why)}</p>
        ${it.how ? `<p class="why" style="color:var(--muted)">${esc(it.how)}</p>` : ""}
        ${(it.alt ?? []).length ? `<p class="why" style="color:var(--muted)">${it.alt.map(esc).join(" · ")}</p>` : ""}
        <div class="tags">
          <span class="tag${it.need === "필수" || it.need === "1안" ? " on" : ""}">${esc(it.need)}</span>
          ${(it.models ?? []).map((m) => `<span class="tag">${esc(m)}</span>`).join("")}
          <span class="tag">${it.usedOk ? "중고 가능" : "새것으로"}</span>
        </div>
        ${it.usedNote ? `<p class="meta" style="margin-top:10px">${esc(it.usedNote)}</p>` : ""}
      </div>
      <div class="qbox">
        <div class="lab">${u.price == null ? "" : u.from === "고름" ? "고른 값" : "지금까지 최저가"}</div>
        <div class="amt${u.price == null ? " none" : ""}">${u.price == null ? "시세 조사 전" : won(u.price)}</div>
        ${u.price != null ? `<div class="lab">${u.condition === "used" ? "중고" : "새것"}${it.qty > 1 ? ` · ${it.qty}개 ${won(tot)}` : ""}</div>` : ""}
        <div class="qlist">
          ${it.quotes.length === 0 ? "" : it.quotes.slice(0, 4).map((q) =>
            `<a href="${esc(q.url)}" target="_blank" rel="noreferrer noopener">${q.condition === "used" ? "중고" : "새것"} ${num(q.price)}원 · ${esc(q.site)}${q.model ? ` · ${esc(q.model)}` : ""}</a>`).join("")}
        </div>
      </div>
    </div>
  </article>`;
}

function itemsPage(rows, { n, label, h1, lede }) {
  const groups = [...new Set(rows.map((r) => r.group))];
  const done = rows.filter((r) => unitPrice(r).price != null).length;
  return `
<section>
  ${sec(n, label)}
  <h1>${esc(h1)}</h1>
  <p class="lede">${esc(lede)}</p>
  <div class="band">
    <span>품목 <b>${rows.length}개</b></span>
    <span>시세 채움 <b>${done}개</b></span>
    <span>값은 <b>최저가</b> 기준</span>
  </div>
</section>
${groups.map((g, i) => `
<section>
  ${sec(String(i + 2).padStart(2, "0"), g)}
  <div class="rows">${rows.filter((r) => r.group === g).map(itemCard).join("")}</div>
</section>`).join("")}`;
}

const gearBody = itemsPage(d.gear, {
  n: "01", label: "장비",
  h1: "팟캐스트에 필요한 만큼만",
  lede: "소리가 먼저입니다. 화질이 나쁜 영상은 보지만 소리가 나쁜 영상은 끕니다. 중고로 사도 되는 물건과 새것으로 사야 하는 물건을 갈라 두었습니다. 값은 조사한 것 중 가장 싼 것을 씁니다.",
});

const interiorBody = itemsPage(d.interior, {
  n: "01", label: "인테리어",
  h1: "공사는 안 합니다",
  lede: "뒤에 세울 벽 한 면과, 소리가 덜 울리게 하는 물건 몇 개면 됩니다. 배경은 세 가지 방법을 두고 매물이 정해지면 하나를 고릅니다. 벽에 못을 안 박는 방법을 먼저 씁니다.",
});

/* ── 예산 ─────────────────────────────────────────────────────── */

const rate = d.market.assumptions?.hourlyRate ?? null;
const monthlyLow = cheapest;

function planFull(p) {
  const byId = new Map([...d.gear, ...d.interior].map((x) => [x.id, x]));
  const c = planCost(p, d.gear, d.interior);
  const ids = [...(p.gear ?? []), ...(p.interior ?? [])];
  const byGroup = new Map();
  for (const id of ids) {
    const it = byId.get(id); if (!it) continue;
    const t = itemTotal(it);
    const cur = byGroup.get(it.group) ?? { sum: 0, missing: 0 };
    if (t == null) cur.missing++; else cur.sum += t;
    byGroup.set(it.group, cur);
  }
  return `<div class="card plan">
    <div class="nm">${esc(p.name)}</div><div class="tl">${esc(p.tagline)}</div>
    <div class="amt">${c.counted === 0 ? "조사 전" : wonMan(c.sum)}</div>
    <div class="meta">${c.missing ? `${c.missing}개 품목은 아직 값을 모릅니다 — 실제로는 더 듭니다` : `${c.total}개 품목 전부 반영`}</div>
    <table style="margin-top:16px">
      <tbody>
      ${[...byGroup].map(([g, v]) => `<tr><td>${esc(g)}</td><td class="r mono">${
        v.sum ? `${won(v.sum)}${v.missing ? ` <span class="meta">+${v.missing}개 미조사</span>` : ""}`
              : `<span class="meta">${v.missing}개 미조사</span>`}</td></tr>`).join("")}
      </tbody>
    </table>
    <p class="why" style="margin-top:14px">${esc(p.note)}</p>
    ${p.cut.length ? `<ul>${p.cut.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

const planBody = `
<section>
  ${sec("01", "예산")}
  <h1>한 번 쓰는 돈과<br>매달 나가는 돈</h1>
  <p class="lede">장비와 인테리어는 처음 한 번입니다. 월세·관리비·공과금은 매달 나갑니다.
  둘을 섞어서 보면 판단이 흐려지니 갈라 둡니다.</p>
</section>

<section>
  ${sec("02", "한 번 쓰는 돈")}
  <div class="grid g3">${d.plans.map(planFull).join("")}</div>
  <div class="concl" style="margin-top:18px">값이 비어 있는 품목이 있으면 합계는 <b>아래쪽 추정</b>입니다.
  시세를 다 걷기 전까지는 이 숫자로 결정하지 않습니다.</div>
</section>

<section>
  ${sec("03", "매달 나가는 돈")}
  <div class="grid g3">
    ${statCard("상한", String(LIMIT), "만원/월", "이 위로는 부담입니다")}
    ${statCard("편한 선", String(COMFORT ?? "—"), "만원/월", "여기 아래면 고민이 없습니다")}
    ${statCard("지금 가장 싼 자리", monthlyLow != null ? String(monthlyLow) : "—", monthlyLow != null ? "만원/월" : "", monthlyLow != null ? "월세 + 관리비" : "자리를 아직 안 걷었습니다")}
  </div>
  <div class="concl" style="margin-top:16px">여기 숫자는 <b>월세와 관리비</b>만입니다.
  전기·수도·인터넷은 계약하고 한 달을 살아 봐야 압니다. 조명 3~4개를 매일 켜면 전기가 더 나옵니다.</div>
</section>

<section>
  ${sec("04", "빌려주면 얼마나 메우나")}
  ${d.market.rates.length === 0
    ? empty("대관 시세를 아직 안 걷었습니다", "스페이스클라우드에서 광진구·성수·건대 촬영 스튜디오의 시간당 가격을 모으면, 월 고정비를 몇 시간 빌려주면 메우는지 여기에 나옵니다.")
    : `<div class="grid g3">
        ${statCard("시간당", rate != null ? num(rate) : "—", "원", `조사한 ${d.market.rates.length}곳의 중앙값`)}
        ${statCard("본전까지", rate && monthlyLow ? String(Math.ceil((monthlyLow * 10000) / rate)) : "—", "시간/월", "월세와 관리비를 메우는 데 필요한 대관 시간")}
        ${statCard("주말만 쓰면", rate && monthlyLow ? String(Math.ceil((monthlyLow * 10000) / rate / 8)) : "—", "일/월", "하루 8시간으로 계산")}
      </div>
      <table style="margin-top:20px">
        <thead><tr><th>스튜디오</th><th>동네</th><th class="r">시간당</th></tr></thead>
        <tbody>${d.market.rates.map((r) => `<tr><td><a href="${esc(r.url)}" target="_blank" rel="noreferrer noopener">${esc(r.name)}</a></td><td>${esc(r.area ?? "—")}</td><td class="r mono">${num(r.hourlyKRW)}원</td></tr>`).join("")}</tbody>
      </table>`}
</section>`;

/* ── 일지 ─────────────────────────────────────────────────────── */

const logBody = `
<section>
  ${sec("01", "일지")}
  <h1>무엇을 보고<br>무엇을 걸렀는가</h1>
  <p class="lede">조사 루프가 하루에 여러 번 씁니다. 나중에 "왜 이 동네를 뺐더라" 를 다시 묻지 않으려고 남깁니다.</p>
</section>
<section>
  <div class="card">
    ${d.log.slice().reverse().map((e) => `<div class="tl-item">
      <div><div class="dt">${esc(e.date)}</div><div class="meta">${esc(e.by)} · ${esc(e.kind ?? "")}</div></div>
      <div><h3 style="font-size:15px">${esc(e.summary)}</h3>
      ${e.detail ? `<p class="why">${esc(e.detail)}</p>` : ""}
      ${(e.refs ?? []).length ? `<div class="tags">${e.refs.map((r) => `<a class="tag" href="${esc(r)}" target="_blank" rel="noreferrer noopener" style="text-decoration:none">출처</a>`).join("")}</div>` : ""}
      </div></div>`).join("")}
  </div>
</section>`;

/* ── 굽기 ─────────────────────────────────────────────────────── */

if (existsSync("dist")) rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

const PAGES = [
  ["index.html", "개요", "/", indexBody],
  ["listings.html", "자리", "/listings", listingsBody],
  ["gear.html", "장비", "/gear", gearBody],
  ["interior.html", "인테리어", "/interior", interiorBody],
  ["plan.html", "예산", "/plan", planBody],
  ["log.html", "일지", "/log", logBody],
];
for (const [file, title, path, body] of PAGES) {
  writeFileSync(`dist/${file}`, page({ title, path, body }), "utf8");
}
console.log(`구움 — ${PAGES.length}쪽 · 자리 ${live.length} · 물건 ${d.gear.length + d.interior.length} · 할 일 ${tasks.length}`);
