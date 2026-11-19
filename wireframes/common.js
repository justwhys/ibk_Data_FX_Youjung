// 와이어프레임용 예시 곡선(실데이터 아님). 결정적 난수로 매번 같은 모양.
function rng(seed) { return function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; }
function series(n, seed, start, end, vol) {
  var r = rng(seed), out = [], v = start;
  for (var i = 0; i < n; i++) {
    var pull = (end - v) / Math.max(1, n - i) * 0.9;
    v += pull + (r() - 0.5) * vol;
    out.push(v);
  }
  out[n - 1] = end; return out;
}
function line(el, data, opt) {
  opt = opt || {};
  var w = el.clientWidth, h = el.clientHeight, p = opt.pad || 4;
  var mn = Math.min.apply(null, data), mx = Math.max.apply(null, data);
  var x = function (i) { return p + i * (w - 2 * p) / (data.length - 1); };
  var y = function (v) { return h - p - (v - mn) / (mx - mn || 1) * (h - 2 * p); };
  var d = data.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); }).join("");
  var col = opt.color || "#0B5CAB";
  var s = "";
  if (opt.area) s += '<path d="' + d + "L" + x(data.length - 1) + "," + h + "L" + x(0) + "," + h + 'Z" fill="' + (opt.areaColor || "#EEF3FA") + '"/>';
  if (opt.band) s += '<rect x="0" y="' + y(opt.band[1]) + '" width="' + w + '" height="' + (y(opt.band[0]) - y(opt.band[1])) + '" fill="#F4F6F9"/>';
  s += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (opt.sw || 1.6) + '"/>';
  if (opt.endDot) s += '<circle cx="' + x(data.length - 1) + '" cy="' + y(data[data.length - 1]) + '" r="4" fill="' + (opt.dotColor || "#D64545") + '" stroke="#fff" stroke-width="1.5"/>';
  el.innerHTML = '<svg width="' + w + '" height="' + h + '">' + s + "</svg>";
  return { x: x, y: y, mn: mn, mx: mx };
}
function cols(el, data, opt) {
  opt = opt || {};
  var w = el.clientWidth, h = el.clientHeight, n = data.length, gap = opt.gap || 2;
  var bw = (w - gap * (n - 1)) / n, mx = opt.max || Math.max.apply(null, data.map(function (d) { return d[0] + (d[1] || 0); }));
  var s = "";
  data.forEach(function (d, i) {
    var x = i * (bw + gap), h1 = d[0] / mx * h, h2 = (d[1] || 0) / mx * h;
    s += '<rect x="' + x + '" y="' + (h - h1) + '" width="' + bw + '" height="' + h1 + '" fill="' + (opt.c1 || "#E8833A") + '"/>';
    if (h2) s += '<rect x="' + x + '" y="' + (h - h1 - h2) + '" width="' + bw + '" height="' + h2 + '" fill="' + (opt.c2 || "#CBD2DB") + '"/>';
  });
  el.innerHTML = '<svg width="' + w + '" height="' + h + '">' + s + "</svg>";
}
function dots(el, k, n, cols_) {
  var s = "";
  for (var i = 0; i < n; i++) s += '<i style="background:' + (i < k ? "#E8833A" : "#DCE1E7") + '"></i>';
  el.innerHTML = s; el.style.gridTemplateColumns = "repeat(" + (cols_ || 20) + ", 1fr)";
}
