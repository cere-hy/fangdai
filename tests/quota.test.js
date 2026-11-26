/**
 * 首套房公积金基础额度测算 —— 回归用例
 * 直接从 index.html 抽取算法代码块执行，保证测试与线上口径同源。
 *
 *   node tests/quota.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const A = '/* ---------- 1. 配置 ---------- */';
const B = '/* ---------- 5. 格式化 ---------- */';
const i = html.indexOf(A), j = html.indexOf(B);
if (i < 0 || j < 0) throw new Error('未能定位算法代码块，请检查 index.html 的分节注释');
const code = html.slice(i, j);
const C = new Function(code + `
return {compute,retireMonths,isTrans,fullYears,parseD,addMonths,addYears,cmp,dstr,TRANS,DEF};`)();

let pass = 0, fail = 0;
const fails = [];

function ok(name, actual, expect) {
  const a = JSON.stringify(actual), e = JSON.stringify(expect);
  if (a === e) { pass++; }
  else { fail++; fails.push(`${name}\n    期望 ${e}\n    实际 ${a}`); }
}
function D(s) { return C.parseD(s); }

/* 构造配置：与页面默认值一致（上限万元 → 元） */
function mkCf(o) {
  const c = Object.assign({
    capMale: C.DEF.capMale, capFemale: C.DEF.capFemale,
    plus: C.DEF.plus, longest: C.DEF.longest,
    baseMult: C.DEF.baseMult, suppMult: C.DEF.suppMult,
    baseCapS: C.DEF.baseCapS * 10000, baseCapC: C.DEF.baseCapC * 10000,
    suppCapS: C.DEF.suppCapS * 10000, suppCapC: C.DEF.suppCapC * 10000,
    ratio: C.DEF.ratio / 100, houseBase: C.DEF.houseBase,
    roundTo: C.DEF.roundTo, mode: 'dual', accept: D('2026-11-26')
  }, o || {});
  return c;
}
function run(o, cf) {
  const c = cf || mkCf();
  const inp = Object.assign({
    gender: 'male', fclass: null, income: 10000, baseBal: 0, suppBal: 0,
    couple: false, spIncome: 0, spBaseBal: 0, spSuppBal: 0,
    houseType: 'new', builtYear: 0, accept: c.accept
  }, o || {});
  inp.birth = D(inp.birth);
  return C.compute(inp, c);
}

console.log('=== 一、退休月数档位（官方三张对照表边界） ===');
[['1964-12-15', 'male', null, 720, '60 岁'],
 ['1965-01-15', 'male', null, 721, '60 岁 1 个月'],
 ['1976-08-15', 'male', null, 755, '62 岁 11 个月'],
 ['1976-09-15', 'male', null, 756, '63 岁'],
 ['1969-12-15', 'female', 'mg', 660, '55 岁'],
 ['1970-01-15', 'female', 'mg', 661, '55 岁 1 个月'],
 ['1981-08-15', 'female', 'mg', 695, '57 岁 11 个月'],
 ['1981-09-15', 'female', 'mg', 696, '58 岁'],
 ['1974-12-15', 'female', 'wg', 600, '50 岁'],
 ['1975-01-15', 'female', 'wg', 601, '50 岁 1 个月'],
 ['1984-10-15', 'female', 'wg', 659, '54 岁 11 个月'],
 ['1984-11-15', 'female', 'wg', 660, '55 岁']
].forEach(([b, g, c, exp, txt]) => {
  const d = D(b);
  ok(`退休月数 ${g}/${c || '-'} ${b} → ${txt}`, C.retireMonths(g, c, d.y, d.m), exp);
});

console.log('=== 二、过渡期判定（含区间外） ===');
ok('男 1964-12 非过渡期', C.isTrans(D('1964-12-15'), 'male', null), false);
ok('男 1965-01 过渡期', C.isTrans(D('1965-01-15'), 'male', null), true);
ok('男 1976-08 过渡期', C.isTrans(D('1976-08-15'), 'male', null), true);
ok('男 1976-09 非过渡期', C.isTrans(D('1976-09-15'), 'male', null), false);
ok('女管理 1969-12 非过渡期', C.isTrans(D('1969-12-15'), 'female', 'mg'), false);
ok('女管理 1981-08 过渡期', C.isTrans(D('1981-08-15'), 'female', 'mg'), true);
ok('女管理 1981-09 非过渡期', C.isTrans(D('1981-09-15'), 'female', 'mg'), false);
ok('女工人 1984-10 过渡期', C.isTrans(D('1984-10-15'), 'female', 'wg'), true);
ok('女工人 1984-11 非过渡期', C.isTrans(D('1984-11-15'), 'female', 'wg'), false);

