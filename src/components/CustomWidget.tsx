import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "./Card";
import { useCustomWidgets } from "../lib/customWidgets";
import type { CustomWidget } from "../lib/customWidgets";
import { useSettings } from "../lib/settings";
import { RefreshIcon } from "./icons";
import { WidgetIcon } from "./widgetIcons";
import { SandboxedWidget } from "./SandboxedWidget";

/**
 * Hosts generated code in an opaque-origin iframe. Refreshing replaces
 * the frame so old event listeners and timers are terminated cleanly.
 */
export function CustomWidgetCard({ widget }: { widget: CustomWidget }) {
  const { remove, retry } = useCustomWidgets();
  const { settings, update } = useSettings();
  const [error, setError] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);
  const bypassAiCache = useRef(false);
  // force=true (the header refresh button) makes widget.ai skip its cache.
  const rerun = useCallback((force = false) => {
    bypassAiCache.current = force;
    setRunKey((k) => k + 1);
  }, []);

  const ready = widget.status === "ready";

  useEffect(() => {
    if (!ready || !widget.refreshMs) return;
    const timer = setInterval(() => rerun(), Math.max(60_000, widget.refreshMs));
    return () => clearInterval(timer);
  }, [ready, rerun, widget.refreshMs]);

  // A finished widget is only taken off the board (bring it back from
  // Personalize); deleting for good — including a half-built or failed one —
  // happens there too, or here for pending/error states.
  const removeButton = !settings.locked && (
    <button
      className="card__more card__more--reveal"
      onClick={() => {
        if (widget.status === "ready") {
          update({
            hidden: [...settings.hidden, widget.id],
            board: settings.board.map((col) => col.filter((c) => c !== widget.id)),
          });
          return;
        }
        const msg =
          widget.status === "pending"
            ? `Stop building the "${widget.title}" widget?`
            : `Remove the "${widget.title}" widget? Its saved data is deleted too.`;
        if (window.confirm(msg)) remove(widget.id);
      }}
    >
      Remove
    </button>
  );

  // Generation still running: a calm skeleton where the widget will land.
  if (widget.status === "pending") {
    return (
      <Card
        title={widget.title}
        icon={<WidgetIcon name={widget.icon} />}
        actions={<span className="widget__actions">{removeButton}</span>}
      >
        <div className="widget__pending">
          <div className="skeleton" style={{ height: 52 }} />
          <div className="skeleton" style={{ height: 16, width: "70%" }} />
          <div className="skeleton" style={{ height: 16, width: "45%" }} />
          <p className="widget__pending-note">
            {widget.generationStage === "review"
              ? "Fixing a quality issue in your widget…"
              : "Designing and building your widget…"} You can leave and come back.
          </p>
        </div>
      </Card>
    );
  }

  // Generation failed outright: offer a retry of the same prompt.
  if (widget.status === "error") {
    return (
      <Card
        title="Couldn't build it"
        icon={<WidgetIcon name="alert" />}
        actions={<span className="widget__actions">{removeButton}</span>}
      >
        <div className="widget__error">
          {widget.genError ?? "Widget generation failed."}
          <button className="list__toggle" onClick={() => retry(widget.id)}>
            Try again
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={widget.title}
      icon={<WidgetIcon name={widget.icon} />}
      actions={
        <span className="widget__actions">
          {widget.refreshMs != null && (
            <button className="card__more card__more--reveal" title="Refresh" aria-label={`Refresh ${widget.title}`} onClick={() => rerun(true)}>
              <RefreshIcon />
            </button>
          )}
          {removeButton}
        </span>
      }
    >
      {error ? (
        <div className="widget__error">
          This widget hit an error: {error}
          <button className="list__toggle" onClick={() => rerun(true)}>
            Try again
          </button>
        </div>
      ) : null}
      <SandboxedWidget
        widget={widget}
        runKey={runKey}
        bypassAiCache={bypassAiCache.current}
        hidden={!!error}
        onError={setError}
        onRefresh={rerun}
      />
    </Card>
  );
}
