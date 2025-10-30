import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "./socket.js";
import MessageBubble from "./MessageBubble.jsx";
import UsernameBanner from "./UsernameBanner.jsx";

export default function ChatRoom() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const myNickname = localStorage.getItem(`nickname_${chatId}`) || "Guest";

  // poruke po ID-u — pending i delivered dele isti ključ
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

  // socket events
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
      const map = {};
      for (const m of history || []) map[m.id] = m;
      setMessagesById(map);
    });

    socket.on("subchat_list", list => {
      if (Array.isArray(list) && list.length > 0)
        setSubChats(prev => [...new Set([...prev, ...list])]);
    });

    socket.on("subchat_created", name => {
      setSubChats(prev => (prev.includes(name) ? prev : [...prev, name]));
    });

    // 💬 normalne poruke od drugih (ignoriši moje)
    socket.on("message", msg => {
      if (msg.senderId === socket.id) return; // ✅ IGNORIŠI SVOJE

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

    // 🕐 pending
    socket.on("scheduled_confirmed", ({ msg, delayMs, subRoom }) => {
      if (subRoom !== activeSubChat) return;
      setMessagesById(prev => ({ ...prev, [msg.id]: msg }));
      setNotification(`Scheduled for ${Math.round(delayMs / 60000)} min`);
      setTimeout(() => setNotification(null), 3000);
    });

    // ✅ zamenjuje pending jednom realnom porukom
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

  function handleKey(e)