console.log('=== 三、核心年龄样例（1971-10-15 男，受理 2026-11-26） ===');
{
  const r = run({ birth: '1971-10-15', income: 10000, baseBal: 40000, suppBal: 0 });
  ok('法定退休月数', r.rm, 741);
  ok('法定退休年龄文本', Math.floor(r.rm / 12) + '岁' + (r.rm % 12) + '月', '61岁9月');
  ok('退休路到期日', C.dstr(r.rEnd), '2038-07-15');
  ok('硬顶到期日', C.dstr(r.capEnd), '2039-10-15');
  ok('取短后到期日', C.dstr(r.end), '2038-07-15');
  ok('年龄可贷年限', r.ageYraw, 11);
  ok('最终可贷年限', r.finalY, 11);
  ok('余额路（4 万 × 30 顶 100 万）', r.balRoute, 1000000);
  ok('还款能力（1 万 × 40% × 12 × 11）', r.ability, 528000);
  ok('限额来源', r.flags[0].t, '还款能力卡住');
  ok('最终额度', r.amt, 528000);
}

console.log('=== 四、到期日临界与取短方向 ===');
ok('受理日 + 11 年 = 到期日 → 满年不退',
  C.fullYears(D('2026-11-26'), D('2037-11-26')), 11);
ok('差一天不满 12 年',
  C.fullYears(D('2026-11-26'), D('2037-11-25')), 10);
ok('男 1976-09 退休路 = 硬顶（63+5=68）',
  C.dstr(run({ birth: '1976-09-15' }).end), '2044-09-15');
{
  const r = run({ birth: '1976-09-15' }, mkCf({ capMale: 65 }));
  ok('硬顶下调至 65 时取短改由硬顶生效', C.dstr(r.end), '2041-09-15');
}
{
  const r = run({ birth: '1981-09-15', gender: 'female', fclass: 'mg' });
  ok('1981-09 女管理岗非过渡期直接 63 硬顶', C.dstr(r.end), '2044-09-15');
  ok('非过渡期不产出退休月数', r.rm, null);
  ok('退休路参考到期日 = 58 岁 ＋ 5 年 = 63 岁，与硬顶同日', C.dstr(r.rEndAll), '2044-09-15');
}
{
  const r = run({ birth: '1985-01-15', gender: 'female' });
  ok('女工人岗非过渡期走 63 硬顶（退休 55＋5＝60 仅作参考）',
    [C.dstr(r.end), C.dstr(r.rEndAll)], ['2048-01-15', '2045-01-15']);
}
{
  const r = run({ birth: '1977-01-15' });
  ok('1977-01 男 → 68 硬顶', C.dstr(r.end), '2045-01-15');
}

console.log('=== 五、月末 / 闰日对齐 ===');
ok('1-31 加 1 个月 → 2 月末',
  C.dstr(C.addMonths(D('1980-01-31'), 1)), '1980-02-29');
ok('平年 1-31 加 1 个月 → 2-28',
  C.dstr(C.addMonths(D('1981-01-31'), 1)), '1981-02-28');
ok('2-29 加 67 年（平年）→ 锚定 2-28',
  C.dstr(C.addYears(D('2000-02-29'), 67)), '2067-02-28');
ok('2-29 加 68 年（闰年）→ 仍为 2-29',
  C.dstr(C.addYears(D('2000-02-29'), 68)), '2068-02-29');
ok('2-30 非法日期被拦截', D('2001-02-30'), null);
ok('13 月非法日期被拦截', D('2001-13-01'), null);
ok('仅年月视为无效', D('2001-02'), null);

console.log('=== 五之二、日期快捷输入（8 位数字 / 斜杠 / 全角） ===');
ok('19580101 → 1958-01-01', C.dstr(D('19580101')), '1958-01-01');
ok('19711015 → 1971-10-15', C.dstr(D('19711015')), '1971-10-15');
ok('1958/1/1 → 1958-01-01', C.dstr(D('1958/1/1')), '1958-01-01');
ok('1958.01.01 → 1958-01-01', C.dstr(D('1958.01.01')), '1958-01-01');
ok('全角 １９５８０１０１ → 1958-01-01', C.dstr(D('１９５８０１０１')), '1958-01-01');
ok('前后空格被忽略', C.dstr(D('  19580101  ')), '1958-01-01');
ok('6 位仅年月仍视为无效', D('195801'), null);
ok('19580230 非法日期被拦截', D('19580230'), null);
ok('快捷输入走完整计算：19580101 男 → 已超退休年龄',
  (() => { const r = run({ birth: '19580101' }); return [r.errType, r.amt]; })(), ['overage', 0]);

