"""고객 영향 계산 (와이프 문서 13장 C1~C16) — 검산용 Python 구현. src/customer.js와 같은 값이 나와야 한다.

python3 scripts/customer.py  → 전체 필터 기준 핵심 숫자·TOP 5·13주 달력
"""
import json, os, datetime as dt
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I = json.load(open(os.path.join(ROOT, "data", "internal.json"), encoding="utf-8"))
EXT = json.load(open(os.path.join(ROOT, "data", "ext.json"), encoding="utf-8"))
BASE = "2026-11-13"  # 고객 기준일 (가상 데이터 고정)
IND = {"C10": "식료품", "C13": "섬유제품", "C20": "화학물질·화학제품", "C22": "고무·플라스틱제품", "C24": "1차 금속",
       "C26": "전자부품·컴퓨터·통신장비", "C27": "의료·정밀·광학기기", "C29": "기타 기계·장비", "C30": "자동차·트레일러", "G46": "도매·상품중개"}
TYPE = {"pay": "수입 결제형", "recv": "수출 수취형", "both": "수출입 병행형"}


def rates(asof):
    D = EXT["환율"]["시점"]; A = max(i for i, d in enumerate(D) if d <= asof)
    g = lambda k: EXT["환율"][k][A]
    return {"USD": g("원/미국달러"), "JPY": g("원/일본엔(100엔)") / 100, "EUR": g("원/유로"), "CNY": g("원/위안")}


def firms():
    bdp = {r["BZN"]: r for r in I["행내5_BDP고객기본"]}
    c2 = {r["사업자번호"]: r for r in I["행내2_CRP외환실적수출입"]}
    out = {}
    for r in I["행내1_CRP외환실적전체"]:
        b = r["사업자번호"]; x = c2[b]; ind = bdp[b.replace("-", "")]["표준산업분류코드"]
        ex, im = x["금년수출통관실적"], x["금년수입통관실적"]
        typ = "pay" if im >= ex * 1.5 and im > 0 else ("recv" if ex >= im * 1.5 and ex > 0 else "both")  # C1
        prev = r["금년도수출입무역외실적"] - r["연중전년동기증감액"]
        out[b] = {"br": r["부점"], "ind": ind, "type": typ, "grow": r["연중전년동기증감액"] / prev if prev else None,
                  "share": x["금년점유비율"], "loan": r["총여신잔액"] > 0, "ex": ex, "im": im, "pay": defaultdict(float), "cov": defaultdict(float)}
    end = (dt.date.fromisoformat(BASE) + dt.timedelta(days=90)).isoformat()
    for r in I["행내3_수입BL만기일"]:  # C2
        if BASE < r["도래년월일"] <= end and r["도래잔액"] > 0:
            out[r["사업자번호"]]["pay"][r["통화종류"]] += r["도래잔액"]
    for r in I["행내4_선물환만기일"]:  # C3 (매입만)
        if r["매입·매도구분"] == "매입" and BASE < r["만기년월일"] <= end:
            out[r["사업자번호"]]["cov"][r["통화종류"]] += r["계약금액"]
    return out


def compute(asof=BASE, br=None, ind=None, cur=None, typ=None):
    R = rates(asof); F = firms(); groups = defaultdict(list)
    for b, f in F.items():
        if (br and f["br"] != br) or (ind and f["ind"] != ind) or (typ and f["type"] != typ):
            continue
        curs = [cur] if cur else set(f["pay"]) | set(f["cov"])
        pay = sum(f["pay"].get(c, 0) * R[c] for c in curs)
        covr = sum(min(f["cov"].get(c, 0), f["pay"].get(c, 0)) * R[c] for c in curs)  # C4: 결제 예정보다 많은 커버는 인정 안 함
        burden = sum(max(f["pay"].get(c, 0) - min(f["cov"].get(c, 0), f["pay"].get(c, 0)), 0) * R[c] * 0.01 for c in curs)  # C6
        groups[(f["ind"], f["type"])].append({"b": b, "pay": pay, "cov": covr, "burden": burden, **{k: f[k] for k in ("grow", "share", "loan")}})
    rows = []
    for (i, t), fs in groups.items():
        if len(fs) < 5:  # C7: 5곳 미만 숨김
            continue
        payf = [x for x in fs if x["pay"] > 0]
        g = [x["grow"] for x in fs if x["grow"] is not None]
        rows.append({"ind": i, "type": t, "name": IND[i] + " · " + TYPE[t], "n": len(fs), "nPay": len(payf),
                     "pay": sum(x["pay"] for x in fs), "cov": sum(x["cov"] for x in fs), "burden": sum(x["burden"] for x in fs),
                     "noFwd": sum(1 for x in payf if x["cov"] == 0) / len(payf) if payf else None,
                     "grow": sum(g) / len(g) if g else None, "share": sum(x["share"] for x in fs) / len(fs),
                     "loan": sum(1 for x in fs if x["loan"]) / len(fs)})
    rows.sort(key=lambda r: -r["burden"])
    tot = {k: sum(r[k] for r in rows) for k in ("n", "nPay", "pay", "cov", "burden")}
    return {"rows": rows, "top": [r for r in rows if r["burden"] > 0][:5], "tot": tot, "rate": R}


def calendar(asof=BASE, ind=None, typ=None):
    """C15: 기준일 다음 날부터 7일 단위 13주. 업체·통화별 커버 비율만큼 '확인됨'."""
    R = rates(asof); F = firms(); base = dt.date.fromisoformat(BASE)
    wk = [[0.0, 0.0] for _ in range(13)]
    for r in I["행내3_수입BL만기일"]:
        f = F[r["사업자번호"]]
        if (ind and f["ind"] != ind) or (typ and f["type"] != typ) or r["도래잔액"] <= 0:
            continue
        d = (dt.date.fromisoformat(r["도래년월일"]) - base).days
        if 1 <= d <= 91:
            c = r["통화종류"]; p = f["pay"].get(c, 0); ratio = min(1, f["cov"].get(c, 0) / p) if p else 0
            krw = r["도래잔액"] * R[c]; w = (d - 1) // 7
            wk[w][0] += krw * (1 - ratio); wk[w][1] += krw * ratio
    return wk


if __name__ == "__main__":
    c = compute(); t = c["tot"]
    print(f"표시 업체 {t['n']} · 결제 예정 업체 {t['nPay']} · 90일 결제 예정 {t['pay']/1e8:,.0f}억 · 선물환 확인 {t['cov']/t['pay']*100:.0f}% · 1% 부담 {t['burden']/1e8:.1f}억 · 업체당 {t['burden']/t['nPay']/1e4:,.0f}만 원 · 고객군 {len(c['rows'])}개")
    for i, r in enumerate(c["top"], 1):
        print(f"  {i}. {r['name']} {r['n']}곳(결제 예정 {r['nPay']}) 결제 {r['pay']/1e8:,.0f}억 확인 {r['cov']/r['pay']*100:.0f}% 부담 {r['burden']/1e8:.1f}억 "
              f"증감 {r['grow']*100:+.0f}% 확인안됨업체 {r['noFwd']*100:.0f}% 여신 {r['loan']*100:.0f}% 점유 {r['share']:.0f}")
    print("  TOP5 합계", round(sum(r["burden"] for r in c["top"]) / 1e8, 1), "억")
    wk = calendar(ind="C13", typ="pay")
    print("  섬유·수입 13주(억):", [round((a + b) / 1e8) for a, b in wk])
