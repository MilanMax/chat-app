import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.static(path.join(__dirname, "client", "dist")));

const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const messages = {};
io.on("connection", socket => {
  console.log("Connected:", socket.id);

  socket.on("join_room", ({ roomId, subRoom, nickname }) => {
    socket.join(roomId);
    if (!messages[roomId]) messages[roomId] = { default: [] };
    if (!messages[roomId][subRoom]) messages[roomId][subRoom] = [];
    socket.emit("chat_history", messages[roomId][subRoom]);
  });

  socket.on("send_message", ({ roomId, subRoom, text, nickname }) => {
    const msg = {
      id: `${socket.id}-${Date.now()}`,
      username: nickname,
      text,
      ts: Date.now(),
      subRoom
    };
    if (!messages[roomId]) messages[roomId] = { default: [] };
    if (!messages[roomId][subRoom]) messages[roomId][subRoom] = [];
    messages[roomId][subRoom].push(msg);
    io.to(roomId).emit("message", msg);
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));
