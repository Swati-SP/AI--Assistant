// src/App.js
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import ThemeToggle from "./components/ThemeToggle";
import SettingsBar from "./components/SettingsBar";
import Chatwindow from "./components/Chatwindow";
import ChatBox from "./components/ChatBox";
import ExportMenu from "./components/ExportMenu";
import ToastHost from "./components/Toast";
import ErrorBanner from "./components/ErrorBanner";
import Sidebar from "./components/Sidebar";
import UploadDocs from "./components/UploadDocs";

import { askQuestion } from "./api/aiClient";
import { getCurrentSession as getAuthSession, logout } from "./api/authApi";

import Login from "./pages/Login";
import SignUp from "./pages/SignUp";

import {
  loadAll,
  createSession,
  setCurrent,
  renameSession,
  deleteSession,
  upsertMessage,
  replaceMessages,
  getCurrentSession as getCurrentChat,
} from "./utils/chatStore";

/* ---------------- JWT helpers ---------------- */
function decodeJwt(token) {
  try {
    const part = token?.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function tokenExpMs() {
  const s = getAuthSession();
  const p = decodeJwt(s?.accessToken);
  return p?.exp ? p.exp * 1000 : 0;
}

function isTokenValid() {
  const exp = tokenExpMs();
  return exp > Date.now();
}

/* ---------------- Route Guards ---------------- */
function RequireAuth({ children }) {
  const location = useLocation();
  if (!isTokenValid()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function RedirectIfAuthed({ children }) {
  if (isTokenValid()) return <Navigate to="/" replace />;
  return children;
}

/* ---------------- Main Router ---------------- */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RequireAuth><ChatLayout /></RequireAuth>} />
        <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
        <Route path="/signup" element={<RedirectIfAuthed><SignUp /></RedirectIfAuthed>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/* ---------------- Chat + Sidebar Layout ---------------- */
function ChatLayout() {
  const auth = getAuthSession();
  const userId = auth?.user?.id || "anon";

  const [store, setStore] = useState(() => loadAll(userId));
  const current = useMemo(() => getCurrentChat(userId), [store, userId]);

  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState("");
  const [lastFailedQuestion, setLastFailedQuestion] = useState("");

  // initialize sessions
  useEffect(() => {
    const data = loadAll(userId);
    if (!data.currentId) setStore(createSession(userId, "New Chat"));
    else setStore(data);
  }, [userId]);

  // auto logout on expiry
  useEffect(() => {
    const exp = tokenExpMs();
    if (!exp) return;
    const msLeft = exp - Date.now();
    if (msLeft <= 0) return handleLogout();
    const t = setTimeout(handleLogout, msLeft);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.accessToken]);

  // sync between tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === `chats_${userId}`) setStore(loadAll(userId));
      if (e.key === "session_v1") window.location.reload(); // auth change
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  // sidebar actions
  const handleNewChat = () => setStore(createSession(userId, "New Chat"));
  const handleSelectChat = (id) => setStore(setCurrent(userId, id));
  const handleRenameChat = (id, title) => setStore(renameSession(userId, id, title));
  const handleDeleteChat = (id) => {
    if (!window.confirm("Delete this chat?")) return;
    setStore(deleteSession(userId, id));
  };

  const messages = current?.messages || [];
  const setMessagesForCurrent = (msgs) => {
    if (!current?.id) return;
    setStore(replaceMessages(userId, current.id, msgs));
  };
  const appendMessage = (m) => {
    if (!current?.id) return;
    setStore(upsertMessage(userId, current.id, m));
  };

  const handleClearCurrent = () => {
    if (!current?.id || loading) return;
    if (!window.confirm("Clear messages in this chat?")) return;
    setMessagesForCurrent([]);
    setLastError("");
    setLastFailedQuestion("");
  };

  const sendCore = async (question) => {
    const q = (question || "").trim();
    if (!q) return;

    appendMessage({ role: "user", content: q, timestamp: Date.now() });

    try {
      setLoading(true);
      const res = await askQuestion(q);
      appendMessage({
        role: "assistant",
        content: res?.answer || "Server error",
        timestamp: Date.now(),
        sources: res?.sources || [],
      });
    } catch {
      setLastError("Connection failed. Please try again.");
      setLastFailedQuestion(q);
    } finally {
      setLoading(false);
    }
  };

  const apiMode = localStorage.getItem("mockMode") === "true" ? "Mock" : "Real";

  /* ------------------ Upload done handler ------------------
     This receives the result object from UploadDocs:
     { uploaded: [{ filename, size, id? }], summaries: [{ filename, summary }], summarizeError? }
     It appends assistant messages for each summary (so they appear in chat).
  ----------------------------------------------------------------*/
  const makeAssistantMsg = useCallback((content, sources = []) => ({
    role: "assistant",
    content,
    timestamp: Date.now(),
    sources,
  }), []);

  const handleUploadDone = useCallback((result) => {
    console.log("handleUploadDone:", result);

    if (!result) {
      appendMessage(makeAssistantMsg("Upload completed (no details returned)."));
      return;
    }

    if (result.summarizeError) {
      appendMessage(makeAssistantMsg(`Files uploaded but summarization failed: ${result.summarizeError}`));
      return;
    }

    const summaries = result.summaries || [];
    if (!summaries.length) {
      appendMessage(makeAssistantMsg("Files uploaded successfully. No summaries were returned by the server."));
      return;
    }

    // Append a short header assistant message
    appendMessage(makeAssistantMsg(`Uploaded ${result.uploaded?.length || summaries.length} file(s). Showing summaries below:`));

    // Append one assistant message per summary (filename + summary)
    summaries.forEach((s) => {
      const content = `**Summary — ${s.filename}**\n\n${s.summary}`;
      appendMessage(makeAssistantMsg(content, [{ title: s.filename }]));
    });
  }, [appendMessage, makeAssistantMsg]);

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      <Sidebar
        sessions={store.sessions}
        currentId={store.currentId}
        onNew={handleNewChat}
        onSelect={handleSelectChat}
        onRename={handleRenameChat}
        onDelete={handleDeleteChat}
        isOpen={true}
        onClose={() => {}}
      />

      <div className="flex-1">
        <div className="mb-4 rounded-2xl p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white grid place-items-center shadow">🤖</div>
                <h1 className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">AI Assistant</h1>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                API Mode: <span className="text-orange-500 font-medium">{apiMode}</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* pass onDone to UploadDocs so uploaded summaries are added to chat */}
              <UploadDocs onDone={handleUploadDone} />
              <ExportMenu messages={messages} />
              <button onClick={handleClearCurrent} disabled={loading} className="px-3 py-2 text-sm border rounded-lg">
                Clear
              </button>
              <button onClick={handleLogout} className="px-3 py-2 text-sm border rounded-lg">
                Logout
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="rounded-3xl p-6 border bg-white/70 dark:bg-gray-900/50 shadow-xl">
          <SettingsBar onModeChange={() => {}} />

          <ErrorBanner
            message={lastError}
            onRetry={lastFailedQuestion ? () => sendCore(lastFailedQuestion) : undefined}
            disabled={loading}
          />

          <Chatwindow messages={messages} loading={loading} onSuggest={sendCore} />
          <div className="mt-4">
            <ChatBox onSend={sendCore} loading={loading} />
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
            Press <kbd className="px-1 py-0.5 border rounded">Enter</kbd> to send,{" "}
            <kbd className="px-1 py-0.5 border rounded">Shift</kbd>+
            <kbd className="px-1 py-0.5 border rounded">Enter</kbd> for a new line.
          </p>
        </div>

        <ToastHost />
      </div>
    </div>
  );
}