console.log('=== 六、房龄可贷年限阈值 ===');
[['2007', 19, 30], ['2006', 20, 30], ['1992', 34, 16], ['1991', 35, 15], ['2026', 0, 30]]
  .forEach(([y, age, exp]) => {
    const r = run({ birth: '1971-10-15', houseType: 'old', builtYear: +y });
    ok(`房龄 ${age} 年（竣工 ${y}）→ ${exp} 年`, [r.houseAge, r.houseY], [age, exp]);
  });
ok('一手房取最长年限', run({ birth: '1971-10-15', houseType: 'new' }).houseY, 30);
ok('房龄年限与年龄年限取短',
  run({ birth: '1971-10-15', houseType: 'old', builtYear: 2000 }).finalY, 11);

console.log('=== 七、分段计算与各自封顶 ===');
[['基本 0 万 / 补充 10 万', 0, 100000, 200000, '20 万'],
 ['基本 1 万 / 补充 10 万', 10000, 100000, 500000, '50 万'],
 ['基本 4 万 / 补充 0', 40000, 0, 1000000, '100 万'],
 ['基本 10 万 / 补充 10 万（单人）', 100000, 100000, 1200000, '120 万']
].forEach(([name, b, s, exp]) => {
  const r = run({ birth: '1971-10-15', income: 5e6, baseBal: b, suppBal: s });
  ok(name + ' → ' + exp, r.balRoute, exp);
});
{
  const r = run({ birth: '1971-10-15', income: 5e6, baseBal: 100000, suppBal: 100000 });
  const tags = r.flags.map(f => f.t);
  ok('单人 120 万：两段均标顶上限',
    tags, ['余额卡住', '基本段顶上限', '补充段顶上限']);
}
{
  const r = run({ birth: '1971-10-15', income: 5e6, couple: true, spIncome: 10000,
    baseBal: 100000, suppBal: 100000, spBaseBal: 0, spSuppBal: 0 });
  ok('夫妻基本 10 万 + 补充 10 万 → 240 万', r.balRoute, 2400000);
}
{
  const r = run({ birth: '1971-10-15', income: 5e6, baseBal: 10000, suppBal: 0 });
  ok('基本倍数不足（未封顶）标记', r.flags.map(f => f.t), ['余额卡住', '基本倍数不足']);
}
ok('补充余额 2 万整 → 20 万', run({ birth: '1971-10-15', income: 5e6, suppBal: 20000 }).suppLoan, 200000);
ok('补充余额 2 万零 1 元 → 20 万', run({ birth: '1971-10-15', income: 5e6, suppBal: 20001 }).suppLoan, 200000);
ok('补充余额为 0 时不输出补充段标记',
  run({ birth: '1971-10-15', income: 10000, baseBal: 40000 }).flags.map(f => f.t).join(','),
  '还款能力卡住');

console.log('=== 八、零余额 / 超龄 / 取整 ===');
{
  const r = run({ birth: '1971-10-15', baseBal: 0, suppBal: 0 });
  ok('零余额 → 额度 0 且注明无可用余额', [r.amt, r.flags[0].t], [0, '无可用余额']);
}
{
  const r = run({ birth: '1950-03-01' });
  ok('超龄 → 终止并给出原因', [!!r.err, r.finalY], [true, 0]);
}
{
  const r = run({ birth: '1971-10-15', income: 10000, baseBal: 40000 }, mkCf({ roundTo: 1000 }));
  ok('千元取整', r.amt, 528000);
}
{
  const r = run({ birth: '1971-10-15', income: 10000, baseBal: 40000 }, mkCf({ roundTo: 10000 }));
  ok('万元向下取整', r.amt, 520000);
}
{
  const r = run({ birth: '1971-10-15', income: 10000, baseBal: 40000 }, mkCf({ roundTo: 100 }));
  ok('百元取整', r.amt, 528000);
}
{
  const r = run({ birth: '1971-10-15', income: 10000, baseBal: 40000 }, mkCf({ ratio: 0.5 }));
  ok('系数 50% → 66 万', r.amt, 660000);
}
{
  const r = run({ birth: '1971-10-15', income: 10000, baseBal: 40000 }, mkCf({ longest: 40 }));
  ok('最长 40 年时年龄仍卡 11 年', r.finalY, 11);
}

