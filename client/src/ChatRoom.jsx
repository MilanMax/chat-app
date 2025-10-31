import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "./socket.js";
import MessageBubble from "./MessageBubble.jsx";
import UsernameBanner from "./UsernameBanner.jsx";

// ✅ KLJUČNA PROMENA: Koristimo scheduledSourceId kao primarni key
const deriveKey = msg => {
  if (!msg) return null;
  
  // Ako poruka ima scheduledSourceId, to je njen key
  if (msg.scheduledSourceId) {
    return msg.scheduledSourceId;
  }
  
  // Ako poruka ima _id (iz baze), koristi ga
  if (msg._id) {
    return msg._id.toString();
  }
  
  // Fallback za poruke bez ID-a
  return (
    msg._storageKey ||
    msg.id ||
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
  if (!key) {
    return collection;
  }

  const previous = collection[key] || {};

  // 🔍 Ako stigne poruka sa istim scheduledSourceId → to je delivered verzija ranije scheduled poruke
  if (incoming.scheduledSourceId && collection[incoming.scheduledSourceId]) {
    const updatedScheduled = {
      ...collection[incoming.scheduledSourceId],
      scheduledDelivered: true,
    };
    return {
      ...collection,
      [incoming.scheduledSourceId]: updatedScheduled, // označi staru (⏰) kao delivered
      [key]: { ...incoming, isScheduled: false }, // nova poruka bez ⏰
    };
  }

  // 🔍 Ako je poruka scheduled ili ima deliverAt
  const hasScheduledContext = Boolean(
    incoming.deliverAt || previous.deliverAt || incoming.isScheduled
  );
  const isScheduledFlag =
    incoming.isScheduled || previous.isScheduled || hasScheduledContext;

  // 🔧 Standardno merge-ovanje (za sve ostale poruke)
  return {
    ...collection,
    [key]: {
      ...previous,
      ...incoming,
      isScheduled: isScheduledFlag,
      _storageKey: key,
    },
  };
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

    // ✅ Primanje poruka - handluje i obične i delivered scheduled poruke
    socket.on("message", msg => {
      // Ako poruka dolazi od mene i nije delivered scheduled, ignoriši
      // (već sam je video kad sam je poslao)
      if (msg.username === myNickname && !msg.scheduledDelivered) {
        return;
      }

      // Proveri da li treba dodati unread count
      if (msg.subRoom !== activeSubChat) {
        setUnreadCounts(prev => ({
          ...prev,
          [msg.subRoom]: (prev[msg.subRoom] || 0) + 1
        }));
      }

      upsertMessage(msg);

      // ✅ REFRESH nakon što scheduled poruka stigne
      if (msg.scheduledSourceId && msg.scheduledDelivered) {
        console.log("♻️ Auto-refreshing after scheduled delivery...");
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    });

    // ✅ Scheduled potvrda - samo za sendera
    socket.on("scheduled_confirmed", ({ msg, delayMs, subRoom }) => {
      if (subRoom !== activeSubChat) return;

      const enriched = {
        ...msg,
        isScheduled: true,
        scheduledDelivered: false,
        _storageKey: deriveKey(msg)
      };

      setMessagesById(prev => mergeMessage(prev, enriched));

      setNotification(`Scheduled for ${Math.round(delayMs / 60000)} min`);
      setTimeout(() => setNotification(null), 3000);

      console.log("📩 scheduled_confirmed:", enriched);
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
    
    // Optimistično dodaj poruku odmah
    const tempMsg = {
      tempId: Date.now().toString(),
      roomId: chatId,
      subRoom: activeSubChat,
      username: myNickname,
      text: txt,
      ts: new Date(),
      isScheduled: false
    };
    
    setMessagesById(prev => mergeMessage(prev, tempMsg));
    
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

  useEffect(() => {
  const hasPending = Object.values(messagesById).some(
    m => m.isScheduled && !m.scheduledDelivered
  );
  if (!hasPending) return;

  const id = setInterval(() => {
    if (document.visibilityState === "visible") {
      console.log("♻️ Sending refresh log to server...");

      // 📡 ping server pre reload-a
      fetch("/api/refresh-log", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          setTimeout(() => {
            window.location.reload();
          }, 300);
        });
    }
  }, 2000);

  return () => clearInterval(id);
}, [messagesById]);

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