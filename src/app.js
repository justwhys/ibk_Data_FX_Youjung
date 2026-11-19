/* IBK 환율 세이프가드 — 화면 렌더링.
   시장 숫자 = MarketModel(원천 시계열), 고객 숫자 = CustomerModel(가상 행내 데이터). 모두 이 파일 안에서 계산한다. */
(function () {
  "use strict";
  var M = MarketModel.build(EXT);
  var LATEST = M.D[M.N - 1];
  var PRESETS = [[LATEST, "최신"], ["2024-06-04", "조용했던 날"], ["2020-03-19", "급변했던 날"]];
  var LEVEL = ["낮음", "조금 높음", "높음"];
  var CUST_DATE = "2026-11-13";
  var C = INT_RAW ? CustomerModel.build(INT_RAW, CUST_DATE) : null;
  var CCY = [["USD", "원/달러", "원"], ["JPY", "원/100엔", "원"], ["EUR", "원/유로", "원"], ["CNY", "원/위안", "원"]];

  var $ = function (s) { return document.querySelector(s); };
  var f1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); };
  var pct = function (x, d) { return (x * 100).toFixed(d || 0) + "%"; };
  var sg = function (x, d) { return (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d == null ? 1 : d) + "%"; };
  var won = function (x) { return x.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
  var won2 = function (x) { return x.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var per100 = function (p) { return Math.round(p * 100); };
  var eok = function (krw) { var x = krw / 1e8; return x >= 10 ? Math.round(x).toLocaleString() : x.toFixed(1); };
  var man = function (krw) { return Math.round(krw / 1e4).toLocaleString(); };
  var esc = function (s) { return String(s).replace(/"/g, "&quot;"); };
  var tip = function (t, f) { return ' data-tip="' + esc(t) + '"' + (f ? ' data-f="' + esc(f) + '"' : ""); };
  var lights = function (sc) { var h = '<span class="lights">'; for (var i = 0; i < 3; i++) h += '<i class="' + (i < sc ? "on" : "") + '"></i>'; return h + "</span>"; };

  var state = { asof: LATEST, view: "v1", selKey: null, range: 1, ccy: "USD", showAll: false, flt: { br: "", ind: "", cur: "", type: "" } };
  var S, CC, R;

  // ── 컨트롤 ─────────────────────────────────────────
  var sel = $("#asof");
  PRESETS.forEach(function (p) { var o = document.createElement("option"); o.value = p[0]; o.textContent = p[0] + " · " + p[1]; sel.appendChild(o); });
  sel.onchange = function () { state.asof = sel.value; render(); };
  function fill(id, opts) { var el = $(id); el.innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join(""); return el; }
  if (C) {
    fill("#f-br", [["", "전체"]].concat(C.branches.map(function (b) { return [b, b.replace("Z가상지점", "가상지점 ")]; })));
    fill("#f-ind", [["", "전체"]].concat(Object.keys(C.IND).map(function (k) { return [k, k + " " + C.IND[k]]; })));
    fill("#f-cur", [["", "전체"]].concat(C.CURS.map(function (c) { return [c, c]; })));
    fill("#f-type", [["", "전체"], ["pay", "수입 결제형"], ["recv", "수출 수취형"], ["both", "수출입 병행형"]]);
    [["#f-br", "br"], ["#f-ind", "ind"], ["#f-cur", "cur"], ["#f-type", "type"]].forEach(function (p) {
      $(p[0]).onchange = function () { state.flt[p[1]] = $(p[0]).value; state.selKey = null; renderCust(); };
    });
  }
  $("#reset").onclick = function () {
    state.asof = LATEST; sel.value = LATEST; state.flt = { br: "", ind: "", cur: "", type: "" }; state.selKey = null; state.showAll = false;
    ["#f-br", "#f-ind", "#f-cur", "#f-type"].forEach(function (id) { $(id).value = ""; }); render();
  };
  document.querySelectorAll(".tab").forEach(function (b) { b.onclick = function () { go(b.getAttribute("data-v")); }; });
  function go(v) {
    state.view = v;
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === v); });
    document.querySelectorAll(".view").forEach(function (el) { el.classList.toggle("on", el.id === v); });
    document.querySelectorAll(".cf").forEach(function (el) { el.disabled = !C || v === "v3"; el.title = v === "v3" ? "③ 근거 탭에는 고객 필터가 적용되지 않습니다" : ""; });
    if (v === "v3") drawCharts();
    if (v === "v1" && S) { drawUsd(); if (charts.usd) charts.usd.resize(); }
    if (v === "v2" && S) { drawCal(); if (charts.cal) charts.cal.resize(); }
  }
  document.addEventListener("click", function (e) { var t = e.target.closest("[data-go]"); if (t) go(t.getAttribute("data-go")); });

  // ── 툴팁 (Tableau식: 설명 + 산식) ───────────────────
  var T = $("#tip");
  document.addEventListener("mouseover", function (e) {
    var el = e.target.closest("[data-tip]"); if (!el) { T.style.display = "none"; return; }
    T.innerHTML = el.getAttribute("data-tip") + (el.getAttribute("data-f") ? '<span class="f">' + el.getAttribute("data-f") + "</span>" : "");
    T.style.display = "block";
  });
  document.addEventListener("mousemove", function (e) {
    if (T.style.display !== "block") return;
    var x = e.clientX + 14, y = e.clientY - T.offsetHeight - 12;
    if (x + T.offsetWidth > window.innerWidth - 8) x = e.clientX - T.offsetWidth - 14;
    if (y < 8) y = e.clientY + 18;
    T.style.left = x + "px"; T.style.top = y + "px";
  });

  // ── 렌더 ───────────────────────────────────────────
  function series(ccy) { return M.CUR[ccy]; }
  function levelPct(arr, A, w) { var lo = Math.max(0, A - w + 1), c = 0, n = 0; for (var j = lo; j <= A; j++) { if (arr[j] == null) continue; n++; if (arr[j] <= arr[A]) c++; } return n ? c / n : NaN; }

  function render() {
    S = M.stats(state.asof);
    S.lvl1 = levelPct(M.USD, S.A, 250); S.lvl3 = levelPct(M.USD, S.A, 750);
    R = { USD: M.CUR.USD[S.A], JPY: M.CUR.JPY[S.A] / 100, EUR: M.CUR.EUR[S.A], CNY: M.CUR.CNY[S.A] };
    renderBasis(); renderMarket(); renderV3(); renderCust();
    $("#foot-l").textContent = C ? "고객 숫자: 가상 행내 데이터(" + CUST_DATE + ", 실제 고객 아님)로 계산 · 원화 환산은 시장 기준일 환율" : "고객 데이터 없음";
    $("#foot-r").textContent = "모든 숫자는 이 파일에 든 원천 데이터로 화면에서 계산 · 문장은 규칙 기반(생성형 AI 호출 없음) · 빌드 " + BUILT;
    if (state.view === "v3") drawCharts();
  }

  function renderBasis() {
    var b = $("#basis"), past = S.asof !== LATEST;
    b.classList.toggle("past", past);
    b.innerHTML = past
      ? "과거 시장 기준일 <b>" + S.asof + "</b>을 보는 중입니다 <span class='bar-sep'>│</span> 시장 숫자는 그날까지 알 수 있던 자료로만 계산 <span class='bar-sep'>│</span> 고객 데이터는 " + CUST_DATE + " 고정 (원화 환산만 그날 환율) <span class='bar-sep'>│</span> <span class='link' id='back'>최신으로 돌아가기 ›</span>"
      : "시장 <b>" + S.asof + " 매매기준율</b>(전 영업일 거래 기준 고시값) · 원/달러 <b>" + won(S.usd) + "원</b> " + sg(S.chg, 2) +
        " <span class='bar-sep'>│</span> 고객 <span class='v'>" + CUST_DATE + " 가상 데이터</span> <span class='bar-sep'>│</span> 고객 필터는 ①·② 탭의 고객 영역에만 적용 <span class='bar-sep'>│</span> 환율 예측이나 상품 권유가 아닙니다";
    var bk = $("#back"); if (bk) bk.onclick = function () { state.asof = LATEST; sel.value = LATEST; render(); };
  }

  function sigRows() {
    return [
      ["하루 급변", S.S[0], "오늘 " + sg(S.chg, 2) + " · 기준 ±" + f1(S.t1 * 100) + "%", "원/달러 하루 움직임이 직전 1년 중 상위 5% 이상이면 켜집니다.", "|ln(오늘/전일)| ≥ 직전 250일 |일간 변동|의 95% 분위수"],
      ["흔들림 큼", S.S[1], "20일 " + (S.vol20 * 100).toFixed(2) + "% · 기준 " + (S.t2 * 100).toFixed(2) + "%", "최근 20일 동안 흔들린 정도가 직전 1년 중 상위 20% 이상이면 켜집니다.", "20일 일간 변동 표준편차 ≥ 직전 250일 값의 80% 분위수"],
      ["유가 급변", S.S[2], "두바이유 한 달 " + (S.oilCh == null ? "-" : sg(S.oilCh, 1)), "두바이유가 20영업일 사이 ±10% 넘게 움직이면 켜집니다.", "|ln(오늘 유가 / 20영업일 전 유가)| ≥ 0.10 · 휴장일(0)은 직전 값"]
    ];
  }

  var RANGES = [["1개월", 21], ["3개월", 63], ["1년", 250]];
  function chgOf(arr, n) { var j = S.A - n; return (j >= 0 && arr[j] != null && arr[S.A] != null) ? arr[S.A] / arr[j] - 1 : null; }
  function chgSpan(label, x) { if (x == null) return ""; return "<span>" + label + ' <b class="' + (x >= 0 ? "up" : "dn") + '">' + (x >= 0 ? "▲" : "▼") + Math.abs(x * 100).toFixed(1) + "%</b></span>"; }

  function renderMarket() {
    var cc = CCY.filter(function (c) { return c[0] === state.ccy; })[0], arr = series(state.ccy), v = arr[S.A], pv = arr[S.A - 1];
    var lo = Math.max(0, S.A - 249), mn = Infinity, mx = -Infinity;
    for (var j = lo; j <= S.A; j++) if (arr[j] != null) { mn = Math.min(mn, arr[j]); mx = Math.max(mx, arr[j]); }
    var lvl = levelPct(arr, S.A, 250), d1 = (v != null && pv != null) ? v / pv - 1 : null, fmt = state.ccy === "CNY" ? won2 : won;
    $("#h-chart-head").innerHTML =
      '<div class="ch-top"><div><div class="cap" style="margin-bottom:2px">' + cc[1] + " 매매기준율 · " + S.asof + (state.ccy !== "USD" ? ' <span class="fine">· 경고등은 원/달러 기준</span>' : "") + "</div>" +
      (v == null ? '<div class="px" style="color:var(--faint)">기준일 이전 자료 없음</div>'
        : '<div class="px">' + fmt(v) + '원<small class="' + (d1 >= 0 ? "up" : "dn") + '">' + (d1 >= 0 ? "▲" : "▼") + Math.abs(d1 * 100).toFixed(2) + "% 전일 대비</small></div>") + "</div>" +
      '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end"><div class="seg" id="segc">' + CCY.map(function (c) { return '<button data-c="' + c[0] + '" class="' + (c[0] === state.ccy ? "on" : "") + '">' + c[0] + "</button>"; }).join("") + "</div>" +
      '<div class="seg" id="seg">' + RANGES.map(function (r, i) { return '<button data-r="' + i + '" class="' + (i === state.range ? "on" : "") + '">' + r[0] + "</button>"; }).join("") + "</div></div></div>" +
      '<div class="chg">' + chgSpan("1주", chgOf(arr, 5)) + chgSpan("1개월", chgOf(arr, 21)) + chgSpan("3개월", chgOf(arr, 63)) + chgSpan("1년", chgOf(arr, 250)) +
      (isFinite(mn) ? '<span' + tip("최근 1년(250영업일) 범위입니다. 수준만으로 앞으로의 방향을 말할 근거는 없습니다.", "1년 중 기준일 값 이하인 날의 비율 = " + pct(lvl)) + ">1년 범위 " + fmt(mn) + "~" + fmt(mx) + "원 · 아래에서 " + pct(lvl) + "</span>" : "") + "</div>";
    document.querySelectorAll("#seg button").forEach(function (b) { b.onclick = function () { state.range = +b.getAttribute("data-r"); renderMarket(); }; });
    document.querySelectorAll("#segc button").forEach(function (b) { b.onclick = function () { state.ccy = b.getAttribute("data-c"); renderMarket(); }; });
    if (state.view === "v1") drawUsd();

    var on = S.S.filter(Boolean).length, c = S.cur, w1 = Math.round(S.won1), k = per100(c.p), a = per100(S.all.p);
    $("#h-prob").innerHTML =
      '<div class="stline"><span class="cap" style="margin:0">변동 가능성</span>' + lights(S.score) + '<span class="nm2"' + tip("켜진 경고등 개수를 그대로 옮긴 상태입니다. 환율 방향 예측이 아닙니다.", "0개 = 낮음 · 1개 = 조금 높음 · 2개 = 높음 (하루 급변과 흔들림 큼은 같은 성격이라 하나로 셉니다)") + ">" + LEVEL[S.score] + '</span><span class="fine">경고등 ' + on + "/3</span></div>" +
      '<div class="sigs">' + sigRows().map(function (r) { return '<span class="' + (r[1] ? "on" : "") + '"' + tip(r[3] + " 지금: " + r[2], r[4]) + ">" + (r[1] ? "● " : "○ ") + r[0] + (r[1] && r[0] === "유가 급변" && S.oilCh != null ? " " + sg(S.oilCh, 0) : "") + "</span>"; }).join("") + "</div>" +
      '<div class="cap" style="margin-bottom:4px">경고등 ' + S.score + "개였던 과거 " + c.n + "번 — 1주일 뒤 원/달러가 ±1%(약 " + w1 + "원) 넘게 달라진 횟수</div>" +
      '<div class="ban2"' + tip("과거 같은 경고등 상태였던 " + c.n + "번 중 " + c.k + "번(" + pct(c.p, 1) + ")을 100번 기준으로 바꾼 값입니다. 95% 범위 " + pct(c.ci[0]) + "~" + pct(c.ci[1]) + ".", "5영업일 간격 표본 · |ln(5영업일 뒤/오늘)| ≥ 1% · 기준일까지 결과가 확정된 표본만") + '><small>100번당</small>' + k + "번" +
      (c.n < 30 ? ' <span class="warn" style="vertical-align:middle">근거 부족: 사례 ' + c.n + "번</span>" : "") + "</div>" +
      '<div class="pair" style="margin:8px 0">' +
        '<div><span>지금 상태</span><span class="t"><i style="width:' + k + '%;background:var(--ibk)"></i></span><span><b>' + k + "번</b></span></div>" +
        '<div><span>전체 평균</span><span class="t"><i style="width:' + a + '%;background:#B9C1CC"></i></span><span' + tip("기준일까지 확정된 전체 표본 " + S.all.n + "번의 평균입니다.") + ">" + a + "번 · 지금이 <b>" + S.mult.toFixed(1) + "배</b></span></div></div>" +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="chip">▲ 1% 넘게 오름 100번당 ' + per100(S.up) + '번</span><span class="chip">▼ 내림 100번당 ' + per100(S.dn) + '번</span><span class="fine">방향은 정해지지 않았습니다</span></div>' +
      '<div class="fine" style="margin-top:8px"><span class="link" data-go="v3">두 기간 검증 · 다른 날과 비교 ③ ›</span></div>';
  }

  // ── 고객 영역 (① 아래 · ②) ───────────────────────────
  function burdenTip() {
    return tip("90일 안에 결제할 수입 외화 중 당행 선물환이 확인되지 않은 금액에, 통화마다 그 통화의 원화 환율이 1% 오를 때 늘어나는 원화 부담입니다. 당행 거래 기준 추정이며 실제 환노출이 아닙니다.",
      "Σ 기업·통화별 max(90일 결제 예정 − min(당행 매입 선물환, 결제 예정), 0) × 시장 기준일 환율 × 1% · 기업끼리·통화끼리 서로 빼지 않습니다");
  }
  function renderCust() {
    if (!C) return;
    CC = C.compute(R, state.flt);
    var vis = CC.rows;
    if (!state.selKey || !vis.some(function (r) { return r.key === state.selKey; })) state.selKey = (CC.top[0] || vis[0] || {}).key || null;
    var t = CC.tot, small = t.n < 5 || t.masked;
    $("#h-cust").innerHTML =
      '<div class="cap">환율이 1% 오르면 늘어나는 원화 부담<span class="i"' + burdenTip() + ">i</span></div>" +
      (small ? '<div class="ban3" style="color:var(--faint);font-size:28px">표시 안 함</div><div class="fine" style="margin-top:8px">선택한 범위의 업체가 5곳 미만이거나 결제 예정 업체가 ' + C.MINPAY + '곳 미만이라, 한 업체의 금액이 드러나지 않도록 합계를 숨깁니다. 필터를 넓혀 보세요.</div>'
        : '<div class="ban3">' + eok(t.burden) + "억<small>원</small></div>" +
          '<div class="eq">90일 안에 결제할 수입 외화 <b>' + eok(t.pay) + "억</b><br>그중 당행 선물환 확인 안 됨 <b>" + (t.pay ? pct(1 - t.cov / t.pay) : "-") + "</b> <span class='fine'>(금액 기준)</span></div>" +
          '<div class="fine" style="margin-top:8px">결제 예정 업체 ' + t.nPay + "곳 (표시 " + t.n + "곳 중)" + (t.nPay ? " · 업체당 평균 약 " + man(t.burden / t.nPay) + "만 원" : "") + "</div>") +
      '<div class="fine" style="margin-top:6px">고객 기준일 ' + CUST_DATE + " · 가상 데이터</div>";

    var list = state.showAll ? vis : CC.top, mx = Math.max.apply(null, list.map(function (r) { return r.burden; }).concat([1]));
    var oneType = list.length && list.every(function (r) { return r.type === list[0].type; });
    var topSum = CC.top.reduce(function (s, r) { return s + r.burden; }, 0);
    var body = list.length ? list.map(function (r) {
      var rank = CC.top.indexOf(r);
      return '<tr class="' + (r.key === state.selKey ? "sel" : "") + '" data-key="' + r.key + '"><td>' + (rank >= 0 ? '<span class="rank">' + (rank + 1) + "</span>" : '<span class="rank" style="background:#C9CFD8">·</span>') + r.name + (oneType ? "" : '<span class="typetag">' + r.typeName + "</span>") + "</td>" +
        '<td class="n"' + tip("고객군 전체 " + r.n + "곳 중 90일 안에 결제 예정인 곳 " + r.nPay + "곳") + ">" + r.n + '곳 <span class="fine">(' + r.nPay + ")</span></td>" +
        (r.masked ? '<td class="n fine" colspan="3"' + tip("결제 예정 업체가 " + r.nPay + "곳뿐이라, 한 업체의 금액이 드러나지 않도록 금액을 숨깁니다.") + ">결제 예정 업체가 적어 금액을 숨김</td>"
          : '<td class="n">' + eok(r.pay) + '억</td><td class="n">' + (r.pay ? pct(1 - r.cov / r.pay) : "-") + "</td>" +
            '<td><div class="bb"><span class="t"><i style="width:' + (r.burden / mx * 100) + '%"></i></span><b>' + eok(r.burden) + "억</b></div></td>") + "<td><span class='link'>상담 준비 ›</span></td></tr>";
    }).join("") : '<tr><td colspan="6" class="fine" style="height:80px;text-align:center">선택한 범위에 보여 줄 고객군이 없습니다(5곳 미만은 숨김). 필터를 넓혀 보세요.</td></tr>';
    $("#t-top").innerHTML =
      '<div class="tbl-h"><div><div class="h2">' + (state.showAll ? "전체 고객군 " + vis.length + "개" : "먼저 점검할 고객군") + '</div><div class="h2s">1% 오르면 늘어나는 부담이 큰 순 · 행을 누르면 ② 탭에서 그 고객군의 상담 준비가 열립니다</div></div>' +
      '<span class="link" id="toggleAll">' + (state.showAll ? "‹ TOP 5만 보기" : "전체 " + vis.length + "개 고객군 보기 ›") + "</span></div>" +
      '<div class="tscroll"><table><thead><tr><th>고객군 (업종' + (oneType && list.length ? " · " + (state.showAll ? "모두 " : list.length + "개 모두 ") + list[0].typeName : " · 유형") + ")</th><th class='n'>업체 수 (결제 예정)<span class='i'" + tip("괄호 밖은 고객군 전체 업체 수, 괄호 안은 90일 안에 결제 예정이 있는 업체 수입니다.") + ">i</span></th><th class='n'>90일 결제 예정</th><th class='n'>당행 선물환 확인 안 됨<span class='i'" + tip("결제 예정 금액 중 당행 매입 선물환으로 환율을 정해 둔 것이 확인되지 않은 비율(금액 기준)입니다. 타행 헤지는 알 수 없습니다.") + ">i</span></th><th style='width:300px'>1% 오르면 늘어나는 부담 ▼</th><th style='width:100px'></th></tr></thead><tbody>" + body +
      (!state.showAll && CC.top.length && !small ? '<tr class="sum"><td>위 ' + CC.top.length + "개 합계</td><td></td><td></td><td></td><td><b>" + eok(topSum) + "억</b> · 전체 " + eok(t.burden) + "억의 약 " + Math.round(topSum / t.burden * 100) + "%</td><td></td></tr>" : "") + "</tbody></table></div>" +
      '<div class="tfoot"><span class="fine">당행 거래 기준 추정이며 실제 환노출이 아닙니다 · 타행 헤지는 알 수 없어 "확인 안 됨"으로 씁니다 · 업체명은 표시하지 않고 5곳 미만 고객군은 숨깁니다' + (CC.hiddenN ? " (이번 범위에서 " + CC.hiddenN + "곳 숨김)" : "") + "</span></div>";
    $("#toggleAll").onclick = function () { state.showAll = !state.showAll; renderCust(); };
    document.querySelectorAll("#t-top tbody tr[data-key]").forEach(function (tr) { tr.onclick = function () { state.selKey = tr.getAttribute("data-key"); renderCust(); go("v2"); }; });
    renderV2();
  }

  function script(r) {
    var tail = r && r.type === "recv" ? "앞으로 받으실 외화 일정이 있으시면 금액과 시점을 함께 점검해 보시죠." : "다가오는 외화 결제가 있으시면 금액과 시점을 함께 점검해 보시죠.";
    return "최근 원/달러는 " + won(S.usd) + "원입니다. 지금과 비슷했던 과거에는 100번 중 " + per100(S.cur.p) + "번이 1주일 뒤 ±1%(약 " + Math.round(S.won1) +
      "원) 넘게 달라졌습니다. 전체 평균은 " + per100(S.all.p) + "번입니다. 그중 1% 넘게 오른 경우가 " + per100(S.up) + "번, 내린 경우가 " + per100(S.dn) +
      "번으로 방향은 정해지지 않았습니다. " + tail;
  }

  function renderV2() {
    var vis = CC ? CC.rows : [], r = vis.filter(function (x) { return x.key === state.selKey; })[0];
    var rank = r ? CC.top.indexOf(r) : -1;
    if (!r) { $("#c-left").innerHTML = '<div class="ph" style="height:300px">선택한 범위에 고객군이 없습니다. 필터를 넓혀 보세요.</div>'; }
    else {
      $("#c-left").innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><select id="gpick" class="picker" style="font:inherit;font-size:18px;font-weight:700;max-width:430px">' +
          vis.map(function (x, i) { var k = CC.top.indexOf(x); return '<option value="' + x.key + '"' + (x.key === r.key ? " selected" : "") + ">" + (k >= 0 ? (k + 1) + ". " : "") + x.name + " · " + x.typeName + "</option>"; }).join("") + "</select>" +
        '<span class="fine"><span class="link" id="prevg">‹ 이전</span> &nbsp; <span class="link" id="nextg">다음 ›</span></span></div>' +
        '<div class="h2s" style="margin-top:6px">' + r.n + "곳 (90일 결제 예정 " + r.nPay + "곳) · " + (r.type === "recv" ? "환율이 내리면 부담이 커지는 고객군" : r.type === "pay" ? "환율이 오르면 부담이 커지는 고객군" : "수출·수입을 함께 하는 고객군") + (rank >= 0 ? " · 요약 탭 순위 " + (rank + 1) + "위" : "") + "</div>" +
        (r.masked ? '<div class="ph" style="height:96px;margin-top:14px">결제 예정 업체가 ' + r.nPay + "곳뿐이라, 한 업체의 금액이 드러나지 않도록 금액·주별 결제를 숨깁니다</div>" :
        '<div class="kpis"><div><div class="cap" style="margin:0">90일 안에 결제할 수입 외화</div><div class="kv">' + eok(r.pay) + "억</div></div>" +
        '<div><div class="cap" style="margin:0">선물환 확인 안 됨 (금액 기준)</div><div class="kv">' + (r.pay ? pct(1 - r.cov / r.pay) : "-") + "</div></div>" +
        '<div><div class="cap" style="margin:0">1% 오르면 늘어나는 부담<span class="i"' + burdenTip() + '>i</span></div><div class="kv o">' + eok(r.burden) + "억</div>" + (r.nPay ? '<div class="fine">결제 예정 업체당 평균 약 ' + man(r.burden / r.nPay) + "만 원</div>" : "") + "</div></div>") +
        (r.type === "recv" ? '<div class="fine" style="margin-top:8px;color:#8A5B06">수출 수취형은 환율이 내릴 때 부담입니다. 받을 외화(미매입 수출 L/C)는 확장 계획이라, 위 금액은 이 고객군의 수입 결제분만 계산했습니다 · 금년 수출통관 ' + Math.round(r.exSum / 1e3).toLocaleString() + "천 달러</div>" : "") +
        '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px"><div><div class="h2">언제 돌아오나요? — 앞으로 13주, 주마다 결제할 외화</div><div class="h2s">원화 환산 · 수입 B/L 도래잔액 기준 · 막대에 마우스를 올리면 금액과 건수</div></div>' +
        '<span class="legend"><span><i style="background:#8D98A6"></i>당행 선물환 확인 안 됨</span><span><i style="background:#D5DAE1"></i>확인됨</span></span></div>' +
        (r.masked ? "" : '<div id="ch-cal" style="height:190px"></div>') +
        '<div class="h2" style="margin-top:8px">이 고객군의 특징</div>' +
        '<div class="feat"><div' + tip("90일 안에 결제 예정이 있는 업체 중 당행 매입 선물환이 하나도 확인되지 않은 업체 비율입니다.") + ">당행 선물환 확인 안 된 업체<br><span class='fine'>업체 수 기준</span><b>" + (r.noFwd == null ? "-" : pct(r.noFwd)) + "</b></div>" +
          '<div' + tip("총여신잔액이 0보다 큰 업체 비율입니다.") + ">여신 보유 업체<br><span class='fine'>업체 수 기준</span><b>" + pct(r.loan) + "</b></div>" +
          '<div' + tip("업체별 연중 전년 동기 대비 증감률의 평균입니다.", "연중전년동기증감액 ÷ (금년도수출입무역외실적 − 연중전년동기증감액)") + ">실적 증감<br><span class='fine'>연중 전년 동기 대비</span><b>" + (r.grow == null ? "-" : sg(r.grow, 0)) + "</b></div></div>";
      $("#gpick").onchange = function () { state.selKey = $("#gpick").value; renderCust(); };
      var idx = vis.indexOf(r);
      $("#prevg").onclick = function () { state.selKey = vis[(idx + vis.length - 1) % vis.length].key; renderCust(); };
      $("#nextg").onclick = function () { state.selKey = vis[(idx + 1) % vis.length].key; renderCust(); };
      if (state.view === "v2") drawCal();
    }

    $("#c-right").innerHTML =
      '<div class="h2">상담 준비</div><div class="h2s" style="margin-bottom:10px">순서대로 보시면 됩니다 · 문장은 규칙으로 만들며 생성형 AI를 쓰지 않습니다</div>' +
      '<div class="rail"><i>!</i><span><b>먼저 연락할 땐 점검 안내만</b> 합니다. 선물환 등 파생상품 상담은 <b>고객이 요청할 때</b>만 합니다 (금융소비자보호법 · 적합성 원칙)</span></div>' +
      '<div class="step"><div class="stt"><span class="n">1단계</span>상담 전에 확인할 것</div><div class="chk">' +
        (r && r.type === "recv" ? ["받을 외화의 금액과 시점(네고 예정 수출 L/C)", "타행 포함 기존 헤지 여부", "환율이 내리면 채산성이 어떻게 되는지", "보유 외화예금과 원화 전환 계획"]
          : ["결제 예정 외화의 금액과 시점", "타행 포함 기존 헤지 여부", "판매가에 환율을 반영할 수 있는지", "유산스 기간 등 결제 조건 조정 여지"]).map(function (x) { return "<label><input type='checkbox'> " + x + "</label>"; }).join("") + "</div></div>" +
      '<div class="step"><div class="stt"><span class="n">2단계</span>고객께 이렇게 말씀하세요<span class="link" id="copy">문구 복사</span></div><div class="quote" id="quote">' + script(r) + "</div>" +
        '<div class="fine" style="margin-top:6px">숫자 근거: <span class="link" data-go="v3">두 기간 검증 보기 ③ ›</span></div></div>' +
      '<div class="step"><div class="stt"><span class="n">3단계</span>고객이 물으면</div><div class="qa">' +
        "<details open><summary>Q. 얼마나 흔들릴 수 있나요?</summary><p>지금과 비슷했던 과거 100번 중 " + per100(S.cur.p) + "번은 1주일 뒤 ±1%(약 " + Math.round(S.won1) + "원) 넘게 달라졌습니다(전체 평균 " + per100(S.all.p) + "번). 1% 넘게 오른 경우 " + per100(S.up) + "번, 내린 경우 " + per100(S.dn) + "번입니다.</p></details>" +
        "<details><summary>Q. 지금 환율 수준은 어디쯤인가요?</summary><p>원/달러 " + won(S.usd) + "원은 최근 1년 중 아래에서 " + pct(S.lvl1) + ", 최근 3년 중 아래에서 " + pct(S.lvl3) + " 위치입니다. 수준만으로 앞으로의 방향을 말할 근거는 없어, 결제 일정에 맞춰 점검하시는 것이 좋습니다.</p></details>" +
        "<details><summary>Q. 우리 회사는 얼마나 영향받나요?</summary><p>화면의 금액은 고객군 단위 추정입니다. 귀사의 결제 예정 외화와 시점을 확인해 함께 계산해 드리겠습니다.</p></details>" +
      "</div></div>" +
      '<div class="step"><div class="stt"><span class="n">4단계</span>안내 순서</div><div class="order">' +
        (r && r.type === "recv" ? '<div><span class="k">먼저 안내할 것 (점검)</span>미매입 수출 L/C의 매입 시점 상담<br>받을 외화의 외화예금 보유·원화 전환 시점 점검</div>'
          : '<div><span class="k">먼저 안내할 것 (점검)</span>결제 예정일과 유산스 등 결제 조건 점검<br>보유 외화예금으로 결제 대비</div>') + '<div class="arr">›</div>' +
        '<div class="later"><span class="k">고객이 요청하면</span>선물환 상담 → 외환 창구·IBK FXON 안내, 헤지-메신저로 선물환 계약 여부에 따른 손익 비교<br>통화옵션·환변동보험 등 → 적합성 확인 후 전문 상담</div></div></div>';
    $("#copy").onclick = function () {
      var txt = $("#quote").textContent, done = function () { $("#copy").textContent = "복사됨 ✓"; setTimeout(function () { var c = $("#copy"); if (c) c.textContent = "문구 복사"; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
      function fallback() { var rg = document.createRange(); rg.selectNodeContents($("#quote")); var s = getSelection(); s.removeAllRanges(); s.addRange(rg); try { document.execCommand("copy"); done(); } catch (e) {} }
    };
  }

  // ── ③ 근거 ─────────────────────────────────────────
  function passOf(g) { return g.tr.n && g.va.n && (g.tr.p - S.baseTr.p >= 0.05) && (g.va.p - S.baseVa.p >= 0.05); }
  function renderV3() {
    var red = (S.brier[1] - S.brier[0]) / S.brier[1];
    $("#e-lead").innerHTML =
      '<div class="big">2011~2019년 자료로 경고등 규칙을 정하고, <em>2020년 이후 자료로 다시 확인했습니다.</em> 두 기간 모두 전체 평균보다 5%p 이상 높았던 경고등 3개만 판단에 씁니다.</div>' +
      '<div style="text-align:right;min-width:250px"' + tip("학습 기간의 경고등 수별 비율로 검증 기간을 맞혀 본 오차(Brier 점수)입니다. 낮을수록 좋습니다.", "전체 평균만 쓸 때 " + S.brier[1].toFixed(4) + " → 경고등 수별 비율 " + S.brier[0].toFixed(4)) + '><div class="cap" style="margin:0">전체 평균만 쓸 때보다 예측 오차</div>' + (S.baseVa.n < 30
        ? '<div style="font-size:22px;font-weight:700;color:#8A5B06">검증 표본 부족</div><div class="fine">이 기준일까지 2020년 이후 표본 ' + S.baseVa.n + "번</div></div>"
        : '<div style="font-size:26px;font-weight:700">약 ' + pct(red, 1) + ' 감소</div><div class="fine">작지만 실제로 줄었습니다</div></div>');
    var cmp = PRESETS.map(function (p) { return [p, M.stats(p[0])]; });
    $("#e-cmp").innerHTML =
      '<div class="h2">그래도 방향은 맞히지 못합니다</div><div class="h2s">경고등 ' + S.score + "개였던 과거 " + S.cur.n + "번 · 1주일 뒤</div>" +
      '<div class="dirrow"><span>▲ 1% 넘게 오름</span><span class="t"><i style="width:' + per100(S.up) + '%"></i></span><b>100번당 ' + per100(S.up) + "번</b></div>" +
      '<div class="dirrow"><span>▼ 1% 넘게 내림</span><span class="t"><i style="width:' + per100(S.dn) + '%"></i></span><b>100번당 ' + per100(S.dn) + "번</b></div>" +
      '<div class="fine" style="margin-top:8px">1주일 뒤 변화는 10번 중 8번이 ' + sg(S.q[0]) + " ~ " + sg(S.q[2]) + " 안이었습니다 (가운데 " + sg(S.q[1]) + ")</div>" +
      '<div class="h2" style="font-size:15px;margin-top:12px">다른 날의 경고등</div>' +
      '<table class="cmp3"><thead><tr><th>시장 기준일</th><th>켜진 경고등</th><th>상태</th><th class="n">100번당</th><th class="n">전체 평균 대비</th></tr></thead><tbody>' +
      cmp.map(function (x) { var s = x[1]; return "<tr style='cursor:default'><td>" + x[0][0] + " · " + x[0][1] + "</td><td>" + s.score + "개</td><td>" + LEVEL[s.score] + "</td><td class='n'>" + per100(s.cur.p) + "번</td><td class='n'>" + s.mult.toFixed(1) + "배</td></tr>"; }).join("") + "</tbody></table>";
    var bal = S.balch / 1e5;
    $("#e-layers").innerHTML =
      '<div><b>사실 <span class="ok">계산에 씀</span></b>오늘 환율·유가가 얼마나 움직였나<br>예: 두바이유 한 달 ' + (S.oilCh == null ? "-" : sg(S.oilCh, 0)) + "</div>" +
      '<div><b>과거 기록 <span class="ok">계산에 씀</span></b>지금과 비슷했던 때 실제로 어땠나<br>예: 100번당 ' + per100(S.cur.p) + "번</div>" +
      '<div><b style="color:var(--faint)">이론 <span class="ok g">설명용</span></b>"금리차가 벌어지면 달러가 강해진다" 같은 설명은 계산에 쓰지 않습니다</div>' +
      "<div><b>참고만 하는 지표</b>한미 금리차 " + (isNaN(S.spr) ? "-" : (S.spr >= 0 ? "+" : "−") + Math.abs(S.spr).toFixed(2) + "%p") + " · 수출 전년 동월 대비 " + sg(S.exy, 1) + " (" + S.expPer + ") · 무역수지 변화 " + (bal >= 0 ? "+" : "−") + Math.abs(Math.round(bal)).toLocaleString() + "억 달러 — 두 기간 차이가 5%p에 못 미쳐 판단에 쓰지 않습니다</div>";
  }

  // ── 차트 ───────────────────────────────────────────
  var charts = {};
  var TT = { backgroundColor: "#1C2430", borderWidth: 0, textStyle: { color: "#fff", fontSize: 13 } };
  function drawUsd() {
    if (typeof echarts === "undefined") return;
    var arr = series(state.ccy), n = RANGES[state.range][1], lo = Math.max(0, S.A - n), xs = [], ys = [], fmt = state.ccy === "CNY" ? won2 : won;
    for (var j = lo; j <= S.A; j++) { xs.push(M.D[j]); ys.push(arr[j]); }
    // Q2: 경고등이 켜졌던 구간(원/달러 기준)을 연한 띠로
    var areas = [], st = null;
    for (j = lo; j <= S.A; j++) {
      var onj = M.SCORE[j] > 0;
      if (onj && st === null) st = j;
      if ((!onj || j === S.A) && st !== null) { var en = onj ? j : j - 1; areas.push([{ xAxis: M.D[st], itemStyle: { color: M.SCORE.slice(st, en + 1).some(function (v) { return v > 1; }) ? "rgba(229,161,46,.22)" : "rgba(229,161,46,.11)" } }, { xAxis: M.D[en] }]); st = null; }
    }
    var first = ys.filter(function (v) { return v != null; })[0], last = ys[ys.length - 1], up = last >= first;
    var el = document.getElementById("ch-usd");
    charts.usd = charts.usd || echarts.init(el, null, { renderer: "svg" });
    charts.usd.setOption({
      animation: false, textStyle: { fontFamily: "Pretendard, Malgun Gothic" },
      grid: { left: 46, right: 14, top: 14, bottom: 24 },
      tooltip: Object.assign({ trigger: "axis", formatter: function (p) {
        var i = M.D.indexOf(p[0].axisValue), sc = M.SCORE[i], on = [];
        if (M.S1[i]) on.push("하루 급변"); if (M.S2[i]) on.push("흔들림 큼"); if (M.S3[i]) on.push("유가 급변");
        return p[0].axisValue + "<br><b>" + (p[0].value == null ? "-" : fmt(p[0].value) + "원") + "</b><br><span style='color:#C9D2DD'>원/달러 경고등 " + sc + "개 · " + LEVEL[sc] + (on.length ? " (" + on.join("·") + ")" : "") + "</span>";
      } }, TT),
      xAxis: { type: "category", data: xs, boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: "#CFD5DD" } },
        axisLabel: { color: "#8A939F", fontSize: 11.5, interval: Math.floor(xs.length / 4), formatter: function (v) { return v.slice(2).replace(/-/g, "."); } } },
      yAxis: { type: "value", scale: true, splitNumber: 3, axisLabel: { color: "#8A939F", fontSize: 11.5, formatter: function (v) { return state.ccy === "CNY" ? v.toFixed(0) : Math.round(v).toLocaleString(); } }, splitLine: { lineStyle: { color: "#EEF0F3" } } },
      series: [{ type: "line", data: ys, showSymbol: false, connectNulls: false, lineStyle: { color: "#0B5CAB", width: 2 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(11,92,171,.14)" }, { offset: 1, color: "rgba(11,92,171,0)" }] } },
        markArea: { silent: true, data: areas },
        markLine: { silent: true, symbol: "none", lineStyle: { color: "#9AA3AE", type: "dashed" }, label: { formatter: RANGES[state.range][0] + " 전", color: "#8A939F", fontSize: 11, position: "insideStartTop" }, data: first != null ? [{ yAxis: first }] : [] },
        markPoint: { symbol: "circle", symbolSize: 9, itemStyle: { color: up ? "#D64545" : "#2F6FD0", borderColor: "#fff", borderWidth: 2 }, label: { show: false }, data: last != null ? [{ coord: [xs.length - 1, last] }] : [] } }]
    }, true);
    var lg = document.getElementById("usd-legend");
    if (lg) lg.innerHTML = '<span><i style="background:rgba(229,161,46,.3)"></i>원/달러 경고등이 켜졌던 기간</span>';
  }

  function drawCal() {
    if (typeof echarts === "undefined" || !CC) return;
    var r = CC.rows.filter(function (x) { return x.key === state.selKey; })[0], el = document.getElementById("ch-cal");
    if (!r || !el || r.masked) return;
    var wk = C.calendar(R, state.flt, r.ind, r.type), mxi = 0;
    wk.forEach(function (w, i) { if (w.un + w.ok > wk[mxi].un + wk[mxi].ok) mxi = i; });
    if (charts.cal && charts.cal.getDom() !== el) { charts.cal.dispose(); charts.cal = null; }
    charts.cal = charts.cal || echarts.init(el, null, { renderer: "svg" });
    charts.cal.setOption({
      animation: false, textStyle: { fontFamily: "Pretendard, Malgun Gothic" },
      grid: { left: 44, right: 8, top: 36, bottom: 24 },
      tooltip: Object.assign({ trigger: "axis", axisPointer: { type: "shadow" }, formatter: function (p) { var w = wk[p[0].dataIndex]; return w.start + " 주<br>합계 <b>" + eok(w.un + w.ok) + "억</b> (" + w.cnt + "건)<br>당행 선물환 확인 안 됨 " + eok(w.un) + "억 · 확인됨 " + eok(w.ok) + "억"; } }, TT),
      xAxis: { type: "category", data: wk.map(function (w) { return w.start.slice(5).replace("-", "/"); }), axisTick: { show: false }, axisLine: { lineStyle: { color: "#CFD5DD" } }, axisLabel: { color: "#8A939F", fontSize: 11.5, interval: 1 } },
      yAxis: { type: "value", splitNumber: 3, axisLabel: { color: "#8A939F", fontSize: 11.5, formatter: function (v) { return Math.round(v / 1e8) + "억"; } }, splitLine: { lineStyle: { color: "#EEF0F3" } } },
      series: [
        { name: "확인 안 됨", type: "bar", stack: "a", barWidth: "62%", data: wk.map(function (w) { return w.un; }), itemStyle: { color: "#8D98A6" } },
        { name: "확인됨", type: "bar", stack: "a", data: wk.map(function (w, i) { return { value: w.ok, label: { show: i === mxi, position: "top", align: i >= 10 ? "right" : (i <= 1 ? "left" : "center"), formatter: function () { return "가장 많은 주 " + eok(w.un + w.ok) + "억"; }, color: "#1C2430", fontWeight: 600, fontSize: 12 } }; }), itemStyle: { color: "#D5DAE1" } }
      ]
    }, true);
  }

  function drawCharts() {
    if (typeof echarts === "undefined") return;
    var names = ["전체 평균"].concat(S.sig.map(function (g) { return g.name; }));
    var rows = [{ tr: S.baseTr, va: S.baseVa, base: true }].concat(S.sig);
    var lab = rows.map(function (g) {
      var cnt = "{s|" + g.tr.n + "번 · " + g.va.n + "번}";
      if (g.base) return cnt;
      var tag = g.ref ? "{g|참고만}" : (passOf(g) ? "{p|✓ 두 기간 확인}" : "{w|확인 부족}");
      if (Math.min(g.tr.n, g.va.n) < 30) tag += "{w| · 표본 적음}";
      return cnt + "\n" + tag;
    });
    var mk = function (key, col, dim) { return rows.map(function (g) { var v = g[key].n ? +(g[key].p * 100).toFixed(1) : null; return { value: v, n: g[key].n, k: g[key].k, itemStyle: { color: g.ref ? dim : col } }; }); };
    var ttf = function (p) { var d = p.data; return p.name + " · " + p.seriesName + "<br>" + d.k + " / " + d.n + "번 = <b>" + d.value + "%</b>"; };
    charts.sig = charts.sig || echarts.init(document.getElementById("ch-sig"), null, { renderer: "svg" });
    charts.sig.setOption({
      animation: false, textStyle: { fontFamily: "Pretendard, Malgun Gothic" },
      grid: { left: 44, right: 12, top: 26, bottom: 64 },
      tooltip: Object.assign({ trigger: "item", formatter: ttf }, TT),
      xAxis: { type: "category", data: names, axisTick: { show: false }, axisLine: { lineStyle: { color: "#CFD5DD" } },
        axisLabel: { interval: 0, color: "#1C2430", fontSize: 14, fontWeight: 600, lineHeight: 18, formatter: function (v, i) { return v + "\n" + lab[i]; },
          rich: { s: { color: "#6A7380", fontSize: 12, fontWeight: 400, lineHeight: 17 }, p: { color: "#0B5CAB", fontSize: 12, fontWeight: 700 }, g: { color: "#9AA3AE", fontSize: 12, fontWeight: 700 }, w: { color: "#B06A00", fontSize: 12, fontWeight: 700 } } } },
      yAxis: { type: "value", max: function (v) { return Math.max(70, Math.ceil((v.max + 8) / 10) * 10); }, axisLabel: { formatter: "{value}%", color: "#8A939F" }, splitLine: { lineStyle: { color: "#EEF0F3" } } },
      series: [
        { name: "2011~2019년", type: "bar", barWidth: 30, barGap: "12%", data: mk("tr", "#B9C1CC", "#DADFE5"), label: { show: true, position: "top", color: "#6A7380", fontSize: 12.5, formatter: function (p) { return p.value == null ? "" : Math.round(p.value); } },
          markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#9AA3AE", type: "dashed" }, data: [{ yAxis: +(S.baseTr.p * 100).toFixed(1) }] } },
        { name: "2020년 이후", type: "bar", barWidth: 30, data: mk("va", "#0B5CAB", "#9DBBDD"), label: { show: true, position: "top", color: "#0B5CAB", fontWeight: 700, fontSize: 12.5, formatter: function (p) { return p.value == null ? "자료 없음" : Math.round(p.value); } },
          markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#0B5CAB", opacity: 0.55, type: "dashed" }, data: [{ yAxis: S.baseVa.n ? +(S.baseVa.p * 100).toFixed(1) : 0 }] } }
      ]
    }, true);
    charts.st = charts.st || echarts.init(document.getElementById("ch-steps"), null, { renderer: "svg" });
    charts.st.setOption({
      animation: false, textStyle: { fontFamily: "Pretendard, Malgun Gothic" },
      grid: { left: 10, right: 10, top: 22, bottom: 26 },
      tooltip: Object.assign({ trigger: "item", formatter: ttf }, TT),
      xAxis: { type: "category", data: ["0개 · 낮음", "1개 · 조금 높음", "2개 · 높음"], axisTick: { show: false }, axisLine: { lineStyle: { color: "#CFD5DD" } },
        axisLabel: { interval: 0, color: "#1C2430", fontSize: 13.5, formatter: function (v, i) { return i === S.score ? "{b|" + v + " ◀ 지금}" : v; }, rich: { b: { fontWeight: 700, fontSize: 13.5, color: "#1C2430" } } } },
      yAxis: { type: "value", max: function (v) { return Math.max(65, v.max + 12); }, show: false },
      series: [
        { name: "2011~2019년", type: "bar", barWidth: 34, barGap: "12%", data: S.by.map(function (b) { return { value: b.tr.n ? +(b.tr.p * 100).toFixed(1) : null, n: b.tr.n, k: b.tr.k }; }), itemStyle: { color: "#B9C1CC" }, label: { show: true, position: "top", color: "#6A7380", formatter: function (p) { return p.value == null ? "" : Math.round(p.value); } } },
        { name: "2020년 이후", type: "bar", barWidth: 34, data: S.by.map(function (b) { return { value: b.va.n ? +(b.va.p * 100).toFixed(1) : null, n: b.va.n, k: b.va.k }; }), itemStyle: { color: "#0B5CAB" }, label: { show: true, position: "top", color: "#0B5CAB", fontWeight: 700, formatter: function (p) { return p.value == null ? "자료 없음" : Math.round(p.value); } } }
      ]
    }, true);
  }

  go("v1");
  render();
  window.__FX = { M: M, C: C, stats: function () { return S; }, cust: function () { return CC; }, state: state, go: go, render: render,
    setAsof: function (d) { state.asof = d; sel.value = d; render(); } };
})();
