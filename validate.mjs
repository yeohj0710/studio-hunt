/**
 * data/*.json 을 결정적으로 검사한다. 여기서 막히면 빌드가 안 된다.
 *
 * 사람이 눈으로 보는 대신 이 스크립트가 본다. 파일만 읽는다. 돈 나가는 호출이 없다.
 *
 * 단위 규칙 — 이거 하나만 틀려도 숫자가 100배가 된다.
 *   매물(listings)  : 보증금·월세·관리비는 만원
 *   장비·인테리어    : 견적 가격은 원
 *   대관 시세(market): 시간당 원
 */
import { readFileSync, existsSync } from "node:fs";

const errors = [];
const warns = [];
const bad = (m) => errors.push(m);
const warn = (m) => warns.push(m);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_OK = /^https?:\/\/\S+$/;

function load(name) {
  const p = `data/${name}.json`;
  if (!existsSync(p)) { bad(`${p} 가 없다.`); return null; }
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { bad(`${p} 를 읽을 수 없다 — ${e.message}`); return null; }
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

/* ── 매물 ─────────────────────────────────────────────────────── */

const LISTING_KIND = ["원룸", "투룸", "쓰리룸", "오피스텔", "상가", "사무실", "지식산업센터", "단독·다가구", "지하", "그 밖"];
const LISTING_STATUS = ["candidate", "shortlist", "contacted", "visited", "rejected", "closed"];
const LIVABLE = ["가능", "불가", "회색", "미확인"];
const NOISE = ["낮음", "중간", "높음", "미확인"];
// 매물을 걷는 곳. 새 사이트를 쓰려면 여기에 먼저 적는다.
const LISTING_SITES = ["네이버부동산", "직방", "다방", "피터팬", "당근", "부동산114", "디스코", "공실클럽", "스페이스클라우드", "현장", "그 밖"];

function checkListings(rows) {
  if (!Array.isArray(rows)) return bad("listings.json 은 배열이어야 한다.");
  const seen = new Set();
  rows.forEach((r, i) => {
    const at = `listings[${i}]${r?.id ? ` (${r.id})` : ""}`;
    if (!isStr(r?.id)) return bad(`${at}: id 가 없다.`);
    if (seen.has(r.id)) bad(`${at}: id 가 겹친다.`);
    seen.add(r.id);

    if (!isStr(r.title)) bad(`${at}: title 이 없다.`);
    if (!LISTING_KIND.includes(r.kind)) bad(`${at}: kind 가 목록에 없다 — ${r.kind}`);
    if (!isStr(r.address)) bad(`${at}: address 가 없다.`);
    if (!LISTING_STATUS.includes(r.status)) bad(`${at}: status 가 목록에 없다 — ${r.status}`);
    if (!LIVABLE.includes(r.livable)) bad(`${at}: livable 은 ${LIVABLE.join("·")} 중 하나여야 한다.`);

    for (const k of ["deposit", "rent"]) {
      if (!isNum(r[k])) { bad(`${at}: ${k} 가 숫자가 아니다. 만원 단위로 적는다.`); continue; }
      if (r[k] < 0) bad(`${at}: ${k} 가 음수다.`);
    }
    // 만원 단위인데 1억(10000)을 원으로 적으면 여기서 걸린다.
    if (isNum(r.rent) && r.rent > 1000) bad(`${at}: rent ${r.rent} 은 만원 단위로 너무 크다. 원 단위로 적은 게 아닌지 본다.`);
    if (isNum(r.deposit) && r.deposit > 200000) bad(`${at}: deposit ${r.deposit} 이 만원 단위로 너무 크다.`);
    if (r.maintenance != null && !isNum(r.maintenance)) bad(`${at}: maintenance 는 숫자이거나 null 이어야 한다.`);
    if (isNum(r.maintenance) && r.maintenance > 200) bad(`${at}: maintenance ${r.maintenance} 이 만원 단위로 너무 크다.`);

    if (r.areaM2 != null && !isNum(r.areaM2)) bad(`${at}: areaM2 는 숫자이거나 null 이어야 한다. 평이 아니라 제곱미터로 적는다.`);
    if (isNum(r.areaM2) && r.areaM2 > 0 && r.areaM2 < 6) warn(`${at}: areaM2 ${r.areaM2} 이 너무 작다. 평으로 적은 게 아닌지 본다.`);

    const c = r.commute ?? {};
    for (const k of ["walkMin", "transitMin"]) {
      if (c[k] != null && !isNum(c[k])) bad(`${at}: commute.${k} 는 숫자이거나 null 이어야 한다.`);
    }
    if (c.walkMin == null && c.transitMin == null) warn(`${at}: 지점까지 걸리는 시간이 하나도 없다. 거를 수가 없다.`);

    if (r.noiseRisk != null && !NOISE.includes(r.noiseRisk)) bad(`${at}: noiseRisk 가 목록에 없다 — ${r.noiseRisk}`);

    const s = r.source ?? {};
    if (!LISTING_SITES.includes(s.site)) bad(`${at}: source.site 가 목록에 없다 — ${s.site}`);
    if (s.site !== "현장" && !URL_OK.test(s.url ?? "")) bad(`${at}: source.url 이 주소 형태가 아니다. 본 화면의 주소를 그대로 넣는다.`);
    if (!DATE.test(s.seenAt ?? "")) bad(`${at}: source.seenAt 이 YYYY-MM-DD 가 아니다.`);

    if (r.status === "rejected" && !isStr(r.rejectReason)) bad(`${at}: 거른 매물에는 rejectReason 을 적는다. 왜 걸렀는지 없으면 같은 매물을 또 줍는다.`);
    if (r.monthlyTotal != null) bad(`${at}: monthlyTotal 은 빌드가 계산한다. 직접 적지 않는다.`);
    if (r.score != null) bad(`${at}: score 는 빌드가 계산한다. 직접 적지 않는다.`);
  });
  return rows;
}

/* ── 견적이 붙는 물건(장비·인테리어) ──────────────────────────── */

const COND = ["new", "used"];
// 시세를 걷는 곳.
const QUOTE_SITES = ["다나와", "네이버쇼핑", "쿠팡", "당근", "중고나라", "번개장터", "알리익스프레스", "오늘의집", "제조사", "오프라인", "그 밖"];

function checkPriced(rows, name, extra) {
  if (!Array.isArray(rows)) return bad(`${name}.json 은 배열이어야 한다.`);
  const seen = new Set();
  rows.forEach((r, i) => {
    const at = `${name}[${i}]${r?.id ? ` (${r.id})` : ""}`;
    if (!isStr(r?.id)) return bad(`${at}: id 가 없다.`);
    if (seen.has(r.id)) bad(`${at}: id 가 겹친다.`);
    seen.add(r.id);
    if (!isStr(r.name)) bad(`${at}: name 이 없다.`);
    if (!isStr(r.group)) bad(`${at}: group 이 없다.`);
    if (!Number.isInteger(r.qty) || r.qty < 1) bad(`${at}: qty 는 1 이상 정수여야 한다.`);
    if (!extra.need.includes(r.need)) bad(`${at}: need 가 목록에 없다 — ${r.need}`);

    if (!Array.isArray(r.quotes)) return bad(`${at}: quotes 는 배열이어야 한다.`);
    r.quotes.forEach((q, j) => {
      const qa = `${at}.quotes[${j}]`;
      if (!COND.includes(q?.condition)) bad(`${qa}: condition 은 new 또는 used 여야 한다.`);
      if (!Number.isInteger(q?.price)) bad(`${qa}: price 는 원 단위 정수여야 한다.`);
      else if (q.price < 500 || q.price > 20000000) bad(`${qa}: price ${q.price} 가 범위를 벗어났다. 원 단위가 맞는지 본다.`);
      if (!QUOTE_SITES.includes(q?.site)) bad(`${qa}: site 가 목록에 없다 — ${q?.site}`);
      if (!URL_OK.test(q?.url ?? "")) bad(`${qa}: url 이 주소 형태가 아니다.`);
      if (!DATE.test(q?.seenAt ?? "")) bad(`${qa}: seenAt 이 YYYY-MM-DD 가 아니다.`);
      if (q.condition === "used" && !isStr(q.model)) warn(`${qa}: 중고 견적에 model 이 없다. 어느 기종인지 안 적으면 비교가 안 된다.`);
    });

    if (r.chosen != null) {
      if (!Number.isInteger(r.chosen.price)) bad(`${at}: chosen.price 는 원 단위 정수여야 한다.`);
      if (!COND.includes(r.chosen.condition)) bad(`${at}: chosen.condition 이 목록에 없다.`);
      if (r.quotes.length === 0) bad(`${at}: 견적이 하나도 없는데 chosen 이 있다. 근거 없이 고르지 않는다.`);
    }
    if (r.usedOk === false && r.chosen?.condition === "used") bad(`${at}: 중고로 사면 안 되는 물건인데 중고를 골랐다.`);
  });
  return rows;
}

/* ── 나머지 ──────────────────────────────────────────────────── */

function checkPlans(plans, gear, interior) {
  if (!Array.isArray(plans)) return bad("plans.json 은 배열이어야 한다.");
  const gid = new Set(gear.map((g) => g.id));
  const iid = new Set(interior.map((g) => g.id));
  plans.forEach((p, i) => {
    const at = `plans[${i}]${p?.id ? ` (${p.id})` : ""}`;
    if (!isStr(p?.id)) return bad(`${at}: id 가 없다.`);
    if (!isStr(p.name)) bad(`${at}: name 이 없다.`);
    (p.gear ?? []).forEach((x) => { if (!gid.has(x)) bad(`${at}: 없는 장비를 가리킨다 — ${x}`); });
    (p.interior ?? []).forEach((x) => { if (!iid.has(x)) bad(`${at}: 없는 인테리어 항목을 가리킨다 — ${x}`); });
  });
}

function checkMarket(m) {
  if (!m || typeof m !== "object") return bad("market.json 이 객체가 아니다.");
  if (!Array.isArray(m.rates)) return bad("market.rates 는 배열이어야 한다.");
  m.rates.forEach((r, i) => {
    const at = `market.rates[${i}]`;
    if (!isStr(r?.name)) bad(`${at}: name 이 없다.`);
    if (!Number.isInteger(r?.hourlyKRW)) bad(`${at}: hourlyKRW 는 원 단위 정수여야 한다.`);
    else if (r.hourlyKRW < 1000 || r.hourlyKRW > 500000) bad(`${at}: hourlyKRW ${r.hourlyKRW} 가 범위를 벗어났다.`);
    if (!URL_OK.test(r?.url ?? "")) bad(`${at}: url 이 주소 형태가 아니다.`);
    if (!DATE.test(r?.seenAt ?? "")) bad(`${at}: seenAt 이 YYYY-MM-DD 가 아니다.`);
  });
  const a = m.assumptions ?? {};
  if (a.hourlyRate != null && !isNum(a.hourlyRate)) bad("market.assumptions.hourlyRate 는 숫자이거나 null 이어야 한다.");
  if (a.hourlyRate != null && m.rates.length === 0) bad("대관 시세를 하나도 안 걷고 hourlyRate 를 정했다. 근거 없이 정하지 않는다.");
}

function checkLog(rows) {
  if (!Array.isArray(rows)) return bad("log.json 은 배열이어야 한다.");
  rows.forEach((r, i) => {
    const at = `log[${i}]`;
    if (!DATE.test(r?.date ?? "")) bad(`${at}: date 가 YYYY-MM-DD 가 아니다.`);
    if (!isStr(r?.by)) bad(`${at}: by 가 없다.`);
    if (!isStr(r?.summary)) bad(`${at}: summary 가 없다.`);
  });
}

function checkConfig(c) {
  if (!c || typeof c !== "object") return bad("config.json 이 객체가 아니다.");
  if (!isNum(c.limits?.monthlyTotalMax)) bad("config.limits.monthlyTotalMax 가 숫자가 아니다.");
  if (c.anchor?.geo != null) {
    const g = c.anchor.geo;
    if (!isNum(g.lat) || !isNum(g.lng)) bad("config.anchor.geo 는 {lat,lng} 숫자여야 한다.");
    else if (g.lat < 37.4 || g.lat > 37.7 || g.lng < 126.7 || g.lng > 127.3) bad("config.anchor.geo 가 서울 범위 밖이다.");
  }
}

/* ── 실행 ────────────────────────────────────────────────────── */

const config = load("config");
const listings = load("listings");
const gear = load("gear");
const interior = load("interior");
const plans = load("plans");
const market = load("market");
const log = load("log");

if (errors.length === 0) {
  checkConfig(config);
  checkListings(listings);
  checkPriced(gear, "gear", { need: ["필수", "권장", "대안", "나중"] });
  checkPriced(interior, "interior", { need: ["1안", "2안", "3안", "3안 부속", "필수", "권장", "나중"] });
  if (Array.isArray(gear) && Array.isArray(interior)) checkPlans(plans, gear, interior);
  checkMarket(market);
  checkLog(log);
}

for (const w of warns) console.log(`  경고  ${w}`);
if (errors.length) {
  console.error(`\n검사 실패 — ${errors.length}건\n`);
  for (const e of errors) console.error(`  ${e}`);
  console.error("");
  process.exit(1);
}
console.log(`검사 통과 — 매물 ${listings.length} · 장비 ${gear.length} · 인테리어 ${interior.length} · 대관시세 ${market.rates.length} · 일지 ${log.length}${warns.length ? ` · 경고 ${warns.length}` : ""}`);
