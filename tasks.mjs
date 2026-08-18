/**
 * 데이터를 보고 "지금 비어 있는 칸" 을 할 일 목록으로 바꾼다.
 *
 * 사이트의 '다음에 할 일' 과 `npm run next` 가 같은 함수를 쓴다.
 * 두 곳이 다른 말을 하면 루프가 헤맨다.
 */
import { readFileSync } from "node:fs";

export function loadAll() {
  const j = (n) => JSON.parse(readFileSync(`data/${n}.json`, "utf8"));
  return {
    config: j("config"), listings: j("listings"), gear: j("gear"),
    interior: j("interior"), plans: j("plans"), market: j("market"), log: j("log"),
  };
}

const LIVE = (l) => l.status !== "rejected" && l.status !== "closed";
const stuck = (l, field) => (l.unresolved ?? []).includes(field);

/* 두 점 사이 직선거리(m). 좌표만 있으면 잰다 — 추정이 아니라 계산이다. */
export function distanceM(a, b) {
  if (!a || !b) return null;
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

export function buildTasks(d) {
  const t = [];
  const add = (area, title, detail, weight) => t.push({ area, title, detail, weight });

  if (!d.config.anchor.verified) {
    add("자리", "기준점 좌표를 확인합니다",
      `${d.config.anchor.name}(${d.config.anchor.roadAddress})의 위도·경도를 지도에서 확인해 config.anchor.geo 에 넣고 verified 를 true 로 바꿉니다. 이게 있어야 매물까지 거리를 잽니다.`, 100);
  }

  for (const q of d.config.openQuestions ?? []) {
    if (q.status === "미확인") {
      add("확인", q.q, `${q.why} 확인하면 config.openQuestions 의 status 를 '확인'으로 바꾸고 answer 와 sources 를 붙입니다.`, 95);
    }
  }

  const live = d.listings.filter(LIVE);

  // 자리가 스무 곳 넘게 모이면 자리 일의 순위를 내린다.
  // 안 그러면 못 채우는 칸 몇 개가 계속 1순위를 차지해서 시세는 영영 0건이 된다.
  const enough = live.length >= 20;
  const w = (before, after) => (enough ? after : before);

  /* 찍을 수 있는 넓이인지부터 본다. 좁은 원룸은 스무 곳을 모아도 쓸 자리가 없다. */
  const sh = d.config.shooting;
  const minShoot = sh
    ? Math.ceil(sh.zone.find((z) => z.id === "z-width").m
        * (sh.zone.filter((z) => z.id !== "z-width").reduce((s, z) => s + z.m, 0))
        + sh.otherAreaM2)
    : 0;
  const usable = live.filter((l) =>
    l.areaM2 != null && l.areaM2 >= minShoot && (sh?.goodKinds ?? []).includes(l.kind));

  if (usable.length < 8) {
    add("자리", `찍을 수 있는 자리를 걷습니다 (지금 ${usable.length}건)`,
      `상가와 사무실, 단독 1층, 투룸을 봅니다. ${minShoot}㎡ 미만이거나 원룸이면 담지 않습니다. 배경 폭 2.4m 앞으로 4.4m가 비어야 두 사람이 찍히는데, 원룸은 네 면 중 한 면이 창, 한 면이 현관과 화장실, 한 면이 주방이라 벽이 안 나옵니다. 여덟 곳은 모여야 고를 수 있습니다.`, 92);
  }

  if (live.length < 20 && usable.length >= 8) {
    add("자리", `매물을 더 걷습니다 (지금 ${live.length}건)`,
      "네이버부동산·직방·다방·피터팬·당근을 돌아가며 봅니다. 한 번에 한 사이트만 보고, 새로 담은 건마다 source 에 그 화면 주소를 그대로 남깁니다. 스무 건은 모여야 비교가 됩니다.", 90);
  }

  const noCommute = live.filter((l) =>
    l.commute?.walkMin == null && l.commute?.transitMin == null && l.geo == null && !stuck(l, "commute"));
  if (noCommute.length) {
    add("자리", `지점까지 걸리는 시간이나 좌표를 채웁니다 (${noCommute.length}건)`,
      `길찾기로 도보 시간을 읽거나, 주소가 동까지만 나오면 지도 핀 좌표를 geo 에 담습니다. 둘 다 두 번 시도해서 안 되면 unresolved 에 "commute" 를 넣고 넘어갑니다. 대상 — ${noCommute.slice(0, 6).map((l) => l.id).join(", ")}${noCommute.length > 6 ? " 외" : ""}`, w(85, 55));
  }

  const unknownUse = live.filter((l) => l.livable === "미확인" && !stuck(l, "livable"));
  if (unknownUse.length) {
    add("자리", `잘 수 있는 자리인지 확인합니다 (${unknownUse.length}건)`,
      `건축물대장 용도를 봅니다. 근린생활시설이면 전입신고가 막힐 수 있습니다. 번지가 없어 대장을 못 떼면 unresolved 에 "livable" 을 넣고 넘어갑니다. 대상 — ${unknownUse.slice(0, 6).map((l) => l.id).join(", ")}${unknownUse.length > 6 ? " 외" : ""}`, w(80, 50));
  }

  const needPrice = (rows, label, area) => {
    const thin = rows.filter((r) => ["필수", "권장", "1안", "2안"].includes(r.need) && r.quotes.length < 2);
    if (thin.length) {
      add(area, `${label} 시세를 걷습니다 (${thin.length}건)`,
        `물건마다 새것 최저가 하나와 중고 두 건을 담습니다. 중고는 기종·상태·판 날짜를 같이 적습니다. 대상 — ${thin.slice(0, 6).map((r) => r.name).join(", ")}${thin.length > 6 ? " 외" : ""}`, 70);
    }
  };
  needPrice(d.gear, "장비", "장비");
  needPrice(d.interior, "인테리어", "인테리어");

  if ((d.market.rates ?? []).length < 8) {
    add("대관", `이 동네 대관 시세를 걷습니다 (지금 ${(d.market.rates ?? []).length}건)`,
      "스페이스클라우드에서 광진구·성수·건대 촬영 스튜디오를 봅니다. 평수와 시간당 가격, 주중 주말 차이를 적습니다. 여덟 곳은 모여야 중앙값이 뜻을 갖습니다.", 65);
  }

  const shortlist = d.listings.filter((l) => l.status === "shortlist");
  if (shortlist.length >= 3) {
    add("자리", `추린 매물의 확인 목록을 만듭니다 (${shortlist.length}건)`,
      "매물마다 임대인·중개에 물어볼 것을 정리합니다. 촬영과 대관을 해도 되는지, 전입신고가 되는지, 전기 용량은 얼마인지, 최소 계약 기간은 몇 달인지. 전화는 사람이 겁니다.", 60);
  }

  if (t.length === 0) {
    add("정리", "빈 칸이 없습니다. 오래된 것을 다시 봅니다",
      "30일 넘은 매물은 아직 살아 있는지 다시 보고, 없어졌으면 status 를 closed 로 바꿉니다. 60일 넘은 시세는 다시 걷습니다.", 10);
  }

  return t.sort((a, b) => b.weight - a.weight);
}

/* 물건 하나의 단가를 정한다. 고른 게 있으면 그걸 쓰고, 없으면 살 수 있는 것 중 제일 싼 값. */
export function unitPrice(item) {
  if (item.chosen) return { price: item.chosen.price, from: "고름", condition: item.chosen.condition };
  const ok = item.quotes.filter((q) => item.usedOk || q.condition === "new");
  if (!ok.length) return { price: null, from: null, condition: null };
  const min = ok.reduce((a, b) => (b.price < a.price ? b : a));
  return { price: min.price, from: "최저가", condition: min.condition };
}

export function itemTotal(item) {
  const u = unitPrice(item);
  return u.price == null ? null : u.price * item.qty;
}

export function planCost(plan, gear, interior) {
  const byId = new Map([...gear, ...interior].map((x) => [x.id, x]));
  const ids = [...(plan.gear ?? []), ...(plan.interior ?? [])];
  let sum = 0, missing = 0, counted = 0;
  for (const id of ids) {
    const it = byId.get(id);
    if (!it) continue;
    const tot = itemTotal(it);
    if (tot == null) missing++;
    else { sum += tot; counted++; }
  }
  return { sum, missing, counted, total: ids.length };
}
