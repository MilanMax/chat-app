import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

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

const roomSubchats = {};      // { roomId: ["default","food",...]}
const messageHistory = {};    // { roomId: [ {msg}, {msg} ] }

io.on("connection", socket => {
  console.log("✅ Connected:", socket.id);

  socket.on("join_room", ({ roomId, subRoom, nickname }) => {
    socket.join(roomId);
    socket.data = { roomId, nickname };

    if (!roomSubchats[roomId]) roomSubchats[roomId] = ["default"];
    if (!messageHistory[roomId]) messageHistory[roomId] = [];

    socket.emit("chat_history", messageHistory[roomId]);
    socket.emit("subchat_list", roomSubchats[roomId]);
    console.log(`${nickname} joined room ${roomId}`);
  });

  socket.on("create_subchat", ({ roomId, subRoom }) => {
    if (!roomSubchats[roomId]) roomSubchats[roomId] = ["default"];
    if (!roomSubchats[roomId].includes(subRoom)) {
      roomSubchats[roomId].push(subRoom);
      io.to(roomId).emit("subchat_created", subRoom);
      console.log(`🆕 Subchat "${subRoom}" created in room ${roomId}`);
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
    console.log(`💬 Message ${data.text} in ${data.roomId}/${data.subRoom}`);
  });

  // ⏰ SCHEDULED MESSAGE
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

    // pošiljaocu odmah pošaljemo potvrdu
    socket.emit("scheduled_confirmed", { msg, delayMs, subRoom });

    // i posle delay-a pošaljemo svima pravu poruku
    setTimeout(() => {
      const deliverMsg = {
        ...msg,
        isScheduled: false,
        id: Date.now(),
        ts: new Date().toISOString()
      };
      if (!messageHistory[roomId]) messageHistory[roomId] = [];
      messageHistory[roomId].push(deliverMsg);
      io.to(roomId).emit("message", deliverMsg);
      console.log(`⏰ Delivered scheduled msg to ${roomId}/${subRoom}`);
    }, delayMs);
  });

  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

app.get("/", (req, res) => res.send("Chat server is running ✅"));
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
