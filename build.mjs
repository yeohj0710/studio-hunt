/**
 * data/*.json → dist/*.html 을 굽는다.
 *
 * 프레임워크를 안 쓴다. node 기본만 쓴다. 의존성이 없으니 깨질 데가 적다.
 * 데이터가 비어 있어도 페이지는 나온다. 빈 칸에는 "아직 없다" 와 무엇을 채워야 하는지가 뜬다.
 *
 * 화면의 원칙
 *  1. 결론과 다음 행동을 맨 위에 둔다. 설명은 그 아래.
 *  2. 스무 곳을 비교할 때는 카드가 아니라 표를 쓴다.
 *  3. 조사한 숫자와 가정한 숫자를 눈으로 갈라 놓는다(가정에는 점선 밑줄과 꼬리표).
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
/* 보증금은 억이 넘어간다. 17,700만원이라고 쓰면 자릿수를 세게 된다. */
const eok = (n) => {
  if (n == null) return null;
  if (n < 10000) return `${num(n)}만원`;
  const e = Math.floor(n / 10000), rest = n % 10000;
  return rest ? `${e}억 ${num(rest)}만원` : `${e}억원`;
};

/* 보증금을 월 부담으로 바꿀 때 쓰는 연이율. 조사한 값이 아니라 가정이다.
   보증금은 돌려받지만 묶여 있는 동안 이자를 못 받으니, 그만큼을 월세에 얹어 본다. */
const RATE_DEFAULT = 3.5;
const RATE_OPTIONS = [2.5, 3.5, 4.5, 6.0];
const realMonthly = (l, rate = RATE_DEFAULT) => l.rent + (l.maintenance ?? 0) + (l.deposit * rate / 100) / 12;

/* ── 값 고르기 ─────────────────────────────────────────────────── */

const minBy = (arr) => (arr.length ? arr.reduce((a, b) => (b.price < a.price ? b : a)) : null);
const qNew = (it) => minBy((it.quotes ?? []).filter((q) => q.condition === "new"));
const qUsed = (it) => (it.usedOk ? minBy((it.quotes ?? []).filter((q) => q.condition === "used")) : null);
/** mode: "new" 새것만 · "used" 중고 먼저 · "cheap" 무조건 싼 것 */
function pickQuote(it, mode) {
  if (it.chosen) return { price: it.chosen.price, condition: it.chosen.condition, site: it.chosen.site, url: it.chosen.url, model: it.chosen.model, fixed: true };
  const n = qNew(it), u = qUsed(it);
  if (mode === "new") return n ?? u;
  if (mode === "used") return u ?? n;
  if (n && u) return u.price <= n.price ? u : n;
  return n ?? u;
}
const itemSum = (it, mode) => { const q = pickQuote(it, mode); return q ? q.price * it.qty : null; };

const ITEMS = [...d.gear, ...d.interior];
const byId = new Map(ITEMS.map((x) => [x.id, x]));
const planItems = (p) => [...(p.gear ?? []), ...(p.interior ?? [])].map((id) => byId.get(id)).filter(Boolean);
function planSum(p, mode) {
  let sum = 0, missing = 0;
  for (const it of planItems(p)) { const t = itemSum(it, mode); if (t == null) missing++; else sum += t; }
  return { sum, missing, total: planItems(p).length };
}
const planOf = new Map(ITEMS.map((x) => [x.id, d.plans.filter((p) => planItems(p).some((y) => y.id === x.id)).map((p) => p.id)]));

/* ── 자리 ─────────────────────────────────────────────────────── */

const ANCHOR = d.config.anchor.geo;
const live = d.listings.filter((l) => l.status !== "rejected" && l.status !== "closed");
const dropped = d.listings.filter((l) => l.status === "rejected" || l.status === "closed");
const walkish = (l) => l.commute?.walkMin ?? (distanceM(ANCHOR, l.geo) != null ? Math.round(distanceM(ANCHOR, l.geo) / 70) : null);
const ranked = live.slice().sort((a, b) => realMonthly(a) - realMonthly(b));

/* 같은 방이 사이트마다 다른 제목으로 올라온다. 주소와 금액이 같으면 표시만 해 둔다. */
const dupKey = (l) => `${(l.address || "").replace(/\s/g, "")}|${l.deposit}|${l.rent}|${l.areaM2}`;
const dupCount = live.reduce((m, l) => (m.set(dupKey(l), (m.get(dupKey(l)) ?? 0) + 1), m), new Map());
const isDup = (l) => dupCount.get(dupKey(l)) > 1;

