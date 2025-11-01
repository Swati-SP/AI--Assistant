import { useCallback, useRef, useState, useEffect } from "react";
import { uploadDocuments, summarizeFiles } from "../api/docsApi";

export default function UploadDocs({ onDone }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Debug log for file queue
  useEffect(() => {
    console.log(
      "📦 Upload queue:",
      queue.map((q) => ({ name: q.file?.name, status: q.status }))
    );
  }, [queue]);

  const openPicker = () => inputRef.current?.click();

  // Add selected or dropped files
  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;

    const limited = files.slice(0, 10);
    const next = limited.map((f) => ({
      file: f,
      progress: 0,
      status: "idle",
    }));

    setQueue((prev) => {
      const combined = [...prev, ...next];
      console.log(`✅ Added ${next.length} file(s). Queue ->`, combined.length);
      return combined;
    });
    setMessage("");
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  // 🔹 Upload + summarize workflow
  const startUpload = async () => {
    console.log("🟢 Start button clicked");
    console.log("Current queue:", queue.map((q) => q.file?.name));

    const idle = queue.filter((q) => q.status === "idle");
    if (!idle.length) {
      setMessage("Please select at least one file to upload.");
      return;
    }

    setBusy(true);
    setMessage("Uploading files...");

    // mark uploading
    setQueue((prev) =>
      prev.map((q) =>
        q.status === "idle" ? { ...q, status: "uploading", progress: 0 } : q
      )
    );

    try {
      const filesToSend = idle.map((q) => q.file);
      console.log("🚀 Starting upload of:", filesToSend.map((f) => f.name));

      const res = await uploadDocuments(filesToSend, (p, file) => {
        setQueue((prev) =>
          prev.map((q) =>
            q.file === file ? { ...q, progress: p } : q
          )
        );
      });

      console.log("✅ Upload response received:", res);

      // mark all as done
      setQueue((prev) =>
        prev.map((q) =>
          q.status === "uploading"
            ? { ...q, progress: 100, status: "done" }
            : q
        )
      );

      setMessage(`Uploaded ${res.uploaded?.length || 0} file(s) successfully.`);

      // === Summarize after upload ===
      const filenames = (res.uploaded || []).map((u) => u.filename).filter(Boolean);
      console.log("📝 Files ready for summarization:", filenames);

      if (filenames.length > 0) {
        try {
          setMessage("Summarizing uploaded documents...");
          console.log("📤 Sending summarize request...");
          const summ = await summarizeFiles(filenames);
          console.log("📥 Summaries received:", summ);

          setMessage("✅ Upload + summarization complete.");
          onDone &&
            onDone({
              uploaded: res.uploaded || [],
              summaries: summ.summaries || [],
            });

          // Optional: clear the queue after 3s for a cleaner UI
          setTimeout(() => setQueue([]), 3000);
        } catch (sumErr) {
          console.error("❌ Summarization failed:", sumErr);
          setMessage("Uploaded but summarization failed.");
          onDone &&
            onDone({
              uploaded: res.uploaded || [],
              summaries: [],
              summarizeError: String(sumErr.message || sumErr),
            });
        }
      } else {
        console.warn("⚠️ No filenames found for summarization.");
        onDone && onDone({ uploaded: res.uploaded || [], summaries: [] });
      }
    } catch (err) {
      console.error("❌ Upload error:", err);
      setQueue((prev) =>
        prev.map((q) =>
          q.status === "uploading"
            ? { ...q, status: "error", error: String(err.message || err) }
            : q
        )
      );
      setMessage(err?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const clearQueue = () => {
    setQueue([]);
    setMessage("");
  };

  return (
    <div className="flex items-center gap-2 relative">
      {/* Upload button */}
      <button
        type="button"
        onClick={openPicker}
        className="px-3 py-2 text-sm rounded-xl border"
        disabled={busy}
        title="Choose files"
      >
        Upload
      </button>

      {/* Start button */}
      <button
        type="button"
        onClick={startUpload}
        className="px-3 py-2 text-sm rounded-xl border bg-indigo-50"
        disabled={busy || queue.length === 0}
        title="Start upload"
      >
        Start
      </button>

      {/* Clear button */}
      <button
        type="button"
        onClick={clearQueue}
        className="px-3 py-2 text-sm rounded-xl border"
        disabled={busy || queue.length === 0}
        title="Clear selected"
      >
        Clear
      </button>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
        accept=".pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.csv,.xlsx,.json,.html,.rtf,.png,.jpg,.jpeg"
      />

      {/* Drag area */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`ml-2 hidden md:flex items-center px-3 py-2 text-xs rounded-xl border ${
          dragOver ? "border-indigo-400" : "border-dashed"
        }`}
        title="Drag files here"
      >
        Drag files here
      </div>

      {/* Status message */}
      {message && (
        <span className="ml-2 text-xs opacity-80 whitespace-nowrap">
          {message}
        </span>
      )}

      {/* Upload queue popup (moved up) */}
      {queue.length > 0 && (
        <div
          className="absolute z-20 w-[28rem] max-w-[90vw] right-4 md:right-auto md:left-1/2 md:-translate-x-1/2"
          style={{ top: "-260px" }}
        >
          <div className="rounded-2xl border p-3 bg-white/95 shadow-2xl">
            <div className="text-sm font-medium mb-2">Selected files</div>
            <ul className="max-h-56 overflow-auto space-y-2">
              {queue.map((q, i) => (
                <li
                  key={i}
                  className="text-xs flex items-center justify-between gap-3 border rounded-lg px-2 py-1.5 bg-white/80"
                >
                  <div className="truncate">
                    {q.file?.name}{" "}
                    <span className="opacity-60">
                      ({Math.round((q.file?.size || 0) / 1024)} KB)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-28 h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`h-2 ${
                          q.status === "error" ? "bg-red-500" : "bg-indigo-500"
                        }`}
                        style={{ width: `${q.progress}%` }}
                      />
                    </div>
                    <span
                      className={`text-[10px] ${
                        q.status === "error" ? "text-red-600" : "text-gray-600"
                      }`}
                    >
                      {q.status === "idle" && "ready"}
                      {q.status === "uploading" && `${q.progress}%`}
                      {q.status === "done" && "done"}
                      {q.status === "error" && "error"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="text-[11px] opacity-60 mt-2">
              Supported: pdf, txt, md, doc(x), ppt(x), csv, xlsx, json, html,
              rtf, png, jpg. Max 10 files per batch.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
