/* ============================================================
   charts.jsx — lightweight hand-built SVG charts
   No external libs. Style-unified to design tokens.
   ============================================================ */

/* ---------- ComboChart: bars (rev) + line (occ) + optional LY line ---------- */
function ComboChart({ data, xKey, barKey, lineKey, ly, height = 240, barColor = 'var(--c-blue)', lineColor = 'var(--c-teal)', barFmt, lineMax = 100, lineUnit = '%' }) {
  const W = 880, H = height, padL = 8, padR = 8, padT = 16, padB = 28;
  const ref = React.useRef(null);
  const [hover, setHover] = React.useState(null);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = data.length;
  const slot = innerW / n;
  const barW = Math.min(34, slot * 0.5);
  const maxBar = Math.max(...data.map(d => d[barKey])) * 1.12;

  const xAt = (i) => padL + slot * i + slot / 2;
  const yBar = (v) => padT + innerH - (v / maxBar) * innerH;
  const yLine = (v) => padT + innerH - (v / lineMax) * innerH;

  const linePts = data.map((d, i) => [xAt(i), yLine(d[lineKey])]);
  const lyPts = ly ? data.map((d, i) => [xAt(i), yLine(d[ly])]) : null;
  const toPath = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');

  const gridY = [0, 0.25, 0.5, 0.75, 1].map(f => padT + innerH - f * innerH);

  return (
    <div style={{ width: '100%', overflow: 'visible' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHover(null)}>
        {gridY.map((y, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 4 ? '0' : '3 4'} opacity={i === 4 ? 1 : .7} />
        ))}
        {/* bars */}
        {data.map((d, i) => {
          const h = innerH - (yBar(d[barKey]) - padT);
          const active = hover === i;
          return (
            <rect key={i} x={xAt(i) - barW / 2} y={yBar(d[barKey])} width={barW} height={Math.max(1, h)}
              rx="2" fill={barColor} opacity={active ? 1 : .22}
              onMouseEnter={() => setHover(i)} style={{ transition: 'opacity .12s' }} />
          );
        })}
        {/* LY line (dashed) */}
        {lyPts && <path d={toPath(lyPts)} fill="none" stroke="var(--c-gray)" strokeWidth="1.5" strokeDasharray="4 4" />}
        {/* main line */}
        <path d={toPath(linePts)} fill="none" stroke={lineColor} strokeWidth="2.25" />
        {linePts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 4 : 2.5} fill="var(--surface)" stroke={lineColor} strokeWidth="2" />
        ))}
        {/* x labels (thinned) */}
        {data.map((d, i) => {
          const show = n <= 12 || i % Math.ceil(n / 12) === 0;
          return show ? <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-3)">{d[xKey]}</text> : null;
        })}
        {/* hover guide */}
        {hover != null && (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={padT} y2={padT + innerH} stroke="var(--border-strong)" strokeWidth="1" />
        )}
        {/* invisible hit areas */}
        {data.map((d, i) => (
          <rect key={'h' + i} x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent"
            onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 6, fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{data[hover][xKey]}</span>
          <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: barColor, marginRight: 5 }} />{barFmt ? barFmt(data[hover][barKey]) : data[hover][barKey]}</span>
          <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: lineColor, marginRight: 5 }} />{data[hover][lineKey]}{lineUnit}</span>
          {ly && <span style={{ color: 'var(--text-3)' }}>前年 {data[hover][ly]}{lineUnit}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- Sparkline (tiny, inline) ---------- */
function Sparkline({ data, w = 76, h = 26, color = 'var(--c-blue)' }) {
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = d + ` L${w} ${h} L0 ${h} Z`;
  const id = React.useMemo(() => 'sp' + Math.random().toString(36).slice(2, 7), []);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity=".18" /><stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} />
    </svg>
  );
}

/* ---------- Bar-in-cell (for table share %) ---------- */
function BarCell({ pct, color = 'var(--c-blue)', label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 96 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: Math.max(2, Math.min(100, pct)) + '%', height: '100%', background: color, borderRadius: 6 }} />
      </div>
      <span className="tabular" style={{ fontSize: 12, color: 'var(--text-2)', width: 38, textAlign: 'right' }}>{label ?? (pct.toFixed(1) + '%')}</span>
    </div>
  );
}

