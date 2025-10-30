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
const messageHistory = {}; // roomId -> [delivered messages only]

// 🧩 SOCKET IO LOGIKA
io.on("connection", socket => {
  console.log("✅ Connected:", socket.id);

  // --- JOIN ROOM ---
  socket.on("join_room", ({ roomId, subRoom, nickname }) => {
    socket.join(roomId);
    socket.data = { roomId, nickname };

    if (!roomSubchats[roomId]) roomSubchats[roomId] = ["default"];
    if (!messageHistory[roomId]) messageHistory[roomId] = [];

    // šaljemo samo isporučene poruke
    socket.emit("chat_history", messageHistory[roomId]);
    socket.emit("subchat_list", roomSubchats[roomId]);
  });

  // --- CREATE SUBCHAT ---
  socket.on("create_subchat", ({ roomId, subRoom }) => {
    if (!roomSubchats[roomId]) roomSubchats[roomId] = ["default"];
    if (!roomSubchats[roomId].includes(subRoom)) {
      roomSubchats[roomId].push(subRoom);
      io.to(roomId).emit("subchat_created", subRoom);
    }
  });

  // --- SEND MESSAGE (odmah) ---
  socket.on("send_message", data => {
    const msg = {
      id: Date.now(),
      username: data.nickname,
      text: data.text,
      subRoom: data.subRoom || "default",
      ts: new Date().toISOString(),
      isScheduled: false,
      senderId: socket.id
    };

    if (!messageHistory[data.roomId]) messageHistory[data.roomId] = [];
    messageHistory[data.roomId].push(msg);

    // ✅ Pošalji svima osim senderu
    socket.to(data.roomId).emit("message", msg);

    // ✅ Samo senderu pošalji potvrdu da zameni svoju poruku
    socket.emit("message_delivered", msg);
  });

  // --- SCHEDULE MESSAGE ---
  socket.on("schedule_message", ({ roomId, subRoom, text, delayMs, nickname }) => {
    const scheduleId = Date.now();
    const msg = {
      id: scheduleId,
      username: nickname,
      text,
      subRoom,
      ts: new Date().toISOString(),
      deliverAt: Date.now() + delayMs,
      isScheduled: true,
      senderId: socket.id
    };

    // 📩 Sender vidi pending odmah
    socket.emit("scheduled_confirmed", { msg, delayMs, subRoom });

    // ⏱ Kada istekne vreme — pošalji svima osim senderu, a njemu zamenu
    setTimeout(() => {
      const deliverMsg = {
        ...msg,
        isScheduled: false,
        deliveredAt: new Date().toISOString()
      };

      if (!messageHistory[roomId]) messageHistory[roomId] = [];
      messageHistory[roomId].push(deliverMsg);

      // ✅ Svima osim senderu
      socket.to(roomId).emit("message", deliverMsg);

      // ✅ Samo senderu
      socket.emit("message_delivered", deliverMsg);
    }, delayMs);
  });

  // --- DISCONNECT ---
  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

// 🧩 SERVE FRONTEND BUILD
const clientPath = path.join(__dirname, "../client/dist");
app.use(express.static(clientPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server + Frontend running on ${PORT}`));
