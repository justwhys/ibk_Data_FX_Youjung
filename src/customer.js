/* 고객 영향 계산 — 와이프 문서 13장 C1~C16. scripts/customer.py와 같은 값이 나와야 한다.
   원칙: 기업별 → 통화별로 먼저 계산 후 고객군 합산(상계 금지) · 결제 예정보다 많은 선물환은 인정 안 함 · 5곳 미만 고객군 숨김 */
(function (root) {
  "use strict";
  var IND = { C10: "식료품", C13: "섬유제품", C20: "화학물질·화학제품", C22: "고무·플라스틱제품", C24: "1차 금속",
    C26: "전자부품·컴퓨터·통신장비", C27: "의료·정밀·광학기기", C29: "기타 기계·장비", C30: "자동차·트레일러", G46: "도매·상품중개" };
  var TYPE = { pay: "수입 결제형", recv: "수출 수취형", both: "수출입 병행형" };
  var CURS = ["USD", "JPY", "EUR", "CNY"];
  var MINPAY = 3; // 금액을 보여 주려면 결제 예정 업체가 3곳 이상

  function addDays(iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dayDiff(a, b) { return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5); }

  function build(INT, BASE) {
    var END = addDays(BASE, 90);
    var bdp = {}, c2 = {}, F = {}, order = [];
    INT["행내5_BDP고객기본"].forEach(function (r) { bdp[r.BZN] = r; });
    INT["행내2_CRP외환실적수출입"].forEach(function (r) { c2[r["사업자번호"]] = r; });
    INT["행내1_CRP외환실적전체"].forEach(function (r) {
      var b = r["사업자번호"], x = c2[b], ex = x["금년수출통관실적"], im = x["금년수입통관실적"];
      var typ = (im >= ex * 1.5 && im > 0) ? "pay" : ((ex >= im * 1.5 && ex > 0) ? "recv" : "both");
      var prev = r["금년도수출입무역외실적"] - r["연중전년동기증감액"];
      F[b] = { br: r["부점"], ind: bdp[b.replace(/-/g, "")]["표준산업분류코드"], type: typ, grow: prev ? r["연중전년동기증감액"] / prev : null,
        share: x["금년점유비율"], loan: r["총여신잔액"] > 0, ex: ex, im: im, pay: {}, cov: {} };
      order.push(b);
    });
    INT["행내3_수입BL만기일"].forEach(function (r) {
      if (r["도래년월일"] > BASE && r["도래년월일"] <= END && r["도래잔액"] > 0) { var p = F[r["사업자번호"]].pay; p[r["통화종류"]] = (p[r["통화종류"]] || 0) + r["도래잔액"]; }
    });
    INT["행내4_선물환만기일"].forEach(function (r) {
      if (r["매입·매도구분"] === "매입" && r["만기년월일"] > BASE && r["만기년월일"] <= END) { var c = F[r["사업자번호"]].cov; c[r["통화종류"]] = (c[r["통화종류"]] || 0) + r["계약금액"]; }
    });
    var BL = INT["행내3_수입BL만기일"];
    var branches = Object.keys(order.reduce(function (o, b) { o[F[b].br] = 1; return o; }, {})).sort();

    function pass(f, flt) { return !((flt.br && f.br !== flt.br) || (flt.ind && f.ind !== flt.ind) || (flt.type && f.type !== flt.type)); }

    function compute(R, flt) {
      var groups = {};
      order.forEach(function (b) {
        var f = F[b]; if (!pass(f, flt)) return;
        var curs = flt.cur ? [flt.cur] : CURS, pay = 0, cov = 0, burden = 0;
        curs.forEach(function (c) { var p = f.pay[c] || 0, k = Math.min(f.cov[c] || 0, p); pay += p * R[c]; cov += k * R[c]; burden += Math.max(p - k, 0) * R[c] * 0.01; });
        var key = f.ind + "|" + f.type; (groups[key] = groups[key] || []).push({ b: b, pay: pay, cov: cov, burden: burden, grow: f.grow, share: f.share, loan: f.loan, ex: f.ex, im: f.im });
      });
      var rows = [], hiddenN = 0;
      Object.keys(groups).forEach(function (key) {
        var fs = groups[key], k = key.split("|");
        if (fs.length < 5) { hiddenN += fs.length; return; }
        var payf = fs.filter(function (x) { return x.pay > 0; }), g = fs.filter(function (x) { return x.grow != null; });
        var sum = function (a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0); };
        rows.push({ key: key, ind: k[0], type: k[1], name: IND[k[0]], typeName: TYPE[k[1]], n: fs.length, nPay: payf.length,
          pay: sum(fs, function (x) { return x.pay; }), cov: sum(fs, function (x) { return x.cov; }), burden: sum(fs, function (x) { return x.burden; }),
          noFwd: payf.length ? payf.filter(function (x) { return x.cov === 0; }).length / payf.length : null,
          grow: g.length ? sum(g, function (x) { return x.grow; }) / g.length : null,
          share: sum(fs, function (x) { return x.share; }) / fs.length, loan: fs.filter(function (x) { return x.loan; }).length / fs.length,
          exSum: sum(fs, function (x) { return x.ex; }) });
        var last = rows[rows.length - 1]; last.masked = last.nPay > 0 && last.nPay < MINPAY; // 결제 예정 업체가 너무 적으면 한 업체 금액이 드러남
      });
      rows.sort(function (a, b) { return b.burden - a.burden || b.pay - a.pay; });
      var tot = { n: 0, nPay: 0, pay: 0, cov: 0, burden: 0 };
      rows.forEach(function (r) { tot.n += r.n; tot.nPay += r.nPay; tot.pay += r.pay; tot.cov += r.cov; tot.burden += r.burden; });
      tot.masked = tot.nPay > 0 && tot.nPay < MINPAY;
      return { rows: rows, top: rows.filter(function (r) { return r.burden > 0 && !r.masked; }).slice(0, 5), tot: tot, hiddenN: hiddenN };
    }

    function calendar(R, flt, ind, type) { // C15
      var wk = []; for (var i = 0; i < 13; i++) wk.push({ start: addDays(BASE, 1 + i * 7), un: 0, ok: 0, cnt: 0 });
      BL.forEach(function (r) {
        var f = F[r["사업자번호"]]; if (!pass(f, flt) || f.ind !== ind || f.type !== type || r["도래잔액"] <= 0) return;
        var c = r["통화종류"]; if (flt.cur && c !== flt.cur) return;
        var d = dayDiff(BASE, r["도래년월일"]); if (d < 1 || d > 91) return;
        var p = f.pay[c] || 0, ratio = p ? Math.min(1, (f.cov[c] || 0) / p) : 0, krw = r["도래잔액"] * R[c], w = Math.floor((d - 1) / 7);
        wk[w].un += krw * (1 - ratio); wk[w].ok += krw * ratio; wk[w].cnt++;
      });
      return wk;
    }
    return { MINPAY: MINPAY, compute: compute, calendar: calendar, IND: IND, TYPE: TYPE, CURS: CURS, branches: branches, BASE: BASE, END: END };
  }
  root.CustomerModel = { build: build };
})(typeof window !== "undefined" ? window : globalThis);
