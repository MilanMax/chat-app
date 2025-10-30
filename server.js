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

// SOCKET IO
io.on("connection", socket => {
  console.log("✅ Connected:", socket.id);

  socket.on("join_room", ({ roomId, subRoom, nickname }) => {
    socket.join(roomId);
    socket.data = { roomId, nickname };

    if (!roomSubchats[roomId]) roomSubchats[roomId] = ["default"];
    if (!messageHistory[roomId]) messageHistory[roomId] = [];

    // šaljemo SAMO isporučene poruke (nema pending-a u istoriji)
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
      id: Date.now(),                         // jedinstven ID
      username: data.nickname,
      text: data.text,
      subRoom: data.subRoom || "default",
      ts: new Date().toISOString(),           // vreme nastanka
      isScheduled: false
    };
    if (!messageHistory[data.roomId]) messageHistory[data.roomId] = [];
    messageHistory[data.roomId].push(msg);
    io.to(data.roomId).emit("message", msg);
  });

  // Zakazivanje
  socket.on("schedule_message", ({ roomId, subRoom, text, delayMs, nickname }) => {
    const scheduleId = Date.now();            // stabilan ID za pending + delivered
    const msg = {
      id: scheduleId,
      username: nickname,
      text,
      subRoom,
      ts: new Date().toISOString(),           // vreme KADA JE ZAKAŽENO (OSTAJE ISTO)
      deliverAt: Date.now() + delayMs,        // planirano vreme
      isScheduled: true
    };

    // 1) samo sender vidi pending odmah
    socket.emit("scheduled_confirmed", { msg, delayMs, subRoom });

    // 2) isporuka kad istekne vreme
    setTimeout(() => {
      const deliverMsg = {
        ...msg,
        isScheduled: false,
        deliveredAt: new Date().toISOString() // pravo vreme slanja (novo polje)
        // id i ts ostaju IDENTIČNI -> frontend će zameniti pending
      };

      if (!messageHistory[roomId]) messageHistory[roomId] = [];
      messageHistory[roomId].push(deliverMsg);

      // recipienti dobijaju realnu poruku
      socket.to(roomId).emit("message", deliverMsg);
      // sender dobija signal da zameni pending
      socket.emit("message_delivered", deliverMsg);
    }, delayMs);
  });

  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

// SERVE FRONTEND BUILD
const clientPath = path.join(__dirname, "../client/dist");
app.use(express.static(clientPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server + Frontend running on ${PORT}`));
