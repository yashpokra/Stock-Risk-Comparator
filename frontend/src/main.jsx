import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Download, Loader2, Plus, Search, X } from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

function stripMarkdown(text) {
  if (!text) return '';
  let out = text
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\s*[-*]\s+/, '')
    // Replace bold/italic groups with their inner content (preserve words)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`/g, '');

  // Ensure spacing where adjacent markdown groups were removed (e.g. "1**TSLA****Low**")
  out = out.replace(/^(\d+)(?=[A-Za-z])/, '$1 ');
  out = out.replace(/(\d)(?=[A-Z]{2,})/g, '$1 ');
  out = out.replace(/([A-Z]{2,})(?=[A-Z][a-z])/g, '$1 ');
  out = out.replace(/([a-zA-Z0-9])(?=(Very High|Low|Medium|High)\b)/g, '$1 ');
  // Remove extra spaces and trim accidental spaces before punctuation
  out = out.replace(/\s+([,.:;?!])/g, '$1');
  out = out.replace(/\s+/g, ' ');
  // Normalize occasional reversed risk ranges like "Medium to Low" -> "Low to Medium"
  out = out.replace(/\bMedium\s+to\s+Low\b/ig, 'Low to Medium');
  return out.trim();
}

function formatInline(text) {
  const normalized = stripMarkdown(text);
  const labelMatch = normalized.match(/^([^:]{2,34}):\s*(.+)$/);
  const body = labelMatch ? labelMatch[2] : normalized;
  let moneyBody = body;
  moneyBody = moneyBody.replace(/(?<!\$)(\d[\d,\.]*)\s*(billion|million|bn|m|k)\b/gi, '$$$1 $2');
  moneyBody = moneyBody.replace(/\b(price|start price|end price|revenue|net income|operating cash flow|operating cashflow|debt|cash flow|market cap|market capitalization)\b(?:\s*(?:is|of|at))?\s*\$?(\d[\d,\.]*)/ig, (m, label, num) => `${label} $${num}`);
  const moneyLabels = ['revenue', 'net income', 'operating cash flow', 'operating cashflow', 'debt', 'cash flow', 'price', 'start price', 'end price'];
  if (labelMatch && moneyLabels.includes(labelMatch[1].toLowerCase())) {
    moneyBody = moneyBody.replace(/(?<!\$)(\d[\d,\.]*)/g, '$$$1');
  }
  const parts = moneyBody.split(/\b(Very High|Low|Medium|High)\b/g);

  return (
    <>
      {labelMatch && <strong className="label">{labelMatch[1]}: </strong>}
      {parts.map((part, index) => {
        if (['Low', 'Medium', 'High', 'Very High'].includes(part)) {
          const className = `risk risk-${part.toLowerCase().replace(' ', '-')}`;
          return <strong className={className} key={index}>{part}</strong>;
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
}

function isSectionHeading(line) {
  const clean = stripMarkdown(line).replace(/:$/, '').toLowerCase();
  return [
    'executive summary',
    'company overview',
    'financial health',
    'financial health assessment',
    'historical trend',
    'historical trend analysis',
    'risk classification',
    'risk classification & justification',
    'warning signals',
    'investment perspective',
    'final recommendation',
    'comparative ranking',
  ].includes(clean);
}

function ReportText({ text }) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  return (
    <div className="report-body">
      {lines.map((line, index) => {
        let clean = stripMarkdown(line);
        const numberedHeading = clean.match(/^(\d+)\.\s+(.+)$/);
        const rankLine = clean.match(/^Rank\s+(\d+):\s+(.+?)(?:\s+-\s+(.+))?$/i);
        const altRank = clean.match(/^(\d+)\s+([A-Z0-9\-]+)\s*[,:\-]?\s*(Very High|Low|Medium|High)?\b[,:\-]?\s*(.*)$/i);
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);

        if (numberedHeading) {
          return (
            <h3 key={index}>
              <span>{numberedHeading[1]}</span>
              {stripMarkdown(numberedHeading[2])}
            </h3>
          );
        }

        if (rankLine) {
          return (
            <div className="rank-row" key={index}>
              <span className="rank-badge">{rankLine[1]}</span>
              <p>
                <strong className="rank-company">{rankLine[2]}</strong>
                {rankLine[3] && <span> {formatInline(rankLine[3])}</span>}
              </p>
            </div>
          );
        }

        if (!rankLine && altRank) {
          // altRank groups: 1=rank, 2=ticker/company, 3=risk (optional), 4=rest
          const reason = [altRank[3], altRank[4]].filter(Boolean).join(', ');
          return (
            <div className="rank-row" key={index}>
              <span className="rank-badge">{altRank[1]}</span>
              <p>
                <strong className="rank-company">{altRank[2]}</strong>
                {reason && <span> {formatInline(reason)}</span>}
              </p>
            </div>
          );
        }

        if (line.startsWith('#') || isSectionHeading(line)) {
          return <h3 key={index}>{stripMarkdown(line).replace(/:$/, '')}</h3>;
        }

        if (bullet) {
          return <p className="bullet" key={index}>{formatInline(bullet[1])}</p>;
        }

        return <p key={index}>{formatInline(clean.replace(/^(\d+)\.\s+/, ''))}</p>;
      })}
    </div>
  );
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatPdfText(report) {
  let out = escapeHtml(report)
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '');

  // add $ for obvious monetary values
    out = out.replace(/(?<![$\d])(\d[\d,\.]*)\s*(billion|million|bn|m|k)\b/gi, '$$$1 $2');
    out = out.replace(/\b(price|start price|end price|revenue|net income|operating cash flow|operating cashflow|debt|cash flow|market cap|market capitalization)\b(?:\s*(?:is|of|at))?\s*\$?(\d[\d,\.]*)/ig, (m, label, num) => `${label}: $${num}`);

    return out
      .replace(/^(\d+)\.\s+(.+)$/gm, '<h3><span>$1</span>$2</h3>')
      .replace(/\b(Very High|Low|Medium|High)\b/g, '<strong class="risk">$1</strong>')
      .replace(/^([^:<>\n]{2,34}):\s*(.+)$/gm, '<p><strong class="label">$1:</strong> $2</p>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br />')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>')
      .replace(/<p><h3/g, '<h3')
      .replace(/<\/h3><\/p>/g, '</h3>')
      .replace(/<p><p>/g, '<p>')
      .replace(/<\/p><\/p>/g, '</p>');
}

function reportHtml(title, reports) {
  const sections = Object.entries(reports)
    .map(([ticker, report]) => {
      const heading = ticker === '__comparison__' ? 'Comparative Ranking' : ticker;
      return `<section class="pdf-section"><h2>${heading}</h2>${formatPdfText(report)}</section>`;
    })
    .join('');

  return `<!doctype html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { margin: 0; color: #172033; font-family: Arial, sans-serif; background: white; }
          main { max-width: 860px; margin: 0 auto; padding: 36px; background: white; }
          h1 { text-align: center; margin: 0 0 6px; font-size: 30px; }
          .sub { text-align: center; margin: 0 0 28px; color: #64748b; }
          .pdf-section { page-break-inside: avoid; border-top: 2px solid #d8e2ea; padding-top: 18px; margin-top: 24px; }
          h2 { margin: 0 0 12px; color: #0f766e; font-size: 22px; }
          h3 { margin: 18px 0 8px; font-size: 16px; color: #172033; }
          h3 span { display: inline-grid; place-items: center; width: 24px; height: 24px; margin-right: 8px; border-radius: 50%; background: #e0f2f1; color: #0f766e; font-size: 12px; }
          p { margin: 0 0 10px; line-height: 1.55; color: #334155; }
          .label { color: #172033; }
          .risk { color: #0f766e; }
        </style>
      </head>
      <body>
        <main>
          <h1>${title}</h1>
          <p class="sub">Generated by Stock Risk Comparator</p>
          ${sections}
        </main>
        <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
      </body>
    </html>`;
}

function App() {
  const [stocks, setStocks] = useState([]);
  const [selected, setSelected] = useState(['AAPL', 'MSFT', 'TSLA']);
  const [query, setQuery] = useState('');
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/stocks`)
      .then((response) => response.json())
      .then((data) => setStocks(data.stocks || []))
      .catch(() => setError('Could not load stock options.'));
  }, []);

  const filteredStocks = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return stocks.filter((stock) => {
      const matches = stock.ticker.toLowerCase().includes(needle) || stock.name.toLowerCase().includes(needle);
      return matches && !selected.includes(stock.ticker);
    });
  }, [query, selected, stocks]);

  const compare = async () => {
    setLoading(true);
    setError('');
    setReports(null);
    try {
      const response = await fetch(`${API_BASE}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: selected }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Comparison failed.');
      setReports(data.reports);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addTicker = (ticker) => {
    if (selected.length >= 6) return;
    setSelected((current) => [...current, ticker]);
    setQuery('');
  };

  const removeTicker = (ticker) => {
    setSelected((current) => current.filter((item) => item !== ticker));
  };

  const downloadPdf = () => {
    if (!reports) return;
    const popup = window.open('', '_blank');
    popup.document.write(reportHtml('Stock Risk Comparison Report', reports));
    popup.document.close();
  };

  return (
    <main className="shell">
      <section className="workspace">
        <header className="topbar">
          <div className="title-block">
            <h1>Stock Risk Comparator</h1>
            <p className="subtitle">Compare financial risk, trends, and warning signals across up to six companies.</p>
          </div>
          <div className="actions">
            <button className="primary" onClick={compare} disabled={loading || selected.length === 0}>
              {loading ? <Loader2 className="spin" size={18} /> : <BarChart3 size={18} />}
              Submit
            </button>
          </div>
        </header>

        <div className="layout">
          <aside className="panel">
            <div className="panel-head">
              <h2>Companies</h2>
              <span>{selected.length}/6</span>
            </div>
            <div className="field">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search 50 companies" />
            </div>

            <div className="selected">
              {selected.map((ticker) => (
                <button className="chip" key={ticker} onClick={() => removeTicker(ticker)}>
                  {ticker}
                  <X size={14} />
                </button>
              ))}
            </div>

            <div className="stock-list">
              {filteredStocks.map((stock) => (
                <button className="stock-row" key={stock.ticker} onClick={() => addTicker(stock.ticker)} disabled={selected.length >= 6}>
                  <span>
                    <strong>{stock.ticker}</strong>
                    <small>{stock.name}</small>
                  </span>
                  <Plus size={16} />
                </button>
              ))}
            </div>
          </aside>

          <section className="results">
            {error && <div className="notice">{error}</div>}
            {!reports && !loading && (
              <div className="empty">
                <BarChart3 size={42} />
                <h2>Select 1 to 6 stocks</h2>
                <p>Run the multi-agent analysis to generate individual risk reports and a comparative ranking.</p>
              </div>
            )}
            {loading && (
              <div className="empty">
                <Loader2 className="spin" size={42} />
                <h2>Analyzing selected companies</h2>
                <p>This can take a minute because each ticker runs through profile, financial, trend, and comparison agents.</p>
              </div>
            )}
            {reports && (
              <div className="report-shell">
                <div className="report-toolbar">
                  <div>
                    <p className="eyebrow">Generated Report</p>
                    <h2>Scrollable PDF Preview</h2>
                  </div>
                  <button className="secondary" onClick={downloadPdf}>
                    <Download size={18} />
                    Download PDF
                  </button>
                </div>
                {reports.__comparison__ && (
                  <article className="report">
                    <h2>Comparative Ranking</h2>
                    <ReportText text={reports.__comparison__} />
                  </article>
                )}
                {Object.entries(reports)
                  .filter(([ticker]) => ticker !== '__comparison__')
                  .map(([ticker, report]) => (
                    <article className="report" key={ticker}>
                      <h2>{ticker}</h2>
                      <ReportText text={report} />
                    </article>
                  ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