console.log('=== 九、年龄封顶与夫妻合并 ===');
{
  const r = run({ birth: '1996-01-01' }, mkCf({ longest: 30 }));
  ok('年轻申请人按最长 30 年封顶', [r.ageYraw, r.ageY, r.finalY], [37, 30, 30]);
}
{
  const r = run({ birth: '1996-01-01' }, mkCf({ longest: 40 }));
  ok('最长 40 年时按 37 年（年龄路）', r.finalY, 37);
}
{
  const r = run({ birth: '1971-10-15', income: 10000, baseBal: 40000, couple: true,
    spIncome: 0, spBaseBal: 0, spSuppBal: 0 });
  ok('配偶合并月收入 0 → 叠加后总额不变', [r.income, r.ability], [10000, 528000]);
}
{
  const r = run({ birth: '1971-10-15', income: 10000, baseBal: 40000, couple: true,
    spIncome: 20000, spBaseBal: 0, spSuppBal: 0 });
  ok('配偶月收入 2 万 → 还款能力 158.4 万', r.ability, 1584000);
}

console.log('=== 九之二、未来受理日（受理在签约之后） ===');
ok('受理日 2027-11-26 → 年龄路 10 年',
  run({ birth: '1971-10-15' }, mkCf({ accept: D('2027-11-26') })).ageYraw, 10);
ok('受理日 2028-11-26 → 年龄路 9 年、额度 43.2 万',
  (() => { const r = run({ birth: '1971-10-15', income: 10000, baseBal: 40000 },
    mkCf({ accept: D('2028-11-26') })); return [r.ageYraw, r.amt]; })(), [9, 432000]);
ok('受理日 2030-08-01 → 年龄路 7 年',
  run({ birth: '1971-10-15' }, mkCf({ accept: D('2030-08-01') })).ageYraw, 7);
ok('未来受理日下房龄按受理年派生（2030 − 2010 = 20 年）',
  (() => { const r = run({ birth: '1990-01-01', houseType: 'old', builtYear: 2010 },
    mkCf({ accept: D('2030-01-01') })); return [r.houseAge, r.houseY]; })(), [20, 30]);
ok('未来受理日已过退休年龄 → 仍拦截为 0',
  (() => { const r = run({ birth: '1971-10-15' }, mkCf({ accept: D('2039-01-01') }));
    return [r.errType, r.amt]; })(), ['overage', 0]);

console.log('=== 十、法定退休年龄拦截（已退休 → 额度 0） ===');
ok('女性硬顶默认值为 63 岁', C.DEF.capFemale, 63);
{
  const r = run({ birth: '1971-03-01', gender: 'female', fclass: 'mg' });
  ok('女管理岗 55 岁 4 个月退休、受理日已过 → 超龄',
    [r.errType, r.amt, r.finalY, C.dstr(r.retireAt)],
    ['overage', 0, 0, '2026-07-01']);
}
{
  const r = run({ birth: '1966-06-26' });
  ok('受理日 = 退休日当天 → 判超龄', [r.errType, r.amt], ['overage', 0]);
}
{
  const r = run({ birth: '1966-05-26' });
  ok('退休日早于受理日 1 个月 → 判超龄', [r.errType, r.amt], ['overage', 0]);
}
{
  const r = run({ birth: '1966-07-26' }, mkCf({ baseCapS: 1000000 }));
  ok('退休日晚于受理日 1 个月 → 仍可贷 5 年',
    [!!r.err, r.ageYraw, r.finalY], [false, 5, 5]);
}
{
  const r = run({ birth: '1971-03-01', gender: 'female', fclass: 'mg' }, mkCf({ mode: 'cap' }));
  ok('超龄拦截与年限口径开关无关（仅硬顶下仍拦截）', [r.errType, r.amt], ['overage', 0]);
}
{
  const r = run({ birth: '1990-05-05' });
  ok('男 63 岁退休 ＋ 5 年 = 68 = 硬顶，两路同日', C.dstr(r.end), '2058-05-05');
}

const total = pass + fail;
console.log('\n----------------------------------------');
console.log(`用例 ${total} 条：通过 ${pass}，失败 ${fail}`);
if (fail) { console.log('\n失败明细：'); fails.forEach(f => console.log(' ✗ ' + f)); process.exit(1); }
console.log('全部通过 ✓');
