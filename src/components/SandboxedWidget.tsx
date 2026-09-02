import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dataKey } from "../lib/customWidgets";
import type { CustomWidget } from "../lib/customWidgets";
import { fnHeaders, fnUrl } from "../lib/backend";
import {
  buildWidgetSandboxDocument,
  isAllowedWidgetUrl,
  readWidgetSandboxStyles,
  readWidgetThemeTokens,
  WIDGET_SANDBOX_CHANNEL,
} from "../lib/widgetSandbox";

type SandboxMessage = {
  channel?: string;
  type?: string;
  runId?: number;
  payload?: Record<string, unknown>;
};

type Props = {
  widget: CustomWidget;
  runKey: number;
  bypassAiCache: boolean;
  hidden?: boolean;
  onError: (message: string | null) => void;
  onRefresh: () => void;
};

function hash(value: string): string {
  let result = 5381;
  for (let index = 0; index < value.length; index++) result = ((result << 5) + result + value.charCodeAt(index)) | 0;
  return (result >>> 0).toString(36);
}

function storedValue(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function SandboxedWidget({ widget, runKey, bypassAiCache, hidden, onError, onRefresh }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1);
  const dataStorageKey = dataKey(widget.id);
  const sandboxDocument = useMemo(() => buildWidgetSandboxDocument(readWidgetSandboxStyles()), []);

  useEffect(() => {
    setHeight(1);
    onError(null);
  }, [runKey, onError]);

  useLayoutEffect(() => {
    const respond = (target: Window, id: unknown, ok: boolean, value?: unknown, error?: string) => {
      target.postMessage(
        { channel: WIDGET_SANDBOX_CHANNEL, type: "rpc-result", runId: runKey, payload: { id, ok, value, error } },
        "*",
      );
    };

    const handleMessage = async (event: MessageEvent<SandboxMessage>) => {
      const frameWindow = iframeRef.current?.contentWindow;
      const message = event.data;
      if (!frameWindow || event.source !== frameWindow || message?.channel !== WIDGET_SANDBOX_CHANNEL || message.runId !== runKey) return;
      const payload = message.payload ?? {};

      if (message.type === "height") {
        const next = Number(payload.value);
        if (Number.isFinite(next)) setHeight(Math.min(4_000, Math.max(1, Math.ceil(next))));
        return;
      }
      if (message.type === "runtime-error") {
        onError(typeof payload.message === "string" ? payload.message : "Widget runtime error");
        return;
      }
      if (message.type === "refresh") {
        onRefresh();
        return;
      }
      if (message.type === "store-set") {
        const serialized = JSON.stringify(payload.value ?? null);
        localStorage.setItem(dataStorageKey, serialized);
        return;
      }
      if (message.type !== "rpc") return;

      const id = payload.id;
      const method = payload.method;
      const value = payload.value;
      if ((method !== "getJSON" && method !== "ai") || typeof value !== "string") {
        respond(frameWindow, id, false, undefined, "Unsupported widget request");
        return;
      }

      try {
        if (method === "getJSON") {
          if (!isAllowedWidgetUrl(value)) throw new Error("That data URL is not allowed");
          let data: unknown;
          try {
            const response = await fetch(value, { signal: AbortSignal.timeout(12_000) });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            data = await response.json();
          } catch (error) {
            if (!(error instanceof TypeError)) throw error;
            const response = await fetch(`/api/proxy?url=${encodeURIComponent(value)}`, {
              signal: AbortSignal.timeout(12_000),
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
            data = body;
          }
          respond(frameWindow, id, true, data);
          return;
        }

        const cacheKey = `${dataStorageKey}.ai`;
        const ttl = Math.max(widget.refreshMs ?? 0, 3_600_000);
        const requestHash = hash(value);
        let cache: Record<string, { t: number; data: unknown }> = {};
        try {
          cache = JSON.parse(localStorage.getItem(cacheKey) ?? "{}");
        } catch {
          // Corrupt cache; replace it with the next successful response.
        }
        const hit = cache[requestHash];
        if (!bypassAiCache && hit && Date.now() - hit.t < ttl) {
          respond(frameWindow, id, true, hit.data);
          return;
        }

        const response = await fetch(fnUrl("widget-data"), {
          method: "POST",
          headers: fnHeaders(),
          body: JSON.stringify({ prompt: value }),
          signal: AbortSignal.timeout(35_000),
        });
        const body = (await response.json().catch(() => ({}))) as { data?: unknown; error?: string };
        if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
        cache[requestHash] = { t: Date.now(), data: body.data };
        const entries = Object.entries(cache).sort((left, right) => right[1].t - left[1].t).slice(0, 8);
        localStorage.setItem(cacheKey, JSON.stringify(Object.fromEntries(entries)));
        respond(frameWindow, id, true, body.data);
      } catch (error) {
        const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
        respond(
          frameWindow,
          id,
          false,
          undefined,
          timedOut ? "The data lookup took too long. Try again." : error instanceof Error ? error.message : String(error),
        );
      }
    };

    addEventListener("message", handleMessage);
    return () => removeEventListener("message", handleMessage);
  }, [bypassAiCache, dataStorageKey, onError, onRefresh, runKey, widget.refreshMs]);

  useEffect(() => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    const sendTheme = () =>
      frameWindow.postMessage(
        { channel: WIDGET_SANDBOX_CHANNEL, type: "theme", runId: runKey, payload: { tokens: readWidgetThemeTokens() } },
        "*",
      );
    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sendTheme);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sendTheme);
    };
  }, [runKey]);

  const start = () => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(
      {
        channel: WIDGET_SANDBOX_CHANNEL,
        type: "run",
        runId: runKey,
        payload: {
          html: widget.html,
          script: widget.script,
          store: storedValue(dataStorageKey),
          themeTokens: readWidgetThemeTokens(),
        },
      },
      "*",
    );
  };

  return (
    <iframe
      key={runKey}
      ref={iframeRef}
      className="gw-frame"
      title={`${widget.title} widget`}
      sandbox="allow-scripts"
      srcDoc={sandboxDocument}
      onLoad={start}
      style={{ height, display: hidden ? "none" : undefined }}
    />
  );
}
