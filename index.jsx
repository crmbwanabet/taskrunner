import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════
// LAYERFORGE — Constitution-Driven Multi-Agent Build Orchestrator
// ═══════════════════════════════════════════════════════════════════

const C = {
  bg: "#060610", surface: "#0c0c1a", surface2: "#10101e",
  border: "#181830", borderLight: "#222245",
  accent: "#5eead4", accent2: "#818cf8", accent3: "#f472b6",
  red: "#f43f5e", green: "#22c55e", amber: "#f59e0b", blue: "#3b82f6",
  text: "#e2e8f0", dim: "#64748b", muted: "#2e3348",
  mono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
  sans: "'IBM Plex Sans', 'DM Sans', system-ui, sans-serif",
};

const PHASE = { UPLOAD: 0, PARSED: 1, AGENTS: 2, FOUNDATION: 3, EXECUTE: 4, OUTPUT: 5 };

// ─── CONSTITUTION PARSER ────────────────────────────────────────
function parseConstitution(text) {
  const result = {
    raw: text,
    projectName: "",
    description: "",
    platforms: [],
    techStack: {},
    auth: {},
    features: {},
    dataModels: [],
    apiStyle: "",
    uiDesign: {},
    infrastructure: {},
    sections: {},
  };

  // Extract project name from first heading or "Project Name:" field
  const nameMatch = text.match(/^#\s+(.+)/m) || text.match(/Project\s*Name\s*[:=]\s*(.+)/im);
  if (nameMatch) result.projectName = nameMatch[1].trim();

  // Extract description
  const descMatch = text.match(/Description\s*[:=]\s*(.+)/im) || text.match(/^##.*overview[\s\S]*?\n(.+)/im);
  if (descMatch) result.description = descMatch[1].trim();

  // Extract platforms
  const platformPatterns = [
    /platforms?\s*[:=]\s*([\s\S]*?)(?=\n\s*\n|\n#|\n\w+\s*[:=])/im,
    /(?:client|customer|admin|vendor|business|mobile|landing|marketing|api)[\s-]*(?:facing\s*)?(?:platform|dashboard|portal|app|site|panel)/gim,
  ];
  const platformMatch = text.match(platformPatterns[0]);
  if (platformMatch) {
    const lines = platformMatch[1].split(/\n/).map(l => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
    result.platforms = lines;
  }
  if (result.platforms.length === 0) {
    const found = new Set();
    let m;
    while ((m = platformPatterns[1].exec(text)) !== null) {
      found.add(m[0].trim());
    }
    result.platforms = [...found];
  }

  // Extract tech stack
  const techSection = text.match(/(?:tech(?:nology)?\s*stack|stack|technologies)\s*[:=]?\s*([\s\S]*?)(?=\n#{1,3}\s|\n\w+\s*[:=].*\n|$)/im);
  if (techSection) {
    const t = techSection[1];
    const frontendMatch = t.match(/frontend\s*[:=\-]\s*(.+)/im);
    const backendMatch = t.match(/backend\s*[:=\-]\s*(.+)/im);
    const dbMatch = t.match(/database\s*[:=\-]\s*(.+)/im);
    const langMatch = t.match(/language\s*[:=\-]\s*(.+)/im);
    const stylingMatch = t.match(/styl(?:ing|e)\s*[:=\-]\s*(.+)/im);
    const ormMatch = t.match(/orm\s*[:=\-]\s*(.+)/im);
    if (frontendMatch) result.techStack.frontend = frontendMatch[1].trim();
    if (backendMatch) result.techStack.backend = backendMatch[1].trim();
    if (dbMatch) result.techStack.database = dbMatch[1].trim();
    if (langMatch) result.techStack.language = langMatch[1].trim();
    if (stylingMatch) result.techStack.styling = stylingMatch[1].trim();
    if (ormMatch) result.techStack.orm = ormMatch[1].trim();
  }

  // Extract auth
  const authSection = text.match(/auth(?:entication)?\s*[:=]?\s*([\s\S]*?)(?=\n#{1,3}\s|\n\w+\s*[:=].*\n|$)/im);
  if (authSection) {
    const a = authSection[1];
    const methodMatch = a.match(/method\s*[:=\-]\s*(.+)/im);
    const providerMatch = a.match(/provider\s*[:=\-]\s*(.+)/im);
    const rolesMatch = a.match(/roles?\s*[:=\-]\s*(.+)/im);
    if (methodMatch) result.auth.methods = methodMatch[1].trim();
    if (providerMatch) result.auth.provider = providerMatch[1].trim();
    if (rolesMatch) result.auth.roles = rolesMatch[1].split(/[,;]/).map(r => r.trim()).filter(Boolean);
  }

  // Extract features per platform
  const featuresSection = text.match(/(?:features?|functionality)\s*[:=]?\s*([\s\S]*?)(?=\n#{1,2}\s|$)/im);
  if (featuresSection) {
    const lines = featuresSection[1].split("\n");
    let currentPlatform = "General";
    lines.forEach(line => {
      const platformHeader = line.match(/^[-*•]?\s*([\w\s/]+?)(?:platform|dashboard|portal|app|panel)?\s*[:=]/i);
      if (platformHeader) {
        currentPlatform = platformHeader[1].trim();
        result.features[currentPlatform] = [];
      } else if (line.match(/^[-*•]\s+/) && currentPlatform) {
        const feature = line.replace(/^[-*•]\s+/, "").trim();
        if (feature) {
          if (!result.features[currentPlatform]) result.features[currentPlatform] = [];
          result.features[currentPlatform].push(feature);
        }
      }
    });
  }

  // Extract data models
  const modelsMatch = text.match(/(?:data\s*)?models?\s*[:=]\s*(.+)/im) ||
    text.match(/entities\s*[:=]\s*(.+)/im);
  if (modelsMatch) {
    result.dataModels = modelsMatch[1].split(/[,;]/).map(m => m.trim()).filter(Boolean);
  }

  // Extract API style
  const apiMatch = text.match(/api\s*(?:style|architecture|type)\s*[:=]\s*(.+)/im);
  if (apiMatch) result.apiStyle = apiMatch[1].trim();

  // Store all sections by heading
  const sections = text.split(/\n(?=#{1,3}\s)/);
  sections.forEach(s => {
    const heading = s.match(/^#{1,3}\s+(.+)/);
    if (heading) {
      result.sections[heading[1].trim().toLowerCase()] = s;
    }
  });

  return result;
}

// ─── AGENT GENERATOR ────────────────────────────────────────────
function generateAgents(parsed) {
  const agents = [];
  const platformColors = ["#5eead4", "#818cf8", "#f472b6", "#fbbf24", "#34d399", "#fb923c", "#f43f5e", "#a78bfa"];

  // Phase 1: Foundation agents (run first, shared across all platforms)
  agents.push({
    id: "shared-types",
    name: "Shared Types & Interfaces",
    phase: "foundation",
    platform: "Shared",
    color: C.accent2,
    icon: "◆",
    description: "Generate TypeScript types, interfaces, and enums shared across all platforms",
    prompt: "shared type definitions, interfaces, and enums",
    status: "idle",
    totalSteps: 3,
    completedSteps: 0,
    currentTask: null,
    output: null,
    tasks: ["Entity type definitions", "API request/response types", "Shared enums & constants"],
  });

  agents.push({
    id: "api-contracts",
    name: "API Contracts & Routes",
    phase: "foundation",
    platform: "Shared",
    color: C.blue,
    icon: "◈",
    description: "Define all API endpoints, route signatures, and validation schemas",
    prompt: "API route definitions, endpoint contracts, and validation",
    status: "idle",
    totalSteps: 3,
    completedSteps: 0,
    currentTask: null,
    output: null,
    tasks: ["Route definitions", "Validation schemas", "API client utilities"],
  });

  agents.push({
    id: "database-schema",
    name: "Database Schema & Models",
    phase: "foundation",
    platform: "Shared",
    color: C.accent3,
    icon: "⬢",
    description: "Database schema, model definitions, migrations, and relationships",
    prompt: "database schema, ORM models, migrations, and seed data",
    status: "idle",
    totalSteps: 4,
    completedSteps: 0,
    currentTask: null,
    output: null,
    tasks: ["Schema design", "Model definitions", "Migration files", "Seed data"],
  });

  agents.push({
    id: "auth-system",
    name: "Authentication System",
    phase: "foundation",
    platform: "Shared",
    color: C.amber,
    icon: "◉",
    description: "Auth provider setup, middleware, role-based access, session management",
    prompt: "authentication system, middleware, role guards, and session management",
    status: "idle",
    totalSteps: 3,
    completedSteps: 0,
    currentTask: null,
    output: null,
    tasks: ["Auth provider config", "Auth middleware & guards", "Role-based access control"],
  });

  agents.push({
    id: "backend-core",
    name: "Backend Server Core",
    phase: "foundation",
    platform: "Shared",
    color: C.green,
    icon: "⬡",
    description: "Server setup, middleware stack, error handling, environment config",
    prompt: "backend server setup, middleware, error handling, and config",
    status: "idle",
    totalSteps: 4,
    completedSteps: 0,
    currentTask: null,
    output: null,
    tasks: ["Server bootstrap", "Middleware stack", "Error handling", "Environment config"],
  });

  // Phase 2: Platform-specific agents
  parsed.platforms.forEach((platform, i) => {
    const color = platformColors[i % platformColors.length];
    const shortName = platform.replace(/\s*(platform|dashboard|portal|app|panel|site)\s*/gi, "").trim() || platform;
    const slug = shortName.toLowerCase().replace(/[^a-z0-9]/g, "-");

    agents.push({
      id: `${slug}-layout`,
      name: `${shortName} — Layout & Routing`,
      phase: "platform",
      platform: shortName,
      color,
      icon: "◧",
      description: `App shell, navigation, sidebar/header, page routing for ${platform}`,
      prompt: `layout, navigation, routing, and app shell for the ${platform}`,
      status: "idle",
      totalSteps: 3,
      completedSteps: 0,
      currentTask: null,
      output: null,
      tasks: ["App shell & layout", "Navigation components", "Route configuration"],
    });

    agents.push({
      id: `${slug}-pages`,
      name: `${shortName} — Pages & Features`,
      phase: "platform",
      platform: shortName,
      color,
      icon: "◳",
      description: `All page components and feature modules for ${platform}`,
      prompt: `page components and feature modules for the ${platform}`,
      status: "idle",
      totalSteps: 4,
      completedSteps: 0,
      currentTask: null,
      output: null,
      tasks: ["Page components", "Feature modules", "Data fetching hooks", "State management"],
    });

    agents.push({
      id: `${slug}-ui`,
      name: `${shortName} — UI Components`,
      phase: "platform",
      platform: shortName,
      color,
      icon: "◐",
      description: `Reusable UI components, forms, tables, modals specific to ${platform}`,
      prompt: `reusable UI components, forms, tables, and modals for the ${platform}`,
      status: "idle",
      totalSteps: 3,
      completedSteps: 0,
      currentTask: null,
      output: null,
      tasks: ["Form components", "Data display components", "Modal & dialog components"],
    });
  });

  return agents;
}

// ─── COMPONENTS ─────────────────────────────────────────────────

function UploadZone({ onFileLoaded }) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState(null);
  const inputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => onFileLoaded(e.target.result, file.name);
    reader.readAsText(file);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
      style={{
        border: `2px dashed ${dragOver ? C.accent : C.border}`,
        borderRadius: 16,
        padding: "64px 40px",
        textAlign: "center",
        cursor: "pointer",
        background: dragOver ? `${C.accent}06` : C.surface,
        transition: "all 0.3s ease",
      }}
    >
      <input ref={inputRef} type="file" accept=".md,.txt,.json" style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files[0])} />
      <div style={{ fontSize: 48, marginBottom: 20, opacity: 0.3 }}>◈</div>
      <div style={{ fontFamily: C.mono, fontSize: 14, color: C.text, marginBottom: 8 }}>
        {fileName ? `✓ ${fileName}` : "Drop your constitution file here"}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
        Accepts .md, .txt, or .json — the file you built on Claude.ai
      </div>
    </div>
  );
}

function ParsedView({ parsed }) {
  const items = [
    { label: "Project", value: parsed.projectName, color: C.accent },
    { label: "Platforms", value: parsed.platforms.join(", ") || "None detected", color: C.accent2 },
    { label: "Frontend", value: parsed.techStack.frontend, color: C.green },
    { label: "Backend", value: parsed.techStack.backend, color: C.amber },
    { label: "Database", value: parsed.techStack.database, color: C.accent3 },
    { label: "Language", value: parsed.techStack.language, color: C.blue },
    { label: "Styling", value: parsed.techStack.styling, color: "#fb923c" },
    { label: "ORM", value: parsed.techStack.orm, color: C.dim },
    { label: "Auth", value: parsed.auth.provider || parsed.auth.methods, color: C.amber },
    { label: "Roles", value: parsed.auth.roles?.join(", "), color: C.accent3 },
    { label: "API", value: parsed.apiStyle, color: C.blue },
    { label: "Models", value: parsed.dataModels.join(", "), color: C.accent },
  ].filter(i => i.value);

  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20 }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
        Parsed Constitution
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        {items.map(item => (
          <div key={item.label} style={{ padding: "8px 12px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{item.label}</div>
            <div style={{ fontFamily: C.mono, fontSize: 12, color: item.color, wordBreak: "break-word" }}>{item.value}</div>
          </div>
        ))}
      </div>
      {Object.keys(parsed.features).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, textTransform: "uppercase", marginBottom: 8 }}>Features by Platform</div>
          {Object.entries(parsed.features).map(([platform, features]) => (
            <div key={platform} style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.accent2, marginBottom: 4 }}>{platform}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {features.map((f, i) => (
                  <span key={i} style={{ padding: "3px 8px", borderRadius: 4, background: `${C.accent2}10`, color: C.dim, fontFamily: C.mono, fontSize: 10 }}>{f}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, isActive }) {
  const pct = agent.totalSteps > 0 ? Math.round((agent.completedSteps / agent.totalSteps) * 100) : 0;
  const isDone = agent.status === "done";
  const isError = agent.status === "error";
  const isRunning = agent.status === "running";

  return (
    <div style={{
      position: "relative", background: C.surface, borderRadius: 12,
      border: `1.5px solid ${isRunning ? agent.color + "50" : isDone ? C.green + "30" : isError ? C.red + "30" : C.border}`,
      padding: 14, transition: "all 0.4s ease",
      boxShadow: isRunning ? `0 0 20px ${agent.color}10` : "none",
      opacity: isDone ? 0.75 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: isDone ? C.green : isError ? C.red : isRunning ? agent.color : C.muted,
            boxShadow: isRunning ? `0 0 8px ${agent.color}` : "none",
            animation: isRunning ? "blink 1.2s ease-in-out infinite" : "none",
          }} />
          <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {agent.name}
          </span>
        </div>
        <span style={{
          fontFamily: C.mono, fontSize: 9, padding: "2px 6px", borderRadius: 4,
          background: agent.phase === "foundation" ? `${C.amber}15` : `${agent.color}15`,
          color: agent.phase === "foundation" ? C.amber : agent.color,
          flexShrink: 0, marginLeft: 6, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {agent.platform}
        </span>
      </div>

      <div style={{ fontSize: 10, color: C.dim, fontFamily: C.sans, marginBottom: 10, lineHeight: 1.5 }}>{agent.description}</div>

      <div style={{ height: 2, background: C.border, borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ height: "100%", background: isDone ? C.green : isError ? C.red : agent.color, width: `${pct}%`, borderRadius: 2, transition: "width 0.4s ease" }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, color: C.muted, fontFamily: C.mono }}>{agent.currentTask || "Queued"}</span>
        <span style={{ fontSize: 9, color: C.dim, fontFamily: C.mono }}>{pct}%</span>
      </div>
    </div>
  );
}

function FileTree({ files }) {
  const [expanded, setExpanded] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);

  const tree = {};
  files.forEach(f => {
    const parts = f.path.split("/");
    let current = tree;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        current[part] = { _file: true, content: f.content, language: f.language, agent: f.agent };
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    });
  });

  const toggle = (path) => setExpanded(p => ({ ...p, [path]: !p[path] }));

  const renderNode = (node, path = "", depth = 0) => {
    return Object.keys(node).filter(k => k !== "_file").sort((a, b) => {
      if (node[a]._file && !node[b]._file) return 1;
      if (!node[a]._file && node[b]._file) return -1;
      return a.localeCompare(b);
    }).map(key => {
      const fp = path ? `${path}/${key}` : key;
      const item = node[key];
      if (item._file) {
        const sel = selectedFile?.path === fp;
        return (
          <div key={fp} onClick={() => setSelectedFile({ ...item, path: fp })} style={{
            padding: "4px 10px", paddingLeft: 12 + depth * 14, fontSize: 11, fontFamily: C.mono,
            color: sel ? C.accent : C.dim, cursor: "pointer", background: sel ? `${C.accent}08` : "transparent",
            transition: "all 0.15s", borderLeft: sel ? `2px solid ${C.accent}` : "2px solid transparent",
          }}>
            {key}
          </div>
        );
      }
      const isOpen = expanded[fp] !== false;
      return (
        <div key={fp}>
          <div onClick={() => toggle(fp)} style={{
            padding: "4px 10px", paddingLeft: 12 + depth * 14, fontSize: 11, fontFamily: C.mono,
            color: C.text, cursor: "pointer", fontWeight: 600,
          }}>
            <span style={{ color: C.muted, marginRight: 6, fontSize: 9 }}>{isOpen ? "▼" : "▶"}</span>{key}/
          </div>
          {isOpen && renderNode(item, fp, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div style={{ display: "flex", gap: 1, height: 460, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}` }}>
      <div style={{ width: 260, background: C.surface, overflow: "auto", paddingTop: 8, paddingBottom: 8, flexShrink: 0, borderRight: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 12px", marginBottom: 4 }}>
          Project Files ({files.length})
        </div>
        {renderNode(tree)}
      </div>
      <div style={{ flex: 1, background: C.bg, overflow: "auto", position: "relative" }}>
        {selectedFile ? (
          <>
            <div style={{
              position: "sticky", top: 0, background: C.surface2, padding: "8px 16px",
              borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between",
              fontFamily: C.mono, fontSize: 10, zIndex: 1,
            }}>
              <span style={{ color: C.text }}>{selectedFile.path}</span>
              <span style={{ color: C.dim }}>Agent: {selectedFile.agent}</span>
            </div>
            <pre style={{ margin: 0, padding: 16, fontFamily: C.mono, fontSize: 11, color: "#94a3b8", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {selectedFile.content}
            </pre>
          </>
        ) : (
          <div style={{ color: C.muted, fontFamily: C.mono, fontSize: 12, padding: 40, textAlign: "center" }}>
            ← Select a file to preview
          </div>
        )}
      </div>
    </div>
  );
}

function LogPanel({ logs, logRef }) {
  return (
    <div ref={logRef} style={{
      background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`,
      padding: 14, height: 180, overflow: "auto",
    }}>
      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
        Build Output
      </div>
      {logs.length === 0 && <div style={{ color: C.muted, fontFamily: C.mono, fontSize: 11, fontStyle: "italic" }}>Waiting for build to start...</div>}
      {logs.map((l, i) => (
        <div key={i} style={{
          fontFamily: C.mono, fontSize: 10, lineHeight: 1.8,
          color: l.type === "error" ? C.red : l.type === "success" ? C.green : l.type === "info" ? C.blue : C.dim,
        }}>
          <span style={{ color: C.muted }}>{l.time}</span>{" "}
          <span style={{ color: l.color || C.dim }}>[{l.agent}]</span>{" "}
          {l.message}
        </div>
      ))}
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────────
export default function LayerForge() {
  const [phase, setPhase] = useState(PHASE.UPLOAD);
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [agents, setAgents] = useState([]);
  const [files, setFiles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [foundationContext, setFoundationContext] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const logRef = useRef(null);
  const timerRef = useRef(null);
  const runRef = useRef(false);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = useCallback((agent, message, type = "log", color = null) => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs(prev => [...prev.slice(-400), { time, agent, message, type, color }]);
  }, []);

  // ─── FILE UPLOAD ──────────────────────────────────────────────
  const handleFileLoaded = (text, name) => {
    setRawText(text);
    setFileName(name);
    const p = parseConstitution(text);
    setParsed(p);
    setPhase(PHASE.PARSED);
  };

  // ─── GENERATE AGENTS ─────────────────────────────────────────
  const handleGenerateAgents = () => {
    const a = generateAgents(parsed);
    setAgents(a);
    setPhase(PHASE.AGENTS);
  };

  // ─── EXECUTE BUILD ────────────────────────────────────────────
  const executeBuild = async () => {
    setIsExecuting(true);
    setFiles([]);
    setLogs([]);
    setElapsed(0);
    setFoundationContext("");
    runRef.current = true;
    setPhase(PHASE.FOUNDATION);

    timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);

    addLog("SYSTEM", "Build pipeline initiated", "info");
    addLog("SYSTEM", `Constitution: ${parsed.projectName || fileName}`, "info");

    const foundationAgents = agents.filter(a => a.phase === "foundation");
    const platformAgents = agents.filter(a => a.phase === "platform");

    // ── PHASE 1: Foundation (sequential, builds shared context) ──
    addLog("SYSTEM", `Phase 1: Building foundation layer (${foundationAgents.length} agents)...`, "info");

    let sharedContext = "";

    for (const agent of foundationAgents) {
      if (!runRef.current) break;

      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: "running", currentTask: agent.tasks[0] } : a));
      addLog(agent.name, "Agent activated", "info", agent.color);

      const prompt = `You are a senior software engineer agent. You are building: "${agent.name}".

PROJECT CONSTITUTION:
${parsed.raw}

PREVIOUSLY GENERATED SHARED CODE (use these types/interfaces/contracts — do NOT redefine them, import from their paths instead):
${sharedContext || "None yet — you are the first agent. Define the foundational types."}

YOUR TASK: Generate production-ready code for: ${agent.prompt}
Tasks: ${agent.tasks.join(", ")}

CRITICAL RULES:
- Use the exact technology stack from the constitution
- Language: ${parsed.techStack.language || "TypeScript"}
- Backend: ${parsed.techStack.backend || "Node.js"}
- Database: ${parsed.techStack.database || "PostgreSQL"}
- ORM: ${parsed.techStack.orm || "Prisma"}
- EVERY file must use proper imports referencing other generated files
- Use conventional project structure
- Generate 2-5 substantial files

Return ONLY a valid JSON array of objects with: "path" (string), "content" (string), "language" (string).
No markdown, no backticks, no explanation. Just the JSON array.`;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
        });

        if (!response.ok) throw new Error(`API ${response.status}`);
        const data = await response.json();
        const text = data.content.map(c => c.text || "").join("");

        for (let i = 0; i < agent.tasks.length; i++) {
          if (!runRef.current) break;
          setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, completedSteps: i + 1, currentTask: agent.tasks[i] } : a));
          addLog(agent.name, `✓ ${agent.tasks[i]}`, "success", agent.color);
          await new Promise(r => setTimeout(r, 200));
        }

        let genFiles;
        try {
          genFiles = JSON.parse(text.replace(/```json\s*/g, "").replace(/```/g, "").trim());
        } catch {
          genFiles = [{ path: `shared/${agent.id}/output.txt`, content: text, language: "text" }];
        }

        // Add to shared context so next agents can reference these files
        const fileSummary = genFiles.map(f => `File: ${f.path}\n${f.content.slice(0, 600)}${f.content.length > 600 ? "\n..." : ""}`).join("\n\n");
        sharedContext += `\n\n--- FROM ${agent.name} ---\n${fileSummary}`;

        setFiles(prev => [...prev, ...genFiles.map(f => ({ ...f, agent: agent.name, platform: "Shared" }))]);
        setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: "done", completedSteps: a.totalSteps, currentTask: "Complete" } : a));
        addLog(agent.name, `Complete — ${genFiles.length} files`, "success", agent.color);

      } catch (err) {
        addLog(agent.name, `Error: ${err.message}`, "error");
        setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: "error", currentTask: err.message } : a));
      }
    }

    if (!runRef.current) { cleanup(); return; }

    setFoundationContext(sharedContext);
    setPhase(PHASE.EXECUTE);

    // ── PHASE 2: Platform agents (parallel, all receive foundation context) ──
    addLog("SYSTEM", `Phase 2: Building ${platformAgents.length} platform agents in parallel...`, "info");

    const runPlatformAgent = async (agent) => {
      if (!runRef.current) return;

      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: "running", currentTask: agent.tasks[0] } : a));
      addLog(agent.name, "Agent activated", "info", agent.color);

      const platformFeatures = parsed.features[agent.platform] || parsed.features["General"] || [];

      const prompt = `You are a senior frontend engineer agent. You are building: "${agent.name}" for the "${agent.platform}" platform.

PROJECT CONSTITUTION:
${parsed.raw}

SHARED FOUNDATION CODE (these files already exist — import from them, do NOT recreate):
${sharedContext}

PLATFORM: ${agent.platform}
PLATFORM FEATURES: ${platformFeatures.join(", ") || "See constitution for details"}

YOUR TASK: Generate production-ready code for: ${agent.prompt}
Tasks: ${agent.tasks.join(", ")}

CRITICAL RULES:
- Frontend: ${parsed.techStack.frontend || "React"}
- Styling: ${parsed.techStack.styling || "Tailwind CSS"}
- Language: ${parsed.techStack.language || "TypeScript"}
- Import shared types from their actual paths (e.g. import { User } from "@shared/types")
- Import API utilities from shared API contracts
- Place files under "${agent.platform.toLowerCase().replace(/\s+/g, "-")}-app/" directory
- Generate 2-5 substantial, complete files
- Include proper component structure, hooks, state management

Return ONLY a valid JSON array of objects with: "path" (string), "content" (string), "language" (string).
No markdown, no backticks, no explanation.`;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
        });

        if (!response.ok) throw new Error(`API ${response.status}`);
        const data = await response.json();
        const text = data.content.map(c => c.text || "").join("");

        for (let i = 0; i < agent.tasks.length; i++) {
          if (!runRef.current) break;
          setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, completedSteps: i + 1, currentTask: agent.tasks[i] } : a));
          addLog(agent.name, `✓ ${agent.tasks[i]}`, "success", agent.color);
          await new Promise(r => setTimeout(r, 250 + Math.random() * 300));
        }

        let genFiles;
        try {
          genFiles = JSON.parse(text.replace(/```json\s*/g, "").replace(/```/g, "").trim());
        } catch {
          genFiles = [{ path: `${agent.platform.toLowerCase().replace(/\s+/g, "-")}-app/${agent.id}/output.txt`, content: text, language: "text" }];
        }

        setFiles(prev => [...prev, ...genFiles.map(f => ({ ...f, agent: agent.name, platform: agent.platform }))]);
        setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: "done", completedSteps: a.totalSteps, currentTask: "Complete" } : a));
        addLog(agent.name, `Complete — ${genFiles.length} files`, "success", agent.color);

      } catch (err) {
        addLog(agent.name, `Error: ${err.message}`, "error");
        setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: "error", currentTask: err.message } : a));
      }
    };

    // Run platform agents in batches of 3
    for (let i = 0; i < platformAgents.length; i += 3) {
      if (!runRef.current) break;
      const batch = platformAgents.slice(i, i + 3);
      addLog("SYSTEM", `Deploying: ${batch.map(a => a.name).join(", ")}`, "info");
      await Promise.all(batch.map(runPlatformAgent));
      if (i + 3 < platformAgents.length) await new Promise(r => setTimeout(r, 300));
    }

    if (runRef.current) {
      addLog("SYSTEM", `Build complete! ${files.length} files generated across all platforms.`, "success");
      setPhase(PHASE.OUTPUT);
    }
    cleanup();
  };

  const cleanup = () => {
    clearInterval(timerRef.current);
    setIsExecuting(false);
    runRef.current = false;
  };

  const stopBuild = () => {
    runRef.current = false;
    cleanup();
    addLog("SYSTEM", "Build stopped by user", "error");
    setAgents(prev => prev.map(a => a.status === "running" ? { ...a, status: "idle", currentTask: "Cancelled" } : a));
  };

  const resetAll = () => {
    setPhase(PHASE.UPLOAD);
    setRawText("");
    setFileName("");
    setParsed(null);
    setAgents([]);
    setFiles([]);
    setLogs([]);
    setFoundationContext("");
    setElapsed(0);
  };

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const foundationAgents = agents.filter(a => a.phase === "foundation");
  const platformAgents = agents.filter(a => a.phase === "platform");
  const doneAgents = agents.filter(a => a.status === "done").length;
  const platforms = [...new Set(platformAgents.map(a => a.platform))];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: ${C.border} transparent; }
        *::-webkit-scrollbar { width: 5px; }
        *::-webkit-scrollbar-track { background: transparent; }
        *::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
      `}</style>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 20px" }}>

        {/* ─── HEADER ─── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7,
                background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: C.bg,
              }}>◈</div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: C.mono, letterSpacing: "-0.02em" }}>
                LAYERFORGE
              </h1>
            </div>
            <p style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, margin: 0, letterSpacing: "0.06em" }}>
              CONSTITUTION-DRIVEN BUILD ORCHESTRATOR
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isExecuting && (
              <span style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.accent, fontVariantNumeric: "tabular-nums" }}>
                {formatTime(elapsed)}
              </span>
            )}
            {phase > PHASE.UPLOAD && !isExecuting && (
              <button onClick={resetAll} style={{
                padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
                background: "transparent", color: C.dim, fontFamily: C.mono, fontSize: 10, cursor: "pointer",
              }}>Reset</button>
            )}
          </div>
        </div>

        {/* ─── PHASE BAR ─── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", gap: 2 }}>
            {["Upload", "Parsed", "Agents", "Foundation", "Build", "Output"].map((p, i) => (
              <div key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, background: i <= phase ? C.accent : C.border, transition: "background 0.4s" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
            {["Upload", "Parsed", "Agents", "Foundation", "Build", "Output"].map((p, i) => (
              <span key={i} style={{ fontSize: 9, fontFamily: C.mono, color: i === phase ? C.accent : i < phase ? C.dim : C.muted }}>{p}</span>
            ))}
          </div>
        </div>

        {/* ─── UPLOAD PHASE ─── */}
        {phase === PHASE.UPLOAD && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <UploadZone onFileLoaded={handleFileLoaded} />
            <div style={{ textAlign: "center", marginTop: 20, fontFamily: C.mono, fontSize: 11, color: C.muted }}>
              Build your constitution file on Claude.ai first, then upload it here
            </div>
          </div>
        )}

        {/* ─── PARSED PHASE ─── */}
        {phase === PHASE.PARSED && parsed && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <ParsedView parsed={parsed} />

            {/* Raw preview */}
            <div style={{
              marginTop: 16, background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`,
              maxHeight: 200, overflow: "auto", padding: 14,
            }}>
              <div style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                Raw Constitution
              </div>
              <pre style={{ margin: 0, fontFamily: C.mono, fontSize: 10, color: C.dim, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {rawText.slice(0, 2000)}{rawText.length > 2000 ? "\n..." : ""}
              </pre>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button onClick={() => setPhase(PHASE.UPLOAD)} style={{
                padding: "10px 20px", borderRadius: 10, border: `1px solid ${C.border}`,
                background: "transparent", color: C.dim, fontFamily: C.mono, fontSize: 11, cursor: "pointer",
              }}>← Re-upload</button>
              <button onClick={handleGenerateAgents} style={{
                padding: "10px 24px", borderRadius: 10, border: "none", flex: 1,
                background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`, color: C.bg,
                fontFamily: C.mono, fontSize: 12, fontWeight: 700, cursor: "pointer",
                boxShadow: `0 4px 20px ${C.accent}25`,
              }}>Generate Agents →</button>
            </div>
          </div>
        )}

        {/* ─── AGENTS PHASE ─── */}
        {phase === PHASE.AGENTS && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
                Agent Deployment Plan
              </h2>
              <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, margin: 0 }}>
                {agents.length} agents — {foundationAgents.length} foundation (sequential) + {platformAgents.length} platform (parallel)
              </p>
            </div>

            {/* Foundation agents */}
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.amber, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              ◆ Phase 1 — Foundation (runs first, builds shared code)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 20 }}>
              {foundationAgents.map(a => <AgentCard key={a.id} agent={a} />)}
            </div>

            {/* Platform agents */}
            {platforms.map(platform => (
              <div key={platform}>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: platformAgents.find(a => a.platform === platform)?.color || C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, marginTop: 12 }}>
                  ◧ Phase 2 — {platform} (runs in parallel)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                  {platformAgents.filter(a => a.platform === platform).map(a => <AgentCard key={a.id} agent={a} />)}
                </div>
              </div>
            ))}

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={() => setPhase(PHASE.PARSED)} style={{
                padding: "10px 20px", borderRadius: 10, border: `1px solid ${C.border}`,
                background: "transparent", color: C.dim, fontFamily: C.mono, fontSize: 11, cursor: "pointer",
              }}>← Back</button>
              <button onClick={executeBuild} style={{
                padding: "12px 28px", borderRadius: 10, border: "none", flex: 1,
                background: `linear-gradient(135deg, ${C.green}, #16a34a)`, color: "#fff",
                fontFamily: C.mono, fontSize: 13, fontWeight: 700, cursor: "pointer",
                boxShadow: `0 4px 20px ${C.green}25`, letterSpacing: "0.03em",
              }}>▶ EXECUTE ALL AGENTS</button>
            </div>
          </div>
        )}

        {/* ─── FOUNDATION + EXECUTE PHASE ─── */}
        {(phase === PHASE.FOUNDATION || phase === PHASE.EXECUTE) && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
                  {phase === PHASE.FOUNDATION ? "⚡ Building Foundation..." : "⚡ Building Platforms..."}
                </h2>
                <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, margin: 0 }}>
                  {doneAgents}/{agents.length} agents complete
                </p>
              </div>
              {isExecuting && (
                <button onClick={stopBuild} style={{
                  padding: "8px 18px", borderRadius: 8, border: "none", background: C.red,
                  color: "#fff", fontFamily: C.mono, fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>■ STOP</button>
              )}
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { label: "Agents", val: agents.length, c: C.accent2 },
                { label: "Running", val: agents.filter(a => a.status === "running").length, c: C.blue },
                { label: "Done", val: doneAgents, c: C.green },
                { label: "Files", val: files.length, c: C.accent },
                { label: "Errors", val: agents.filter(a => a.status === "error").length, c: C.red },
              ].map(s => (
                <div key={s.label} style={{ background: C.surface, borderRadius: 8, padding: "8px 14px", border: `1px solid ${C.border}`, flex: "1 1 80px" }}>
                  <div style={{ fontFamily: C.mono, fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700, color: s.c, fontVariantNumeric: "tabular-nums" }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Agent grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8, marginBottom: 16 }}>
              {agents.map(a => <AgentCard key={a.id} agent={a} isActive={a.status === "running"} />)}
            </div>

            <LogPanel logs={logs} logRef={logRef} />
          </div>
        )}

        {/* ─── OUTPUT PHASE ─── */}
        {phase === PHASE.OUTPUT && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
                  📦 Build Complete
                </h2>
                <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, margin: 0 }}>
                  {files.length} files across {[...new Set(files.map(f => f.platform))].length} layers — built in {formatTime(elapsed)}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setPhase(PHASE.AGENTS); setLogs([]); setFiles([]); setAgents(prev => prev.map(a => ({ ...a, status: "idle", completedSteps: 0, currentTask: null, output: null }))); }}
                  style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: C.mono, fontSize: 10, cursor: "pointer" }}>
                  ↻ Re-run
                </button>
                <button onClick={resetAll}
                  style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.dim, fontFamily: C.mono, fontSize: 10, cursor: "pointer" }}>
                  New Project
                </button>
              </div>
            </div>

            {/* Platform badges */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {[...new Set(files.map(f => f.platform))].map(p => {
                const count = files.filter(f => f.platform === p).length;
                const agent = agents.find(a => a.platform === p);
                return (
                  <span key={p} style={{
                    padding: "4px 10px", borderRadius: 6, fontFamily: C.mono, fontSize: 10, fontWeight: 600,
                    background: `${agent?.color || C.accent}12`, color: agent?.color || C.accent,
                  }}>
                    {p} ({count})
                  </span>
                );
              })}
            </div>

            <FileTree files={files} />

            <div style={{ marginTop: 16 }}>
              <LogPanel logs={logs} logRef={logRef} />
            </div>
          </div>
        )}

        {/* ─── FOOTER ─── */}
        <div style={{ textAlign: "center", marginTop: 28, fontFamily: C.mono, fontSize: 9, color: C.muted, letterSpacing: "0.1em" }}>
          LAYERFORGE v2.0 — CONSTITUTION-DRIVEN MULTI-AGENT BUILD ORCHESTRATOR
        </div>
      </div>
    </div>
  );
}
