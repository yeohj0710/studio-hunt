# 구의동 스튜디오

신용보증기금 광진지점(서울 광진구 광나루로 520)에서 걸어갈 거리에 팟캐스트 스튜디오를 잡는 계획.
자리·장비·인테리어·예산을 한군데 모아 놓고 정적 사이트로 굽는다.

- 사이트 — https://studio-hunt.vercel.app
- 조사 루프 지침 — [AGENTS.md](AGENTS.md)

## 조건

- 월세 + 관리비 + 공과금 합쳐 **월 100만원까지**. 80만원 아래면 편하다.
- 지점에서 **걸어서 15분 안**이 1순위.
- 잘 수도 있으면 좋다. 다만 건축물 용도에 따라 전입신고가 막히는 자리가 있다.
- 팟캐스트 수준. 방음 공사는 안 한다. 뒤에 가벽 하나 세우는 정도.
- 인테리어는 최저가로 맞춘다. 장비는 중고도 산다.

## 구조

```
data/
  config.json      기준점·조건·아직 모르는 것
  listings.json    매물 후보              (조사 루프가 채운다)
  gear.json        살 장비와 시세          (목록은 사람이, 시세는 루프가)
  interior.json    인테리어 품목과 시세
  plans.json       세 가지 안 (A·B·C)
  market.json      이 동네 대관 시세       (조사 루프가 채운다)
  log.json         조사 일지
validate.mjs       데이터 검사. 여기서 막히면 빌드가 안 된다
build.mjs          data/*.json → dist/*.html
tasks.mjs          빈 칸을 할 일 목록으로 바꾼다
next.mjs           지금 할 일 하나를 뱉는다
```

의존성이 없다. node 기본만 쓴다.

## 쓰는 법

```bash
node next.mjs        # 지금 할 일 하나
npm run validate     # 데이터 검사
npm run build        # dist/ 로 굽는다
npm run deploy       # 검사 + 빌드 + Vercel 프로덕션 배포
```

배포는 Vercel CLI 로만 된다. GitHub 연동이 없어서 push 만으로는 사이트가 안 바뀐다.

## 숫자 단위

매물은 **만원**, 장비·인테리어 견적은 **원**, 대관 시세는 시간당 **원**.
`validate.mjs` 가 범위로 잡지만 애초에 맞춰서 넣는다.
