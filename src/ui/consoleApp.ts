/**
 * Self-contained Enterprise Web Console for Zero-Trust Failure Topology.
 * Served directly at GET / with zero external frontend build dependencies.
 */
export function renderConsoleHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Zero-Trust Failure Topology · Blast-Radius &amp; Containment Console</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-page: #f8fafc;
      --bg-card: #ffffff;
      --border: #e2e8f0;
      --border-strong: #cbd5e1;
      --text: #0f172a;
      --text-secondary: #334155;
      --muted: #64748b;
      --accent: #1d4ed8;
      --accent-hover: #1e40af;
      --accent-soft: #eff6ff;
      --accent-border: #bfdbfe;
      --allow-bg: #ecfdf5;
      --allow-border: #a7f3d0;
      --allow-text: #065f46;
      --block-bg: #fef2f2;
      --block-border: #fecaca;
      --block-text: #991b1b;
      --hold-bg: #fffbeb;
      --hold-border: #fde68a;
      --hold-text: #92400e;
      --origin-bg: #f5f3ff;
      --origin-border: #c4b5fd;
      --origin-text: #5b21b6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-page);
      color: var(--text);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    code, pre, .mono {
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 40;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(6px);
      border-bottom: 1px solid var(--border);
    }
    .topbar-inner {
      max-width: 1320px;
      margin: 0 auto;
      height: 64px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: var(--accent);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    }
    .brand-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.015em;
      color: var(--text);
    }
    .version-pill {
      background: #f1f5f9;
      color: #475569;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .brand-sub {
      font-size: 12px;
      color: var(--muted);
      font-weight: 500;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 600;
      white-space: nowrap;
      border: 1px solid var(--allow-border);
      background: var(--allow-bg);
      color: var(--allow-text);
    }
    .status-pill.quarantined {
      border-color: var(--block-border);
      background: var(--block-bg);
      color: var(--block-text);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #059669;
      flex-shrink: 0;
    }
    .status-pill.quarantined .dot { background: #dc2626; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 13px;
      border-radius: 6px;
      font-size: 12.5px;
      font-weight: 600;
      border: 1px solid var(--border);
      background: #fff;
      color: var(--text-secondary);
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.12s ease;
    }
    .btn:hover { background: #f8fafc; border-color: var(--border-strong); color: var(--text); }
    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); color: #fff; }
    .btn-success {
      background: #059669;
      border-color: #059669;
      color: #fff;
    }
    .btn-success:hover { background: #047857; border-color: #047857; color: #fff; }
    .btn-danger-soft {
      background: var(--block-bg);
      border-color: var(--block-border);
      color: var(--block-text);
    }
    .btn-danger-soft:hover { background: #fee2e2; }

    /* Layout */
    .shell {
      max-width: 1320px;
      margin: 0 auto;
      padding: 24px;
      display: flex;
      gap: 24px;
      align-items: flex-start;
    }
    .sidebar {
      width: 232px;
      flex-shrink: 0;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    }
    .nav-group-label {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      padding: 6px 10px 4px;
    }
    .nav-list {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .nav-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted);
      font-size: 13.5px;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .nav-btn-left {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .nav-btn:hover { background: #f1f5f9; color: var(--text); }
    .nav-btn.active {
      background: var(--accent-soft);
      color: var(--accent);
      border-color: var(--accent-border);
      font-weight: 600;
    }
    .nav-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 999px;
      background: #fee2e2;
      color: #991b1b;
    }
    .nav-badge.clean {
      background: #dcfce7;
      color: #166534;
    }
    .sidebar-card {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
      font-size: 12px;
    }
    .sidebar-card-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .zone-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 0;
      color: var(--text-secondary);
      font-size: 12px;
    }
    .main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .tab-pane { display: none; flex-direction: column; gap: 20px; }
    .tab-pane.active { display: flex; }

    /* Cards & Metrics */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }
    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 18px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    }
    .kpi-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .kpi-value {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
      line-height: 1.2;
    }
    .kpi-sub {
      font-size: 11.5px;
      color: var(--muted);
      margin-top: 5px;
    }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .card-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
    }
    .card-subtitle {
      font-size: 12.5px;
      color: var(--muted);
      margin-top: 2px;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    /* SVG Graph Canvas */
    .graph-wrap {
      width: 100%;
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .graph-svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .legend-row {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      font-size: 11.5px;
      color: var(--text-secondary);
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }
    .legend-swatch {
      width: 11px;
      height: 11px;
      border-radius: 3px;
      border: 1.5px solid transparent;
    }

    /* Preset Pills & Form Controls */
    .preset-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .preset-pill {
      padding: 6px 11px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #f8fafc;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .preset-pill:hover {
      border-color: var(--accent-border);
      background: var(--accent-soft);
      color: var(--accent);
    }
    .controls-bar {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      flex-wrap: wrap;
      padding: 14px;
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 200px;
      flex: 1;
    }
    .field label {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--text-secondary);
    }
    select, input[type="number"] {
      height: 36px;
      padding: 0 10px;
      border-radius: 6px;
      border: 1px solid var(--border-strong);
      background: #fff;
      color: var(--text);
      font-family: inherit;
      font-size: 13px;
    }

    /* Banners */
    .sim-banner {
      border-radius: 8px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      border: 1px solid var(--border);
      background: #fff;
    }
    .sim-banner.high-risk {
      background: var(--block-bg);
      border-color: var(--block-border);
      color: var(--block-text);
    }
    .sim-banner.moderate-risk {
      background: var(--hold-bg);
      border-color: var(--hold-border);
      color: var(--hold-text);
    }
    .sim-banner.contained {
      background: var(--allow-bg);
      border-color: var(--allow-border);
      color: var(--allow-text);
    }
    .sim-metrics {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .sim-stat-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.8;
      font-weight: 600;
    }
    .sim-stat-val {
      font-size: 18px;
      font-weight: 700;
    }

    /* Tables & Badges */
    .table-wrap {
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }
    th {
      background: #f8fafc;
      color: var(--muted);
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      color: var(--text-secondary);
      vertical-align: top;
    }
    tr:last-child td { border-bottom: none; }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .badge-red { background: var(--block-bg); color: var(--block-text); border: 1px solid var(--block-border); }
    .badge-amber { background: var(--hold-bg); color: var(--hold-text); border: 1px solid var(--hold-border); }
    .badge-green { background: var(--allow-bg); color: var(--allow-text); border: 1px solid var(--allow-border); }
    .badge-blue { background: var(--accent-soft); color: var(--accent); border: 1px solid var(--accent-border); }
    .badge-violet { background: var(--origin-bg); color: var(--origin-text); border: 1px solid var(--origin-border); }
    .badge-slate { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

    /* Risk Cards */
    .risk-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .risk-item {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 15px 16px;
      background: #fff;
    }
    .risk-item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }
    .risk-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
    }
    .risk-desc {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 10px;
    }
    .risk-remediation {
      padding: 9px 12px;
      border-radius: 6px;
      background: #f8fafc;
      border-left: 3px solid var(--accent);
      font-size: 12.5px;
      color: var(--text-secondary);
    }

    /* Before/After Comparison */
    .compare-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .compare-box {
      border-radius: 8px;
      padding: 16px 18px;
      border: 1px solid var(--border);
    }
    .compare-box.before {
      background: #fff5f5;
      border-color: var(--block-border);
    }
    .compare-box.after {
      background: #f0fdf4;
      border-color: var(--allow-border);
    }
    .compare-score {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 6px 0;
    }
    .bar-row {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 10px;
    }
    .bar-label-line {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 500;
    }
    .bar-track {
      height: 7px;
      background: #f1f5f9;
      border-radius: 999px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 999px;
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand" onclick="switchTab('overview')">
        <div class="brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="6" r="3"></circle>
            <circle cx="18" cy="6" r="3"></circle>
            <circle cx="12" cy="18" r="3"></circle>
            <line x1="8.7" y1="7.5" x2="10.8" y2="15.3"></line>
            <line x1="15.3" y1="7.5" x2="13.2" y2="15.3"></line>
            <line x1="9" y1="6" x2="15" y2="6"></line>
          </svg>
        </div>
        <div>
          <div class="brand-title-row">
            <span class="brand-title">Zero-Trust Failure Topology</span>
            <span class="version-pill">v1.0.0</span>
          </div>
          <div class="brand-sub">Deterministic Cascading-Failure Graph · Blast-Radius &amp; Bulkhead Console</div>
        </div>
      </div>

      <div class="header-actions">
        <div id="quarantine-pill" class="status-pill">
          <span class="dot"></span>
          <span id="quarantine-pill-text">Mesh Healthy · 0 Quarantined</span>
        </div>
        <button class="btn" onclick="seedDemoScenarios()">Seed Scenarios</button>
        <button class="btn" onclick="resetTopologyMesh()">Reset Mesh</button>
      </div>
    </div>
  </header>

  <div class="shell">
    <aside class="sidebar">
      <div class="nav-group-label">Analyze</div>
      <nav class="nav-list">
        <button class="nav-btn active" data-tab="overview" onclick="switchTab('overview')">
          <span class="nav-btn-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Overview
          </span>
        </button>
        <button class="nav-btn" data-tab="simulator" onclick="switchTab('simulator')">
          <span class="nav-btn-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Blast Simulator
          </span>
        </button>
        <button class="nav-btn" data-tab="risks" onclick="switchTab('risks')">
          <span class="nav-btn-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Structural Risks
          </span>
          <span id="nav-risk-badge" class="nav-badge">0</span>
        </button>
      </nav>

      <div class="nav-group-label" style="margin-top:12px;">Contain &amp; Govern</div>
      <nav class="nav-list">
        <button class="nav-btn" data-tab="planner" onclick="switchTab('planner')">
          <span class="nav-btn-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Bulkhead Planner
          </span>
        </button>
        <button class="nav-btn" data-tab="audit" onclick="switchTab('audit')">
          <span class="nav-btn-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Audit Ledger
          </span>
        </button>
      </nav>

      <div class="sidebar-card">
        <div class="sidebar-card-title">Engine Controls</div>
        <div class="zone-row"><span>External calls</span><span class="mono" style="color:#059669;font-weight:600;">0</span></div>
        <div class="zone-row"><span>Graph evaluation</span><span class="mono" style="font-weight:600;">&lt; 1 ms</span></div>
        <div class="zone-row"><span>Audit trail</span><span class="mono" style="font-weight:600;">SHA-256 chain</span></div>
      </div>
    </aside>

    <main class="main">
      <!-- TAB 1: OVERVIEW -->
      <section id="tab-overview" class="tab-pane active">
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Active Mesh Topology</div>
            <div id="kpi-mesh-size" class="kpi-value">9 Nodes</div>
            <div id="kpi-mesh-edges" class="kpi-sub">11 directed dependency edges</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Structural Risk Paths</div>
            <div id="kpi-risk-count" class="kpi-value" style="color: #dc2626;">0</div>
            <div id="kpi-risk-sub" class="kpi-sub">Cycles, SPOFs &amp; unsanitized sinks</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Peak Blast Radius</div>
            <div id="kpi-peak-blast" class="kpi-value">0%</div>
            <div id="kpi-peak-sub" class="kpi-sub">Across evaluated fault simulations</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Audit Chain Integrity</div>
            <div id="kpi-audit-status" class="kpi-value" style="color: #059669;">VERIFIED</div>
            <div id="kpi-audit-sub" class="kpi-sub">SHA-256 hash chain intact</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div id="overview-mesh-title" class="card-title">Order Fulfillment Agent &amp; Service Mesh</div>
              <div class="card-subtitle">Click any node in the dependency graph to simulate its fault blast radius across upstream and downstream boundaries.</div>
            </div>
            <div class="legend-row">
              <span class="legend-item"><span class="legend-swatch" style="background:#dcfce7;border-color:#10b981;"></span>Protected Edge (Breaker / Sanitized)</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#f1f5f9;border-color:#94a3b8;"></span>Unguarded Hard Dependency</span>
            </div>
          </div>
          <div class="graph-wrap" id="overview-svg-container"></div>
        </div>

        <div class="two-col">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Structural Vulnerability Breakdown</div>
                <div class="card-subtitle">Static graph findings across trust zones, retry chains, and credentials</div>
              </div>
              <button class="btn" onclick="switchTab('risks')">Inspect All</button>
            </div>
            <div id="overview-risk-bars"></div>
          </div>

          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Live Incident Correlator &amp; Node Quarantine</div>
                <div class="card-subtitle">Auto-quarantines a node when consecutive runtime security signals trip threshold</div>
              </div>
              <button class="btn" onclick="clearAllQuarantines()">Clear All</button>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
              <select id="incident-node-select" style="flex:1;"></select>
              <button class="btn btn-danger-soft" onclick="sendRuntimeIncident()">Inject Signal</button>
            </div>
            <div id="incident-health-list" style="font-size:12.5px;color:var(--text-secondary);"></div>
          </div>
        </div>
      </section>

      <!-- TAB 2: BLAST-RADIUS SIMULATOR -->
      <section id="tab-simulator" class="tab-pane">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Deterministic Blast-Radius Simulator</div>
              <div class="card-subtitle">Inject an outage, retry surge, untrusted payload taint, or credential leak at any node and trace exact propagation</div>
            </div>
          </div>

          <div class="preset-bar">
            <span style="font-size:12px;font-weight:600;color:var(--muted);">Quick Scenarios:</span>
            <button class="preset-pill" onclick="runPresetSimulation('ledger-db', 'dependency_outage')">1. Core Ledger Outage (SPOF)</button>
            <button class="preset-pill" onclick="runPresetSimulation('inbound-webhook', 'taint_propagation')">2. Webhook Taint Injection</button>
            <button class="preset-pill" onclick="runPresetSimulation('inbound-webhook', 'retry_storm')">3. Nested Retry Storm</button>
            <button class="preset-pill" onclick="runPresetSimulation('triage-agent', 'credential_compromise')">4. Shared Token Compromise</button>
          </div>

          <div class="controls-bar">
            <div class="field">
              <label for="sim-origin">Fault Origin Node</label>
              <select id="sim-origin"></select>
            </div>
            <div class="field">
              <label for="sim-fault-mode">Fault Propagation Mode</label>
              <select id="sim-fault-mode">
                <option value="dependency_outage">Dependency Outage (Upstream Cascade)</option>
                <option value="taint_propagation">Untrusted Taint Propagation (Downstream)</option>
                <option value="retry_storm">Compounded Retry Storm (Load Amplification)</option>
                <option value="credential_compromise">Credential Compromise (Lateral &amp; Downstream)</option>
              </select>
            </div>
            <button class="btn btn-primary" onclick="executeSimulation()">Simulate (Model)</button>
            <button class="btn btn-success" onclick="runLiveChaosFromSim()">Run Live HTTP Test</button>
            <button class="btn" onclick="openPlannerFromSim()">Plan Bulkheads &rarr;</button>
          </div>
        </div>

        <div id="sim-result-banner" class="sim-banner"></div>
        <div id="sim-live-chaos-card" class="card" style="display:none;"></div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Live Impact Propagation Map</div>
              <div class="card-subtitle">Nodes &amp; edges color-coded by deterministic simulation state</div>
            </div>
            <div class="legend-row">
              <span class="legend-item"><span class="legend-swatch" style="background:#f5f3ff;border-color:#7c3aed;"></span>Origin</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#fef2f2;border-color:#dc2626;"></span>Compromised</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#fffbeb;border-color:#d97706;"></span>Degraded</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#ecfdf5;border-color:#059669;"></span>Contained</span>
              <span class="legend-item"><span class="legend-swatch" style="background:#ffffff;border-color:#cbd5e1;"></span>Healthy</span>
            </div>
          </div>
          <div class="graph-wrap" id="sim-svg-container"></div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Causal Hop-by-Hop Propagation Trace</div>
              <div class="card-subtitle">Exact sequence of propagated faults, graceful degradations, and triggered containment gates</div>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Hop Vector</th>
                  <th>Edge ID</th>
                  <th>Outcome</th>
                  <th>Causal Explanation</th>
                </tr>
              </thead>
              <tbody id="sim-trace-tbody"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 3: STRUCTURAL RISKS -->
      <section id="tab-risks" class="tab-pane">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Architectural Cascading-Failure Risk Scan</div>
              <div class="card-subtitle">Deterministic graph inspection for agent delegation cycles, nested retry amplification, shared cross-zone tokens, and unguarded sinks</div>
            </div>
            <button class="btn btn-primary" onclick="triggerAuditedRiskScan()">Run Audited Scan</button>
          </div>
          <div id="risk-findings-container" class="risk-list"></div>
        </div>
      </section>

      <!-- TAB 4: CONTAINMENT PLANNER -->
      <section id="tab-planner" class="tab-pane">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Counterfactual Bulkhead &amp; Containment Planner</div>
              <div class="card-subtitle">Tests candidate circuit breakers, retry caps, sanitization gates, and token isolation patches in memory and ranks them by blast-radius reduction</div>
            </div>
          </div>
          <div class="controls-bar">
            <div class="field">
              <label for="plan-origin">Target Fault Origin</label>
              <select id="plan-origin"></select>
            </div>
            <div class="field">
              <label for="plan-fault-mode">Target Fault Mode</label>
              <select id="plan-fault-mode">
                <option value="dependency_outage">Dependency Outage (Upstream Cascade)</option>
                <option value="taint_propagation">Untrusted Taint Propagation (Downstream)</option>
                <option value="retry_storm">Compounded Retry Storm (Load Amplification)</option>
                <option value="credential_compromise">Credential Compromise (Lateral &amp; Downstream)</option>
              </select>
            </div>
            <button class="btn btn-primary" onclick="computeContainmentPlan()">Compute Bulkhead Plan</button>
            <button id="apply-all-bulkheads-btn" class="btn btn-success" onclick="applyAllRecommendedBulkheads()">Apply Recommended Bulkheads</button>
            <button class="btn" onclick="runLiveChaosFromPlanner()">Verify via Live HTTP Test</button>
          </div>
        </div>

        <div id="planner-applied-banner" class="sim-banner contained" style="display:none;"></div>
        <div id="planner-comparison-area" class="compare-grid"></div>
        <div id="planner-live-chaos-card" class="card" style="display:none;"></div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Ranked Architectural Control Recommendations</div>
              <div class="card-subtitle">Individual bulkhead patches ordered by single-control blast-radius score reduction</div>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Target</th>
                  <th>Recommended Control Patch</th>
                  <th>Blast Radius Impact</th>
                  <th>Compromised Nodes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="planner-recs-tbody"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 5: AUDIT LEDGER -->
      <section id="tab-audit" class="tab-pane">
        <div id="audit-verify-banner" class="sim-banner contained"></div>
        <div id="audit-tamper-alert" class="sim-banner high-risk" style="display:none;"></div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Tamper-Evident SHA-256 Topology Audit Chain</div>
              <div class="card-subtitle">Every simulation, structural risk scan, bulkhead update, and node quarantine event is cryptographically linked from GENESIS</div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn" onclick="verifyLedgerNow()">Verify Chain</button>
              <button class="btn btn-danger-soft" onclick="simulateTamperAttack()">Simulate Tamper Attack</button>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Timestamp</th>
                  <th>Event Type</th>
                  <th>Summary</th>
                  <th>Blast Score</th>
                  <th>prevHash &rarr; entryHash</th>
                </tr>
              </thead>
              <tbody id="audit-tbody"></tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  </div>

  <script>
    let currentTopology = null;
    let currentRisks = [];
    let currentSimulation = null;
    let currentPlan = null;

    function esc(str) {
      return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    async function api(path, options = {}) {
      const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options
      });
      return res.json();
    }

    function switchTab(tabId) {
      document.querySelectorAll(".nav-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === tabId);
      });
      document.querySelectorAll(".tab-pane").forEach((p) => {
        p.classList.toggle("active", p.id === "tab-" + tabId);
      });
      if (tabId === "overview") refreshDashboard();
      if (tabId === "risks") renderRisksList();
      if (tabId === "audit") loadAuditLedger();
      if (tabId === "planner" && !currentPlan) computeContainmentPlan();
    }

    function populateNodeSelectors(nodes) {
      const ids = ["sim-origin", "plan-origin", "incident-node-select"];
      ids.forEach((selId) => {
        const el = document.getElementById(selId);
        if (!el) return;
        const prev = el.value;
        el.innerHTML = nodes
          .map((n) => '<option value="' + esc(n.id) + '">' + esc(n.label) + ' (' + esc(n.kind) + ' · ' + esc(n.zone) + ')</option>')
          .join("");
        if (prev && nodes.some((n) => n.id === prev)) {
          el.value = prev;
        }
      });
      const simEl = document.getElementById("sim-origin");
      if (simEl && !simEl.dataset.initialized && nodes.some((n) => n.id === "ledger-db")) {
        simEl.value = "ledger-db";
        simEl.dataset.initialized = "1";
      }
      const planEl = document.getElementById("plan-origin");
      if (planEl && !planEl.dataset.initialized && nodes.some((n) => n.id === "ledger-db")) {
        planEl.value = "ledger-db";
        planEl.dataset.initialized = "1";
      }
    }

    function renderTopologySvg(topology, simResult, clickableToSim) {
      if (!topology || !topology.nodes) return "";
      const outcomeMap = new Map();
      const hopOutcomeMap = new Map();
      if (simResult) {
        (simResult.nodeOutcomes || []).forEach((o) => outcomeMap.set(o.nodeId, o));
        (simResult.propagationTrace || []).forEach((h) => hopOutcomeMap.set(h.edgeId, h));
      }

      const nodePos = new Map();
      topology.nodes.forEach((n, idx) => {
        const x = typeof n.x === "number" ? n.x : 140 + (idx % 4) * 240;
        const y = typeof n.y === "number" ? n.y : 120 + Math.floor(idx / 4) * 150;
        nodePos.set(n.id, { x, y, node: n });
      });

      const zones = [
        { label: "UNTRUSTED INGRESS", x: 18, w: 195, fill: "#fef2f2" },
        { label: "DMZ / EDGE AGENTS", x: 225, w: 235, fill: "#fffbeb" },
        { label: "RESTRICTED MESH", x: 472, w: 245, fill: "#eff6ff" },
        { label: "CRITICAL STATE SINKS", x: 729, w: 233, fill: "#f5f3ff" }
      ];

      let svg = '<svg class="graph-svg" viewBox="0 0 980 485" xmlns="http://www.w3.org/2000/svg">';
      svg += '<defs>';
      svg += '<marker id="arrow-slate" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8"/></marker>';
      svg += '<marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981"/></marker>';
      svg += '<marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444"/></marker>';
      svg += '<marker id="arrow-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706"/></marker>';
      svg += '</defs>';

      zones.forEach((z) => {
        svg += '<rect x="' + z.x + '" y="16" width="' + z.w + '" height="452" rx="10" fill="' + z.fill + '" fill-opacity="0.45" stroke="#e2e8f0" stroke-dasharray="4 4"/>';
        svg += '<text x="' + (z.x + 12) + '" y="38" font-size="10" font-weight="700" fill="#64748b" letter-spacing="0.06em">' + z.label + '</text>';
      });

      function rectBorderPoint(cx, cy, tx, ty, halfW, halfH, pad) {
        const dx = tx - cx;
        const dy = ty - cy;
        if (dx === 0 && dy === 0) return { x: cx, y: cy };
        const scaleX = Math.abs(dx) > 0.001 ? (halfW + pad) / Math.abs(dx) : Infinity;
        const scaleY = Math.abs(dy) > 0.001 ? (halfH + pad) / Math.abs(dy) : Infinity;
        const t = Math.min(scaleX, scaleY);
        return { x: cx + dx * t, y: cy + dy * t };
      }

      // Draw edges
      topology.edges.forEach((e) => {
        const src = nodePos.get(e.from);
        const dst = nodePos.get(e.to);
        if (!src || !dst) return;

        const hasReverse = topology.edges.some((other) => other.from === e.to && other.to === e.from);
        const curveOffset = hasReverse ? (e.from < e.to ? -22 : 22) : 0;
        const midX = (src.x + dst.x) / 2 + curveOffset;
        const midY = (src.y + dst.y) / 2 + (hasReverse ? (e.from < e.to ? -12 : 12) : 0);

        const startPt = rectBorderPoint(src.x, src.y, midX, midY, 78, 29, 2);
        const endPt = rectBorderPoint(dst.x, dst.y, midX, midY, 78, 29, 5);
        const x1 = startPt.x;
        const y1 = startPt.y;
        const x2 = endPt.x;
        const y2 = endPt.y;
        const cx = midX;
        const cy = midY;

        let stroke = "#94a3b8";
        let width = "1.75";
        let dash = "";
        let marker = "url(#arrow-slate)";

        const isProtected = Boolean(e.circuitBreaker || e.fallbackMode || (e.sanitized && e.scopedTokenVerified));
        if (!simResult && isProtected) {
          stroke = "#10b981";
          dash = "5 3";
          marker = "url(#arrow-green)";
        }

        const hop = hopOutcomeMap.get(e.id);
        if (hop) {
          if (hop.outcome === "PROPAGATED") {
            stroke = "#ef4444";
            width = "2.6";
            marker = "url(#arrow-red)";
          } else if (hop.outcome === "DEGRADED") {
            stroke = "#d97706";
            width = "2.4";
            dash = "5 3";
            marker = "url(#arrow-amber)";
          } else if (hop.outcome === "BLOCKED_BY_CONTROL") {
            stroke = "#10b981";
            width = "2.5";
            dash = "5 3";
            marker = "url(#arrow-green)";
          }
        }

        svg += '<path d="M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Q ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '" fill="none" stroke="' + stroke + '" stroke-width="' + width + '" ' + (dash ? 'stroke-dasharray="' + dash + '"' : '') + ' marker-end="' + marker + '"/>';
      });

      // Draw nodes
      topology.nodes.forEach((n) => {
        const pos = nodePos.get(n.id);
        const w = 156;
        const h = 58;
        const rx = pos.x - w / 2;
        const ry = pos.y - h / 2;

        let fill = "#ffffff";
        let border = "#cbd5e1";
        let titleColor = "#0f172a";
        let subText = n.kind + " · " + n.zone;
        let stateBadge = "";

        const outcome = outcomeMap.get(n.id);
        if (outcome) {
          if (outcome.state === "ORIGIN") {
            fill = "#f5f3ff";
            border = "#7c3aed";
            titleColor = "#4c1d95";
            stateBadge = "ORIGIN";
          } else if (outcome.state === "COMPROMISED") {
            fill = "#fef2f2";
            border = "#dc2626";
            titleColor = "#991b1b";
            stateBadge = outcome.loadMultiplier > 1 ? outcome.loadMultiplier + "x FAIL" : "COMPROMISED";
          } else if (outcome.state === "DEGRADED") {
            fill = "#fffbeb";
            border = "#d97706";
            titleColor = "#92400e";
            stateBadge = "DEGRADED";
          } else if (outcome.state === "CONTAINED") {
            fill = "#ecfdf5";
            border = "#059669";
            titleColor = "#065f46";
            stateBadge = "SHIELDED";
          }
        } else if (n.blocksTaint) {
          border = "#10b981";
        }

        const clickAttr = clickableToSim
          ? 'style="cursor:pointer;" data-jump-node="' + esc(n.id) + '"'
          : "";

        svg += '<g ' + clickAttr + '>';
        svg += '<rect x="' + rx + '" y="' + ry + '" width="' + w + '" height="' + h + '" rx="9" fill="' + fill + '" stroke="' + border + '" stroke-width="2"/>';
        svg += '<text x="' + pos.x + '" y="' + (ry + 23) + '" text-anchor="middle" font-size="12.5" font-weight="700" fill="' + titleColor + '">' + esc(n.label) + '</text>';
        svg += '<text x="' + pos.x + '" y="' + (ry + 42) + '" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#64748b">' + esc(stateBadge ? stateBadge + " · " + n.kind : subText) + '</text>';
        svg += '</g>';
      });

      svg += '</svg>';
      return svg;
    }

    function jumpToNodeSim(nodeId) {
      const sel = document.getElementById("sim-origin");
      if (sel) sel.value = nodeId;
      switchTab("simulator");
      executeSimulation();
    }

    async function refreshDashboard() {
      const stats = await api("/v1/stats");
      currentTopology = stats.topology;
      currentRisks = stats.findings || [];
      populateNodeSelectors(currentTopology.nodes);

      document.getElementById("overview-mesh-title").textContent = currentTopology.name + " (" + currentTopology.version + ")";
      document.getElementById("kpi-mesh-size").textContent = currentTopology.nodes.length + " Nodes";
      document.getElementById("kpi-mesh-edges").textContent = currentTopology.edges.length + " directed dependency edges";
      document.getElementById("kpi-risk-count").textContent = String(stats.riskCount);
      document.getElementById("kpi-risk-count").style.color = stats.riskCount > 0 ? "#dc2626" : "#059669";
      document.getElementById("kpi-risk-sub").textContent = stats.criticalHighRiskCount + " critical/high severity findings";

      document.getElementById("kpi-peak-blast").textContent = stats.peakBlastRadiusScore + "%";
      document.getElementById("kpi-peak-blast").style.color =
        stats.peakBlastRadiusScore >= 50 ? "#dc2626" : stats.peakBlastRadiusScore > 0 ? "#d97706" : "#059669";
      document.getElementById("kpi-peak-sub").textContent = stats.simulationCount + " simulations recorded in ledger";

      const navBadge = document.getElementById("nav-risk-badge");
      navBadge.textContent = String(stats.riskCount);
      navBadge.className = "nav-badge" + (stats.riskCount === 0 ? " clean" : "");

      const auditOk = stats.auditVerification && stats.auditVerification.valid;
      document.getElementById("kpi-audit-status").textContent = auditOk ? "VERIFIED" : "BROKEN";
      document.getElementById("kpi-audit-status").style.color = auditOk ? "#059669" : "#dc2626";
      document.getElementById("kpi-audit-sub").textContent = stats.totalAuditEntries + " SHA-256 hash-linked entries";

      // Quarantine pill
      const qCount = (stats.quarantinedNodeIds || []).length;
      const qPill = document.getElementById("quarantine-pill");
      const qText = document.getElementById("quarantine-pill-text");
      if (qCount > 0) {
        qPill.classList.add("quarantined");
        qText.textContent = "Quarantine Active · " + qCount + " Isolated";
      } else {
        qPill.classList.remove("quarantined");
        qText.textContent = "Mesh Healthy · 0 Quarantined";
      }

      // Render SVG
      document.getElementById("overview-svg-container").innerHTML = renderTopologySvg(currentTopology, null, true);

      // Render risk breakdown bars
      const byCode = stats.risksByCode || [];
      const barsEl = document.getElementById("overview-risk-bars");
      if (byCode.length === 0) {
        barsEl.innerHTML = '<div style="padding:14px;background:var(--allow-bg);border:1px solid var(--allow-border);border-radius:8px;color:var(--allow-text);font-weight:600;">Zero structural vulnerabilities detected in active mesh.</div>';
      } else {
        const maxCount = Math.max(1, ...byCode.map((r) => r.count));
        barsEl.innerHTML = byCode
          .map((item) => {
            const pct = Math.round((item.count / maxCount) * 100);
            return (
              '<div class="bar-row">' +
              '<div class="bar-label-line"><span class="mono" style="font-size:11.5px;">' + esc(item.code) + '</span><span>' + item.count + '</span></div>' +
              '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
              '</div>'
            );
          })
          .join("");
      }

      // Render runtime health list
      const healthList = stats.runtimeHealth || [];
      const healthEl = document.getElementById("incident-health-list");
      if (healthList.length === 0) {
        healthEl.innerHTML = '<div style="padding:10px;background:#f8fafc;border:1px solid var(--border);border-radius:6px;color:var(--muted);">No runtime violation signals recorded. Select a node above and click <strong>Inject Signal</strong> to test automatic node quarantine (threshold: ' + stats.quarantineThreshold + ' signals).</div>';
      } else {
        healthEl.innerHTML = healthList
          .map((h) => {
            const badge = h.quarantined
              ? '<span class="badge badge-red">QUARANTINED</span>'
              : '<span class="badge badge-amber">' + h.consecutiveSignals + ' / ' + stats.quarantineThreshold + ' SIGNALS</span>';
            return (
              '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);">' +
              '<div><strong class="mono">' + esc(h.nodeId) + '</strong> <span style="color:var(--muted);font-size:11.5px;">(' + esc(h.lastSignalCode || "signal") + ')</span></div>' +
              badge +
              '</div>'
            );
          })
          .join("");
      }

      if (stats.lastSimulation && !currentSimulation) {
        currentSimulation = stats.lastSimulation;
        renderSimulationView(currentSimulation);
      }
    }

    async function runPresetSimulation(originNodeId, faultMode) {
      document.getElementById("sim-origin").value = originNodeId;
      document.getElementById("sim-fault-mode").value = faultMode;
      await executeSimulation();
    }

    async function executeSimulation() {
      const originNodeId = document.getElementById("sim-origin").value;
      const faultMode = document.getElementById("sim-fault-mode").value;
      if (!originNodeId) return;
      const sim = await api("/v1/simulate", {
        method: "POST",
        body: JSON.stringify({ originNodeId, faultMode, initialSpikeMultiplier: 2 })
      });
      currentSimulation = sim;
      renderSimulationView(sim);
    }

    function renderSimulationView(sim) {
      if (!sim || !currentTopology) return;
      const banner = document.getElementById("sim-result-banner");
      const cls =
        sim.blastRadiusScore >= 45
          ? "high-risk"
          : sim.blastRadiusScore > 0
            ? "moderate-risk"
            : "contained";
      banner.className = "sim-banner " + cls;

      const verdictLabel =
        sim.blastRadiusScore >= 45
          ? "UNCONTAINED CASCADE"
          : sim.blastRadiusScore > 0
            ? "PARTIAL DEGRADATION"
            : "FULLY CONTAINED";

      banner.innerHTML =
        '<div class="sim-metrics">' +
        '<div><div class="sim-stat-label">Verdict</div><div class="sim-stat-val">' + verdictLabel + '</div></div>' +
        '<div><div class="sim-stat-label">Blast Radius</div><div class="sim-stat-val">' + sim.blastRadiusScore + '%</div></div>' +
        '<div><div class="sim-stat-label">Compromised</div><div class="sim-stat-val">' + sim.compromisedCount + ' nodes</div></div>' +
        '<div><div class="sim-stat-label">Degraded</div><div class="sim-stat-val">' + sim.degradedCount + ' nodes</div></div>' +
        '<div><div class="sim-stat-label">Shielded</div><div class="sim-stat-val">' + sim.containedCount + ' nodes</div></div>' +
        '<div><div class="sim-stat-label">Peak Amplification</div><div class="sim-stat-val">' + sim.maxLoadAmplification + 'x</div></div>' +
        '</div>' +
        '<div class="mono" style="font-size:11.5px;">Evaluated in ' + sim.evaluatedInMs + ' ms · Hash ' + esc((sim.auditEntryHash || "").slice(0, 12)) + '…</div>';

      document.getElementById("sim-svg-container").innerHTML = renderTopologySvg(currentTopology, sim, false);

      const tbody = document.getElementById("sim-trace-tbody");
      const hops = sim.propagationTrace || [];
      if (hops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted);">No propagation hops triggered from selected origin node.</td></tr>';
      } else {
        tbody.innerHTML = hops
          .map((h) => {
            const b =
              h.outcome === "PROPAGATED"
                ? '<span class="badge badge-red">PROPAGATED</span>'
                : h.outcome === "DEGRADED"
                  ? '<span class="badge badge-amber">DEGRADED</span>'
                  : '<span class="badge badge-green">BLOCKED (' + esc(h.controlTriggered || "gate") + ')</span>';
            return (
              '<tr>' +
              '<td class="mono">' + h.step + '</td>' +
              '<td class="mono"><strong>' + esc(h.fromNodeId) + '</strong> &rarr; <strong>' + esc(h.toNodeId) + '</strong></td>' +
              '<td class="mono">' + esc(h.edgeId) + '</td>' +
              '<td>' + b + '</td>' +
              '<td>' + esc(h.reason) + '</td>' +
              '</tr>'
            );
          })
          .join("");
      }
    }

    function openPlannerFromSim() {
      document.getElementById("plan-origin").value = document.getElementById("sim-origin").value;
      document.getElementById("plan-fault-mode").value = document.getElementById("sim-fault-mode").value;
      switchTab("planner");
      computeContainmentPlan();
    }

    function renderRisksList() {
      const container = document.getElementById("risk-findings-container");
      if (!currentRisks || currentRisks.length === 0) {
        container.innerHTML = '<div style="padding:18px;background:var(--allow-bg);border:1px solid var(--allow-border);border-radius:8px;color:var(--allow-text);font-weight:600;">Zero structural cascading-failure vulnerabilities detected in active topology.</div>';
        return;
      }
      container.innerHTML = currentRisks
        .map((r) => {
          const sevBadge =
            r.severity === "critical"
              ? '<span class="badge badge-red">CRITICAL</span>'
              : r.severity === "high"
                ? '<span class="badge badge-amber">HIGH</span>'
                : '<span class="badge badge-blue">' + esc(r.severity.toUpperCase()) + '</span>';
          return (
            '<div class="risk-item">' +
            '<div class="risk-item-top">' +
            '<div class="risk-title">' + esc(r.title) + '</div>' +
            '<div style="display:flex;gap:6px;align-items:center;">' + sevBadge + '<span class="badge badge-slate mono">' + esc(r.code) + '</span></div>' +
            '</div>' +
            '<div class="risk-desc">' + esc(r.description) + '</div>' +
            '<div class="risk-remediation"><strong>Recommended Bulkhead:</strong> ' + esc(r.remediation) + '</div>' +
            '</div>'
          );
        })
        .join("");
    }

    async function triggerAuditedRiskScan() {
      const res = await api("/v1/risks/scan", { method: "POST" });
      currentRisks = res.findings || [];
      renderRisksList();
      await refreshDashboard();
    }

    async function computeContainmentPlan() {
      const originNodeId = document.getElementById("plan-origin").value;
      const faultMode = document.getElementById("plan-fault-mode").value;
      if (!originNodeId) return;
      const appliedBanner = document.getElementById("planner-applied-banner");
      if (appliedBanner) appliedBanner.style.display = "none";
      const applyBtn = document.getElementById("apply-all-bulkheads-btn");
      if (applyBtn) applyBtn.textContent = "Apply Recommended Bulkheads";
      const plan = await api("/v1/containment/plan", {
        method: "POST",
        body: JSON.stringify({ originNodeId, faultMode, initialSpikeMultiplier: 2 })
      });
      currentPlan = plan;
      renderContainmentPlan(plan);
    }

    function renderLiveChaosCard(containerId, res) {
      const el = document.getElementById(containerId);
      if (!el || !res) return;
      el.style.display = "block";
      const matchBadge = res.matchesSimulation
        ? '<span class="badge badge-green">MATCHES MODEL (' + res.measuredBlastRadiusScore + '% = ' + res.simulatedBlastRadiusScore + '%)</span>'
        : '<span class="badge badge-amber">MEASURED ' + res.measuredBlastRadiusScore + '% vs MODEL ' + res.simulatedBlastRadiusScore + '%</span>';

      const rows = (res.nodeProbes || [])
        .map((p) => {
          const stBadge =
            p.observedState === "ORIGIN"
              ? '<span class="badge badge-violet">ORIGIN</span>'
              : p.observedState === "COMPROMISED"
                ? '<span class="badge badge-red">COMPROMISED</span>'
                : p.observedState === "DEGRADED"
                  ? '<span class="badge badge-amber">DEGRADED</span>'
                  : p.observedState === "CONTAINED"
                    ? '<span class="badge badge-green">SHIELDED</span>'
                    : '<span class="badge badge-slate">HEALTHY</span>';
          const httpBadge =
            p.httpStatus >= 500
              ? '<span class="badge badge-red mono">HTTP ' + p.httpStatus + '</span>'
              : p.httpStatus >= 400
                ? '<span class="badge badge-green mono">HTTP ' + p.httpStatus + ' (GATED)</span>'
                : '<span class="badge badge-blue mono">HTTP ' + p.httpStatus + '</span>';
          return (
            '<tr>' +
            '<td><strong>' + esc(p.label) + '</strong> <span class="mono" style="color:var(--muted);font-size:11px;">(' + esc(p.nodeId) + ')</span></td>' +
            '<td class="mono">127.0.0.1:' + p.port + '</td>' +
            '<td>' + httpBadge + '</td>' +
            '<td class="mono">' + p.requestsHandled + '</td>' +
            '<td>' + stBadge + '</td>' +
            '<td>' + esc(p.detail) + '</td>' +
            '</tr>'
          );
        })
        .join("");

      el.innerHTML =
        '<div class="card-header">' +
        '<div>' +
        '<div class="card-title">Live TCP/HTTP Cluster Chaos Test (' + res.serversSpawned + ' Real Ephemeral Node Servers)</div>' +
        '<div class="card-subtitle">Spawned ' + res.serversSpawned + ' live node:http servers on localhost, injected real HTTP fault traffic, and measured actual TCP responses in ' + res.durationMs + ' ms</div>' +
        '</div>' +
        matchBadge +
        '</div>' +
        '<div class="table-wrap"><table><thead><tr>' +
        '<th>Node</th><th>Live Endpoint</th><th>HTTP Status</th><th>TCP Reqs</th><th>Observed State</th><th>Live Telemetry Detail</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    async function runLiveChaosFromSim() {
      const originNodeId = document.getElementById("sim-origin").value;
      const faultMode = document.getElementById("sim-fault-mode").value;
      if (!originNodeId) return;
      const res = await api("/v1/chaos/live", {
        method: "POST",
        body: JSON.stringify({ originNodeId, faultMode, initialSpikeMultiplier: 2 })
      });
      renderLiveChaosCard("sim-live-chaos-card", res);
      await refreshDashboard();
    }

    async function runLiveChaosFromPlanner() {
      const originNodeId = document.getElementById("plan-origin").value;
      const faultMode = document.getElementById("plan-fault-mode").value;
      if (!originNodeId) return;
      const res = await api("/v1/chaos/live", {
        method: "POST",
        body: JSON.stringify({ originNodeId, faultMode, initialSpikeMultiplier: 2 })
      });
      renderLiveChaosCard("planner-live-chaos-card", res);
      await refreshDashboard();
    }

    function renderContainmentPlan(plan) {
      const cmp = document.getElementById("planner-comparison-area");
      const before = plan.baseline;
      const after = plan.combinedHardenedSimulation;

      cmp.innerHTML =
        '<div class="compare-box before">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;"><span class="badge badge-red">CURRENT TOPOLOGY (BEFORE)</span><span class="mono" style="font-size:11.5px;color:var(--block-text);">Origin: ' + esc(plan.originNodeId) + '</span></div>' +
        '<div class="compare-score" style="color:#991b1b;">' + before.blastRadiusScore + '% Blast Radius</div>' +
        '<div style="font-size:12.5px;color:#7f1d1d;"><strong>' + before.compromisedCount + '</strong> compromised · <strong>' + before.degradedCount + '</strong> degraded · <strong>' + before.containedCount + '</strong> shielded · Peak load <strong>' + before.maxLoadAmplification + 'x</strong></div>' +
        '</div>' +
        '<div class="compare-box after">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;"><span class="badge badge-green">HARDENED TOPOLOGY (AFTER BULKHEADS)</span><span class="mono" style="font-size:11.5px;color:var(--allow-text);">' + plan.recommendations.length + ' candidate control(s)</span></div>' +
        '<div class="compare-score" style="color:#065f46;">' + after.blastRadiusScore + '% Blast Radius</div>' +
        '<div style="font-size:12.5px;color:#065f46;"><strong>' + after.compromisedCount + '</strong> compromised · <strong>' + after.degradedCount + '</strong> degraded · <strong>' + after.containedCount + '</strong> shielded · Peak load <strong>' + after.maxLoadAmplification + 'x</strong></div>' +
        '</div>';

      const tbody = document.getElementById("planner-recs-tbody");
      if (!plan.recommendations || plan.recommendations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:var(--allow-text);font-weight:600;">Fault path is already contained — no additional bulkheads required for this scenario.</td></tr>';
        return;
      }

      tbody.innerHTML = plan.recommendations
        .map((rec, i) => {
          const targetId = rec.action.targetType === "edge" ? rec.action.edgeId : rec.action.nodeId;
          return (
            '<tr>' +
            '<td><span class="badge badge-blue">#' + rec.rank + '</span></td>' +
            '<td class="mono">' + esc(rec.action.targetType + ": " + targetId) + '</td>' +
            '<td><strong>' + esc(rec.action.summary) + '</strong></td>' +
            '<td><span class="badge badge-green">-' + rec.scoreReduction + ' pts (' + rec.baselineBlastRadiusScore + '% &rarr; ' + rec.projectedBlastRadiusScore + '%)</span></td>' +
            '<td class="mono">' + rec.compromisedBefore + ' &rarr; ' + rec.compromisedAfter + '</td>' +
            '<td><button class="btn" onclick="applySinglePatch(' + i + ')">Apply</button></td>' +
            '</tr>'
          );
        })
        .join("");
    }

    async function applySinglePatch(idx) {
      if (!currentPlan || !currentPlan.recommendations[idx]) return;
      const rec = currentPlan.recommendations[idx];
      await api("/v1/containment/apply", {
        method: "POST",
        body: JSON.stringify({
          patches: [rec.action],
          summary: rec.action.summary
        })
      });
      await refreshDashboard();
      await computeContainmentPlan();
      await executeSimulation();
    }

    async function applyAllRecommendedBulkheads() {
      if (!currentPlan || !currentPlan.recommendations || currentPlan.recommendations.length === 0) return;
      const beforeScore = currentPlan.baseline.blastRadiusScore;
      const afterScore = currentPlan.combinedHardenedSimulation.blastRadiusScore;
      const patches = currentPlan.recommendations.map((r) => r.action);
      await api("/v1/containment/apply", {
        method: "POST",
        body: JSON.stringify({
          patches,
          summary: "Applied " + patches.length + " recommended bulkheads for " + currentPlan.faultMode + " at '" + currentPlan.originNodeId + "'."
        })
      });
      const appliedBanner = document.getElementById("planner-applied-banner");
      if (appliedBanner) {
        appliedBanner.style.display = "flex";
        appliedBanner.innerHTML =
          '<div><strong>BULKHEADS APPLIED TO ACTIVE TOPOLOGY</strong> · Active mesh hardened (' + beforeScore + '% &rarr; ' + afterScore + '% blast radius). Click <strong>Reset Mesh</strong> in the top bar anytime to restore the unhardened baseline.</div>';
      }
      const applyBtn = document.getElementById("apply-all-bulkheads-btn");
      if (applyBtn) applyBtn.textContent = "Bulkheads Active ✓";
      await refreshDashboard();
      await executeSimulation();
      await runLiveChaosFromPlanner();
    }

    async function sendRuntimeIncident() {
      const nodeId = document.getElementById("incident-node-select").value;
      if (!nodeId) return;
      await api("/v1/incidents", {
        method: "POST",
        body: JSON.stringify({
          nodeId,
          sourceGate: "agent-firewall",
          signalCode: "CONSECUTIVE_POLICY_VIOLATION",
          severity: "high"
        })
      });
      await refreshDashboard();
    }

    async function clearAllQuarantines() {
      await api("/v1/incidents/reset", { method: "POST", body: JSON.stringify({}) });
      await refreshDashboard();
    }

    async function loadAuditLedger() {
      const data = await api("/v1/audit");
      renderAuditBanner(data.verification, false);
      const tbody = document.getElementById("audit-tbody");
      const entries = (data.entries || []).slice().reverse();
      if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted);">No audit entries recorded yet.</td></tr>';
        return;
      }
      tbody.innerHTML = entries
        .map((e) => {
          const badgeClass =
            e.eventType === "CONTAINMENT_APPLIED" || e.eventType === "LIVE_CHAOS_TEST"
              ? "badge-green"
              : e.eventType === "QUARANTINE_TRIPPED"
                ? "badge-red"
                : e.eventType === "SIMULATION" && e.blastRadiusScore >= 45
                  ? "badge-amber"
                  : "badge-blue";
          return (
            '<tr>' +
            '<td class="mono">' + e.index + '</td>' +
            '<td class="mono" style="white-space:nowrap;">' + esc(e.timestamp.replace("T", " ").slice(0, 19)) + 'Z</td>' +
            '<td><span class="badge ' + badgeClass + '">' + esc(e.eventType) + '</span></td>' +
            '<td>' + esc(e.summary) + '</td>' +
            '<td class="mono">' + e.blastRadiusScore + '%</td>' +
            '<td class="mono" style="font-size:11px;">' + esc(e.prevHash.slice(0, 10)) + '… &rarr; <strong>' + esc(e.entryHash.slice(0, 12)) + '…</strong></td>' +
            '</tr>'
          );
        })
        .join("");
    }

    function renderAuditBanner(report, isTamperSimulation) {
      if (isTamperSimulation) {
        const alertEl = document.getElementById("audit-tamper-alert");
        alertEl.style.display = "flex";
        alertEl.innerHTML =
          '<div><span class="badge badge-red" style="margin-right:8px;">TAMPER DETECTED</span><strong>Simulated Attack Caught by SHA-256 Verifier</strong><div style="font-size:12.5px;margin-top:4px;">Cloned ledger in memory and altered blast-radius score on entry #' + report.brokenAtIndex + ' (' + esc(report.brokenEntryId || "") + '). ' + esc(report.reason || "") + '</div></div>';
        return;
      }
      const alertEl = document.getElementById("audit-tamper-alert");
      if (alertEl) alertEl.style.display = "none";

      const banner = document.getElementById("audit-verify-banner");
      if (report.valid) {
        banner.className = "sim-banner contained";
        banner.innerHTML =
          '<div><strong>SHA-256 Hash Chain Verified (' + report.checked + ' linked records)</strong><div class="mono" style="font-size:11.5px;margin-top:2px;">GENESIS &rarr; Head: ' + esc(report.headHash || "GENESIS") + '</div></div>';
      } else {
        banner.className = "sim-banner high-risk";
        banner.innerHTML =
          '<div><strong>AUDIT CHAIN INTEGRITY FAILURE</strong> · ' + esc(report.reason || "Hash mismatch") + '</div>' +
          '<div class="mono" style="font-size:12px;">Broken at index #' + report.brokenAtIndex + ' (' + esc(report.brokenEntryId || "") + ')</div>';
      }
    }

    async function verifyLedgerNow() {
      const report = await api("/v1/audit/verify");
      renderAuditBanner(report, false);
    }

    async function simulateTamperAttack() {
      const report = await api("/v1/audit/tamper-test", { method: "POST" });
      if (report.simulated) {
        renderAuditBanner(report, true);
      }
    }

    async function seedDemoScenarios() {
      await api("/v1/demo/seed", { method: "POST" });
      currentPlan = null;
      currentSimulation = null;
      await refreshDashboard();
      await executeSimulation();
      if (document.getElementById("tab-audit").classList.contains("active")) {
        await loadAuditLedger();
      }
      if (document.getElementById("tab-planner").classList.contains("active")) {
        await computeContainmentPlan();
      }
    }

    async function resetTopologyMesh() {
      await api("/v1/topology/reset", { method: "POST" });
      currentPlan = null;
      const simLive = document.getElementById("sim-live-chaos-card");
      if (simLive) simLive.style.display = "none";
      const planLive = document.getElementById("planner-live-chaos-card");
      if (planLive) planLive.style.display = "none";
      const appliedBanner = document.getElementById("planner-applied-banner");
      if (appliedBanner) appliedBanner.style.display = "none";
      await refreshDashboard();
      await executeSimulation();
      renderRisksList();
      if (document.getElementById("tab-planner").classList.contains("active")) {
        await computeContainmentPlan();
      }
    }

    window.addEventListener("DOMContentLoaded", async () => {
      const ovContainer = document.getElementById("overview-svg-container");
      if (ovContainer) {
        ovContainer.addEventListener("click", (ev) => {
          const g = ev.target && ev.target.closest ? ev.target.closest("[data-jump-node]") : null;
          if (g && g.dataset.jumpNode) {
            jumpToNodeSim(g.dataset.jumpNode);
          }
        });
      }
      await refreshDashboard();
      if (!currentSimulation) {
        await executeSimulation();
      }
      renderRisksList();
    });
  </script>
</body>
</html>`;
}
