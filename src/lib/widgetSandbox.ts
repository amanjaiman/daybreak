export const WIDGET_SANDBOX_CHANNEL = "daybreak-widget-v1";

const THEME_TOKENS = [
  "bg",
  "surface",
  "surface-2",
  "hover",
  "border",
  "border-strong",
  "ink",
  "ink-2",
  "ink-3",
  "accent",
  "accent-soft",
  "positive",
  "live",
  "live-soft",
  "radius",
  "radius-sm",
  "shadow-card",
  "shadow-hover",
  "font-ui",
  "font-display",
] as const;

export type WidgetThemeTokens = Record<string, string>;

/** Only GET-able JSON resources are exposed to generated code. */
export function isAllowedWidgetUrl(value: string): boolean {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value, "https://daybreak.invalid/");
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Copy the app's compiled design-system CSS into the opaque iframe. */
export function readWidgetSandboxStyles(): string {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) rules.push(rule.cssText);
    } catch {
      // Cross-origin font stylesheets cannot be inspected. The iframe uses
      // the design system's system-font fallbacks instead.
    }
  }
  return rules.join("\n");
}

export function readWidgetThemeTokens(): WidgetThemeTokens {
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(THEME_TOKENS.map((name) => [`--${name}`, styles.getPropertyValue(`--${name}`).trim()]));
}

/**
 * Self-contained runtime injected into srcdoc. Keep every dependency inside
 * this function: it executes at an opaque origin with no access to the app.
 */
function widgetSandboxRuntime() {
  const channel = "daybreak-widget-v1";
  const root = document.getElementById("widget-root") as HTMLElement;
  let activeRunId = -1;
  let requestSequence = 0;
  let currentCols = 1;
  const requests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
  >();

  const send = (type: string, payload: Record<string, unknown> = {}) => {
    parent.postMessage({ channel, type, runId: activeRunId, payload }, "*");
  };

  const errorMessage = (reason: unknown) =>
    reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Widget runtime error";

  const esc = (value: unknown) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const sparkline = (values: number[]) => {
    const nums = (Array.isArray(values) ? values : []).map(Number).filter((number) => Number.isFinite(number));
    if (nums.length < 2) return "";
    const width = 100;
    const height = 32;
    const padding = 2;
    const min = Math.min(...nums);
    const span = Math.max(...nums) - min || 1;
    const points = nums.map((value, index) => [
      (padding + (index / (nums.length - 1)) * (width - padding * 2)).toFixed(2),
      (padding + (1 - (value - min) / span) * (height - padding * 2)).toFixed(2),
    ]);
    const line = points.map((point) => point.join(",")).join(" ");
    const area = `M${points[0][0]},${height} L${points.map((point) => point.join(",")).join(" L")} L${points[points.length - 1][0]},${height} Z`;
    return `<svg class="gw-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path d="${area}" fill="var(--accent)" fill-opacity="0.08"/><polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };

  const rpc = (method: "getJSON" | "ai", value: string) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++requestSequence;
      requests.set(id, { resolve, reject });
      send("rpc", { id, method, value });
    });

  const applyTheme = (tokens: Record<string, string>) => {
    for (const [name, value] of Object.entries(tokens ?? {})) {
      if (name.startsWith("--") && typeof value === "string") document.documentElement.style.setProperty(name, value);
    }
  };

  const run = (payload: {
    html?: string;
    script?: string;
    store?: unknown;
    themeTokens?: Record<string, string>;
  }) => {
    root.innerHTML = typeof payload.html === "string" ? payload.html : "";
    applyTheme(payload.themeTokens ?? {});
    let storeValue: unknown = payload.store ?? null;
    currentCols = window.innerWidth >= 900 ? 3 : window.innerWidth >= 560 ? 2 : 1;
    const widget = {
      root,
      cols: currentCols,
      store: {
        get: () => storeValue,
        set: (value: unknown) => {
          storeValue = value;
          send("store-set", { value });
        },
      },
      getJSON: (url: string) => rpc("getJSON", url),
      ai: (request: string) => rpc("ai", request),
      esc,
      sparkline,
      refresh: () => send("refresh"),
    };

    try {
      const execute = new Function("widget", `"use strict";\n${payload.script ?? ""}`);
      Promise.resolve(execute(widget)).catch((error) => send("runtime-error", { message: errorMessage(error) }));
    } catch (error) {
      send("runtime-error", { message: errorMessage(error) });
    }
  };

  addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.channel !== channel) return;
    if (message.type === "run") {
      activeRunId = message.runId;
      run(message.payload ?? {});
      return;
    }
    if (message.type === "theme") {
      applyTheme(message.payload?.tokens ?? {});
      return;
    }
    if (message.type === "rpc-result") {
      const pending = requests.get(message.payload?.id);
      if (!pending) return;
      requests.delete(message.payload.id);
      if (message.payload.ok) pending.resolve(message.payload.value);
      else pending.reject(new Error(message.payload.error || "Widget request failed"));
    }
  });

  addEventListener("error", (event) => send("runtime-error", { message: event.message || "Widget runtime error" }));
  addEventListener("unhandledrejection", (event) =>
    send("runtime-error", { message: errorMessage(event.reason) }),
  );
  addEventListener("resize", () => {
    const nextCols = window.innerWidth >= 900 ? 3 : window.innerWidth >= 560 ? 2 : 1;
    if (activeRunId >= 0 && nextCols !== currentCols) send("refresh");
  });
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (target?.closest("a")) event.preventDefault();
  });

  const reportHeight = () => send("height", { value: Math.ceil(document.documentElement.scrollHeight) });
  new ResizeObserver(reportHeight).observe(root);
  addEventListener("load", reportHeight);
}

const escapeEmbedded = (value: string, tag: "style" | "script") =>
  value.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);

export function buildWidgetSandboxDocument(styles: string): string {
  const css = escapeEmbedded(styles, "style");
  const runtime = escapeEmbedded(`(${widgetSandboxRuntime.toString()})();`, "script");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
  <style>${css}</style>
  <style>
    html, body { margin: 0; padding: 0; overflow: hidden; background: transparent !important; color: var(--ink); }
    body { container-type: inline-size; min-width: 0; }
    #widget-root { min-width: 0; }
  </style>
</head>
<body><div id="widget-root" class="gw-root"></div><script>${runtime}</script></body>
</html>`;
}
