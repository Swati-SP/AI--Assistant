// src/components/Sidebar.jsx
import { useState } from "react";

export default function Sidebar({
  sessions,
  currentId,
  onNew,
  onSelect,
  onRename,
  onDelete,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");

  const startEdit = (s) => {
    setEditingId(s.id);
    setDraftTitle(s.title);
  };
  const saveEdit = () => {
    if (editingId) onRename(editingId, draftTitle);
    setEditingId(null);
    setDraftTitle("");
  };

  return (
    <aside className="hidden md:flex md:flex-col w-72 shrink-0 h-[calc(100vh-2rem)] sticky top-4 rounded-2xl border bg-white/60 dark:bg-gray-900/50 backdrop-blur p-3 gap-3">
      <button
        onClick={onNew}
        className="w-full border rounded-xl py-2 px-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        + New chat
      </button>

      <div className="overflow-auto pr-1">
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500 px-1">No chats yet</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 mb-2 rounded-xl border p-2 cursor-pointer ${
                s.id === currentId
                  ? "bg-indigo-50/60 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
              onClick={() => onSelect(s.id)}
            >
              {editingId === s.id ? (
                <input
                  className="w-full bg-transparent outline-none"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setDraftTitle("");
                    }
                  }}
                  autoFocus
                />
              ) : (
                <div className="flex-1">
                  <div className="text-sm font-medium line-clamp-1">
                    {s.title}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </div>
              )}

              {editingId === s.id ? (
                <button
                  className="text-xs border rounded px-2 py-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    saveEdit();
                  }}
                >
                  Save
                </button>
              ) : (
                <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
                  <button
                    className="text-xs border rounded px-2 py-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(s);
                    }}
                    title="Rename"
                  >
                    Rename
                  </button>
                  <button
                    className="text-xs border rounded px-2 py-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
