
import React, { useState, useCallback } from "react";
import ChatWindow from "./components/ChatWindow";
import UploadDocs from "../components/UploadDocs";

/**
 * ChatApp - top-level chat page that integrates UploadDocs.
 *
 * When UploadDocs finishes uploading + summarizing it calls onDone(result).
 * We transform the summaries into assistant messages and append to chat.
 */
export default function ChatApp() {
  const [messages, setMessages] = useState([
    // initial assistant greeting (optional)
    {
      role: "assistant",
      content: "Hello. How can I assist you today?",
      timestamp: Date.now(),
      sources: [
        { title: "Source 1" },
        { title: "Source 2" },
        { title: "Source 3" },
        { title: "Source 4" },
      ],
    },
  ]);
  const [loading, setLoading] = useState(false);

  // appendMessage utility
  const appendMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Optional helper to create assistant message object
  const makeAssistantMsg = useCallback((content, sources = []) => ({
    role: "assistant",
    content,
    timestamp: Date.now(),
    sources,
  }), []);

  /**
   * Called by UploadDocs after upload and summarization.
   * result = { uploaded: [...], summaries: [{filename, summary}, ...], summarizeError? }
   */
  const handleUploadDone = useCallback((result) => {
    console.log("handleUploadDone result:", result);

    // If there was an error summarizing, show a short assistant message
    if (result?.summarizeError) {
      appendMessage(makeAssistantMsg(
        `Files uploaded successfully but summarization failed: ${result.summarizeError}`
      ));
      return;
    }

    const summaries = result?.summaries || [];

    if (!summaries.length) {
      // If backend didn't provide summaries, show a single assistant notice
      appendMessage(makeAssistantMsg("Files uploaded successfully. No summaries were returned by the server."));
      return;
    }

    // Option A: append separate assistant message for each file
    summaries.forEach((s) => {
      // s: { filename, summary }
      const content = `**Summary of ${s.filename}**\n\n${s.summary}`;
      appendMessage(makeAssistantMsg(content, [{ title: s.filename }]));
    });

    // Option B (alternative): append one combined message
    // Uncomment the block below and comment out the loop above if you prefer one combined message.
    /*
    const combined = summaries.map(s => `**${s.filename}**\n${s.summary}`).join("\n\n---\n\n");
    appendMessage(makeAssistantMsg(`Uploaded and summarized files:\n\n${combined}`));
    */
  }, [appendMessage, makeAssistantMsg]);

  // Example: if you want to let user send messages (not requested but handy)
  const handleSendUserMessage = async (text) => {
    if (!text || !text.trim()) return;
    const userMsg = { role: "user", content: text.trim(), timestamp: Date.now() };
    appendMessage(userMsg);

    // If you have a /api/ask endpoint, call it here and append assistant reply.
    // setLoading(true);
    // try { call api... append assistant } finally { setLoading(false) }
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        {/* Top toolbar: UploadDocs on the left */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <UploadDocs onDone={handleUploadDone} />
          </div>

          {/* Right-side: optionally add Logout / Mode toggle etc */}
          <div className="flex items-center gap-2">
            {/* keep simple — can add buttons here */}
          </div>
        </div>

        {/* Chat window */}
        <ChatWindow messages={messages} loading={loading} onSuggest={(q) => handleSendUserMessage(q)} />

        {/* Basic input to send user messages (optional) */}
        <div className="mt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.target.elements["chat-input"];
              handleSendUserMessage(input.value);
              input.value = "";
            }}
          >
            <input
              name="chat-input"
              className="w-full p-3 rounded-lg border"
              placeholder="Ask me something..."
            />
          </form>
        </div>
      </div>
    </div>
  );
}
