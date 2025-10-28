const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"]
  })
);

app.get("/", (req, res) => {
  res.send("Chat server is running ✅");
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// room structure
const messages = {};
const participants = {}; // roomId -> [socket.id list]

io.on("connection", socket => {
  console.log("💚 Connected:", socket.id);

  socket.on("join_room", ({ roomId, subRoom, nickname }) => {
    if (!roomId || !subRoom) return;

    socket.join(roomId);

    // track participants
    if (!participants[roomId]) participants[roomId] = [];
    if (!participants[roomId].includes(socket.id)) {
      participants[roomId].push(socket.id);
    }

    // assign role
    let role = "receiver";
    if (participants[roomId].length === 1) role = "sender";

    socket.data.role = role;
    socket.data.nickname = nickname || `User${Math.floor(Math.random() * 1000)}`;

    // init messages
    if (!messages[roomId]) messages[roomId] = { default: [] };
    if (!messages[roomId][subRoom]) messages[roomId][subRoom] = [];

    socket.emit("chat_role", { role, nickname: socket.data.nickname });
    socket.emit("chat_history", messages[roomId][subRoom]);
    socket.emit("subchat_list", Object.keys(messages[roomId]));
  });

  socket.on("send_message", ({ roomId, subRoom, text }) => {
    if (!roomId || !subRoom || !text) return;

    const msg = {
      id: `${socket.id}-${Date.now()}`,
      username: socket.data.nickname,
      text: text.trim(),
      ts: Date.now()
    };

    if (!messages[roomId]) messages[roomId] = { default: [] };
    if (!messages[roomId][subRoom]) messages[roomId][subRoom] = [];

    messages[roomId][subRoom].push(msg);
    io.to(roomId).emit("message", { ...msg, subRoom });
  });

  socket.on("schedule_message", ({ roomId, subRoom, text, delayMs }) => {
    if (!roomId || !subRoom || !text) return;
    if (typeof delayMs !== "number") return;

    if (delayMs > 21600000) delayMs = 21600000;

    const now = Date.now();
    const msg = {
      id: `${socket.id}-${now}`,
      username: socket.data.nickname,
      text: text.trim(),
      ts: now + delayMs,
      scheduled: true
    };

    if (!messages[roomId]) messages[roomId] = { default: [] };
    if (!messages[roomId][subRoom]) messages[roomId][subRoom] = [];

    messages[roomId][subRoom].push(msg);

    socket.emit("scheduled_confirmed", { msg, delayMs, subRoom });

    setTimeout(() => {
      const finalMsg = { ...msg, scheduled: false, ts: Date.now() };
      messages[roomId][subRoom].push(finalMsg);
      io.to(roomId).emit("message", { ...finalMsg, subRoom });
    }, delayMs);
  });

  socket.on("create_subchat", ({ roomId, subRoom }) => {
    if (!roomId || !subRoom) return;
    if (!messages[roomId]) messages[roomId] = { default: [] };
    if (!messages[roomId][subRoom]) messages[roomId][subRoom] = [];
    io.to(roomId).emit("subchat_created", subRoom);
  });

  socket.on("disconnect", () => {
    for (const roomId in participants) {
      participants[roomId] = participants[roomId].filter(id => id !== socket.id);
      if (participants[roomId].length === 0) delete participants[roomId];
    }
    console.log("💔 Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
