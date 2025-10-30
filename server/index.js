import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ✅ MongoDB konekcija
const mongoUri = process.env.MONGO_URI;
mongoose
  .connect(mongoUri, { dbName: "chatapp" })
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ✅ Definicije modela
const MessageSchema = new mongoose.Schema({
  roomId: String,
  subRoom: { type: String, default: "default" },
  username: String,
  text: String,
  ts: { type: Date, default: Date.now },
  isScheduled: Boolean,
  deliverAt: Date
});
const Message = mongoose.model("Message", MessageSchema);

const SubchatSchema = new mongoose.Schema({
  roomId: String,
  name: String
});
const Subchat = mongoose.model("Subchat", SubchatSchema);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ✅ SOCKET.IO
io.on("connection", socket => {
  console.log("✅ Connected:", socket.id);

  socket.on("join_room", async ({ roomId, subRoom, nickname }) => {
    socket.join(roomId);
    socket.data = { roomId, nickname };

    // učitaj istoriju i subchats
    const history = await Message.find({ roomId }).sort({ ts: 1 }).lean();
    const subchats = await Subchat.find({ roomId }).lean();

    socket.emit("chat_history", history);
    socket.emit(
      "subchat_list",
      subchats.length ? subchats.map(s => s.name) : ["default"]
    );
  });

  socket.on("create_subchat", async ({ roomId, subRoom }) => {
    const exists = await Subchat.findOne({ roomId, name: subRoom });
    if (!exists) {
      await Subchat.create({ roomId, name: subRoom });
      io.to(roomId).emit("subchat_created", subRoom);
      console.log(`🆕 Subchat "${subRoom}" created in room ${roomId}`);
    }
  });

  socket.on("send_message", async data => {
    const msg = {
      roomId: data.roomId,
      subRoom: data.subRoom || "default",
      username: data.nickname,
      text: data.text,
      ts: new Date(),
      isScheduled: false
    };
    await Message.create(msg);
    io.to(data.roomId).emit("message", msg);
  });

  socket.on(
    "schedule_message",
    async ({ roomId, subRoom, text, delayMs, nickname }) => {
      const deliverAt = new Date(Date.now() + delayMs);
      const msg = {
        roomId,
        subRoom,
        username: nickname,
        text,
        ts: new Date(),
        isScheduled: true,
        deliverAt
      };
      const saved = await Message.create(msg);
      socket.emit("scheduled_confirmed", { msg: saved, delayMs, subRoom });

      setTimeout(async () => {
        const deliverMsg = {
          ...msg,
          isScheduled: false,
          ts: new Date()
        };
        await Message.create(deliverMsg);
        io.to(roomId).emit("message", deliverMsg);
        console.log(`⏰ Delivered scheduled msg to ${roomId}/${subRoom}`);
      }, delayMs);
    }
  );

  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

// ✅ Serviraj React build
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
server.listen(PORT, () => console.log(`🚀 Server + Mongo running on ${PORT}`));