const cheapestMonthly = live.map((l) => l.rent + (l.maintenance ?? 0)).sort((a, b) => a - b)[0] ?? null;
const RATE = d.market.assumptions?.hourlyRate ?? null;

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
:root{--bg:#EAF1F3;--card:#FFFFFF;--stroke:#D9E5E8;--title:#0F262C;--body:#40565C;--muted:#8CA3A9;
  --accent:#0E7490;--accent-soft:#E4F1F4;--flag:#9E4A3A;--flag-soft:#FCF6F4;--good:#2F6E5A}
a{color:inherit}
h1,h2,h3,h4{color:var(--title);margin:0;font-weight:700;letter-spacing:-0.025em;line-height:1.34}
p{margin:0}
.n,.mono{font-family:Inter,Pretendard,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:-0.02em}

.wrap{max-width:1100px;margin:0 auto;padding:0 26px}
.top{position:sticky;top:0;z-index:30;background:rgba(234,241,243,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--stroke)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:20px;height:60px}
.mark{display:flex;align-items:baseline;gap:9px;text-decoration:none}
.mark b{font-size:14.5px;color:var(--title);letter-spacing:-0.02em}
.mark span{font-family:Inter,sans-serif;font-size:10px;letter-spacing:.18em;color:var(--muted);text-transform:uppercase}
nav{display:flex;gap:2px;flex-wrap:wrap}
nav a{text-decoration:none;font-size:13.5px;color:var(--body);padding:5px 11px;border-radius:99px;white-space:nowrap}
nav a:hover{color:var(--title)}
nav a[aria-current]{background:var(--title);color:#fff}

main{padding:52px 0 96px}
section{margin-bottom:52px}
.eyebrow{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);margin-bottom:14px;letter-spacing:.02em}
.eyebrow .n{color:var(--accent);font-weight:600}
.eyebrow .bar{width:14px;height:1px;background:var(--stroke)}
h1{font-size:clamp(26px,4.2vw,36px);margin-bottom:14px}
.lede{font-size:16.5px;color:var(--body);max-width:64ch}
h2{font-size:21px;margin-bottom:10px}
h3{font-size:16.5px}
.note{font-size:13px;color:var(--muted);max-width:74ch}

.band{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.band span{background:#fff;border:1px solid var(--stroke);border-radius:99px;padding:5px 13px;font-size:12.5px;color:var(--body)}
.band span b{color:var(--title);font-weight:600}

.card{background:var(--card);border:1px solid var(--stroke);border-radius:14px;padding:22px 24px}
.grid{display:grid;gap:14px}
.g4{grid-template-columns:repeat(4,1fr)}
.g3{grid-template-columns:repeat(3,1fr)}
.g2{grid-template-columns:repeat(2,1fr)}
@media(max-width:900px){.g4{grid-template-columns:repeat(2,1fr)}}
@media(max-width:820px){.g3,.g2{grid-template-columns:1fr}}

.stat .lab{font-size:12.5px;color:var(--muted);margin-bottom:6px}
.big{display:flex;align-items:baseline;gap:5px}
.big .v{font-family:Inter,sans-serif;font-size:32px;font-weight:600;color:var(--title);line-height:1.1;letter-spacing:-0.03em}
.big .v.none{font-size:17px;font-weight:400;color:var(--muted);letter-spacing:0}
.big .u{font-size:13px;color:var(--muted)}
.stat .sub{font-size:12.5px;color:var(--muted);margin-top:7px}

.concl{background:#fff;border:1px solid var(--stroke);border-left:3px solid var(--accent);border-radius:0 14px 14px 0;padding:18px 22px;font-size:14px}
.concl b{color:var(--title)}
.warnbox{background:var(--flag-soft);border:1px solid #E3CBC5;border-radius:14px;padding:16px 20px;font-size:14px;color:#7C3B2E}
.warnbox b{color:#5E2C21}

.empty{border:1px dashed #C4D5DA;border-radius:14px;padding:30px 24px;text-align:center;color:var(--muted);font-size:14px;background:rgba(255,255,255,.5)}
.empty b{display:block;color:var(--title);font-size:15px;margin-bottom:6px;font-weight:600}

.rows{display:flex;flex-direction:column;gap:12px}
.rowc{background:#fff;border:1px solid var(--stroke);border-radius:14px;padding:18px 22px}
.rowc .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}
.rowc .why{font-size:14px;color:var(--body);margin-top:8px;max-width:76ch}
.meta{font-size:12.5px;color:var(--muted);margin-top:3px}
.sep{display:inline-block;width:1px;height:9px;background:var(--stroke);margin:0 8px;vertical-align:baseline}

.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.tag{font-size:11.5px;border:1px solid var(--stroke);border-radius:6px;padding:2px 8px;color:var(--body);background:#F7FAFB;white-space:nowrap}
.tag.on{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
.tag.flag{border-color:#E3CBC5;color:var(--flag);background:var(--flag-soft)}
.tag.good{border-color:#BFD9CE;color:var(--good);background:#EFF6F3}

/* 조사한 값이 아니라 계산해서 얹은 값 */
.calc{border-bottom:1px dotted var(--muted);cursor:help}

.src{display:inline-block;margin-top:12px;font-size:12.5px;color:var(--accent);text-decoration:none;border-bottom:1px solid rgba(14,116,144,.28)}
.src:hover{border-bottom-color:var(--accent)}

/* 읽는 법 표 */
.howto{width:100%;border-collapse:collapse;font-size:14px;background:#fff;border:1px solid var(--stroke);border-radius:14px;overflow:hidden}
.howto th{background:#F3F8F9;font-size:12px;color:var(--muted);font-weight:500;text-align:left;padding:10px 16px;border-bottom:1px solid var(--stroke)}
.howto td{padding:13px 16px;border-bottom:1px solid #EEF4F5;vertical-align:top;color:var(--body)}
.howto tr:last-child td{border-bottom:0}
.howto td:first-child{white-space:nowrap}
.howto a{color:var(--accent);font-weight:600;text-decoration:none;border-bottom:1px solid rgba(14,116,144,.3)}
.howto .state{color:var(--muted);font-size:13px;white-space:nowrap}
@media(max-width:760px){
  .howto,.howto tbody,.howto tr,.howto td{display:block;width:100%}
  .howto thead{display:none}
  .howto tr{border-bottom:1px solid var(--stroke);padding:6px 0}
  .howto tr:last-child{border-bottom:0}
  .howto td{border-bottom:0;padding:3px 16px}
  .howto td:first-child{padding-top:12px;font-weight:600}
  .howto td:last-child{padding-bottom:12px}
}

/* 단계 */
.steps{counter-reset:s;display:flex;flex-direction:column;gap:12px}
.step{position:relative;background:#fff;border:1px solid var(--stroke);border-radius:14px;padding:18px 22px 18px 62px}
.step::before{counter-increment:s;content:counter(s);position:absolute;left:20px;top:18px;
  width:26px;height:26px;border-radius:50%;background:var(--title);color:#fff;
  font-family:Inter,sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center}
.step h3{font-size:16px}
.step p{font-size:14px;color:var(--body);margin-top:6px;max-width:74ch}
.step .who{position:absolute;right:20px;top:18px}
@media(max-width:600px){.step{padding:16px 18px 16px 54px}.step .who{position:static;display:inline-block;margin-top:10px}}

/* 표 */
.tblwrap{overflow-x:auto;background:#fff;border:1px solid var(--stroke);border-radius:14px}
table.data{width:100%;border-collapse:collapse;font-size:13.5px;min-width:760px}
table.data th{position:sticky;top:0;background:#F3F8F9;text-align:left;font-weight:500;color:var(--muted);
  font-size:12px;padding:11px 12px;border-bottom:1px solid var(--stroke);white-space:nowrap;z-index:1}
table.data th.s{cursor:pointer;user-select:none}
table.data th.s:hover{color:var(--title)}
table.data th[aria-sort]{color:var(--accent)}
table.data th[aria-sort]::after{content:" ↓"}
table.data th[aria-sort="ascending"]::after{content:" ↑"}
table.data td{padding:11px 12px;border-bottom:1px solid #EEF4F5;color:var(--body);vertical-align:middle;white-space:nowrap}
table.data tr:last-child td{border-bottom:0}
table.data td.r,table.data th.r{text-align:right}
table.data td.name{white-space:normal;min-width:200px}
table.data td.name b{color:var(--title);font-weight:600}
table.data tbody tr.pick{background:#F7FBFB}
table.data tbody tr:hover{background:#F3F8F9}
table.data .rank{font-family:Inter,sans-serif;color:var(--muted);font-size:12px}
table.data .strong{color:var(--title);font-weight:600}
table.data .over{color:var(--flag)}
table.data a.go{color:var(--accent);text-decoration:none;border-bottom:1px solid rgba(14,116,144,.3);font-size:12.5px}
/* 좁은 화면에서는 실부담이 옆으로 밀려 안 보인다. 이름 밑에 한 줄로 같이 적는다. */
.monly{display:none}
@media(max-width:760px){
  .monly{display:block;font-size:12.5px;color:var(--title);margin-top:3px}
  .monly b{font-weight:600}
  #tbl{min-width:560px}
  #tbl td.name{min-width:150px}
  #tbl th:nth-child(6),#tbl td:nth-child(6),#tbl th:nth-child(8),#tbl td:nth-child(8){display:none}
}
tr.detail td{background:#F7FAFB;white-space:normal;padding:16px 18px;font-size:13.5px}
tr.detail ul{margin:6px 0 0;padding-left:17px}
tr.detail li{margin-bottom:3px}
.expand{background:none;border:0;padding:0;font-family:inherit;font-size:12.5px;color:var(--accent);cursor:pointer;border-bottom:1px solid rgba(14,116,144,.3)}

/* 제어판 */
.panel{background:#fff;border:1px solid var(--stroke);border-radius:14px;padding:18px 22px;margin-bottom:16px}
.panel .row{display:flex;flex-wrap:wrap;gap:20px 28px;align-items:flex-end}
.fld{display:flex;flex-direction:column;gap:6px;min-width:150px}
.fld .fl{font-size:12px;color:var(--muted)}
.fld .fv{font-family:Inter,sans-serif;font-size:15px;color:var(--title);font-weight:600}
input[type=range]{width:220px;accent-color:var(--accent)}
select{font-family:inherit;font-size:14px;color:var(--title);background:#fff;border:1px solid var(--stroke);
  border-radius:9px;padding:8px 11px;max-width:340px}
.chip{font-size:12.5px;border:1px solid var(--stroke);background:#fff;color:var(--body);border-radius:99px;
  padding:5px 13px;cursor:pointer;font-family:inherit}
.chip[aria-pressed="true"]{background:var(--title);border-color:var(--title);color:#fff}
.chips{display:flex;gap:6px;flex-wrap:wrap}

/* 합계 띠 */
.sumbar{position:sticky;top:60px;z-index:20;background:var(--title);color:#fff;border-radius:14px;
  padding:14px 22px;display:flex;align-items:baseline;gap:8px 22px;flex-wrap:wrap;margin-bottom:16px}
.sumbar .l{font-size:12.5px;color:#9FBAC1}
.sumbar .v{font-family:Inter,sans-serif;font-size:25px;font-weight:600;letter-spacing:-0.03em}
.sumbar .x{font-size:13px;color:#9FBAC1}
@media(max-width:680px){.sumbar{top:0}}

/* 거리 띠 */
.strip{height:66px;margin:8px 0 10px;background:#fff;border:1px solid var(--stroke);border-radius:12px;padding:0 18px}
.track{position:relative;height:100%}
.track .ax{position:absolute;top:44%;left:0;right:0;height:1px;background:var(--stroke)}
.track .mk{position:absolute;top:calc(44% + 9px);transform:translateX(-50%);font-size:11px;color:var(--muted);white-space:nowrap}
.track .dot{position:absolute;top:44%;transform:translate(-50%,-50%);width:9px;height:9px;border-radius:50%;
  background:var(--accent);border:2px solid #fff;box-shadow:0 0 0 1px var(--accent)}
.track .dot.over{background:var(--flag);box-shadow:0 0 0 1px var(--flag)}

/* 계산기 결과 */
.calcout{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
@media(max-width:820px){.calcout{grid-template-columns:1fr}}
.bill{background:#fff;border:1px solid var(--stroke);border-radius:14px;padding:20px 22px}
.bill h3{font-size:15px;margin-bottom:4px}
.bill .cap{font-size:12.5px;color:var(--muted);margin-bottom:14px}
.bill table{width:100%;border-collapse:collapse;font-size:13.5px}
.bill td{padding:7px 0;border-bottom:1px solid #EEF4F5;color:var(--body)}
.bill td.r{text-align:right;font-family:Inter,sans-serif;font-variant-numeric:tabular-nums;color:var(--title)}
.bill tr.tot td{border-bottom:0;border-top:1px solid var(--stroke);padding-top:12px;font-weight:600;color:var(--title)}
.bill tr.tot td.r{font-size:19px}

.plan{display:flex;flex-direction:column;height:100%}
.plan .nm{font-size:18px;color:var(--title);font-weight:700}
.plan .tl{font-size:13px;color:var(--muted);margin-top:3px}
.plan .amt{font-family:Inter,sans-serif;font-size:28px;font-weight:600;color:var(--title);margin:16px 0 2px;letter-spacing:-0.03em}
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
  .top{position:static}
  .top .wrap{height:auto;min-height:52px;flex-wrap:wrap;gap:4px 14px;padding-top:11px;padding-bottom:11px}
  .mark b{white-space:nowrap}
  .mark span{display:none}
  nav a{padding:4px 9px;font-size:13px}
  main{padding:32px 0 72px}
  section{margin-bottom:40px}
  .card,.rowc{padding:18px}
  .rowc .hd{gap:10px}
  input[type=range]{width:100%}
  .fld{min-width:100%}
}
`;

function page({ title, path, body, lead }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}, 구의동 스튜디오</title>
<meta name="description" content="${esc(lead ?? "신용보증기금 광진지점에서 걸어갈 거리에 팟캐스트 스튜디오를 얻는 계획. 자리 비교표, 장비 최저가, 예산 계산기.")}">
<meta property="og:title" content="${esc(title)}, 구의동 스튜디오">
<meta property="og:description" content="사무실에서 걸어갈 거리에 스튜디오를 얻는 계획.">
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
  마지막 갱신 ${esc(d.config.updatedAt)}<span class="sep"></span>자리 ${d.listings.length}건<span class="sep"></span>물건 ${ITEMS.length}개<span class="sep"></span>대관 시세 ${d.market.rates.length}곳<br>
  값은 조사한 화면에서 그대로 옮긴 것입니다. 점선 밑줄이 그어진 숫자는 조사값이 아니라 계산해서 얹은 값입니다.
</footer>
</body></html>`;
}

const sec = (n, label) => `<div class="eyebrow"><span class="n">${n}</span><span class="bar"></span>${esc(label)}</div>`;
const empty = (t, s) => `<div class="empty"><b>${esc(t)}</b>${esc(s)}</div>`;

function statCard(lab, v, u, sub) {
  const none = v === "미확인" || v === "조사 전" || v == null;
  return `<div class="card stat"><div class="lab">${esc(lab)}</div>
    <div class="big"><span class="v${none ? " none" : ""}">${esc(none ? "아직 없음" : v)}</span>${u && !none ? `<span class="u">${esc(u)}</span>` : ""}</div>
    <div class="sub">${esc(sub)}</div></div>`;
}

/* ── 개요 ─────────────────────────────────────────────────────── */

const needed = ITEMS.filter((x) => ["필수", "권장", "1안", "2안"].includes(x.need));
const neededPriced = needed.filter((x) => pickQuote(x, "cheap") != null);
const openLeft = d.config.openQuestions.filter((q) => q.status !== "확인");

const sumA = planSum(d.plans[0], "cheap"), sumB = planSum(d.plans[1], "cheap"), sumC = planSum(d.plans[2], "cheap");
const planB = d.plans[1];
const bNew = planSum(planB, "new"), bUsed = planSum(planB, "used");

/* 개요의 순위는 "걸어서 15분 안"이라는 1순위 조건을 먼저 건다.
   그걸 안 걸면 29분짜리 자리가 1등으로 올라와서 사이트가 스스로 모순된다. */
const WALK_OK = d.config.reach.walkMinMax;
const nearby = ranked.filter((l) => walkish(l) != null && walkish(l) <= WALK_OK);
/* 같은 방이 사이트마다 다른 제목으로 올라온다. 개요의 세 자리를 중복으로 채우면 볼 게 두 곳뿐이다. */
const uniq = (rows) => { const seen = new Set(); return rows.filter((l) => (seen.has(dupKey(l)) ? false : (seen.add(dupKey(l)), true))); };
const top3 = uniq(nearby.length >= 3 ? nearby : ranked).slice(0, 3);
const farOut = live.length - nearby.length;
const bigDeposit = live.filter((l) => l.deposit >= 10000);
const bigDepRents = bigDeposit.map((l) => l.rent + (l.maintenance ?? 0)).sort((a, b) => a - b);
const cheapReal = Math.round(Math.min(...live.map((l) => realMonthly(l))));

const HOWTO = [
  ["/listings", "자리",
    `광진구 원룸과 상가 ${live.length}곳을 한 표에 놓고 보증금, 월세, 걸어가는 시간으로 거릅니다. 보러 갈 세 곳을 여기서 고릅니다.`,
    "조사 끝, 고르는 건 사람"],
  ["/gear", "장비",
    `녹음과 촬영에 필요한 ${d.gear.length}개 품목입니다. 물건마다 새것 최저가와 중고 시세를 붙여 뒀습니다.`,
    `${d.gear.length}개 값 확인`],
  ["/interior", "인테리어",
    `배경을 만드는 세 가지 방법과 소리를 잡는 물건 ${d.interior.length}개입니다. 공사는 안 하는 쪽으로 짰습니다.`,
    `${d.interior.length}개 값 확인`],
  ["/plan", "예산",
    "자리 하나와 만드는 수준 하나를 고르면 계약할 때 나가는 현금, 매달 나가는 돈, 빌려줘서 메우는 시간이 바로 나옵니다.",
    "계산기"],
  ["/log", "일지",
    `무엇을 봤고 무엇을 걸렀는지 ${d.log.length}줄입니다. 같은 매물을 두 번 줍지 않으려고 남깁니다.`,
    `${d.log.length}줄`],
];

const STEPS = [
  ["보증금을 얼마까지 넣을지 정합니다", "사용자",
    `이걸 안 정하면 후보가 안 줄어듭니다. 지금 ${live.length}곳 중 ${bigDeposit.length}곳은 보증금이 1억을 넘고, 그중 가장 비싼 자리가 ${eok(Math.max(...live.map((l) => l.deposit)))}입니다. 이런 자리는 월세가 ${man(bigDepRents[0])}에서 ${man(bigDepRents[bigDepRents.length - 1])}이라 표에서 싸 보이지만 목돈이 통째로 묶입니다. <a class="src" style="margin:0" href="/listings">자리 표</a>의 보증금 손잡이를 움직이면 그 자리에서 몇 곳이 남는지 보입니다.`],
  ["남은 자리에 전화해서 다섯 가지를 묻습니다", "사용자",
    "촬영하고 빌려줘도 되는지, 전입신고가 되는지, 최소 계약이 몇 달인지, 전기 용량이 얼마인지, 배경 세울 빈 벽이 한 면 있는지. 전화는 사람이 겁니다. 조사 루프는 임대인과 중개사에게 연락하지 않습니다."],
  ["가서 소리를 들어 봅니다", "사용자",
    "말소리만 담는 팟캐스트라 방음 공사는 안 합니다. 대신 큰길 소리, 지하철 진동, 실외기 소리가 방에 들어오는지는 가 봐야 압니다. 휴대폰 녹음기를 켜고 30초만 서 있으면 됩니다."],
  ["만드는 수준을 고르고 장비를 삽니다", "사용자",
    `세 가지 안이 있습니다. 지금 시세로 ${wonMan(sumA.sum)}, ${wonMan(sumB.sum)}, ${wonMan(sumC.sum)}입니다. 자리를 정하기 전에도 소리 장비는 먼저 사도 됩니다. 어느 방에서든 똑같이 씁니다.`],
];

const indexBody = `
<section>
  ${sec("01", "무슨 일인가")}
  <h1>구의동에 팟캐스트<br>스튜디오를 얻습니다</h1>
  <p class="lede">사무실이 신용보증기금 광진지점입니다. 걸어 다닐 거리에 방을 하나 얻어 팟캐스트를 찍고,
  남는 시간에는 빌려줍니다. 잘 수 있는 자리면 자취방 월세까지 하나로 합칩니다.
  이 사이트는 그 결정에 필요한 숫자를 모아 둔 곳입니다.</p>
  <div class="band">
    <span>기준점 <b>${esc(d.config.anchor.roadAddress)}</b></span>
    <span>월 고정비 <b>${LIMIT}만원</b>까지</span>
    <span>걸어서 <b>${d.config.reach.walkMinMax}분</b> 안</span>
    <span>조사 <b>${live.length}곳</b> 끝</span>
  </div>
</section>

<section>
  ${sec("02", "이 사이트 읽는 법")}
  <h2>다섯 쪽이고, 하는 일이 다 다릅니다</h2>
  <p class="note" style="margin-bottom:16px">조사는 거의 끝났습니다. 남은 건 고르는 일이고, 그건 사람이 합니다.</p>
  <table class="howto">
    <thead><tr><th>쪽</th><th>거기서 하는 일</th><th>지금</th></tr></thead>
    <tbody>
      ${HOWTO.map(([href, name, what, state]) => `<tr>
        <td><a href="${href}">${esc(name)}</a></td>
        <td>${esc(what)}</td>
        <td class="state">${esc(state)}</td></tr>`).join("")}
    </tbody>
  </table>
</section>

<section>
  ${sec("03", "지금 상태")}
  <div class="grid g4">
    ${statCard("보고 있는 자리", String(live.length), "곳", `걸어서 ${WALK_OK}분 안이 ${nearby.length}곳, 실부담이 가장 낮은 곳이 월 ${man(cheapReal)}`)}
    ${statCard("값을 아는 물건", String(neededPriced.length), `/ ${needed.length}개`, "꼭 사야 하거나 사면 좋은 물건 기준")}
    ${statCard("장비 한 번 값", wonMan(sumB.sum), "", `두 앵글 기준. 다 새것으로 사면 ${wonMan(bNew.sum)}`)}
    ${statCard("남은 확인거리", String(openLeft.length), "건", openLeft.length ? openLeft[0].q : "계약 전에 확인할 것은 다 정리했습니다")}
  </div>
</section>

<section>
  ${sec("04", "지금 당장 할 일")}
  <h2>여기서 막혀 있습니다</h2>
  <p class="note" style="margin-bottom:16px">조사로 채울 칸은 거의 다 찼습니다. 아래 네 가지는 사람이 해야 넘어갑니다.</p>
  <div class="steps">
    ${STEPS.map(([t, who, body]) => `<div class="step">
      <span class="tag on who">${esc(who)}가 합니다</span>
      <h3>${esc(t)}</h3><p>${body}</p></div>`).join("")}
  </div>
</section>

<section>
  ${sec("05", "지금 순위")}
  <h2>월세만 보면 순위가 뒤집힙니다</h2>
  <p class="lede" style="margin-bottom:16px">보증금 ${eok(Math.max(...live.map((l) => l.deposit)))}짜리 자리가 월 ${man(cheapestMonthly)}으로 표에서 제일 싸게 뜹니다.
  목돈이 묶이는 값을 안 세서 그렇습니다. 월세와 관리비에, 보증금에 연 ${RATE_DEFAULT}%를 매겨 12로 나눈 값을 얹은 것이 <b>실부담</b>입니다.
  걸어서 ${WALK_OK}분 안으로 확인한 ${nearby.length}곳만 놓고 세우면 이렇게 됩니다.</p>
  <div class="tblwrap">
    <table class="data" style="min-width:620px">
      <thead><tr><th></th><th>자리</th><th class="r">보증금</th><th class="r">월세 + 관리비</th><th class="r">실부담</th><th class="r">걸어서</th></tr></thead>
      <tbody>
        ${top3.map((l, i) => `<tr class="pick">
          <td class="rank">${i + 1}</td>
          <td class="name"><b>${esc(l.title)}</b><br><span class="meta">${esc(l.address)}</span></td>
          <td class="r mono">${eok(l.deposit)}</td>
          <td class="r mono">${man(l.rent + (l.maintenance ?? 0))}</td>
          <td class="r mono strong"><span class="calc" title="월세 + 관리비 + 보증금 × 연 ${RATE_DEFAULT}% ÷ 12">${man(Math.round(realMonthly(l)))}</span></td>
          <td class="r mono">${walkish(l) != null ? `${walkish(l)}분` : "미확인"}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>
  <p class="note" style="margin-top:12px">연 ${RATE_DEFAULT}%는 조사한 값이 아니라 가정입니다.
  보증금은 나갈 때 돌려받지만 묶여 있는 동안 이자를 못 받으니 그만큼을 월세에 얹어 본 것입니다.
  ${farOut}곳은 걸어서 ${WALK_OK}분을 넘거나 길찾기 화면을 못 읽어서 이 표에서 뺐습니다.
  <a class="src" style="margin:0" href="/listings">자리 표에서 이율과 조건을 바꿔 보기</a></p>
</section>

<section>
  ${sec("06", "세 가지 안")}
  <h2>어디까지 만들지 먼저 정합니다</h2>
  <p class="lede" style="margin-bottom:18px">셋 다 팟캐스트를 찍을 수 있습니다. 차이는 카메라 대수와, 남이 와서 쓸 수 있느냐입니다.</p>
  <div class="grid g3">
    ${d.plans.map((p) => {
      const c = planSum(p, "cheap");
      return `<a class="card plan" style="text-decoration:none" href="/plan">
        <div class="nm">${esc(p.name)}</div><div class="tl">${esc(p.tagline)}</div>
        <div class="amt">${c.sum ? wonMan(c.sum) : "조사 전"}</div>
        <div class="sub" style="font-size:12.5px;color:var(--muted)">${c.missing ? `${c.missing}개 품목은 값을 아직 모릅니다` : `${c.total}개 품목, 중고까지 넣어 가장 싼 값`}</div>
        <p class="why" style="margin-top:14px">${esc(p.for)}</p></a>`;
    }).join("")}
  </div>
</section>

<section>
  ${sec("07", "자리에 거는 조건")}
  <div class="rows">
    ${d.config.requirements.map((r) => `<div class="rowc">
      <div class="hd"><h3>${esc(r.label)}</h3><span class="tag${r.level === "필수" ? " on" : ""}">${esc(r.level)}</span></div>
      <p class="why">${esc(r.detail)}</p></div>`).join("")}
  </div>
</section>

<section>
  ${sec("08", "계약 전에 확인할 것")}
  <h2>여기서 걸리면 자리를 바꿔야 합니다</h2>
  <p class="note" style="margin-bottom:16px">법 해석을 지어내지 않았습니다. 아래 답은 전부 공식 문서에서 확인한 것이고, 출처를 달아 뒀습니다.</p>
  <div class="rows">
    ${d.config.openQuestions.map((q) => `<div class="rowc">
      <div class="hd"><h3>${esc(q.q)}</h3><span class="tag${q.status === "확인" ? " good" : " flag"}">${esc(q.status)}</span></div>
      <p class="why">${esc(q.why)}</p>
      ${q.answer ? `<p class="why" style="color:var(--title)"><b>${esc(q.answer)}</b></p>` : ""}
      ${(q.sources ?? []).length ? `<div class="tags">${q.sources.map((s, i) => `<a class="tag" href="${esc(s)}" target="_blank" rel="noreferrer noopener" style="text-decoration:none">근거 ${i + 1}</a>`).join("")}</div>` : ""}
    </div>`).join("")}
  </div>
</section>

<section>
  ${sec("09", "조사 루프가 할 일")}
  <p class="note" style="margin-bottom:14px">이 목록은 데이터의 빈 칸에서 저절로 나옵니다. 사람이 손대는 목록이 아닙니다.</p>
  <div class="rows">
    ${tasks.slice(0, 4).map((t) => `<div class="rowc">
      <div class="hd"><h3 style="font-size:15px">${esc(t.title)}</h3><span class="tag">${esc(t.area)}</span></div>
      <p class="why">${esc(t.detail)}</p></div>`).join("")}
  </div>
</section>`;

/* ── 자리 ─────────────────────────────────────────────────────── */

const livableTag = (l) => l.livable === "가능" ? ["잘 수 있음", "good"]
  : l.livable === "불가" ? ["잘 수 없음", "flag"]
  : l.livable === "회색" ? ["용도 확인 필요", "flag"]
  : ["용도 미확인", ""];

function listingRow(l, i) {
  const monthly = l.rent + (l.maintenance ?? 0);
  const walk = walkish(l);
  const [lt, lc] = livableTag(l);
  return `<tr data-id="${esc(l.id)}" data-dep="${l.deposit}" data-rent="${monthly}" data-walk="${walk ?? ""}"
      data-area="${l.areaM2 ?? ""}" data-live="${esc(l.livable)}" data-kind="${esc(l.kind)}"${isDup(l) ? ' data-dup="1"' : ""}>
    <td class="rank">${i + 1}</td>
    <td class="name"><b>${esc(l.title)}</b>${isDup(l) ? ` <span class="tag flag">중복 의심</span>` : ""}
      <br><span class="meta">${esc(l.kind)}<span class="sep"></span>${esc(l.address)}${l.addressDetail ? ` ${esc(l.addressDetail)}` : ""}</span>
      <span class="monly">실부담 <b class="real2">${man(Math.round(realMonthly(l)))}</b>, ${walk != null ? `걸어서 ${walk}분` : "거리 미확인"}, ${lt}</span></td>
    <td class="r mono">${eok(l.deposit)}</td>
    <td class="r mono${monthly > LIMIT ? " over" : ""}">${man(monthly)}</td>
    <td class="r mono strong real">${man(Math.round(realMonthly(l)))}</td>
    <td class="r mono">${l.areaM2 != null ? `${l.areaM2}㎡` : "미확인"}</td>
    <td class="r mono">${walk != null ? `${walk}분` : "미확인"}</td>
    <td><span class="tag ${lc}">${esc(lt)}</span></td>
    <td><button class="expand" data-x="${esc(l.id)}">자세히</button></td>
  </tr>
  <tr class="detail" id="x-${esc(l.id)}" hidden><td colspan="9">
    <div class="grid g2" style="gap:18px">
      <div>
        <h3 style="font-size:14px;margin-bottom:6px">좋은 점</h3>
        ${(l.pros ?? []).length ? `<ul>${l.pros.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : `<p class="meta">적어 둔 게 없습니다.</p>`}
        <h3 style="font-size:14px;margin:14px 0 6px">걸리는 점</h3>
        ${(l.cons ?? []).length ? `<ul>${l.cons.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : `<p class="meta">적어 둔 게 없습니다.</p>`}
      </div>
      <div>
        <table style="width:100%;border-collapse:collapse;font-size:13.5px">
          <tbody>
            <tr><td style="color:var(--muted);padding:5px 0">층</td><td style="text-align:right">${l.floor != null ? `${esc(String(l.floor))}층${l.totalFloors ? ` / ${l.totalFloors}층` : ""}` : "미확인"}</td></tr>
            <tr><td style="color:var(--muted);padding:5px 0">천장 높이</td><td style="text-align:right">${l.ceilingM != null ? `${l.ceilingM}m` : "미확인"}</td></tr>
            <tr><td style="color:var(--muted);padding:5px 0">소음</td><td style="text-align:right">${esc(l.noiseRisk ?? "미확인")}</td></tr>
            <tr><td style="color:var(--muted);padding:5px 0">관리비</td><td style="text-align:right">${l.maintenance != null ? man(l.maintenance) : "미확인"}</td></tr>
            <tr><td style="color:var(--muted);padding:5px 0">최소 계약</td><td style="text-align:right">${l.contract?.minMonths != null ? `${l.contract.minMonths}개월` : "미확인"}</td></tr>
            <tr><td style="color:var(--muted);padding:5px 0">입주</td><td style="text-align:right">${esc(l.contract?.available ?? "미확인")}</td></tr>
          </tbody>
        </table>
        ${l.livableNote ? `<p class="meta" style="margin-top:10px">${esc(l.livableNote)}</p>` : ""}
        ${l.notes ? `<p class="why">${esc(l.notes)}</p>` : ""}
        ${(l.unresolved ?? []).length ? `<p class="meta" style="margin-top:8px">못 채운 칸: ${esc(l.unresolvedNote ?? l.unresolved.join(", "))}</p>` : ""}
        ${l.rejectReason ? `<p class="why" style="color:var(--flag)">거른 이유: ${esc(l.rejectReason)}</p>` : ""}
        ${l.source?.url ? `<a class="src" href="${esc(l.source.url)}" target="_blank" rel="noreferrer noopener">${esc(l.source.site)}에서 본 화면 (${esc(l.source.seenAt)})</a>` : ""}
      </div>
    </div>
  </td></tr>`;
}

const walks = live.map(walkish).filter((n) => Number.isFinite(n));
const STRIP_MAX = 30;
const strip = walks.length ? `
<div class="strip"><div class="track">
  <div class="ax"></div>
  ${[0, 10, 20, 30].map((m, i, a) => {
    const tx = i === 0 ? "translateX(0)" : i === a.length - 1 ? "translateX(-100%)" : "translateX(-50%)";
    return `<div class="mk" style="left:${(m / STRIP_MAX) * 100}%;transform:${tx}">${m === 0 ? "사무실" : `${m}분`}</div>`;
  }).join("")}
  ${live.filter((l) => Number.isFinite(walkish(l))).map((l) => {
    const m = walkish(l);
    const over = l.rent + (l.maintenance ?? 0) > LIMIT;
    return `<div class="dot${over ? " over" : ""}" style="left:${Math.min(m / STRIP_MAX, 1) * 100}%" title="${esc(l.title)}, 걸어서 ${m}분"></div>`;
  }).join("")}
</div></div>
<p class="note" style="margin:0 0 22px">점 하나가 자리 하나입니다. 왼쪽일수록 사무실에서 가깝고, 붉은 점은 월세와 관리비를 더해 ${LIMIT}만원을 넘습니다.
걸어가는 시간을 못 잰 ${live.length - walks.length}곳은 이 띠에 안 찍힙니다.</p>` : "";

const listingsBody = `
<section>
  ${sec("01", "자리")}
  <h1>${live.length}곳을 한 표에 놓고 거릅니다</h1>
  <p class="lede">걸어서 ${d.config.reach.walkMinMax}분 안이면 1순위, 대중교통 ${d.config.reach.transitMinMax}분 안이면 후보입니다.
  월세와 관리비를 더해 ${LIMIT}만원을 넘으면 붉게 칠합니다.</p>
  <div class="warnbox" style="margin-top:20px">
    <b>월세가 싸다고 싼 자리가 아닙니다.</b> 이 표에서 월세가 제일 싼 자리는 보증금이 ${eok(Math.max(...live.map((l) => l.deposit)))}입니다.
    목돈이 묶이는 값을 세려고 <b>실부담</b> 칸을 뒀습니다. 월세에 관리비를 더하고, 보증금에 연이율을 매겨 12로 나눈 값을 얹은 숫자입니다.
    이 이율은 조사한 값이 아니라 아래에서 사람이 고르는 가정입니다.
  </div>
</section>

<section>
${live.length === 0 ? empty("아직 걷은 자리가 없습니다", "네이버부동산, 직방, 다방, 피터팬, 당근을 돌면서 조건에 맞는 매물을 담으면 여기에 쌓입니다.") : `
  ${strip}
  <div class="panel">
    <div class="row">
      <div class="fld">
        <span class="fl">보증금 상한</span>
        <span class="fv" id="depv">제한 없음</span>
        <input type="range" id="dep" min="0" max="18000" step="500" value="18000">
      </div>
      <div class="fld">
        <span class="fl">월세와 관리비 상한</span>
        <span class="fv" id="rentv">${LIMIT}만원</span>
        <input type="range" id="rent" min="20" max="110" step="5" value="${LIMIT}">
      </div>
      <div class="fld">
        <span class="fl">걸어서</span>
        <span class="fv" id="walkv">제한 없음</span>
        <input type="range" id="walk" min="5" max="31" step="1" value="31">
      </div>
      <div class="fld" style="min-width:auto">
        <span class="fl">보증금에 매길 연이율</span>
        <div class="chips">
          ${RATE_OPTIONS.map((r) => `<button class="chip" data-rate="${r}" aria-pressed="${r === RATE_DEFAULT}">${r}%</button>`).join("")}
        </div>
      </div>
    </div>
    <p class="note" style="margin-top:14px" id="cnt"></p>
  </div>
  <div class="tblwrap">
    <table class="data" id="tbl">
      <thead><tr>
        <th></th><th class="s" data-k="name">자리</th>
        <th class="s r" data-k="dep">보증금</th>
        <th class="s r" data-k="rent">월세 + 관리비</th>
        <th class="s r" data-k="real" aria-sort="ascending">실부담</th>
        <th class="s r" data-k="area">면적</th>
        <th class="s r" data-k="walk">걸어서</th>
        <th>잘 수 있나</th><th></th>
      </tr></thead>
      <tbody>${ranked.map(listingRow).join("")}</tbody>
    </table>
  </div>
  <p class="note" style="margin-top:12px">머리글을 누르면 그 칸으로 다시 줄 세웁니다.
  걸어가는 시간이 미확인인 자리는 거리로 거를 때 같이 빠집니다. 길찾기 화면을 못 읽은 자리라 시간을 지어내지 않았습니다.</p>`}
</section>

${dropped.length ? `
<section>
  ${sec("02", "거른 자리")}
  <p class="note" style="margin-bottom:14px">같은 매물을 두 번 줍지 않으려고 남겨 둡니다.</p>
  <div class="rows">
    ${dropped.map((l) => `<div class="rowc">
      <div class="hd"><div><h3>${esc(l.title)}</h3><p class="meta">${esc(l.kind)}<span class="sep"></span>${esc(l.address)}</p></div>
        <div style="text-align:right"><div class="big"><span class="v" style="font-size:22px">${num(l.rent + (l.maintenance ?? 0))}</span><span class="u">만원/월</span></div>
        <div class="meta">보증금 ${eok(l.deposit)}</div></div></div>
      ${l.rejectReason ? `<p class="why" style="color:var(--flag)">거른 이유: ${esc(l.rejectReason)}</p>` : ""}
      ${l.source?.url ? `<a class="src" href="${esc(l.source.url)}" target="_blank" rel="noreferrer noopener">${esc(l.source.site)}에서 본 화면</a>` : ""}
    </div>`).join("")}
  </div>
</section>` : ""}

<script>
(function(){
  var tb=document.getElementById('tbl'); if(!tb) return;
  var body=tb.tBodies[0];
  var pairs=[]; // [행, 자세히 행]
  var rows=[].slice.call(body.rows);
  for(var i=0;i<rows.length;i+=2) pairs.push([rows[i],rows[i+1]]);
  var rate=${RATE_DEFAULT}, sortKey='real', asc=true;
  var dep=document.getElementById('dep'), rent=document.getElementById('rent'), walk=document.getElementById('walk');
  var depv=document.getElementById('depv'), rentv=document.getElementById('rentv'), walkv=document.getElementById('walkv');
  var cnt=document.getElementById('cnt');
  var fmt=function(n){return Number(n).toLocaleString('ko-KR')};

  function real(r){ return +r.dataset.rent + (+r.dataset.dep*rate/100)/12 }
  function val(r,k){
    if(k==='name') return r.querySelector('b').textContent;
    if(k==='real') return real(r);
    var v=r.dataset[k];
    return v===''?Infinity:+v;
  }
  function paint(){
    pairs.forEach(function(p){
      var t=fmt(Math.round(real(p[0])))+'만원';
      p[0].querySelector('.real').textContent=t;
      p[0].querySelector('.real2').textContent=t;
    });
  }
  function apply(){
    var dMax=+dep.value, rMax=+rent.value, wMax=+walk.value;
    depv.textContent = dMax>=18000 ? '제한 없음' : fmt(dMax)+'만원';
    rentv.textContent = rMax+'만원';
    walkv.textContent = wMax>=31 ? '제한 없음' : wMax+'분';
    var shown=0, best=null;
    pairs.forEach(function(p){
      var r=p[0], ok=true;
      if(dMax<18000 && +r.dataset.dep>dMax) ok=false;
      if(+r.dataset.rent>rMax) ok=false;
      if(wMax<31 && (r.dataset.walk===''||+r.dataset.walk>wMax)) ok=false;
      r.hidden=!ok; if(!ok) p[1].hidden=true;
      if(ok){ shown++; if(!best||real(r)<real(best)) best=r; }
    });
    // 순위 번호는 보이는 것만 다시 매긴다
    var n=0;
    pairs.forEach(function(p){ if(!p[0].hidden){ n++; p[0].cells[0].textContent=n; p[0].classList.toggle('pick',n<=3);} });
    cnt.innerHTML = shown===0
      ? '조건에 맞는 자리가 없습니다. 손잡이를 풀어 보세요.'
      : shown+'곳 보이는 중 (전체 '+pairs.length+'곳)'+(best?', 실부담이 제일 낮은 자리는 <b>'+best.querySelector('b').textContent+'</b> 월 '+fmt(Math.round(real(best)))+'만원':'');
  }
  function sortNow(){
    pairs.sort(function(a,b){
      var x=val(a[0],sortKey), y=val(b[0],sortKey);
      if(typeof x==='string') return asc? x.localeCompare(y,'ko') : y.localeCompare(x,'ko');
      return asc? x-y : y-x;
    });
    pairs.forEach(function(p){ body.appendChild(p[0]); body.appendChild(p[1]); });
    apply();
  }
  [dep,rent,walk].forEach(function(el){ el.addEventListener('input',apply) });
  document.querySelectorAll('[data-rate]').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('[data-rate]').forEach(function(o){o.setAttribute('aria-pressed','false')});
      b.setAttribute('aria-pressed','true'); rate=+b.dataset.rate; paint(); if(sortKey==='real') sortNow(); else apply();
    });
  });
  tb.querySelectorAll('th.s').forEach(function(th){
    th.addEventListener('click',function(){
      var k=th.dataset.k;
      if(sortKey===k) asc=!asc; else { sortKey=k; asc=(k!=='area'); }
      tb.querySelectorAll('th').forEach(function(o){o.removeAttribute('aria-sort')});
      th.setAttribute('aria-sort',asc?'ascending':'descending');
      sortNow();
    });
  });
  body.addEventListener('click',function(e){
    var b=e.target.closest('.expand'); if(!b) return;
    var t=document.getElementById('x-'+b.dataset.x);
    t.hidden=!t.hidden; b.textContent=t.hidden?'자세히':'접기';
  });
  paint(); apply();
})();
</script>`;

/* ── 물건(장비·인테리어) ───────────────────────────────────────── */

function itemRow(it) {
  const n = qNew(it), u = qUsed(it);
  const plans = planOf.get(it.id) ?? [];
  const q = pickQuote(it, "cheap");
  return `<tr data-id="${esc(it.id)}" data-qty="${it.qty}" data-new="${n ? n.price : ""}" data-used="${u ? u.price : ""}"
      data-plans="${plans.join(" ")}" data-group="${esc(it.group)}">
    <td class="name"><b>${esc(it.name)}</b>${it.qty > 1 ? ` <span class="meta">${it.qty}개</span>` : ""}
      <br><span class="meta">${esc(it.spec)}</span></td>
    <td><span class="tag${["필수", "1안"].includes(it.need) ? " on" : ""}">${esc(it.need)}</span></td>
    <td><span class="tag${it.usedOk ? "" : " flag"}">${it.usedOk ? "중고 가능" : "새것으로"}</span></td>
    <td class="r mono">${n ? won(n.price) : "못 찾음"}</td>
    <td class="r mono">${u ? won(u.price) : (it.usedOk ? "못 찾음" : "안 삽니다")}</td>
    <td class="r mono strong sub">${q ? won(q.price * it.qty) : "값 모름"}</td>
    <td><button class="expand" data-x="${esc(it.id)}">왜?</button></td>
  </tr>
  <tr class="detail" id="x-${esc(it.id)}" hidden><td colspan="7">
    <p>${esc(it.why)}</p>
    ${it.how ? `<p style="margin-top:8px;color:var(--muted)">${esc(it.how)}</p>` : ""}
    ${(it.alt ?? []).length ? `<p style="margin-top:8px;color:var(--muted)">${it.alt.map(esc).join(" / ")}</p>` : ""}
    ${(it.models ?? []).length ? `<div class="tags"><span class="meta" style="margin:0 4px 0 0">쓸 만한 기종</span>${it.models.map((m) => `<span class="tag">${esc(m)}</span>`).join("")}</div>` : ""}
    ${it.usedNote ? `<p class="meta" style="margin-top:10px">중고로 살 때: ${esc(it.usedNote)}</p>` : ""}
    <div class="tags" style="margin-top:12px">
      ${(it.quotes ?? []).map((qq) => `<a class="tag" href="${esc(qq.url)}" target="_blank" rel="noreferrer noopener" style="text-decoration:none">
        ${qq.condition === "used" ? "중고" : "새것"} ${num(qq.price)}원<span class="sep"></span>${esc(qq.site)}${qq.model ? `<span class="sep"></span>${esc(qq.model)}` : ""}</a>`).join("")}
    </div>
    ${(it.quotes ?? []).some((qq) => qq.note) ? `<p class="meta" style="margin-top:8px">${esc(it.quotes.find((qq) => qq.note).note)}</p>` : ""}
  </td></tr>`;
}

function itemsPage(rows, { label, h1, lede, tail, allNote }) {
  const groups = [...new Set(rows.map((r) => r.group))];
  return `
<section>
  ${sec("01", label)}
  <h1>${esc(h1)}</h1>
  <p class="lede">${esc(lede)}</p>
</section>

<section>
  <div class="panel">
    <div class="row">
      <div class="fld" style="min-width:auto">
        <span class="fl">어느 안으로 볼까</span>
        <div class="chips" id="pf">
          <button class="chip" data-plan="" aria-pressed="true">전부</button>
          ${d.plans.map((p) => `<button class="chip" data-plan="${esc(p.id)}" aria-pressed="false">${esc(p.name)}</button>`).join("")}
        </div>
      </div>
      <div class="fld" style="min-width:auto">
        <span class="fl">어떻게 살까</span>
        <div class="chips" id="mf">
          <button class="chip" data-mode="cheap" aria-pressed="true">싼 것부터</button>
          <button class="chip" data-mode="used" aria-pressed="false">중고 먼저</button>
          <button class="chip" data-mode="new" aria-pressed="false">전부 새것</button>
        </div>
      </div>
    </div>
  </div>
  <div class="sumbar">
    <span class="l">지금 고른 조건으로</span>
    <span class="v" id="sum">0원</span>
    <span class="x" id="sumx"></span>
  </div>
  ${groups.map((g) => `
    <h2 style="margin:26px 0 10px">${esc(g)}</h2>
    <div class="tblwrap">
      <table class="data">
        <thead><tr><th>물건</th><th>얼마나</th><th>중고</th><th class="r">새것 최저</th><th class="r">중고 최저</th><th class="r">소계</th><th></th></tr></thead>
        <tbody>${rows.filter((r) => r.group === g).map(itemRow).join("")}</tbody>
      </table>
    </div>`).join("")}
  <p class="note" style="margin-top:16px">${esc(tail)}</p>
</section>

<script>
(function(){
  var rows=[].slice.call(document.querySelectorAll('tr[data-qty]'));
  if(!rows.length) return;
  var plan='', mode='cheap';
  var sum=document.getElementById('sum'), sumx=document.getElementById('sumx');
  var fmt=function(n){return Number(n).toLocaleString('ko-KR')};
  function price(r){
    var n=r.dataset.new===''?null:+r.dataset.new, u=r.dataset.used===''?null:+r.dataset.used;
    if(mode==='new') return n!==null?n:u;
    if(mode==='used') return u!==null?u:n;
    if(n!==null&&u!==null) return Math.min(n,u);
    return n!==null?n:u;
  }
  function apply(){
    var total=0, shown=0, miss=0;
    rows.forEach(function(r){
      var ok = !plan || (' '+r.dataset.plans+' ').indexOf(' '+plan+' ')>=0;
      r.hidden=!ok;
      var det=document.getElementById('x-'+r.dataset.id); if(det&&!ok) det.hidden=true;
      var p=price(r);
      r.querySelector('.sub').textContent = p===null?'값 모름':fmt(p*+r.dataset.qty)+'원';
      if(ok){ shown++; if(p===null) miss++; else total+=p*+r.dataset.qty; }
    });
    sum.textContent = total>=10000 ? fmt(Math.round(total/10000))+'만원' : fmt(total)+'원';
    sumx.textContent = shown+'개 품목'+(miss?', '+miss+'개는 값을 모릅니다':'')
      +(mode==='new'?', 전부 새것으로':mode==='used'?', 중고가 있으면 중고로':', 새것과 중고 중 싼 쪽으로')
      +(plan?'':${JSON.stringify(allNote ? `, ${allNote}` : "")});
  }
  document.querySelectorAll('#pf .chip').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('#pf .chip').forEach(function(o){o.setAttribute('aria-pressed','false')});
      b.setAttribute('aria-pressed','true'); plan=b.dataset.plan; apply();
    });
  });
  document.querySelectorAll('#mf .chip').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('#mf .chip').forEach(function(o){o.setAttribute('aria-pressed','false')});
      b.setAttribute('aria-pressed','true'); mode=b.dataset.mode; apply();
    });
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest('.expand'); if(!b) return;
    var t=document.getElementById('x-'+b.dataset.x); if(!t) return;
    t.hidden=!t.hidden; b.textContent=t.hidden?'왜?':'접기';
  });
  apply();
})();
</script>`;
}

const gearBody = itemsPage(d.gear, {
  label: "장비",
  h1: "팟캐스트에 필요한 만큼만",
  lede: "소리가 먼저입니다. 화질이 나쁜 영상은 보지만 소리가 나쁜 영상은 끕니다. 위에서 안을 고르면 그 안에 들어가는 물건만 남고, 합계가 바로 바뀝니다.",
  tail: "값은 조사한 날 화면에 뜬 최저가입니다. 중고는 그때 올라와 있던 매물이라 지금은 팔렸을 수 있습니다. 물건 이름 옆 '왜?'를 누르면 왜 필요한지, 어떤 기종을 보면 되는지, 어디서 봤는지가 펼쳐집니다.",
  allNote: "레코더처럼 서로 대신하는 물건까지 다 더한 값이라 실제로는 이만큼 안 듭니다",
});

const interiorBody = itemsPage(d.interior, {
  label: "인테리어",
  h1: "공사는 안 합니다",
  lede: "뒤에 세울 벽 한 면과, 소리가 덜 울리게 하는 물건 몇 개면 됩니다. 배경은 1안 배경천, 2안 파티션, 3안 DIY 가벽 중에서 자리가 정해지면 하나만 고릅니다. 벽에 못을 안 박는 방법을 먼저 씁니다.",
  tail: "1안과 2안, 3안은 같이 사는 게 아니라 셋 중 하나만 고르는 것입니다. 위에서 안을 고르면 그 안에 들어가는 배경 방법만 남습니다.",
  allNote: "배경 1안과 2안, 3안을 다 더한 값이라 실제로는 이만큼 안 듭니다",
});

/* ── 예산 ─────────────────────────────────────────────────────── */

/* 드롭다운은 실부담이 낮은 순으로 세운다. 스무 개를 데이터 순서대로 늘어놓으면 못 고른다. */
const CALCDATA = {
  listings: ranked.map((l) => ({
    id: l.id,
    label: `${l.title} (보증금 ${eok(l.deposit)}, 월 ${man(l.rent + (l.maintenance ?? 0))}, ${walkish(l) != null ? `걸어서 ${walkish(l)}분` : "거리 미확인"})`,
    dep: l.deposit, rent: l.rent, maint: l.maintenance ?? 0, walk: walkish(l), area: l.areaM2,
  })),
  plans: d.plans.map((p) => ({
    id: p.id, name: p.name,
    cheap: planSum(p, "cheap").sum, used: planSum(p, "used").sum, nw: planSum(p, "new").sum,
    count: planItems(p).length,
  })),
  hourly: RATE,
};
/* 처음 뜨는 자리는 "걸어서 15분 안" 1순위 조건을 만족하는 것 중 실부담이 제일 낮은 곳으로 둔다. */
const CALC_DEFAULT = Math.max(0, CALCDATA.listings.findIndex((l) => l.walk != null && l.walk <= WALK_OK));

const planBody = `
<section>
  ${sec("01", "예산")}
  <h1>자리 하나와 안 하나를<br>고르면 총액이 나옵니다</h1>
  <p class="lede">장비와 인테리어는 처음 한 번 나가고, 월세와 관리비는 매달 나갑니다.
  둘을 섞어 보면 판단이 흐려지니 갈라 놨습니다.</p>
</section>

<section>
  ${sec("02", "계산기")}
  <div class="panel">
    <div class="row">
      <div class="fld" style="flex:1 1 320px">
        <span class="fl">어느 자리</span>
        <select id="cl">${CALCDATA.listings.map((l, i) => `<option value="${i}"${i === CALC_DEFAULT ? " selected" : ""}>${esc(l.label)}</option>`).join("")}</select>
        <span class="note">실부담이 낮은 순으로 세워 뒀습니다. 처음 뜨는 자리는 걸어서 ${WALK_OK}분 안에서 실부담이 가장 낮은 곳입니다.</span>
      </div>
      <div class="fld" style="min-width:auto">
        <span class="fl">어디까지 만들까</span>
        <div class="chips" id="cp">
          ${CALCDATA.plans.map((p, i) => `<button class="chip" data-i="${i}" aria-pressed="${i === 1}">${esc(p.name)}</button>`).join("")}
        </div>
      </div>
      <div class="fld" style="min-width:auto">
        <span class="fl">장비를 어떻게</span>
        <div class="chips" id="cm">
          <button class="chip" data-m="cheap" aria-pressed="true">싼 것부터</button>
          <button class="chip" data-m="used" aria-pressed="false">중고 먼저</button>
          <button class="chip" data-m="nw" aria-pressed="false">전부 새것</button>
        </div>
      </div>
    </div>
    <div class="row" style="margin-top:18px">
      <div class="fld">
        <span class="fl">공과금과 인터넷을 달에 얼마로 볼까</span>
        <span class="fv" id="utilv">15만원</span>
        <input type="range" id="util" min="0" max="40" step="1" value="15">
      </div>
      <div class="fld">
        <span class="fl">지금 자취방 월세 (합칠 수 있으면 빠집니다)</span>
        <span class="fv" id="homev">0원</span>
        <input type="range" id="home" min="0" max="120" step="5" value="0">
      </div>
    </div>
  </div>

  <div class="calcout">
    <div class="bill">
      <h3>계약할 때 한 번에 필요한 돈</h3>
      <p class="cap">둘의 성격이 다릅니다. 하나는 돌려받고 하나는 안 돌아옵니다.</p>
      <table><tbody>
        <tr><td>보증금 <span class="tag good">나갈 때 돌려받음</span></td><td class="r" id="b-dep">0원</td></tr>
        <tr><td>장비와 인테리어 <span class="tag flag">안 돌아옴</span><span class="meta" style="display:block" id="b-gearlab"></span></td><td class="r" id="b-gear">0원</td></tr>
        <tr class="tot"><td>계약 날 있어야 하는 현금</td><td class="r" id="b-once">0원</td></tr>
      </tbody></table>
      <p class="note" style="margin-top:12px">중개보수와 이사비, 첫 달 월세는 여기 안 들어 있습니다. 자리를 정하고 실제 금액이 나오면 더합니다.
      장비는 하루에 다 안 사도 되니, 실제로 첫날 필요한 현금은 이보다 적습니다.</p>
    </div>

    <div class="bill">
      <h3>매달 나가는 돈</h3>
      <p class="cap">위 손잡이로 공과금 가정을 바꾸면 같이 바뀝니다.</p>
      <table><tbody>
        <tr><td>월세</td><td class="r" id="b-rent">0원</td></tr>
        <tr><td>관리비</td><td class="r" id="b-maint">0원</td></tr>
        <tr><td>공과금과 인터넷 <span class="calc" title="조사한 값이 아니라 손잡이로 넣은 가정입니다">가정</span></td><td class="r" id="b-util">0원</td></tr>
        <tr><td>지금 자취방 월세가 빠지는 몫</td><td class="r" id="b-home">0원</td></tr>
        <tr class="tot"><td>통장에서 매달 빠지는 돈</td><td class="r" id="b-mon">0원</td></tr>
      </tbody></table>
      <p class="note" style="margin-top:10px" id="b-verdict"></p>
      <table style="margin-top:14px"><tbody>
        <tr><td>보증금이 묶여서 못 받는 이자 <span class="calc" title="보증금 × 연 ${RATE_DEFAULT}% ÷ 12. 조사한 값이 아니라 가정입니다">연 ${RATE_DEFAULT}% 가정</span></td><td class="r" id="b-int">0원</td></tr>
        <tr class="tot"><td>실부담 합계</td><td class="r" id="b-real">0원</td></tr>
      </tbody></table>
      <p class="note" style="margin-top:10px">보증금이 큰 자리는 통장에서 빠지는 돈이 적어 보입니다.
      묶인 목돈이 이자를 못 버는 몫까지 세면 실부담 합계가 진짜 무게입니다.</p>
    </div>
  </div>

  ${RATE ? `
  <div class="concl" style="margin-top:16px" id="b-rent-out">계산 중입니다.</div>` : ""}
</section>

<section>
  ${sec("03", "세 가지 안에 뭐가 들어가나")}
  <div class="grid g3">
    ${d.plans.map((p) => {
      const c = planSum(p, "cheap");
      const g = new Map();
      for (const it of planItems(p)) {
        const t = itemSum(it, "cheap");
        const cur = g.get(it.group) ?? { sum: 0, miss: 0 };
        if (t == null) cur.miss++; else cur.sum += t;
        g.set(it.group, cur);
      }
      return `<div class="card plan">
        <div class="nm">${esc(p.name)}</div><div class="tl">${esc(p.tagline)}</div>
        <div class="amt">${c.sum ? wonMan(c.sum) : "조사 전"}</div>
        <div class="meta">${c.missing ? `${c.missing}개 품목은 값을 모릅니다. 실제로는 더 듭니다` : `${c.total}개 품목 전부 반영`}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13.5px;margin-top:16px">
          <tbody>${[...g].map(([k, v]) => `<tr>
            <td style="padding:6px 0;border-bottom:1px solid #EEF4F5">${esc(k)}</td>
            <td class="mono" style="text-align:right;padding:6px 0;border-bottom:1px solid #EEF4F5">${v.sum ? won(v.sum) : `<span class="meta">${v.miss}개 미조사</span>`}</td></tr>`).join("")}</tbody>
        </table>
        <p class="why" style="margin-top:14px">${esc(p.note)}</p>
        ${p.cut.length ? `<div class="tags">${p.cut.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>` : ""}
      </div>`;
    }).join("")}
  </div>
</section>

<section>
  ${sec("04", "빌려주면 얼마나 메우나")}
  ${d.market.rates.length === 0
    ? empty("대관 시세를 아직 안 걷었습니다", "스페이스클라우드에서 광진구, 성수, 건대 촬영 스튜디오의 시간당 가격을 모으면 여기에 나옵니다.")
    : `<p class="lede" style="margin-bottom:18px">이 동네 촬영 스튜디오 ${d.market.rates.length}곳의 시간당 가격입니다.
      중앙값 ${won(RATE)}을 기준으로 위 계산기가 본전 시간을 냅니다.
      값이 ${won(Math.min(...d.market.rates.map((r) => r.hourlyKRW)))}부터 ${won(Math.max(...d.market.rates.map((r) => r.hourlyKRW)))}까지 벌어져 있어서, 평균이 아니라 중앙값을 씁니다.</p>
      <div class="tblwrap">
        <table class="data" style="min-width:560px">
          <thead><tr><th>스튜디오</th><th>동네</th><th class="r">넓이</th><th class="r">시간당</th></tr></thead>
          <tbody>${d.market.rates.slice().sort((a, b) => a.hourlyKRW - b.hourlyKRW).map((r) => `<tr>
            <td class="name"><a class="go" href="${esc(r.url)}" target="_blank" rel="noreferrer noopener">${esc(r.name)}</a></td>
            <td>${esc(r.area ?? "미표시")}</td>
            <td class="r mono">${r.sizeM2 != null ? `${r.sizeM2}㎡` : "미표시"}</td>
            <td class="r mono strong">${won(r.hourlyKRW)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <p class="note" style="margin-top:12px">화면에 주중과 주말 가격을 따로 안 적어 둔 곳은 차이를 지어내지 않았습니다.
      우리 방은 이 표의 스튜디오보다 좁으니 같은 값을 받기는 어렵습니다. 본전 시간은 위쪽으로 잡힌 숫자로 보면 됩니다.</p>`}
</section>

<script>
(function(){
  var D=${JSON.stringify(CALCDATA)};
  if(!D.listings.length) return;
  var li=${CALC_DEFAULT}, pi=1, mode='cheap';
  var $=function(id){return document.getElementById(id)};
  var fmt=function(n){return Number(n).toLocaleString('ko-KR')};
  var wonMan=function(n){ return n>=10000 ? fmt(Math.round(n/10000))+'만원' : fmt(Math.round(n))+'원' };
  var eok=function(n){ // n은 원 단위
    var m=Math.round(n/10000);
    if(m<10000) return fmt(m)+'만원';
    var e=Math.floor(m/10000), r=m%10000;
    return r? e+'억 '+fmt(r)+'만원' : e+'억원';
  };
  function calc(){
    var l=D.listings[li], p=D.plans[pi];
    var gear=p[mode];
    var util=+$('util').value, home=+$('home').value;
    var dep=l.dep*10000, rent=l.rent*10000, maint=l.maint*10000;
    var mon=rent+maint+util*10000-home*10000;
    $('b-dep').textContent=eok(dep);
    $('b-gearlab').textContent=p.name+', '+p.count+'개';
    $('b-gear').textContent=wonMan(gear);
    $('b-once').textContent=eok(dep+gear);
    $('b-rent').textContent=wonMan(rent);
    $('b-maint').textContent=maint?wonMan(maint):'0원';
    $('b-util').textContent=wonMan(util*10000);
    $('b-home').textContent=home? '-'+wonMan(home*10000) : '0원';
    $('b-mon').textContent=wonMan(mon);
    var interest=dep*${RATE_DEFAULT}/100/12;
    $('b-int').textContent=wonMan(interest);
    $('b-real').textContent=wonMan(mon+interest);
    $('utilv').textContent=util+'만원';
    $('homev').textContent=home?home+'만원':'없음 (안 합침)';
    var limit=${LIMIT}*10000, comfort=${COMFORT ?? LIMIT}*10000;
    var v=$('b-verdict');
    if(mon>limit) v.innerHTML='상한 ${LIMIT}만원을 <b style="color:var(--flag)">'+wonMan(mon-limit)+' 넘습니다.</b>';
    else if(mon<=comfort) v.innerHTML='편한 선 ${COMFORT ?? LIMIT}만원 안쪽입니다. 여유가 '+wonMan(comfort-mon)+' 남습니다.';
    else v.innerHTML='상한 ${LIMIT}만원 안쪽입니다. 편한 선까지는 '+wonMan(mon-comfort)+' 넘습니다.';
    var out=$('b-rent-out');
    if(out&&D.hourly){
      var need=Math.max(0,Math.ceil(mon/D.hourly));
      out.innerHTML='이 자리를 시간당 <b>'+fmt(D.hourly)+'원</b>에 빌려준다면, 매달 나가는 '+wonMan(mon)+'을 메우는 데 <b>월 '+need+'시간</b>이 듭니다. '
        +'하루 8시간씩 쓴다고 보면 <b>월 '+Math.ceil(need/8)+'일</b>입니다. 시간당 값은 이 동네 '+${d.market.rates.length}+'곳의 중앙값이고, 우리 방은 그 스튜디오들보다 좁습니다.';
    }
  }
  $('cl').addEventListener('change',function(){ li=+this.value; calc() });
  document.querySelectorAll('#cp .chip').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('#cp .chip').forEach(function(o){o.setAttribute('aria-pressed','false')});
      b.setAttribute('aria-pressed','true'); pi=+b.dataset.i; calc();
    });
  });
  document.querySelectorAll('#cm .chip').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('#cm .chip').forEach(function(o){o.setAttribute('aria-pressed','false')});
      b.setAttribute('aria-pressed','true'); mode=b.dataset.m; calc();
    });
  });
  ['util','home'].forEach(function(id){ $(id).addEventListener('input',calc) });
  calc();
})();
</script>`;

/* ── 일지 ─────────────────────────────────────────────────────── */

const logEntries = d.log.slice().reverse();
const kinds = [...new Set(logEntries.map((e) => e.kind).filter(Boolean))];
const SHOW_FIRST = 25;

const logBody = `
<section>
  ${sec("01", "일지")}
  <h1>무엇을 봤고<br>무엇을 걸렀나</h1>
  <p class="lede">조사 루프가 일을 하나 끝낼 때마다 한 줄 남깁니다. 지금 ${logEntries.length}줄입니다.
  나중에 "왜 이 동네를 뺐더라"를 다시 묻지 않으려고 남깁니다.</p>
  <div class="chips" style="margin-top:20px" id="lf">
    <button class="chip" data-k="" aria-pressed="true">전부 ${logEntries.length}</button>
    ${kinds.map((k) => `<button class="chip" data-k="${esc(k)}" aria-pressed="false">${esc(k)} ${logEntries.filter((e) => e.kind === k).length}</button>`).join("")}
  </div>
</section>
<section>
  <div class="card">
    ${logEntries.map((e, i) => `<div class="tl-item" data-k="${esc(e.kind ?? "")}"${i >= SHOW_FIRST ? ' data-late="1" hidden' : ""}>
      <div><div class="dt">${esc(e.date)}</div><div class="meta">${esc(e.by)}${e.kind ? `<span class="sep"></span>${esc(e.kind)}` : ""}</div></div>
      <div><h3 style="font-size:15px">${esc(e.summary)}</h3>
      ${e.detail ? `<p class="why">${esc(e.detail)}</p>` : ""}
      ${(e.refs ?? []).length ? `<div class="tags">${e.refs.map((r, j) => `<a class="tag" href="${esc(r)}" target="_blank" rel="noreferrer noopener" style="text-decoration:none">본 화면 ${j + 1}</a>`).join("")}</div>` : ""}
      </div></div>`).join("")}
  </div>
  <p style="text-align:center;margin-top:18px"><button class="chip" id="more">나머지 ${Math.max(0, logEntries.length - SHOW_FIRST)}줄 더 보기</button></p>
</section>
<script>
(function(){
  var items=[].slice.call(document.querySelectorAll('.tl-item'));
  var more=document.getElementById('more'), open=false, kind='';
  function apply(){
    var n=0;
    items.forEach(function(el,i){
      var ok=(!kind||el.dataset.k===kind);
      if(ok&&!open&&!kind&&el.dataset.late) ok=false;
      el.hidden=!ok; if(ok)n++;
    });
    more.hidden = open || !!kind;
  }
  more.addEventListener('click',function(){ open=true; apply() });
  document.querySelectorAll('#lf .chip').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('#lf .chip').forEach(function(o){o.setAttribute('aria-pressed','false')});
      b.setAttribute('aria-pressed','true'); kind=b.dataset.k; apply();
    });
  });
  apply();
})();
</script>`;

/* ── 굽기 ─────────────────────────────────────────────────────── */

if (existsSync("dist")) rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

const PAGES = [
  ["index.html", "개요", "/", indexBody, `구의동에 팟캐스트 스튜디오를 얻는 계획. 자리 ${live.length}곳 비교, 장비 ${ITEMS.length}개 최저가, 예산 계산기.`],
  ["listings.html", "자리", "/listings", listingsBody, `광진구 자리 ${live.length}곳을 보증금, 월세, 걸어가는 시간으로 비교합니다.`],
  ["gear.html", "장비", "/gear", gearBody, `팟캐스트 장비 ${d.gear.length}개 품목의 새것과 중고 최저가.`],
  ["interior.html", "인테리어", "/interior", interiorBody, `공사 없이 배경과 소리를 잡는 물건 ${d.interior.length}개.`],
  ["plan.html", "예산", "/plan", planBody, "자리와 안을 고르면 한 번 나가는 돈과 매달 나가는 돈이 나옵니다."],
  ["log.html", "일지", "/log", logBody, `조사 기록 ${logEntries.length}줄.`],
];
for (const [file, title, path, body, lead] of PAGES) {
  writeFileSync(`dist/${file}`, page({ title, path, body, lead }), "utf8");
}
console.log(`구움 ${PAGES.length}쪽 / 자리 ${live.length} / 물건 ${ITEMS.length} / 대관 ${d.market.rates.length} / 남은 일 ${tasks.length}`);
