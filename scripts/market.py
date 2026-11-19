"""시장 판단 로직 (와이프 문서 10장 정의 그대로) — 검산용 Python 구현.
대시보드 JS와 같은 결과가 나와야 한다. 기준값은 문서 20장.

python3 scripts/market.py [기준일 YYYY-MM-DD ...]
"""
import json, math, os, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = json.load(open(os.path.join(ROOT, "data", "ext.json"), encoding="utf-8"))

D = EXT["환율"]["시점"]
USD = np.array(EXT["환율"]["원/미국달러"], dtype=float)
N = len(D)


def ffill_to(dates, vals):
    """다른 날짜의 시계열을 원/달러 고시일에 맞춰 직전 값으로 채운다(None은 건너뜀)."""
    out, j, last = [], 0, None
    for d in D:
        while j < len(dates) and dates[j] <= d:
            if vals[j] is not None:
                last = vals[j]
            j += 1
        out.append(last)
    return np.array([np.nan if v is None else v for v in out], dtype=float)


OIL = ffill_to(EXT["두바이유"]["기간"], EXT["두바이유"]["Dubai"])
RET = np.full(N, np.nan); RET[1:] = np.log(USD[1:] / USD[:-1])
ABS = np.abs(RET)
VOL20 = np.full(N, np.nan)
for i in range(20, N):
    VOL20[i] = np.std(RET[i - 19:i + 1], ddof=1)


def q(arr, p):  # 선형 보간 분위수(pandas 기본과 동일)
    return float(np.quantile(arr, p, method="linear"))


S1 = np.zeros(N, bool); S2 = np.zeros(N, bool); S3 = np.zeros(N, bool)
for i in range(N):
    if i >= 251:
        S1[i] = ABS[i] >= q(ABS[i - 250:i], 0.95)
    if i >= 270:
        S2[i] = VOL20[i] >= q(VOL20[i - 250:i], 0.80)
    if i >= 20 and not np.isnan(OIL[i]) and not np.isnan(OIL[i - 20]):
        S3[i] = abs(math.log(OIL[i] / OIL[i - 20])) >= 0.10
SCORE = (S1 | S2).astype(int) + S3.astype(int)
FWD = np.full(N, np.nan); FWD[:-5] = np.log(USD[5:] / USD[:-5])
GRID = list(range(260, N, 5))


def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"),) * 2
    p = k / n; den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return c - h, c + h


def rate(idx):
    big = [abs(FWD[i]) >= 0.01 for i in idx]
    k, n = sum(big), len(idx)
    return {"k": k, "n": n, "p": k / n if n else float("nan"), "ci": wilson(k, n)}


def stats(asof):
    A = D.index(asof) if asof in D else max(i for i, d in enumerate(D) if d <= asof)
    s = [i for i in GRID if i + 5 <= A]
    tr = [i for i in s if "2011" <= D[i][:4] <= "2019"]
    va = [i for i in s if D[i][:4] >= "2020"]
    sc = int(SCORE[A])
    same = [i for i in s if SCORE[i] == sc]
    allr = rate(s); cur = rate(same)
    up = sum(FWD[i] >= 0.01 for i in same) / len(same); dn = sum(FWD[i] <= -0.01 for i in same) / len(same)
    qs = [q(np.array([FWD[i] for i in same]), p) for p in (0.1, 0.5, 0.9)]
    by_score = {k: (rate([i for i in tr if SCORE[i] == k]), rate([i for i in va if SCORE[i] == k]), rate([i for i in s if SCORE[i] == k])) for k in (0, 1, 2)}
    sig = {}
    for name, S in (("하루 급변", S1), ("흔들림 큼", S2), ("유가 급변", S3)):
        sig[name] = (rate([i for i in tr if S[i]]), rate([i for i in va if S[i]]))
    # Brier: 학습 기간 점수별 비율로 검증 기간을 맞혀 본 오차 vs 학습 기간 평균만 쓸 때
    ptr = {k: by_score[k][0]["p"] for k in (0, 1, 2)}; base = rate(tr)["p"]
    y = np.array([abs(FWD[i]) >= 0.01 for i in va], float)
    b_model = float(np.mean((np.array([ptr[SCORE[i]] for i in va]) - y) ** 2)) if va else float("nan")
    b_base = float(np.mean((base - y) ** 2)) if va else float("nan")
    return {"asof": D[A], "usd": USD[A], "chg": USD[A] / USD[A - 1] - 1, "S": (bool(S1[A]), bool(S2[A]), bool(S3[A])),
            "oil20": math.log(OIL[A] / OIL[A - 20]) if A >= 20 else None, "score": sc,
            "cur": cur, "all": allr, "mult": cur["p"] / allr["p"], "up": up, "dn": dn, "q": qs,
            "by_score": by_score, "sig": sig, "base_tr": rate(tr), "base_va": rate(va), "brier": (b_model, b_base)}


def pct(r):
    return f"{r['p']*100:.1f}% ({r['n']}번)"


if __name__ == "__main__":
    for asof in (sys.argv[1:] or ["2026-11-13", "2024-06-04", "2020-03-19"]):
        s = stats(asof)
        print(f"\n■ 기준일 {s['asof']}  원/달러 {s['usd']:,.1f} ({s['chg']*100:+.2f}%)  1%≈{s['usd']*0.01:.0f}원")
        print(f"  경고등 S1={s['S'][0]} S2={s['S'][1]} S3={s['S'][2]} (유가 20일 {s['oil20']*100:+.1f}%) → 점수 {s['score']}")
        lo, hi = s["cur"]["ci"]
        print(f"  가능성 {s['cur']['k']}/{s['cur']['n']} = {s['cur']['p']*100:.1f}% (95% {lo*100:.0f}~{hi*100:.0f}%) | 평소 {s['all']['p']*100:.1f}% ({s['all']['n']}) | 배수 {s['mult']:.2f}")
        print(f"  방향 상승 {s['up']*100:.0f}% 하락 {s['dn']*100:.0f}% | 10·50·90% {s['q'][0]*100:+.1f}% {s['q'][1]*100:+.1f}% {s['q'][2]*100:+.1f}%")
        print("  점수별 (학습 / 검증 / 전체):", "  ".join(f"{k}개 {pct(a)} / {pct(b)} / {pct(c)}" for k, (a, b, c) in s["by_score"].items()))
        print(f"  평소 학습 {pct(s['base_tr'])} / 검증 {pct(s['base_va'])}")
        for k, (a, b) in s["sig"].items():
            print(f"  {k}: 학습 {pct(a)} / 검증 {pct(b)}")
        print(f"  Brier 모델 {s['brier'][0]:.4f} vs 평소 {s['brier'][1]:.4f}")
