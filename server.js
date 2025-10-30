import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const roomSubchats = {};
const messageHistory = {};

// 🧩 SOCKET IO LOGIKA
io.on("connection", socket => {
  console.log("✅ Connected:", socket.id);

  socket.on("join_room", ({ roomId, subRoom, nickname }) => {
    socket.join(roomId);
    socket.data = { roomId, nickname };

    if (!roomSubchats[roomId]) roomSubchats[roomId] = ["default"];
    if (!messageHistory[roomId]) messageHistory[roomId] = [];

    socket.emit("chat_history", messageHistory[roomId]);
    socket.emit("subchat_list", roomSubchats[roomId]);
  });

  socket.on("create_subchat", ({ roomId, subRoom }) => {
    if (!roomSubchats[roomId]) roomSubchats[roomId] = ["default"];
    if (!roomSubchats[roomId].includes(subRoom)) {
      roomSubchats[roomId].push(subRoom);
      io.to(roomId).emit("subchat_created", subRoom);
    }
  });

  socket.on("send_message", data => {
    const msg = {
      id: Date.now(),
      username: data.nickname,
      text: data.text,
      subRoom: data.subRoom || "default",
      ts: new Date().toISOString()
    };
    if (!messageHistory[data.roomId]) messageHistory[data.roomId] = [];
    messageHistory[data.roomId].push(msg);
    io.to(data.roomId).emit("message", msg);
  });

  // 🕐 Zakazivanje poruke (sa ispravljenim duplikatom)
  socket.on("schedule_message", ({ roomId, subRoom, text, delayMs, nickname }) => {
    const scheduleId = Date.now();
    const msg = {
      id: scheduleId,
      username: nickname,
      text,
      subRoom,
      ts: new Date().toISOString(),
      isScheduled: true,
      deliverAt: Date.now() + delayMs
    };

    // ✅ Pošalji potvrdu samo senderu da prikaže "🕐"
    socket.emit("scheduled_confirmed", { msg, delayMs, subRoom });

    // ⏱ Kad istekne vreme, pošalji svima osim senderu
   setTimeout(() => {
  const deliverMsg = {
    ...msg,
    isScheduled: false,
    // ⚠️ NE menja se ID — koristi isti scheduleId
    ts: new Date().toISOString()
  };

  if (!messageHistory[roomId]) messageHistory[roomId] = [];
  messageHistory[roomId].push(deliverMsg);

  socket.to(roomId).emit("message", deliverMsg);
  socket.emit("message_delivered", deliverMsg);
}, delayMs);

  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

// 🧩 SERVE FRONTEND BUILD
const clientPath = path.join(__dirname, "../client/dist");
app.use(express.static(clientPath));

// fallback za React Router (sve nepoznate rute vraćaju index.html)
app.get("*", (req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server + Frontend running on ${PORT}`));
