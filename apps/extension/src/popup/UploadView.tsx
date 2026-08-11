import { useState, useCallback, useRef } from "react";
import { parseLog } from "@salesforce-xray/parser";

type UploadStatus = "idle" | "parsing" | "done" | "error";

export function UploadView() {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = useCallback(async (file: File) => {
    if (!file.name.endsWith(".log") && !file.name.endsWith(".txt")) {
      setError("Please select a Salesforce .log file.");
      return;
    }
    setStatus("parsing");
    setError(null);

    try {
      const raw = await file.text();
      const result = parseLog(raw);

      // Store result and open X-Ray tab
      await chrome.runtime.sendMessage({
        type: "STORE_LOG",
        payload: JSON.stringify({ raw, result }),
      });
      await chrome.runtime.sendMessage({ type: "OPEN_XRAY" });
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse log.");
      setStatus("error");
    }
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void process(file);
    },
    [process]
  );

  return (
    <div className="body">
      <div
        className={`upload-zone ${dragover ? "dragover" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragover(true);
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragover(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <span style={{ fontSize: 28 }}>📂</span>
        <span className="upload-zone-label">
          Drop Salesforce Debug Log here
        </span>
        <span className="upload-zone-or">or</span>
        <span
          style={{
            fontSize: 11,
            color: "var(--accent)",
            textDecoration: "underline",
          }}
        >
          Choose file
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".log,.txt"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {status === "parsing" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-dim)" }}>
          <span className="spinner" />
          Parsing log…
        </div>
      )}

      {status === "done" && (
        <div className="hint">
          Analysis is opening in a new tab.
        </div>
      )}

      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
