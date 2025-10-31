import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "./socket.js";
import MessageBubble from "./MessageBubble.jsx";
import UsernameBanner from "./UsernameBanner.jsx";

const deriveKey = msg => {
  if (!msg) return null;

  if (msg.scheduledSourceId) return msg.scheduledSourceId;

  return (
    msg._storageKey ||
    (msg.deliverAt
      ? `${msg.username || ""}__${msg.subRoom || "default"}__${new Date(
          msg.deliverAt
        ).getTime()}__${(msg.text || "").trim()}`
      : null) ||
    msg.id ||
    msg._id ||
    msg.tempId ||
    (msg.ts
      ? `${msg.username || "anon"}__${msg.subRoom || "default"}__${new Date(
          msg.ts
        ).getTime()}__${(msg.text || "").slice(0, 16)}`
      : null)
  );
};

const mergeMessage = (collection, incoming) => {
  const key = deriveKey(incoming);
  if (!key) return collection;

  const previous = collection[key] || {};

  const merged = {
    ...previous,
    ...incoming,
    scheduledSourceId:
      incoming.scheduledSourceId || previous.scheduledSourceId || null,
    isScheduled:
      incoming.isScheduled ?? previous.isScheduled ?? false,
    deliverAt: incoming.deliverAt || previous.deliverAt || null,
    deliveredAt: incoming.deliveredAt || previous.deliveredAt || null,
    scheduledDelivered:
      incoming.scheduledDelivered ??
      previous.scheduledDelivered ??
      (!incoming.isScheduled && previous.isScheduled) ??
      false,
    _storageKey: key
  };

  return { ...collection, [key]: merged };
};

