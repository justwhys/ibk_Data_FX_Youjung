"""단일 HTML 빌드: src/template.html + 폰트·ECharts·데이터·JS를 모두 안에 넣는다 (행내 PC에서 인터넷 없이 열림).
python3 scripts/build_dash.py  →  dist/IBK_환율세이프가드_대시보드.html
"""
import base64, datetime, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
read = lambda p: open(p, encoding="utf-8").read()


def fonts():
    css = []
    for w, name in ((400, "Regular"), (600, "SemiBold"), (700, "Bold")):
        b64 = base64.b64encode(open(P("vendor", f"Pretendard-{name}.subset.woff2"), "rb").read()).decode()
        css.append(f'@font-face{{font-family:"Pretendard";font-weight:{w};font-display:block;src:url(data:font/woff2;base64,{b64}) format("woff2")}}')
    return "\n".join(css)


def main():
    t = read(P("src", "template.html"))
    internal = P("data", "internal.json")
    rep = {
        "__FONTS__": fonts(),
        "__ECHARTS__": read(P("vendor", "echarts-5.5.1.min.js")).replace("</script", "<\\/script"),
        "__EXTERNAL__": read(P("data", "ext.json")),
        "__INTERNAL__": read(internal) if os.path.exists(internal) else "null",
        "__MARKET_JS__": read(P("src", "market.js")),
        "__APP_JS__": read(P("src", "app.js")),
        "__BUILT__": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M KST"),
    }
    for k, v in rep.items():
        assert k in t, k
        t = t.replace(k, v)
    os.makedirs(P("dist"), exist_ok=True)
    out = P("dist", "IBK_환율세이프가드_대시보드.html")
    open(out, "w", encoding="utf-8").write(t)
    print(out, f"{os.path.getsize(out)/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
