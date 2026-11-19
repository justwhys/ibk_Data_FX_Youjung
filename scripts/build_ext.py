"""외부(시장) 원천 데이터 → data/ext.json

입력: data/raw/ 의 ECOS·오피넷·관세청 내려받기 파일 (LibreOffice로 xlsx 변환 후 읽음)
  u1: ECOS 1.3.1 한국은행 기준금리(일)
  u2: ECOS 1.5.1.1 주식시장(일) — KOSPI지수, 외국인 순매수(유가증권시장, 억원)
  u3: ECOS 3.1.1.1 주요국 통화의 대원화환율(일) — 원/달러, 원/위안, 원/100엔, 원/유로
  u4: 오피넷 국제유가 Dubai(일) — 0은 휴장(값 없음)으로 처리
  u5: 관세청 수출입 총괄(월, 천 달러) — 기간은 문자열 YYYY.MM로 강제
빠진 것: 미국 정책금리(ECOS 902Y006, 월) — 받으면 u6로 추가
"""
import json, os, subprocess, sys, tempfile, glob
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "ext.json")


def to_xlsx(path, tmp):
    """ECOS xlsx는 일반 라이브러리가 스타일시트 오류로 못 여는 경우가 있어 LibreOffice로 다시 저장한다."""
    subprocess.run(["soffice", "--headless", "--convert-to", "xlsx", "--outdir", tmp, path],
                   check=True, capture_output=True, timeout=300)
    return os.path.join(tmp, os.path.splitext(os.path.basename(path))[0] + ".xlsx")


def ecos_wide(path):
    """ECOS 가로형(날짜가 열) → {계정항목: Series(index=YYYY-MM-DD)}"""
    d = pd.read_excel(path, sheet_name=0, header=None)
    dates = [str(x).replace("/", "-") for x in d.iloc[0, 5:]]
    out = {}
    for r in range(1, d.shape[0]):
        name = str(d.iloc[r, 2]).strip()
        vals = pd.to_numeric(d.iloc[r, 5:], errors="coerce").values
        out[name] = pd.Series(vals, index=dates)
    return out


def main():
    tmp = tempfile.mkdtemp()
    f = {k: to_xlsx(glob.glob(os.path.join(RAW, k + ".xls*"))[0], tmp) for k in ["u1", "u2", "u3", "u4", "u5"]}

    fx = ecos_wide(f["u3"])
    usd = fx["원/미국달러(매매기준율)"].dropna()
    dates = list(usd.index)  # 날짜 축 = 원/달러 고시일
    def col(name):
        s = fx[name].reindex(dates)
        return [None if pd.isna(v) else float(v) for v in s.values]

    base = ecos_wide(f["u1"])["한국은행 기준금리"].dropna()
    stk = ecos_wide(f["u2"])
    kospi = stk["KOSPI지수"].dropna()
    fnet = [v for k, v in stk.items() if k.startswith("외국인 순매수")][0].dropna()

    oil = pd.read_excel(f["u4"], sheet_name=0, header=None).iloc[7:, :2].dropna()
    oil_dates = ["20" + s[:2] + "-" + s[3:5] + "-" + s[6:8] for s in oil[0].astype(str)]
    oil_vals = pd.to_numeric(oil[1], errors="coerce").tolist()
    oil_vals = [None if (v is None or pd.isna(v) or v == 0) else float(v) for v in oil_vals]  # 0 = 휴장

    tr = pd.read_excel(f["u5"], sheet_name=0, header=None, dtype=str).iloc[6:, :]
    tr = tr[tr[0].str.match(r"^\d{4}\.\d{2}$", na=False)]
    num = lambda s: float(str(s).replace(",", ""))

    ext = {
        "환율": {"시점": dates, "원/미국달러": col("원/미국달러(매매기준율)"),
                 "원/일본엔(100엔)": col("원/일본엔(100엔)"), "원/유로": col("원/유로"), "원/위안": col("원/위안(매매기준율)")},
        "기준금리": {"시점": list(base.index), "값": [float(v) for v in base.values]},
        "미국정책금리": None,  # 빠진 자료 — ECOS 902Y006
        "수출입": {"기간": tr[0].tolist(), "수출 금액": [num(v) for v in tr[4]], "수입 금액": [num(v) for v in tr[7]],
                   "단위": "천 달러"},
        "두바이유": {"기간": oil_dates, "Dubai": oil_vals},
        "주식시장": {"시점": list(kospi.index), "KOSPI지수": [float(v) for v in kospi.values],
                     "외국인 순매수(유가증권시장)": [float(v) for v in fnet.reindex(kospi.index).values]},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fp:
        json.dump(ext, fp, ensure_ascii=False, separators=(",", ":"))
    print("환율", dates[0], "~", dates[-1], len(dates), "일 | 마지막 원/달러", ext["환율"]["원/미국달러"][-1])
    print("유가", oil_dates[0], "~", oil_dates[-1], "| 휴장(0) 처리", sum(v is None for v in oil_vals), "일")
    print("수출입", ext["수출입"]["기간"][0], "~", ext["수출입"]["기간"][-1], len(tr), "개월 | 10월 행:",
          [p for p in ext["수출입"]["기간"] if p.endswith(".10")][-2:])
    print("KOSPI", kospi.index[0], "~", kospi.index[-1], "| 기준금리 마지막", base.values[-1])
    print("저장:", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