export default function ChatRoom() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const myNickname = localStorage.getItem(`nickname_${chatId}`) || "Guest";

  const [messagesById, setMessagesById] = useState({});
  const [pendingText, setPendingText] = useState("");
  const [subChats, setSubChats] = useState(["default"]);
  const [activeSubChat, setActiveSubChat] = useState("default");
  const [unreadCounts, setUnreadCounts] = useState({});
  const [showSchedule, setShowSchedule] = useState(false);
  const [selectedDelay, setSelectedDelay] = useState(60000);
  const [notification, setNotification] = useState(null);
  const [showAddChat, setShowAddChat] = useState(false);
  const [newChatName, setNewChatName] = useState("");

  const bottomRef = useRef(null);

  const sortedMessages = Object.values(messagesById)
    .filter(m => m.subRoom === activeSubChat)
    .sort(
      (a, b) =>
        new Date(a.deliveredAt || a.ts) - new Date(b.deliveredAt || b.ts)
    );

  useEffect(() => {
    if (!chatId) {
      const id = Math.random().toString(36).substring(2, 8);
      navigate(`/chat/${id}`, { replace: true });
      return;
    }

    const upsertMessage = incoming => {
      if (!incoming) return;
      setMessagesById(prev => {
        const key = deriveKey(incoming);
        const fallbackSubRoom = key ? prev[key]?.subRoom : undefined;
        const enriched = {
          ...incoming,
          subRoom: incoming.subRoom || fallbackSubRoom || "default"
        };
        return mergeMessage(prev, enriched);
      });
    };

    socket.emit("join_room", {
      roomId: chatId,
      subRoom: activeSubChat,
      nickname: myNickname
    });

    socket.on("chat_history", history => {
      let map = {};
      for (const entry of history || []) {
        const enriched = {
          ...entry,
          subRoom: entry.subRoom || "default"
        };
        map = mergeMessage(map, enriched);
      }
      setMessagesById(map);
    });

    socket.on("subchat_list", list => {
      if (Array.isArray(list) && list.length > 0)
        setSubChats(prev => [...new Set([...prev, ...list])]);
    });

    socket.on("subchat_created", name => {
      setSubChats(prev => (prev.includes(name) ? prev : [...prev, name]));
    });

    // ✅ Glavni fix — bez dupliranja, sa unread logikom
    socket.on("message", msg => {
      setMessagesById(prev => {
        const key = deriveKey(msg);
        if (key && prev[key]) return prev; // spreči duplikate

        if (msg.subRoom !== activeSubChat) {
          setUnreadCounts(prevUnread => ({
            ...prevUnread,
            [msg.subRoom]: (prevUnread[msg.subRoom] || 0) + 1
          }));
        }

        return mergeMessage(prev, msg);
      });
    });

    // ✅ Fix za scheduled poruke (prikaz italika)
    socket.on("scheduled_confirmed", ({ msg, delayMs, subRoom }) => {
      if (subRoom !== activeSubChat) return;

      const deliverAt = Date.now() + delayMs;

      const enriched = {
        ...msg,
        isScheduled: true,
        scheduledDelivered: false,
        deliverAt,
        _storageKey: deriveKey(msg)
      };

      setMessagesById(prev => mergeMessage(prev, enriched));

      setNotification(`Scheduled for ${Math.round(delayMs / 60000)} min`);
      setTimeout(() => setNotification(null), 3000);
    });

    return () => {
      socket.off("chat_history");
      socket.off("subchat_list");
      socket.off("subchat_created");
      socket.off("message");
      socket.off("scheduled_confirmed");
    };
  }, [chatId, activeSubChat, myNickname, navigate]);

  function sendMessage() {
    const txt = pendingText.trim();
    if (!txt) return;
    socket.emit("send_message", {
      roomId: chatId,
      subRoom: activeSubChat,
      text: txt,
      nickname: myNickname
    });
    setPendingText("");
  }

  function scheduleMessage() {
    const txt = pendingText.trim();
    if (!txt) return;
    socket.emit("schedule_message", {
      roomId: chatId,
      subRoom: activeSubChat,
      text: txt,
      delayMs: selectedDelay,
      nickname: myNickname
    });
    setPendingText("");
    setShowSchedule(false);
  }

  function createSubChat() {
    const name = newChatName.trim();
    if (!name) return;
    socket.emit("create_subchat", { roomId: chatId, subChatName: name });
    setNewChatName("");
    setShowAddChat(false);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages]);

  return (
    <div className="flex flex-col h-screen bg-bg text-white">
      <UsernameBanner chatId={chatId} nickname={myNickname} />

      {notification && (
        <div className="bg-indigo-600 text-white text-center py-2 text-sm">
          {notification}
        </div>
      )}

      {showAddChat && (
        <div className="bg-slate-800 border-b border-slate-700 px-3 py-2 flex gap-2">
          <input
            type="text"
            placeholder="New chat name..."
            value={newChatName}
            onChange={e => setNewChatName(e.target.value)}
            className="flex-1 bg-slate-700 text-white px-3 py-1 rounded-lg text-sm outline-none border border-slate-600"
            onKeyDown={e => e.key === "Enter" && createSubChat()}
          />
          <button
            onClick={createSubChat}
            className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-sm"
          >
            Create
          </button>
          <button
            onClick={() => setShowAddChat(false)}
            className="bg-slate-700 text-gray-300 px-3 py-1 rounded-lg text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex gap-2 px-3 py-2 border-b border-slate-800 overflow-x-auto">
        {subChats.map(sub => {
          const unread = sub !== activeSubChat ? unreadCounts[sub] || 0 : 0;
          return (
            <button
              key={sub}
              onClick={() => {
                setActiveSubChat(sub);
                setUnreadCounts(prev => ({ ...prev, [sub]: 0 }));
              }}
              className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap ${
                sub === activeSubChat
                  ? "bg-indigo-600 border-indigo-400 text-white"
                  : "bg-slate-800 border-slate-700 text-gray-300"
              }`}
            >
              {sub === "default" ? "General" : sub}
              {unread > 0 && (
                <span className="ml-1 text-[0.7rem] text-indigo-300">
                  ({unread})
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setShowAddChat(!showAddChat)}
          className="px-2 py-1 text-xs rounded-full bg-slate-700 text-gray-200 border border-slate-600"
        >
          ＋
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {sortedMessages.map(m => (
          <MessageBubble
            key={m._storageKey || deriveKey(m) || m.id || m._id}
            mine={m.username === myNickname}
            username={m.username}
            text={m.text}
            ts={m.deliveredAt || m.ts}
            isScheduled={m.isScheduled}
            deliverAt={m.deliverAt}
            scheduledDelivered={Boolean(m.scheduledDelivered)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="safe-area border-t border-slate-800 bg-bg px-3 py-3">
        <div className="flex items-end gap-2 flex-wrap">
          <textarea
            className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl bg-inputBg text-white text-sm px-3 py-2 outline-none border border-slate-700 focus:border-indigo-500"
            placeholder={`Message in "${activeSubChat}"...`}
            value={pendingText}
            onChange={e => setPendingText(e.target.value)}
            onKeyDown={handleKey}
          />

          <div className="flex flex-col gap-1">
            <button
              className="bg-bubbleSelf text-white text-sm font-semibold rounded-xl px-4 py-2 border border-indigo-400/30 active:scale-95 transition"
              onClick={sendMessage}
            >
              Send
            </button>
            <button
              className="bg-slate-700 text-gray-200 text-xs rounded-xl px-3 py-1 border border-slate-600 active:scale-95"
              onClick={() => setShowSchedule(!showSchedule)}
            >
              ⏰ Schedule
            </button>
          </div>
        </div>

        {showSchedule && (
          <div className="mt-2 bg-slate-800 rounded-lg p-3 border border-slate-700">
            <div className="flex gap-2 mb-2">
              {[60000, 300000, 600000].map(ms => (
                <button
                  key={ms}
                  onClick={() => setSelectedDelay(ms)}
                  className={`px-3 py-1 text-xs rounded ${
                    selectedDelay === ms
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-700 text-gray-300"
                  }`}
                >
                  {ms / 60000} min
                </button>
              ))}
            </div>
            <button
              onClick={scheduleMessage}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold"
            >
              Schedule Message
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
