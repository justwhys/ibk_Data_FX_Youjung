/* 시장 판단 로직 — 와이프 문서 10장 정의 그대로. scripts/market.py와 같은 값이 나와야 한다.
   입력: EXT (data/ext.json). 출력: window.MKT = { dates, prep(), stats(asof) ... } */
(function (root) {
  "use strict";
  function ffillTo(D, dates, vals) {
    var out = new Array(D.length), j = 0, last = null;
    for (var i = 0; i < D.length; i++) {
      while (j < dates.length && dates[j] <= D[i]) { if (vals[j] !== null && vals[j] !== undefined) last = vals[j]; j++; }
      out[i] = last;
    }
    return out;
  }
  function quantile(arr, p) { // 선형 보간 (numpy linear = pandas 기본)
    var a = arr.slice().sort(function (x, y) { return x - y; }), h = (a.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return a[lo] + (a[hi] - a[lo]) * (h - lo);
  }
  function std(a) { var m = 0, s = 0, n = a.length, i; for (i = 0; i < n; i++) m += a[i]; m /= n; for (i = 0; i < n; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / (n - 1)); }
  function wilson(k, n) {
    if (!n) return [NaN, NaN];
    var z = 1.96, p = k / n, den = 1 + z * z / n, c = (p + z * z / (2 * n)) / den,
      h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    return [c - h, c + h];
  }
  function monthAvail(ym, day) { // "YYYY-MM" 월 값은 다음 달 day일부터 알려진 것으로
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7); m++; if (m > 12) { m = 1; y++; }
    return y + "-" + (m < 10 ? "0" : "") + m + "-" + day;
  }

  function build(EXT) {
    var D = EXT["환율"]["시점"], N = D.length;
    var CUR = { USD: EXT["환율"]["원/미국달러"], JPY: EXT["환율"]["원/일본엔(100엔)"], EUR: EXT["환율"]["원/유로"], CNY: EXT["환율"]["원/위안"] };
    var USD = CUR.USD;
    var OIL = ffillTo(D, EXT["두바이유"]["기간"], EXT["두바이유"]["Dubai"]);
    var RET = new Array(N).fill(NaN), ABS = new Array(N).fill(NaN), VOL20 = new Array(N).fill(NaN), i;
    for (i = 1; i < N; i++) { RET[i] = Math.log(USD[i] / USD[i - 1]); ABS[i] = Math.abs(RET[i]); }
    for (i = 20; i < N; i++) VOL20[i] = std(RET.slice(i - 19, i + 1));
    var S1 = new Array(N).fill(false), S2 = new Array(N).fill(false), S3 = new Array(N).fill(false),
      T1 = new Array(N).fill(NaN), T2 = new Array(N).fill(NaN);
    for (i = 0; i < N; i++) {
      if (i >= 251) { T1[i] = quantile(ABS.slice(i - 250, i), 0.95); S1[i] = ABS[i] >= T1[i]; }
      if (i >= 270) { T2[i] = quantile(VOL20.slice(i - 250, i), 0.80); S2[i] = VOL20[i] >= T2[i]; }
      if (i >= 20 && OIL[i] != null && OIL[i - 20] != null) S3[i] = Math.abs(Math.log(OIL[i] / OIL[i - 20])) >= 0.10;
    }
    var SCORE = new Array(N), FWD = new Array(N).fill(NaN), GRID = [];
    for (i = 0; i < N; i++) SCORE[i] = ((S1[i] || S2[i]) ? 1 : 0) + (S3[i] ? 1 : 0);
    for (i = 0; i + 5 < N; i++) FWD[i] = Math.log(USD[i + 5] / USD[i]);
    for (i = 260; i < N; i += 5) GRID.push(i);

    // 참고 지표: 한미 금리차 60영업일 변화, 수출 전년 동월 대비 (발표 시점 규칙)
    var KR = ffillTo(D, EXT["기준금리"]["시점"], EXT["기준금리"]["값"]);
    var us = EXT["미국정책금리"], USR = us ? ffillTo(D, us["시점"].map(function (m) { return monthAvail(m, "01"); }), us["값"]) : null;
    var SPR = new Array(N).fill(NaN), SPRCH = new Array(N).fill(NaN);
    if (USR) for (i = 0; i < N; i++) { if (KR[i] != null && USR[i] != null) SPR[i] = KR[i] - USR[i]; if (i >= 60) SPRCH[i] = SPR[i] - SPR[i - 60]; }
    var tr = EXT["수출입"], per = tr["기간"], ex = tr["수출 금액"], im = tr["수입 금액"];
    var av = per.map(function (p) { return monthAvail(p.replace(".", "-"), "02"); });
    var EXY = new Array(N).fill(NaN), BALCH = new Array(N).fill(NaN), EXP = new Array(N).fill(null), k = -1;
    for (i = 0; i < N; i++) {
      while (k + 1 < av.length && av[k + 1] <= D[i]) k++;
      if (k >= 12) { EXY[i] = ex[k] / ex[k - 12] - 1; BALCH[i] = (ex[k] - im[k]) - (ex[k - 12] - im[k - 12]); EXP[i] = per[k]; }
    }
    var REF1 = SPRCH.map(function (v) { return v <= -0.25 + 1e-9; }), REF2 = EXY.map(function (v) { return v < 0; });

    function idxOf(asof) { var A = -1; for (var j = 0; j < N; j++) if (D[j] <= asof) A = j; return A; }
    function rate(idx) { var kk = 0; idx.forEach(function (j) { if (Math.abs(FWD[j]) >= 0.01) kk++; }); return { k: kk, n: idx.length, p: idx.length ? kk / idx.length : NaN, ci: wilson(kk, idx.length) }; }
    function pick(s, f) { return s.filter(f); }

    function stats(asof) {
      var A = idxOf(asof);
      var s = GRID.filter(function (j) { return j + 5 <= A; });
      var trn = s.filter(function (j) { var y = D[j].slice(0, 4); return y >= "2011" && y <= "2019"; });
      var val = s.filter(function (j) { return D[j].slice(0, 4) >= "2020"; });
      var sc = SCORE[A], same = s.filter(function (j) { return SCORE[j] === sc; });
      var all = rate(s), cur = rate(same);
      var up = same.filter(function (j) { return FWD[j] >= 0.01; }).length / same.length;
      var dn = same.filter(function (j) { return FWD[j] <= -0.01; }).length / same.length;
      var fw = same.map(function (j) { return FWD[j]; });
      var by = [0, 1, 2].map(function (x) { var f = function (j) { return SCORE[j] === x; }; return { tr: rate(pick(trn, f)), va: rate(pick(val, f)), all: rate(pick(s, f)) }; });
      var sigDefs = [["하루 급변", S1], ["흔들림 큼", S2], ["유가 급변", S3], ["금리차 불리", REF1], ["수출 감소", REF2]];
      var sig = sigDefs.map(function (d) { var f = function (j) { return d[1][j]; }; return { name: d[0], tr: rate(pick(trn, f)), va: rate(pick(val, f)), ref: d[0] === "금리차 불리" || d[0] === "수출 감소" }; });
      var ptr = by.map(function (b) { return b.tr.p; }), base = rate(trn).p, bm = 0, bb = 0;
      val.forEach(function (j) { var y = Math.abs(FWD[j]) >= 0.01 ? 1 : 0; bm += Math.pow(ptr[SCORE[j]] - y, 2); bb += Math.pow(base - y, 2); });
      var oilCh = (A >= 20 && OIL[A] != null && OIL[A - 20] != null) ? OIL[A] / OIL[A - 20] - 1 : null;
      return {
        asof: D[A], A: A, usd: USD[A], chg: USD[A] / USD[A - 1] - 1, won1: USD[A] * 0.01,
        S: [S1[A], S2[A], S3[A]], score: sc, absRet: ABS[A], t1: T1[A], vol20: VOL20[A], t2: T2[A], oilCh: oilCh,
        cur: cur, all: all, mult: cur.p / all.p, up: up, dn: dn,
        q: [quantile(fw, 0.1), quantile(fw, 0.5), quantile(fw, 0.9)],
        by: by, sig: sig, baseTr: rate(trn), baseVa: rate(val),
        brier: val.length ? [bm / val.length, bb / val.length] : [NaN, NaN],
        spr: SPR[A], exy: EXY[A], balch: BALCH[A], expPer: EXP[A], nSamples: s.length,
        cny: CUR.CNY[A]
      };
    }
    return { D: D, N: N, USD: USD, CUR: CUR, SCORE: SCORE, S1: S1, S2: S2, S3: S3, stats: stats, idxOf: idxOf, wilson: wilson };
  }
  root.MarketModel = { build: build };
})(typeof window !== "undefined" ? window : globalThis);
