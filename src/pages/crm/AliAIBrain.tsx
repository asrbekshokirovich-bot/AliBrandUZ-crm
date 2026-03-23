import { useState, useRef, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import { useAIAnalytics } from '@/hooks/useAIAnalytics';
import type { AnalyticsData } from '@/hooks/useAIAnalytics';
import { supabase } from '@/integrations/supabase/client';

// ─── Colors ─────────────────────────────────────────────
const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// ─── Custom Tooltip ──────────────────────────────────────
function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1a1a2e', border: '1px solid #f59e0b44', padding: '8px 14px', borderRadius: 6 }}>
      <p style={{ color: '#f59e0b', margin: 0, fontSize: 12 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: '#e2e8f0', margin: '2px 0', fontSize: 12 }}>
          {p.name}: <strong style={{ color: p.color || '#f59e0b' }}>{Number(p.value).toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
}

// ─── Compute analytics from real data ───────────────────
function buildLocalResponse(cmd: string, data: AnalyticsData) {
  const { today, weekly, inventory, logistics, problems, topProducts, platformBreakdown } = data;

  if (cmd === 'stats') {
    return {
      headline: `Bugungi natija: ${today.orders} buyurtma`,
      summary: `Bugun ${today.orders} ta buyurtma qabul qilindi. Daromad ${(today.revenue / 1_000_000).toFixed(2)}M UZS, komissiya chegirib ${(today.netProfit / 1_000_000).toFixed(2)}M UZS sof foyda qoldi. Haftalik sof: ${(weekly.net / 1_000_000).toFixed(2)}M UZS.`,
      kpis: [
        { label: 'Bugungi Daromad',   value: `${(today.revenue / 1000).toFixed(0)}K UZS`,  trend: 'up',      color: 'green' },
        { label: 'Komissiya',          value: `${(today.commission / 1000).toFixed(0)}K UZS`, trend: 'down',   color: 'red' },
        { label: 'Sof Foyda (bugun)', value: `${(today.netProfit / 1000).toFixed(0)}K UZS`, trend: today.netProfit >= 0 ? 'up' : 'down', color: today.netProfit >= 0 ? 'green' : 'red' },
        { label: 'Haftalik Sof',      value: `${(weekly.net / 1_000_000).toFixed(2)}M UZS`, trend: weekly.net >= 0 ? 'up' : 'down', color: weekly.net >= 0 ? 'green' : 'red' },
      ],
      alerts: problems.slice(0, 2).map((p) => ({ type: p.severity === 'critical' ? 'danger' : 'warning', title: p.title, detail: p.description })),
      chart_data: {
        type: 'bar',
        title: 'Haftalik Daromad (000 UZS)',
        data: weekly.trend.slice(-7).map((d) => ({ name: d.date.slice(5), value: Math.round(d.revenue / 1000) })),
      },
      recommendations: [
        `Bugungi sotuv ${today.orders} ta — haftalik o'rtamadan taqqoslang`,
        platformBreakdown.length ? `Eng katta platforma: ${platformBreakdown.sort((a, b) => b.revenue - a.revenue)[0].platform}` : 'Platforma ma\'lumoti yo\'q',
        problems.length ? `${problems.length} ta muammo hal qilinishini kutmoqda` : 'Hozircha jiddiy muammo yo\'q ✅',
      ],
    };
  }

  if (cmd === 'problems') {
    return {
      headline: problems.length ? `${problems.length} ta muammo aniqlandi` : 'Muammolar yo\'q ✅',
      summary: problems.length
        ? `Tizim ${problems.length} ta muammo topdi: ${problems.map((p) => p.title).join(', ')}. Darhol e\'tibor qarating.`
        : 'Barcha ko\'rsatkichlar normada. Zaxira yetarli, yuklarning kechikishi yo\'q.',
      kpis: [
        { label: 'Tugagan mahsulot', value: String(inventory.outOfStock),  trend: inventory.outOfStock > 0 ? 'down' : 'neutral', color: inventory.outOfStock > 0 ? 'red' : 'green' },
        { label: 'Kam zaxira',       value: String(inventory.lowStock),     trend: inventory.lowStock > 0 ? 'down' : 'neutral',   color: inventory.lowStock > 0 ? 'red' : 'green' },
        { label: 'Kechikkan quti',   value: String(logistics.delayed),      trend: logistics.delayed > 0 ? 'down' : 'neutral',    color: logistics.delayed > 0 ? 'red' : 'green' },
        { label: 'Sog\'lom zaxira',  value: String(inventory.healthy),      trend: 'up',                                          color: 'green' },
      ],
      alerts: problems.map((p) => ({ type: p.severity === 'critical' ? 'danger' : 'warning', title: p.title, detail: p.description })),
      chart_data: {
        type: 'pie',
        title: 'Inventar holati taqsimoti',
        data: [
          { name: 'Yaxshi', value: inventory.healthy },
          { name: 'Kam', value: inventory.lowStock },
          { name: 'Tugadi', value: inventory.outOfStock },
        ].filter((d) => d.value > 0),
      },
      recommendations: problems.length ? [
        'Tugagan mahsulotlarni zudlik bilan buyurtma qiling',
        'Kechikkan yuklarni Xitoy hamkoringiz orqali kuzating',
        'Kam zaxirali mahsulotlar uchun minimum threshold belgilang',
      ] : ['Barchasi yaxshi — keyingi sipariş muddatini rejalashtiring'],
    };
  }

  if (cmd === 'top10') {
    const top = topProducts.slice(0, 10);
    return {
      headline: `Haftalik Top-${top.length} mahsulot`,
      summary: `Bu hafta eng ko'p sotilgan mahsulotlar. Eng yaxshi natija: ${top[0]?.name || 'N/A'} — ${top[0]?.qty || 0} dona, ${((top[0]?.revenue || 0) / 1000).toFixed(0)}K UZS.`,
      kpis: top.slice(0, 3).map((p) => ({
        label: p.name.slice(0, 20),
        value: `${p.qty} dona · ${((p.revenue || 0) / 1000).toFixed(0)}K`,
        trend: 'up',
        color: 'green',
      })),
      alerts: [],
      chart_data: {
        type: 'bar',
        title: 'Top mahsulotlar (sotilgan dona)',
        data: top.map((p) => ({ name: p.name.slice(0, 15), value: p.qty })),
      },
      recommendations: [
        `${top[0]?.name || 'Birinchi mahsulot'} — eng ko'p sotilmoqda, zaxirani ko'paytiring`,
        'Daromad bo\'yicha top mahsulot uchun reklama budjetini oshiring',
        'Oz sotilgan mahsulotlar uchun narx tahlili o\'tkazing',
      ],
    };
  }

  return null;
}

// ─── Main Component ──────────────────────────────────────
export default function AliAIBrain() {
  const [aiResponse, setAiResponse] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeCmd, setActiveCmd] = useState<string | null>(null);
  const [customQuery, setCustomQuery] = useState('');
  const [streamText, setStreamText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const { data: analyticsData, fetchAnalytics } = useAIAnalytics();

  // Ensure analytics data loaded
  useEffect(() => { void fetchAnalytics('today'); }, []);

  // ── Particle canvas ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width  = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const pts = Array.from({ length: 50 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      pts.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245,158,11,0.35)'; ctx.fill();
      });
      pts.forEach((a, i) => pts.slice(i + 1).forEach((b) => {
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 100) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(245,158,11,${(0.12 * (1 - d / 100)).toFixed(3)})`;
          ctx.lineWidth = 0.5; ctx.stroke();
        }
      }));
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ── Handle CEO commands ──────────────────────────────
  const handleCommand = useCallback(async (cmd: string, text?: string) => {
    setLoading(true); setAiResponse(null); setStreamText(''); setActiveCmd(cmd);

    // For preset commands: use cached analytics data directly (fast)
    if (cmd !== 'custom' && analyticsData) {
      const local = buildLocalResponse(cmd, analyticsData);
      if (local) { setAiResponse(local); setLoading(false); return; }
    }

    // For custom query or missing data: stream from Gemini
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) { setLoading(false); return; }

    const question = text || cmd;
    setIsStreaming(true);
    let full = '';

    try {
      const res = await fetch('/api/ceo-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: question }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const chunk = JSON.parse(line.slice(6));
            const text = chunk.choices?.[0]?.delta?.content || '';
            full += text; setStreamText(full);
          } catch { /* skip */ }
        }
      }
      // Try to parse as structured JSON; otherwise show as text
      try {
        const clean = full.replace(/```json|```/g, '').trim();
        setAiResponse(JSON.parse(clean));
        setStreamText('');
      } catch {
        // Display as plain text response card
        setAiResponse({ headline: 'Ali AI Javobi', summary: full, kpis: [], alerts: [], chart_data: null, recommendations: [] });
        setStreamText('');
      }
    } catch (err) {
      setAiResponse({ headline: 'Xato', summary: String(err), kpis: [], alerts: [{ type: 'danger', title: 'Xato', detail: String(err) }], chart_data: null, recommendations: [] });
    }
    setIsStreaming(false); setLoading(false);
  }, [analyticsData]);

  // ── Chart renderer ───────────────────────────────────
  function renderChart(chartData: { type: string; title: string; data: { name: string; value: number }[] } | null | undefined) {
    if (!chartData?.data?.length) return null;
    const { type, title, data } = chartData;
    return (
      <div style={{ marginTop: 20, background: '#0d0d1a', borderRadius: 12, padding: '18px', border: '1px solid #f59e0b22' }}>
        <p style={{ margin: '0 0 14px', color: '#f59e0b', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: 'uppercase' }}>{title}</p>
        <ResponsiveContainer width="100%" height={200}>
          {type === 'pie' ? (
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}>
                {data.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
            </PieChart>
          ) : type === 'line' ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip content={<DarkTooltip />} />
              <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
            </LineChart>
          ) : (
            <BarChart data={data} barSize={26}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  }

  const trendIcon = (t: string) => t === 'up' ? '↑' : t === 'down' ? '↓' : '→';
  const kpiColor  = (c: string) => c === 'green' ? '#10b981' : c === 'red' ? '#ef4444' : '#f59e0b';
  const alertBg   = (t: string) => t === 'danger' ? '#ef444411' : t === 'warning' ? '#f59e0b11' : '#3b82f611';
  const alertBdr  = (t: string) => t === 'danger' ? '#ef4444' : t === 'warning' ? '#f59e0b' : '#3b82f6';

  const CMDS = [
    { id: 'stats',    label: '📊 Bugungi Statistika', desc: 'KPI + Sof Foyda hisob-kitobi', color: '#10b981' },
    { id: 'problems', label: '⚠️ Muammolar',           desc: 'Zaxira, Kechikish, Margin',    color: '#ef4444' },
    { id: 'top10',    label: '🏆 Top-10 Mahsulot',     desc: "Haftalik sotuv reytingi",       color: '#3b82f6' },
    { id: 'custom',   label: '💬 CEO Savol',            desc: 'Ixtiyoriy tahlil so\'rovi',    color: '#8b5cf6' },
  ];

  const totalRev  = analyticsData?.today.revenue  || 0;
  const netProfit = analyticsData?.today.netProfit || 0;
  const weeklyNet = analyticsData?.weekly.net      || 0;

  return (
    <div style={{ minHeight: '100vh', background: '#060614', fontFamily: "'DM Sans',sans-serif", color: '#e2e8f0', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #f59e0b44; border-radius: 2px; }
        @keyframes pulse-glow { 0%,100% { box-shadow: 0 0 20px #f59e0b33; } 50% { box-shadow: 0 0 40px #f59e0b77; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes scanline { 0% { transform:translateY(-100%); } 100% { transform:translateY(100vh); } }
        .cmd-btn:hover { transform: translateY(-2px); filter: brightness(1.15); }
        .cmd-btn { transition: all 0.2s ease; }
        .ai-resp { animation: fadeIn 0.4s ease; }
        .pulse-dot { animation: pulse-glow 2s ease infinite; }
      `}</style>

      {/* Particle BG */}
      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg,transparent,#f59e0b44,transparent)', animation: 'scanline 4s linear infinite', zIndex: 1, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 860, margin: '0 auto', padding: '24px 16px 60px' }}>

        {/* ─── HEADER ─── */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#f59e0b0d', border: '1px solid #f59e0b33', borderRadius: 40, padding: '6px 20px', marginBottom: 14 }}>
            <div className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#f59e0b', letterSpacing: 2 }}>SISTEMA FAOL · REAL-TIME</span>
          </div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 'clamp(28px,6vw,52px)', fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#f59e0b,#fbbf24,#f59e0b88)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.1 }}>ALI AI BRAIN</h1>
          <p style={{ color: '#64748b', fontSize: 12, margin: '6px 0 0', fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1 }}>XITOY → O'ZBEKISTON · IMPORT ANALYTICS ENGINE · v3.0</p>
        </div>

        {/* ─── LIVE KPI STRIP ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Bugungi Daromad', value: `${(totalRev / 1_000_000).toFixed(2)}M`, unit: 'UZS', color: '#10b981' },
            { label: 'Sof Foyda (Bugun)', value: `${(netProfit / 1_000_000).toFixed(2)}M`, unit: 'UZS', color: netProfit >= 0 ? '#f59e0b' : '#ef4444' },
            { label: 'Haftalik Sof', value: `${(weeklyNet / 1_000_000).toFixed(2)}M`, unit: 'UZS', color: weeklyNet >= 0 ? '#10b981' : '#ef4444' },
          ].map((k, i) => (
            <div key={i} style={{ background: '#0d0d1a', border: `1px solid ${k.color}33`, borderRadius: 12, padding: '14px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: k.color, opacity: 0.7 }} />
              <p style={{ margin: 0, fontSize: 10, color: '#64748b', fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: 'uppercase' }}>{k.label}</p>
              <p style={{ margin: '5px 0 0', fontSize: 'clamp(16px,3vw,24px)', fontFamily: "'Syne',sans-serif", fontWeight: 800, color: k.color }}>
                {k.value} <span style={{ fontSize: 11, color: '#64748b' }}>{k.unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* ─── CEO COMMANDS ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 24 }}>
          {CMDS.filter((c) => c.id !== 'custom').map((cmd) => (
            <button key={cmd.id} className="cmd-btn"
              onClick={() => handleCommand(cmd.id)}
              disabled={loading}
              style={{
                background: activeCmd === cmd.id ? `${cmd.color}22` : '#0d0d1a',
                border: `1px solid ${activeCmd === cmd.id ? cmd.color : cmd.color + '44'}`,
                borderRadius: 12, padding: '14px 18px', cursor: 'pointer', textAlign: 'left', outline: 'none',
              }}>
              <p style={{ margin: 0, fontSize: 14, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: activeCmd === cmd.id ? cmd.color : '#e2e8f0' }}>{cmd.label}</p>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: '#64748b' }}>{cmd.desc}</p>
            </button>
          ))}
        </div>

        {/* ─── CUSTOM QUERY ─── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          <input value={customQuery} onChange={(e) => setCustomQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && customQuery.trim()) { handleCommand('custom', customQuery); setCustomQuery(''); } }}
            placeholder="CEO savoli... (mas: 'Qaysi mahsulot zarar ko\'rsatmoqda?')"
            style={{ flex: 1, background: '#0d0d1a', border: '1px solid #f59e0b33', borderRadius: 10, padding: '12px 16px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: "'DM Sans',sans-serif" }}
          />
          <button className="cmd-btn"
            onClick={() => { if (customQuery.trim()) { handleCommand('custom', customQuery); setCustomQuery(''); } }}
            disabled={loading || !customQuery.trim()}
            style={{ background: '#f59e0b', border: 'none', borderRadius: 10, padding: '0 18px', cursor: 'pointer', fontFamily: "'Syne',sans-serif", fontWeight: 700, color: '#000', fontSize: 14, opacity: !customQuery.trim() || loading ? 0.4 : 1 }}>
            ↵ So'ra
          </button>
        </div>

        {/* ─── LOADING ─── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ display: 'inline-block', width: 38, height: 38, border: '3px solid #f59e0b33', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: '#f59e0b', marginTop: 14, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: 2 }}>AI BRAIN TAHLIL QILMOQDA...</p>
          </div>
        )}

        {/* ─── STREAMING TEXT ─── */}
        {isStreaming && streamText && !aiResponse && (
          <div style={{ background: '#0a0a1a', border: '1px solid #f59e0b33', borderRadius: 16, padding: '20px', whiteSpace: 'pre-wrap', color: '#94a3b8', fontSize: 13, lineHeight: 1.7 }}>
            {streamText}<span style={{ color: '#f59e0b' }}>▌</span>
          </div>
        )}

        {/* ─── AI RESPONSE ─── */}
        {aiResponse && !loading && (() => {
          const r = aiResponse as {
            headline?: string; summary?: string;
            kpis?: { label: string; value: string; trend: string; color: string }[];
            alerts?: { type: string; title: string; detail: string }[];
            chart_data?: { type: string; title: string; data: { name: string; value: number }[] } | null;
            recommendations?: string[];
          };
          return (
            <div className="ai-resp" style={{ background: '#0a0a1a', border: '1px solid #f59e0b44', borderRadius: 16, padding: '22px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#f59e0b,#10b981,#3b82f6)' }} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div className="pulse-dot" style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b', marginTop: 5, flexShrink: 0 }} />
                <div>
                  <h2 style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>{r.headline}</h2>
                  <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13, lineHeight: 1.7 }}>{r.summary}</p>
                </div>
              </div>
              {(r.kpis?.length ?? 0) > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginBottom: 16 }}>
                  {r.kpis!.map((k, i) => (
                    <div key={i} style={{ background: '#0d0d1a', borderRadius: 10, padding: '10px 12px', border: `1px solid ${kpiColor(k.color)}33` }}>
                      <p style={{ margin: 0, fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace" }}>{k.label}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 16, fontFamily: "'Syne',sans-serif", fontWeight: 700, color: kpiColor(k.color) }}>{k.value} <span style={{ fontSize: 12 }}>{trendIcon(k.trend)}</span></p>
                    </div>
                  ))}
                </div>
              )}
              {(r.alerts?.length ?? 0) > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {r.alerts!.map((a, i) => (
                    <div key={i} style={{ background: alertBg(a.type), border: `1px solid ${alertBdr(a.type)}44`, borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${alertBdr(a.type)}` }}>
                      <p style={{ margin: 0, fontWeight: 600, color: alertBdr(a.type), fontSize: 12 }}>{a.title}</p>
                      <p style={{ margin: '3px 0 0', color: '#94a3b8', fontSize: 11, lineHeight: 1.6 }}>{a.detail}</p>
                    </div>
                  ))}
                </div>
              )}
              {renderChart(r.chart_data)}
              {(r.recommendations?.length ?? 0) > 0 && (
                <div style={{ marginTop: 18, background: '#0d0d1a', borderRadius: 10, padding: '14px', border: '1px solid #f59e0b22' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 10, color: '#f59e0b', fontFamily: "'JetBrains Mono',monospace", letterSpacing: 2, textTransform: 'uppercase' }}>🎯 CEO Tavsiyalar</p>
                  {r.recommendations!.map((rec, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                      <span style={{ color: '#f59e0b', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, marginTop: 2, flexShrink: 0 }}>[{String(i + 1).padStart(2, '0')}]</span>
                      <p style={{ margin: 0, color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>{rec}</p>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ margin: '14px 0 0', fontSize: 10, color: '#334155', fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1 }}>
                LANDED COST ENGINE v3.0 · {new Date().toLocaleTimeString('uz-UZ')} · Real Supabase data
              </p>
            </div>
          );
        })()}

        {/* ─── DEFAULT: Daily chart when no response ─── */}
        {!aiResponse && !loading && analyticsData && (
          <div style={{ background: '#0d0d1a', border: '1px solid #f59e0b22', borderRadius: 16, padding: '20px' }}>
            <p style={{ margin: '0 0 14px', fontSize: 11, color: '#f59e0b', fontFamily: "'JetBrains Mono',monospace", letterSpacing: 2, textTransform: 'uppercase' }}>📈 Kunlik Daromad Dinamikasi (000 UZS)</p>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={analyticsData.weekly.trend.slice(-7).map((d) => ({ date: d.date.slice(5), revenue: Math.round(d.revenue / 1000) }))} barSize={30}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {analyticsData.weekly.trend.slice(-7).map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: 12, color: '#64748b' }}>CEO buyruqlaridan birini tanlang yoki savolingizni yozing ↑</p>
          </div>
        )}
      </div>
    </div>
  );
}
