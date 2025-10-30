import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "./socket.js";
import MessageBubble from "./MessageBubble.jsx";
import UsernameBanner from "./UsernameBanner.jsx";

export default function ChatRoom() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const myNickname = localStorage.getItem(`nickname_${chatId}`) || "Guest";

  // 👉 Držimo poruke kao MAPU po ID-u, da se pending i delivered NIKAD ne dupliraju
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

  // Helper – dobij listu poruka filtriranih i sortiranih
  const sortedMessages = Object.values(messagesById)
    .filter(m => m.subRoom === activeSubChat)
    .sort((a, b) => new Date((a.deliveredAt || a.ts)) - new Date((b.deliveredAt || b.ts)));

  // Load saved state (subchats, active tab, draft)
  useEffect(() => {
    const saved = localStorage.getItem(`chat_state_${chatId}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (Array.isArray(data.subChats)) setSubChats(data.subChats);
        if (data.activeSubChat) setActiveSubChat(data.activeSubChat);
        if (data.pendingText) setPendingText(data.pendingText);
      } catch {}
    }
  }, [chatId]);

  useEffect(() => {
    localStorage.setItem(
      `chat_state_${chatId}`,
      JSON.stringify({ subChats, activeSubChat, pendingText })
    );
  }, [subChats, activeSubChat, pendingText, chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages.length]);

  // SOCKET EVENTS
  useEffect(() => {
    if (!chatId) {
      const id = Math.random().toString(36).substring(2, 8);
      navigate(`/chat/${id}`, { replace: true });
      return;
    }

    socket.emit("join_room", {
      roomId: chatId,
      subRoom: activeSubChat,
      nickname: myNickname
    });

    socket.on("chat_history", history => {
      // server šalje samo delivered poruke — pretvori u mapu
      const map = {};
      for (const m of history || []) map[m.id] = m;
      setMessagesById(map);
    });

    socket.on("subchat_list", list => {
      if (Array.isArray(list) && list.length > 0) {
        setSubChats(prev => [...new Set([...prev, ...list])]);
      }
    });

    socket.on("subchat_created", name => {
      setSubChats(prev => (prev.includes(name) ? prev : [...prev, name]));
    });

    // 1) normalne poruke od drugih
    socket.on("message", msg => {
      // ako je poruka "moje" korisničko ime na ovoj strani, ignoriši — sender dobija message_delivered
      if (msg.username === myNickname) return;

      if (msg.subRoom !== activeSubChat) {
        setUnreadCounts(prev => ({
          ...prev,
          [msg.subRoom]: (prev[msg.subRoom] || 0) + 1
        }));
      }

      setMessagesById(prev => ({
        ...prev,
        [msg.id]: { ...(prev[msg.id] || {}), ...msg, isScheduled: false }
      }));
    });

    // 2) pending potvrda samo za sender-a
    socket.on("scheduled_confirmed", ({ msg, delayMs, subRoom }) => {
      if (subRoom !== activeSubChat) return;
      setMessagesById(prev => ({ ...prev, [msg.id]: msg })); // pending poruka
      setNotification(`Scheduled for ${Math.round(delayMs / 60000)} min`);
      setTimeout(() => setNotification(null), 3000);
    });

    // 3) kada isporuka stigne — ZAMENJUJEMO pending po ID-u
    socket.on("message_delivered", msg => {
      setMessagesById(prev => ({
        ...prev,
        [msg.id]: { ...(prev[msg.id] || {}), ...msg, isScheduled: false }
      }));
    });

    return () => {
      socket.off("chat_history");
      socket.off("subchat_list");
      socket.off("subchat_created");
      socket.off("message");
      socket.off("scheduled_confirmed");
      socket.off("message_delivered");
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

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function addNewChat() {
    const clean = newChatName.trim();
    if (!clean || subChats.includes(clean)) return;
    setSubChats(prev => [...prev, clean]);
    setActiveSubChat(clean);
    setShowAddChat(false);
    setNewChatName("");
    socket.emit("create_subchat", { roomId: chatId, subRoom: clean });
  }

  return (
    <div className="flex flex-col h-full bg-bg text-white">
      {/* HEADER */}
      <div className="px-4 pt-4 pb-2 border-b border-slate-800 bg-bg flex justify-between items-center">
        <div>
          <div className="text-center font-semibold text-gray-100 text-sm">
            Private Chat Room
          </div>
          <div className="text-center text-[0.7rem] text-slate-500">Share this link:</div>
          <div className="text-center text-xs text-indigo-400 mt-1 break-all">
            {window.location.href}
          </div>
        </div>
        <button
          onClick={() => {
            const id = Math.random().toString(36).substring(2, 8);
            navigate(`/chat/${id}`);
          }}
          className="text-xs bg-indigo-600 px-2 py-1 rounded-md border border-indigo-400 hover:bg-indigo-500 transition"
        >
          + New Chat
        </button>
      </div>

      <UsernameBanner username={myNickname} />

      {/* SUBCHATS */}
      <div className="flex gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 overflow-x-auto">
        {subChats.map(sub => {
          const unread = unreadCounts[sub] || 0;
          return (
            <button
              key={sub}
              onClick={() => {
                setActiveSubChat(sub);
                setUnreadCounts(prev => ({ ...prev, [sub]: 0 }));
              }}
              className={`px-3 py-1 text-xs rounded-full border relative ${
                sub === activeSubChat
                  ? "bg-indigo-600 border-indigo-400 text-white"
                  : "bg-slate-800 border-slate-700 text-gray-300"
              }`}
            >
              {sub === "default" ? "General" : sub}
              {unread > 0 && <span className="ml-1 text-[0.7rem] text-indigo-300">({unread})</span>}
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

      {showAddChat && (
        <div className="px-3 py-2 bg-slate-800 border-b border-slate-700 flex gap-2">
          <input
            className="flex-1 bg-slate-700 rounded-lg px-2 py-1 text-xs text-white border border-slate-600 outline-none"
            placeholder="New chat name..."
            value={newChatName}
            onChange={e => setNewChatName(e.target.value)}
          />
          <button className="bg-indigo-600 text-xs px-3 rounded-lg" onClick={addNewChat}>
            Add
          </button>
        </div>
      )}

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {sortedMessages.map(m => (
          <MessageBubble
            key={m.id} // STABILAN ključ: nema duplikata
            mine={m.username === myNickname}
            username={m.username}
            text={m.text}
            // prikazuj realno vreme kad postoji, inače vreme zakazivanja
            ts={m.deliveredAt || m.ts}
            isScheduled={m.isScheduled}
            deliverAt={m.deliverAt}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* INPUT */}
      <div className="safe-area border-t border-slate-800 bg-bg px-3 py-3">
        <div className="flex items-end gap-2 flex-wrap">
          <textarea
            className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl bg-inputBg text-white text-sm leading-relaxed px-3 py-2 outline-none border border-slate-700 focus:border-indigo-500"
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
              Send later
            </button>
          </div>
        </div>

        {showSchedule && (
          <div className="mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-gray-200">
            <div className="mb-2 font-semibold text-indigo-400">Send after:</div>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 5, 10, 30, 60, 180, 360].map(min => (
                <button
                  key={min}
                  className={`px-3 py-1 rounded-lg border ${
                    selectedDelay === min * 60000
                      ? "bg-indigo-500 border-indigo-300"
                      : "bg-slate-700 border-slate-600"
                  }`}
                  onClick={() => setSelectedDelay(min * 60000)}
                >
                  {min >= 60 ? `${min / 60}h` : `${min}m`}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button className="bg-indigo-600 px-4 py-1 rounded-lg text-sm font-semibold" onClick={scheduleMessage}>
                Confirm
              </button>
            </div>
          </div>
        )}

        {notification && <div className="text-center text-xs text-green-400 mt-2">{notification}</div>}
      </div>
    </div>
  );
}
