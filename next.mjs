/**
 * 지금 할 일 하나를 뱉는다. 루프는 이걸 물어보고 그것만 한다.
 *
 *   node next.mjs        가장 급한 것 하나
 *   node next.mjs --all  남은 것 전부
 *
 * 상태 파일을 직접 열어 보고 "다음엔 뭘 할까" 를 스스로 정하지 않는다.
 * 그러면 쉬운 일만 골라 하다가 같은 자리를 맴돈다.
 */
import { loadAll, buildTasks } from "./tasks.mjs";

const tasks = buildTasks(loadAll());
const all = process.argv.includes("--all");

if (!tasks.length) { console.log("할 일이 없다."); process.exit(0); }

for (const t of all ? tasks : tasks.slice(0, 1)) {
  console.log(`\n[${t.area}] ${t.title}\n${t.detail}\n`);
}
if (!all && tasks.length > 1) console.log(`(뒤에 ${tasks.length - 1}건 더 있다. 전부 보려면 node next.mjs --all)\n`);
