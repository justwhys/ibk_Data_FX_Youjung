/* IBK 환율 세이프가드 — 화면 렌더링. 시장 숫자는 전부 MarketModel로 계산, 고객 숫자는 가상 데이터 연결 전까지 임시값. */
(function () {
  "use strict";
  var M = MarketModel.build(EXT);
  var LATEST = M.D[M.N - 1];
  var PRESETS = [[LATEST, "최신"], ["2024-06-04", "조용했던 날"], ["2020-03-19", "급변했던 날"]];
  var LEVEL = ["낮음", "조금 높음", "높음"];
  var CUST_DATE = "2026-11-13";
  var HAS_INT = !!INT_RAW;

  // 고객 쪽 임시값 — 와이프 문서 20.3 기준값. 가상 데이터(INT_RAW)가 연결되면 계산값으로 바뀐다.
  var TEMP = {
    total: { pay: 5684, cov: 0.09, burden: 52, firmsPay: 376, avg: 1379 },
    top: [
      { g: "섬유제품", n: 70, pay: 1042, cov: 0.03, b: 10, tags: { noFwd: 0.83, loan: 0.81, grow: 0.10 }, avg: 2146 },
      { g: "화학물질·화학제품", n: 62, pay: 840, cov: 0.01, b: 8.3 },
      { g: "전자부품·컴퓨터·통신장비", n: 99, pay: 829, cov: 0.03, b: 8.0 },
      { g: "식료품", n: 85, pay: 831, cov: 0.11, b: 7.4 },
      { g: "도매·상품중개", n: 71, pay: 929, cov: 0.24, b: 7.1 }
    ], topSum: 41, groups: 28
  };

  var $ = function (s) { return document.querySelector(s); };
  var f1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); };
  var pct = function (x, d) { return (x * 100).toFixed(d || 0) + "%"; };
  var sg = function (x, d) { return (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d == null ? 1 : d) + "%"; };
  var won = function (x) { return x.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
  var per100 = function (p) { return Math.round(p * 100); };
  var eok = function (x) { return x >= 10 ? String(Math.round(x)) : x.toFixed(1); };
  var esc = function (s) { return String(s).replace(/"/g, "&quot;"); };
  var tip = function (t, f) { return ' data-tip="' + esc(t) + '"' + (f ? ' data-f="' + esc(f) + '"' : ""); };
  var lights = function (sc) { var h = '<span class="lights">'; for (var i = 0; i < 3; i++) h += '<i class="' + (i < sc ? "on" : "") + '"></i>'; return h + "</span>"; };
  function levelPct(A, w) { var lo = Math.max(0, A - w + 1), c = 0, n = 0; for (var j = lo; j <= A; j++) { n++; if (M.USD[j] <= M.USD[A]) c++; } return c / n; }

  var state = { asof: LATEST, view: "v1", sel: 0 };

  // ── 컨트롤 ─────────────────────────────────────────
  var sel = $("#asof");
  PRESETS.forEach(function (p) { var o = document.createElement("option"); o.value = p[0]; o.textContent = p[0] + " · " + p[1]; sel.appendChild(o); });
  sel.onchange = function () { state.asof = sel.value; render(); };
  $("#reset").onclick = function () { state.asof = LATEST; sel.value = LATEST; render(); };
  document.querySelectorAll(".tab").forEach(function (b) { b.onclick = function () { go(b.getAttribute("data-v")); }; });
  function go(v) {
    state.view = v;
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === v); });
    document.querySelectorAll(".view").forEach(function (el) { el.classList.toggle("on", el.id === v); });
    document.querySelectorAll(".cf").forEach(function (el) { el.disabled = !HAS_INT || v === "v3"; el.title = v === "v3" ? "③ 근거 탭에는 고객 필터가 적용되지 않습니다" : (HAS_INT ? "" : "가상 고객 데이터 연결 후 사용"); });
    if (v === "v3") drawCharts();
    if (v === "v1" && S) { drawUsd(); if (charts.usd) charts.usd.resize(); }
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
  var S;
  function render() {
    S = M.stats(state.asof);
    S.lvl1 = levelPct(S.A, 250); S.lvl3 = levelPct(S.A, 750);
    renderBasis(); renderV1(); renderV2(); renderV3();
    $("#foot-l").textContent = HAS_INT ? "고객 숫자: 가상 데이터(" + CUST_DATE + ")로 계산" : "고객 숫자: 임시값(문서 기준값) — 가상 고객 데이터 연결 전";
    $("#foot-r").textContent = "시장 숫자는 이 파일에 든 원천 데이터로 화면에서 계산 · 문장은 규칙 기반(생성형 AI 호출 없음) · 빌드 " + BUILT;
    if (state.view === "v3") drawCharts();
  }

  function renderBasis() {
    var b = $("#basis"), past = S.asof !== LATEST;
    b.classList.toggle("past", past);
    b.innerHTML = past
      ? "과거 시장 기준일 <b>" + S.asof + "</b>을 보는 중입니다 <span class='bar-sep'>│</span> 시장 숫자는 그날까지 알 수 있던 자료로만 계산 <span class='bar-sep'>│</span> 고객 숫자는 " + CUST_DATE + " 고정 <span class='bar-sep'>│</span> <span class='link' id='back'>최신으로 돌아가기 ›</span>"
      : "시장 <b>" + S.asof + " 매매기준율</b>(전 영업일 거래 기준 고시값) · 원/달러 <b>" + won(S.usd) + "원</b> " + sg(S.chg, 2) +
        " <span class='bar-sep'>│</span> 고객 <span class='v'>" + CUST_DATE + " 가상 데이터</span> <span class='bar-sep'>│</span> 고객 필터는 ①·② 탭의 고객 영역에만 적용 <span class='bar-sep'>│</span> 환율 예측이나 상품 권유가 아닙니다";
    var bk = $("#back"); if (bk) bk.onclick = function () { state.asof = LATEST; sel.value = LATEST; render(); };
  }

  function sigRows() {
    var w1 = Math.round(S.won1);
    return [
      ["하루 급변", S.S[0], "오늘 " + sg(S.chg, 2) + " · 기준 ±" + f1(S.t1 * 100) + "%", "원/달러 하루 움직임이 직전 1년 중 상위 5% 이상이면 켜집니다.", "|ln(오늘/전일)| ≥ 직전 250일 |일간 변동|의 95% 분위수"],
      ["흔들림 큼", S.S[1], "20일 " + (S.vol20 * 100).toFixed(2) + "% · 기준 " + (S.t2 * 100).toFixed(2) + "%", "최근 20일 동안 흔들린 정도가 직전 1년 중 상위 20% 이상이면 켜집니다.", "20일 일간 변동 표준편차 ≥ 직전 250일 값의 80% 분위수"],
      ["유가 급변", S.S[2], "두바이유 한 달 " + (S.oilCh == null ? "-" : sg(S.oilCh, 1)), "두바이유가 20영업일 사이 ±10% 넘게 움직이면 켜집니다.", "|ln(오늘 유가 / 20영업일 전 유가)| ≥ 0.10 · 휴장일(0)은 직전 값"]
    ];
  }

  function chgOf(n) { var j = S.A - n; return j >= 0 ? M.USD[S.A] / M.USD[j] - 1 : null; }
  function chgSpan(label, x) { if (x == null) return ""; return "<span>" + label + ' <b class="' + (x >= 0 ? "up" : "dn") + '">' + (x >= 0 ? "▲" : "▼") + Math.abs(x * 100).toFixed(1) + "%</b></span>"; }
  var RANGES = [["1개월", 21], ["3개월", 63], ["1년", 250]];
  state.range = 1;

  function renderV1() {
    var on = S.S.filter(Boolean).length, lv = LEVEL[S.score];
    var lo = Math.max(0, S.A - 249), mn = Infinity, mx = -Infinity;
    for (var j = lo; j <= S.A; j++) { mn = Math.min(mn, M.USD[j]); mx = Math.max(mx, M.USD[j]); }
    $("#h-chart-head").innerHTML =
      '<div class="ch-top"><div><div class="cap" style="margin-bottom:2px">원/달러 매매기준율 · ' + S.asof + '</div>' +
      '<div class="px">' + won(S.usd) + '원<small class="' + (S.chg >= 0 ? "up" : "dn") + '">' + (S.chg >= 0 ? "▲" : "▼") + Math.abs(S.chg * 100).toFixed(2) + "% 전일 대비</small></div></div>" +
      '<div class="seg" id="seg">' + RANGES.map(function (r, i) { return '<button data-r="' + i + '" class="' + (i === state.range ? "on" : "") + '">' + r[0] + "</button>"; }).join("") + "</div></div>" +
      '<div class="chg">' + chgSpan("1주", chgOf(5)) + chgSpan("1개월", chgOf(21)) + chgSpan("3개월", chgOf(63)) + chgSpan("1년", chgOf(250)) +
      '<span' + tip("최근 1년(250영업일) 원/달러 범위입니다. 수준만으로 앞으로의 방향을 말할 근거는 없습니다.", "1년 중 기준일 값 이하인 날의 비율 = " + pct(S.lvl1)) + '>1년 범위 ' + Math.round(mn).toLocaleString() + "~" + Math.round(mx).toLocaleString() + "원 · 아래에서 " + pct(S.lvl1) + "</span></div>";
    document.querySelectorAll("#seg button").forEach(function (b) { b.onclick = function () { state.range = +b.getAttribute("data-r"); renderV1(); }; });
    if (state.view === "v1") drawUsd();

    var c = S.cur, w1 = Math.round(S.won1), k = per100(c.p), a = per100(S.all.p);
    $("#h-prob").innerHTML =
      '<div class="stline"><span class="cap" style="margin:0">변동 가능성</span>' + lights(S.score) + '<span class="nm2"' + tip("켜진 경고등 개수를 그대로 옮긴 상태입니다. 환율 방향 예측이 아닙니다.", "0개 = 낮음 · 1개 = 조금 높음 · 2개 = 높음 (하루 급변과 흔들림 큼은 같은 성격이라 하나로 셉니다)") + ">" + lv + '</span><span class="fine">경고등 ' + on + "/3</span></div>" +
      '<div class="sigs">' + sigRows().map(function (r) { return '<span class="' + (r[1] ? "on" : "") + '"' + tip(r[3] + " 지금: " + r[2], r[4]) + ">" + (r[1] ? "● " : "○ ") + r[0] + (r[1] && r[0] === "유가 급변" && S.oilCh != null ? " " + sg(S.oilCh, 0) : "") + "</span>"; }).join("") + "</div>" +
      '<div class="cap" style="margin-bottom:4px">경고등 ' + S.score + "개였던 과거 " + c.n + "번 — 1주일 뒤 ±1%(약 " + w1 + "원) 넘게 달라진 횟수</div>" +
      '<div class="ban2"' + tip("과거 같은 경고등 상태였던 " + c.n + "번 중 " + c.k + "번(" + pct(c.p, 1) + ")을 100번 기준으로 바꾼 값입니다. 95% 범위 " + pct(c.ci[0]) + "~" + pct(c.ci[1]) + ".", "5영업일 간격 표본 · |ln(5영업일 뒤/오늘)| ≥ 1% · 기준일까지 결과가 확정된 표본만") + '><small>100번당</small>' + k + "번" +
      (c.n < 30 ? ' <span class="warn" style="vertical-align:middle">근거 부족: 사례 ' + c.n + "번</span>" : "") + "</div>" +
      '<div class="pair" style="margin:8px 0">' +
        '<div><span>지금 상태</span><span class="t"><i style="width:' + k + '%;background:var(--ibk)"></i></span><span><b>' + k + "번</b></span></div>" +
        '<div><span>전체 평균</span><span class="t"><i style="width:' + a + '%;background:#B9C1CC"></i></span><span' + tip("기준일까지 확정된 전체 표본 " + S.all.n + "번의 평균입니다.") + ">" + a + "번 · 지금이 <b>" + S.mult.toFixed(1) + "배</b></span></div></div>" +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="chip">▲ 1% 넘게 오름 100번당 ' + per100(S.up) + '번</span><span class="chip">▼ 내림 100번당 ' + per100(S.dn) + '번</span><span class="fine">방향은 정해지지 않았습니다</span></div>' +
      '<div class="fine" style="margin-top:8px"><span class="link" data-go="v3">두 기간 검증 · 다른 날과 비교 ③ ›</span></div>';

    var t = TEMP.total;
    $("#h-cust").innerHTML =
      '<div class="cap">환율이 1% 오르면 늘어나는 원화 부담' + '<span class="i"' + tip("90일 안에 결제할 수입 외화 중 당행 선물환이 확인되지 않은 금액에, 각 통화의 원화 환율이 1% 오를 때의 부담입니다. 당행 거래 기준 추정이며 실제 환노출이 아닙니다.", "Σ 기업·통화별 max(90일 결제 예정 − 당행 선물환, 0) × 기준일 환율 × 1% · 기업끼리·통화끼리 서로 빼지 않습니다") + '>i</span>' + (HAS_INT ? "" : ' <span class="temp">임시값</span>') + "</div>" +
      '<div class="ban3">' + t.burden + "억<small>원</small></div>" +
      '<div class="eq">90일 안에 결제할 수입 외화 <b>' + t.pay.toLocaleString() + "억</b><br>그중 당행 선물환 확인 안 됨 <b>" + pct(1 - t.cov) + "</b> <span class='fine'>(금액 기준)</span></div>" +
      '<div class="fine" style="margin-top:8px">결제 예정 업체 ' + t.firmsPay + "곳 · 업체당 평균 약 " + t.avg.toLocaleString() + "만 원 · 고객 기준일 " + CUST_DATE + "</div>";

    var mx = TEMP.top[0].b;
    $("#t-top").innerHTML =
      '<div class="tbl-h"><div><div class="h2">먼저 점검할 고객군 ' + (HAS_INT ? "" : '<span class="temp">임시값</span>') + '</div><div class="h2s">1% 오르면 늘어나는 부담이 큰 순 · 행을 누르면 ② 탭에서 그 고객군의 상담 준비가 열립니다</div></div><span class="link">전체 ' + TEMP.groups + "개 고객군 보기 ›</span></div>" +
      "<table><thead><tr><th>고객군 (업종 · 5개 모두 수입 결제형)</th><th class='n'>업체 수<span class='i'" + tip("고객군 전체 업체 수입니다. 90일 안에 결제가 없는 업체도 포함합니다.") + ">i</span></th><th class='n'>90일 결제 예정</th><th class='n'>당행 선물환 확인 안 됨<span class='i'" + tip("결제 예정 금액 중 당행 선물환으로 환율을 정해 둔 것이 확인되지 않은 비율입니다. 타행 헤지는 알 수 없습니다.") + ">i</span></th><th style='width:330px'>1% 오르면 늘어나는 부담 ▼</th><th style='width:110px'></th></tr></thead><tbody>" +
      TEMP.top.map(function (r, i) {
        return '<tr class="' + (i === state.sel ? "sel" : "") + '" data-row="' + i + '"><td><span class="rank">' + (i + 1) + "</span>" + r.g + '</td><td class="n">' + r.n + '곳</td><td class="n">' + r.pay.toLocaleString() + '억</td><td class="n">' + pct(1 - r.cov) + '</td><td><div class="bb"><span class="t"><i style="width:' + (r.b / mx * 100) + '%"></i></span><b>' + eok(r.b) + "억</b></div></td><td><span class='link'>상담 준비 ›</span></td></tr>";
      }).join("") +
      '<tr class="sum"><td>위 5개 합계</td><td></td><td></td><td></td><td><b>' + TEMP.topSum + "억</b> · 전체 " + t.burden + "억의 약 " + Math.round(TEMP.topSum / t.burden * 100) + "%</td><td></td></tr></tbody></table>" +
      '<div class="tfoot"><span class="fine">당행 거래 기준 추정이며 실제 환노출이 아닙니다 · 타행 헤지는 알 수 없어 "확인 안 됨"으로 씁니다 · 업체명은 표시하지 않고 5곳 미만 고객군은 숨깁니다</span></div>';
    document.querySelectorAll("#t-top tbody tr[data-row]").forEach(function (tr) { tr.onclick = function () { state.sel = +tr.getAttribute("data-row"); renderV1(); renderV2(); go("v2"); }; });
  }

  function script() {
    return "최근 원/달러는 " + won(S.usd) + "원입니다. 지금과 비슷했던 과거에는 100번 중 " + per100(S.cur.p) + "번이 1주일 뒤 ±1%(약 " + Math.round(S.won1) +
      "원) 넘게 달라졌습니다. 전체 평균은 " + per100(S.all.p) + "번입니다. 그중 1% 넘게 오른 경우가 " + per100(S.up) + "번, 내린 경우가 " + per100(S.dn) +
      "번으로 방향은 정해지지 않았습니다. 다가오는 외화 결제가 있으시면 금액과 시점을 함께 점검해 보시죠.";
  }

  function renderV2() {
    var r = TEMP.top[state.sel], first = state.sel === 0;
    $("#c-left").innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center"><span class="picker"><span class="rank" style="margin:0">' + (state.sel + 1) + "</span>" + r.g + " · 수입 결제형</span>" +
      '<span class="fine"><span class="link" id="prevg">‹ 이전</span> &nbsp; <span class="link" id="nextg">다음 ›</span></span></div>' +
      '<div class="h2s" style="margin-top:6px">' + r.n + "곳 · 환율이 오르면 부담이 커지는 고객군 · 요약 탭 순위 " + (state.sel + 1) + "위 " + (HAS_INT ? "" : '<span class="temp">임시값</span>') + "</div>" +
      '<div class="kpis"><div><div class="cap" style="margin:0">90일 안에 결제할 수입 외화</div><div class="kv">' + r.pay.toLocaleString() + "억</div></div>" +
      '<div><div class="cap" style="margin:0">선물환 확인 안 됨 (금액 기준)</div><div class="kv">' + pct(1 - r.cov) + "</div></div>" +
      '<div><div class="cap" style="margin:0">1% 오르면 늘어나는 부담</div><div class="kv o">' + eok(r.b) + "억</div>" + (r.avg ? '<div class="fine">결제 예정 업체당 평균 약 ' + r.avg.toLocaleString() + "만 원</div>" : "") + "</div></div>" +
      '<div class="h2" style="margin-top:22px">언제 돌아오나요? — 앞으로 13주, 주마다 결제할 외화</div><div class="h2s">원화 환산 · 수입 B/L 도래잔액 기준 · 가장 많이 몰린 주를 먼저 확인합니다</div>' +
      '<div class="ph">가상 고객 데이터 연결 후 주별 금액으로 계산됩니다</div>' +
      '<div class="h2" style="margin-top:20px">이 고객군의 특징</div>' +
      (first ? '<div class="feat"><div>당행 선물환 확인 안 된 업체 (업체 수 기준)<b>' + pct(r.tags.noFwd) + '</b></div><div>여신 보유 업체 (업체 수 기준)<b>' + pct(r.tags.loan) + '</b></div><div>실적 증감 (연중 전년 동기 대비)<b>+' + pct(r.tags.grow) + "</b></div></div>"
        : '<div class="ph" style="height:70px">가상 고객 데이터 연결 후 계산됩니다</div>');
    $("#prevg").onclick = function () { state.sel = (state.sel + 4) % 5; renderV1(); renderV2(); };
    $("#nextg").onclick = function () { state.sel = (state.sel + 1) % 5; renderV1(); renderV2(); };

    $("#c-right").innerHTML =
      '<div class="h2">상담 준비</div><div class="h2s" style="margin-bottom:10px">순서대로 보시면 됩니다 · 문장은 규칙으로 만들며 생성형 AI를 쓰지 않습니다</div>' +
      '<div class="rail"><i>!</i><span><b>먼저 연락할 땐 점검 안내만</b> 합니다. 선물환 등 파생상품 상담은 <b>고객이 요청할 때</b>만 합니다 (금융소비자보호법 · 적합성 원칙)</span></div>' +
      '<div class="step"><div class="stt"><span class="n">1단계</span>상담 전에 확인할 것</div><div class="chk">' +
        ["결제 예정 외화의 금액과 시점", "타행 포함 기존 헤지 여부", "판매가에 환율을 반영할 수 있는지", "유산스 기간 등 결제 조건 조정 여지"].map(function (x) { return "<label><input type='checkbox'> " + x + "</label>"; }).join("") + "</div></div>" +
      '<div class="step"><div class="stt"><span class="n">2단계</span>고객께 이렇게 말씀하세요<span class="link" id="copy">문구 복사</span></div><div class="quote" id="quote">' + script() + "</div>" +
        '<div class="fine" style="margin-top:6px">숫자 근거: <span class="link" data-go="v3">두 기간 검증 보기 ③ ›</span></div></div>' +
      '<div class="step"><div class="stt"><span class="n">3단계</span>고객이 물으면</div><div class="qa">' +
        "<details open><summary>Q. 얼마나 흔들릴 수 있나요?</summary><p>지금과 비슷했던 과거 100번 중 " + per100(S.cur.p) + "번은 1주일 뒤 ±1%(약 " + Math.round(S.won1) + "원) 넘게 달라졌습니다(전체 평균 " + per100(S.all.p) + "번). 1% 넘게 오른 경우 " + per100(S.up) + "번, 내린 경우 " + per100(S.dn) + "번입니다.</p></details>" +
        "<details><summary>Q. 지금 환율 수준은 어디쯤인가요?</summary><p>원/달러 " + won(S.usd) + "원은 최근 1년 중 아래에서 " + pct(S.lvl1) + ", 최근 3년 중 아래에서 " + pct(S.lvl3) + " 위치입니다. 수준만으로 앞으로의 방향을 말할 근거는 없어, 결제 일정에 맞춰 점검하시는 것이 좋습니다.</p></details>" +
        "<details><summary>Q. 우리 회사는 얼마나 영향받나요?</summary><p>화면의 금액은 고객군 단위 추정입니다. 귀사의 결제 예정 외화와 시점을 확인해 함께 계산해 드리겠습니다.</p></details>" +
      "</div></div>" +
      '<div class="step"><div class="stt"><span class="n">4단계</span>안내 순서</div><div class="order">' +
        '<div><span class="k">먼저 안내할 것 (점검)</span>결제 예정일과 유산스 등 결제 조건 점검<br>보유 외화예금으로 결제 대비</div><div class="arr">›</div>' +
        '<div class="later"><span class="k">고객이 요청하면</span>선물환 상담 → 외환 창구·IBK FXON 안내, 헤지-메신저로 선물환 계약 여부에 따른 손익 비교<br>통화옵션·환변동보험 등 → 적합성 확인 후 전문 상담</div></div></div>';
    $("#copy").onclick = function () {
      var txt = $("#quote").textContent, done = function () { $("#copy").textContent = "복사됨 ✓"; setTimeout(function () { var c = $("#copy"); if (c) c.textContent = "문구 복사"; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
      function fallback() { var r = document.createRange(); r.selectNodeContents($("#quote")); var s = getSelection(); s.removeAllRanges(); s.addRange(r); try { document.execCommand("copy"); done(); } catch (e) {} }
    };
  }

  function passOf(g) { return g.tr.n && g.va.n && (g.tr.p - S.baseTr.p >= 0.05) && (g.va.p - S.baseVa.p >= 0.05); }

  function renderV3() {
    var red = (S.brier[1] - S.brier[0]) / S.brier[1];
    $("#e-lead").innerHTML =
      '<div class="big">2011~2019년 자료로 경고등 규칙을 정하고, <em>2020년 이후 자료로 다시 확인했습니다.</em> 두 기간 모두 전체 평균보다 5%p 이상 높았던 경고등 3개만 판단에 씁니다.</div>' +
      '<div style="text-align:right;min-width:250px"' + tip("학습 기간의 경고등 수별 비율로 검증 기간을 맞혀 본 오차(Brier 점수)입니다. 낮을수록 좋습니다.", "전체 평균만 쓸 때 " + S.brier[1].toFixed(4) + " → 경고등 수별 비율 " + S.brier[0].toFixed(4)) + '><div class="cap" style="margin:0">전체 평균만 쓸 때보다 예측 오차</div>' + (S.baseVa.n < 30
        ? '<div style="font-size:22px;font-weight:700;color:#8A5B06">검증 표본 부족</div><div class="fine">이 기준일까지 2020년 이후 표본 ' + S.baseVa.n + '번</div></div>'
        : '<div style="font-size:26px;font-weight:700">약 ' + pct(red, 1) + ' 감소</div><div class="fine">작지만 실제로 줄었습니다</div></div>');

    var cmp = PRESETS.map(function (p) { var s = M.stats(p[0]); return [p, s]; });
    $("#e-cmp").innerHTML =
      '<div class="h2">그래도 방향은 맞히지 못합니다</div><div class="h2s">경고등 ' + S.score + "개였던 과거 " + S.cur.n + "번 · 1주일 뒤</div>" +
      '<div class="dirrow"><span>▲ 1% 넘게 오름</span><span class="t"><i style="width:' + per100(S.up) + '%"></i></span><b>100번당 ' + per100(S.up) + "번</b></div>" +
      '<div class="dirrow"><span>▼ 1% 넘게 내림</span><span class="t"><i style="width:' + per100(S.dn) + '%"></i></span><b>100번당 ' + per100(S.dn) + "번</b></div>" +
      '<div class="fine" style="margin-top:8px">1주일 뒤 변화는 10번 중 8번이 ' + sg(S.q[0]) + " ~ " + sg(S.q[2]) + " 안이었습니다 (가운데 " + sg(S.q[1]) + ")</div>" +
      '<div class="h2" style="font-size:15px;margin-top:12px">다른 날의 경고등</div>' +
      '<table class="cmp3"><thead><tr><th>시장 기준일</th><th>켜진 경고등</th><th>상태</th><th class="n">100번당</th><th class="n">전체 평균 대비</th></tr></thead><tbody>' +
      cmp.map(function (x) { var s = x[1]; return "<tr style='cursor:default'><td>" + x[0][0] + " · " + x[0][1] + "</td><td>" + s.score + "개</td><td>" + LEVEL[s.score] + "</td><td class='n'>" + per100(s.cur.p) + "번</td><td class='n'>" + s.mult.toFixed(1) + "배</td></tr>"; }).join("") + "</tbody></table>";

    var exY = S.exy, bal = S.balch / 1e5;
    $("#e-layers").innerHTML =
      '<div><b>사실 <span class="ok">계산에 씀</span></b>오늘 환율·유가가 얼마나 움직였나<br>예: 두바이유 한 달 ' + (S.oilCh == null ? "-" : sg(S.oilCh, 0)) + "</div>" +
      '<div><b>과거 기록 <span class="ok">계산에 씀</span></b>지금과 비슷했던 때 실제로 어땠나<br>예: 100번당 ' + per100(S.cur.p) + "번</div>" +
      '<div><b style="color:var(--faint)">이론 <span class="ok g">설명용</span></b>"금리차가 벌어지면 달러가 강해진다" 같은 설명은 계산에 쓰지 않습니다</div>' +
      "<div><b>참고만 하는 지표</b>한미 금리차 " + (isNaN(S.spr) ? "-" : (S.spr >= 0 ? "+" : "−") + Math.abs(S.spr).toFixed(2) + "%p") + " · 수출 전년 동월 대비 " + sg(exY, 1) + " (" + S.expPer + ") · 무역수지 변화 " + (bal >= 0 ? "+" : "−") + Math.abs(Math.round(bal)).toLocaleString() + "억 달러 — 두 기간 차이가 5%p에 못 미쳐 판단에 쓰지 않습니다</div>";
  }

  var charts = {};
  function drawUsd() {
    if (typeof echarts === "undefined") return;
    var n = RANGES[state.range][1], lo = Math.max(0, S.A - n), xs = [], ys = [];
    for (var j = lo; j <= S.A; j++) { xs.push(M.D[j]); ys.push(M.USD[j]); }
    var el = document.getElementById("ch-usd");
    charts.usd = charts.usd || echarts.init(el, null, { renderer: "svg" });
    var up = ys[ys.length - 1] >= ys[0];
    charts.usd.setOption({
      animation: false, textStyle: { fontFamily: "Pretendard, Malgun Gothic" },
      grid: { left: 46, right: 14, top: 12, bottom: 24 },
      tooltip: { trigger: "axis", backgroundColor: "#1C2430", borderWidth: 0, textStyle: { color: "#fff", fontSize: 13 },
        formatter: function (p) { return p[0].axisValue + "<br><b>" + won(p[0].value) + "원</b>"; } },
      xAxis: { type: "category", data: xs, boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: "#CFD5DD" } },
        axisLabel: { color: "#8A939F", fontSize: 11.5, interval: Math.floor(xs.length / 4), formatter: function (v) { return v.slice(2).replace(/-/g, "."); } } },
      yAxis: { type: "value", scale: true, splitNumber: 3, axisLabel: { color: "#8A939F", fontSize: 11.5, formatter: function (v) { return Math.round(v).toLocaleString(); } }, splitLine: { lineStyle: { color: "#EEF0F3" } } },
      series: [{ type: "line", data: ys, showSymbol: false, lineStyle: { color: "#0B5CAB", width: 2 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(11,92,171,.16)" }, { offset: 1, color: "rgba(11,92,171,0)" }] } },
        markLine: { silent: true, symbol: "none", lineStyle: { color: "#9AA3AE", type: "dashed" }, label: { formatter: RANGES[state.range][0] + " 전", color: "#8A939F", fontSize: 11, position: "insideStartTop" }, data: [{ yAxis: ys[0] }] },
        markPoint: { symbol: "circle", symbolSize: 9, itemStyle: { color: up ? "#D64545" : "#2F6FD0", borderColor: "#fff", borderWidth: 2 }, label: { show: false }, data: [{ coord: [xs.length - 1, ys[ys.length - 1]] }] } }]
    }, true);
  }
  function drawCharts() {
    if (typeof echarts === "undefined") return;
    var names = ["전체 평균"].concat(S.sig.map(function (g) { return g.name; }));
    var rows = [{ tr: S.baseTr, va: S.baseVa, base: true }].concat(S.sig);
    var lab = rows.map(function (g, i) {
      var cnt = "{s|" + g.tr.n + "번 · " + g.va.n + "번}";
      if (g.base) return cnt;
      var tag = g.ref ? "{g|참고만}" : (passOf(g) ? "{p|✓ 두 기간 확인}" : "{w|확인 부족}");
      if (Math.min(g.tr.n, g.va.n) < 30) tag += "{w| · 표본 적음}";
      return cnt + "\n" + tag;
    });
    var mk = function (key, col, dim) {
      return rows.map(function (g) { var v = g[key].n ? +(g[key].p * 100).toFixed(1) : null; return { value: v, n: g[key].n, k: g[key].k, itemStyle: { color: g.ref ? dim : col } }; });
    };
    var el = document.getElementById("ch-sig");
    charts.sig = charts.sig || echarts.init(el, null, { renderer: "svg" });
    charts.sig.setOption({
      animation: false, textStyle: { fontFamily: "Pretendard, Malgun Gothic" },
      grid: { left: 44, right: 12, top: 26, bottom: 64 },
      tooltip: { trigger: "item", backgroundColor: "#1C2430", borderWidth: 0, textStyle: { color: "#fff", fontSize: 13 },
        formatter: function (p) { var d = p.data; return p.name + " · " + p.seriesName + "<br>" + d.k + " / " + d.n + "번 = <b>" + d.value + "%</b>"; } },
      xAxis: { type: "category", data: names, axisTick: { show: false }, axisLine: { lineStyle: { color: "#CFD5DD" } },
        axisLabel: { interval: 0, color: "#1C2430", fontSize: 14, fontWeight: 600, lineHeight: 18,
          formatter: function (v, i) { return v + "\n" + lab[i]; },
          rich: { s: { color: "#6A7380", fontSize: 12, fontWeight: 400, lineHeight: 17 }, p: { color: "#0B5CAB", fontSize: 12, fontWeight: 700 }, g: { color: "#9AA3AE", fontSize: 12, fontWeight: 700 }, w: { color: "#B06A00", fontSize: 12, fontWeight: 700 } } } },
      yAxis: { type: "value", max: function (v) { return Math.max(70, Math.ceil((v.max + 8) / 10) * 10); }, axisLabel: { formatter: "{value}%", color: "#8A939F" }, splitLine: { lineStyle: { color: "#EEF0F3" } } },
      series: [
        { name: "2011~2019년", type: "bar", barWidth: 30, barGap: "12%", data: mk("tr", "#B9C1CC", "#DADFE5"), label: { show: true, position: "top", color: "#6A7380", fontSize: 12.5, formatter: function (p) { return p.value == null ? "" : Math.round(p.value); } },
          markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#9AA3AE", type: "dashed" }, data: [{ yAxis: +(S.baseTr.p * 100).toFixed(1) }] } },
        { name: "2020년 이후", type: "bar", barWidth: 30, data: mk("va", "#0B5CAB", "#9DBBDD"), label: { show: true, position: "top", color: "#0B5CAB", fontWeight: 700, fontSize: 12.5, formatter: function (p) { return p.value == null ? "자료 없음" : Math.round(p.value); } },
          markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#0B5CAB", opacity: 0.55, type: "dashed" }, data: [{ yAxis: S.baseVa.n ? +(S.baseVa.p * 100).toFixed(1) : 0 }] } }
      ]
    }, true);

    var el2 = document.getElementById("ch-steps");
    charts.st = charts.st || echarts.init(el2, null, { renderer: "svg" });
    var by = S.by;
    charts.st.setOption({
      animation: false, textStyle: { fontFamily: "Pretendard, Malgun Gothic" },
      grid: { left: 10, right: 10, top: 22, bottom: 26 },
      tooltip: { trigger: "item", backgroundColor: "#1C2430", borderWidth: 0, textStyle: { color: "#fff", fontSize: 13 },
        formatter: function (p) { var d = p.data; return p.name + " · " + p.seriesName + "<br>" + d.k + " / " + d.n + "번 = <b>" + d.value + "%</b>"; } },
      xAxis: { type: "category", data: ["0개 · 낮음", "1개 · 조금 높음", "2개 · 높음"], axisTick: { show: false }, axisLine: { lineStyle: { color: "#CFD5DD" } },
        axisLabel: { interval: 0, color: "#1C2430", fontSize: 13.5, formatter: function (v, i) { return i === S.score ? "{b|" + v + " ◀ 지금}" : v; }, rich: { b: { fontWeight: 700, fontSize: 13.5, color: "#1C2430" } } } },
      yAxis: { type: "value", max: function (v) { return Math.max(65, v.max + 12); }, show: false },
      series: [
        { name: "2011~2019년", type: "bar", barWidth: 34, barGap: "12%", data: by.map(function (b) { return { value: b.tr.n ? +(b.tr.p * 100).toFixed(1) : null, n: b.tr.n, k: b.tr.k }; }), itemStyle: { color: "#B9C1CC" }, label: { show: true, position: "top", color: "#6A7380", formatter: function (p) { return p.value == null ? "" : Math.round(p.value); } } },
        { name: "2020년 이후", type: "bar", barWidth: 34, data: by.map(function (b) { return { value: b.va.n ? +(b.va.p * 100).toFixed(1) : null, n: b.va.n, k: b.va.k }; }), itemStyle: { color: "#0B5CAB" }, label: { show: true, position: "top", color: "#0B5CAB", fontWeight: 700, formatter: function (p) { return p.value == null ? "자료 없음" : Math.round(p.value); } } }
      ]
    }, true);
  }

  go("v1");
  render();
  window.__FX = { M: M, stats: function () { return S; }, state: state, go: go, setAsof: function (d) { state.asof = d; sel.value = d; render(); } };
})();