Object.assign(window, { ComboChart, Sparkline, BarCell });

/* ---------- MultiLineChart: N本の折れ線（ブッキングカーブ等）。dual-axis対応 ---------- */
function MultiLineChart({ series, xLabels, yFmt, yFmtRight, height = 320, yTicks = 5, hoverFmt, hoverFmtRight }) {
  const hasRight = series.some(s => s.axis === 'right');
  const W = 1000, H = height, padL = 64, padR = hasRight ? 72 : 16, padT = 16, padB = 64;
  const [hover, setHover] = React.useState(null);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = xLabels.length;
  const niceMax = (m) => { const p = Math.pow(10, Math.floor(Math.log10(m))); const f = m / p; const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10; return step * p * Math.ceil(m / (step * p)); };
  const maxOf = (pred) => { const vals = series.filter(pred).flatMap(s => s.values).filter(v => v != null); return niceMax(Math.max(...vals, 1) * 1.05); };
  const maxL = maxOf(s => s.axis !== 'right');
  const maxR = hasRight ? maxOf(s => s.axis === 'right') : maxL;
  const xAt = (i) => padL + (n === 1 ? innerW / 2 : innerW * i / (n - 1));
  const yAt = (v, axis) => padT + innerH - (v / (axis === 'right' ? maxR : maxL)) * innerH;
  const toPath = (s) => s.values.map((v, i) => (i ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(v, s.axis).toFixed(1)).join(' ');
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => i / yTicks);

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }} onMouseLeave={() => setHover(null)}>
        {/* grid + 左軸ラベル */}
        {ticks.map((f, i) => {
          const y = padT + innerH - f * innerH;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3 4'} opacity={i === 0 ? 1 : .7} />
              <text x={padL - 10} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-3)" className="tabular">{yFmt ? yFmt(maxL * f) : Math.round(maxL * f)}</text>
              {hasRight && <text x={W - padR + 10} y={y + 4} textAnchor="start" fontSize="11" fill="var(--text-3)" className="tabular">{(yFmtRight || yFmt || (v => Math.round(v)))(maxR * f)}</text>}
            </g>
          );
        })}
        {/* x labels */}
        {xLabels.map((lb, i) => (
          <text key={i} x={xAt(i)} y={H - padB + 20} textAnchor="end" fontSize="10.5" fill="var(--text-3)" transform={`rotate(-32 ${xAt(i)} ${H - padB + 20})`}>{lb}</text>
        ))}
        {/* hover guide */}
        {hover != null && <line x1={xAt(hover)} x2={xAt(hover)} y1={padT} y2={padT + innerH} stroke="var(--border-strong)" strokeWidth="1" />}
        {/* lines */}
        {series.map((s, si) => (
          <path key={si} d={toPath(s)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.75 : 2.5} strokeDasharray={s.dashed ? '5 4' : '0'} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* points */}
        {series.map((s, si) => s.values.map((v, i) => (
          <circle key={si + '-' + i} cx={xAt(i)} cy={yAt(v, s.axis)} r={hover === i ? 4 : 2.4} fill="var(--surface)" stroke={s.color} strokeWidth="2" />
        )))}
        {/* hit areas */}
        {xLabels.map((_, i) => (
          <rect key={i} x={xAt(i) - innerW / (n - 1) / 2} y={padT} width={innerW / (n - 1)} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {/* legend */}
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
        {series.map((s, si) => (
          <span key={si} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
            <i style={{ display: 'inline-block', width: 16, height: 3, borderRadius: 2, background: s.color, opacity: s.dashed ? .55 : 1 }} />{s.label}
          </span>
        ))}
      </div>
      {/* hover readout */}
      {hover != null && (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{xLabels[hover]}</span>
          {series.map((s, si) => {
            const f = s.axis === 'right' ? (hoverFmtRight || yFmtRight) : (hoverFmt || yFmt);
            return <span key={si}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: s.color, marginRight: 5 }} />{s.label}：{(f || (v => v))(s.values[hover])}</span>;
          })}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { MultiLineChart });
