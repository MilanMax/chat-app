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
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const roomSubchats = {};
const messageHistory = {};

// 🧩 SOCKET IO
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
    socket.emit("scheduled_confirmed", { msg, delayMs, subRoom });
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
    }, delayMs);
  });

  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

// 🧩 FRONTEND BUILD SERVING
import fs from "fs";
const clientPath = path.join(__dirname, "../client-dist");
if (fs.existsSync(clientPath)) {
  app.use(express.static(clientPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientPath, "index.html"));
  });
} else {
  app.get("/", (req, res) =>
    res.send("⚠️ Frontend not found (client-dist missing).")
  );
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server + Frontend running on ${PORT}`));
