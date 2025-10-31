import dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

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
  deliverAt: Date,
  scheduledSourceId: { type: String, default: null }
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
  
socket.on("client_refresh", data => {
  console.log(`♻️ Client triggered auto-refresh: ${socket.id}`, data);
});
  // --- JOIN ROOM ---
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

  // --- CREATE SUBCHAT ---
  socket.on("create_subchat", async ({ roomId, subRoom }) => {
    const exists = await Subchat.findOne({ roomId, name: subRoom });
    if (!exists) {
      await Subchat.create({ roomId, name: subRoom });
      io.to(roomId).emit("subchat_created", subRoom);
      console.log(`🆕 Subchat "${subRoom}" created in room ${roomId}`);
    }
  });

  // --- SEND MESSAGE (odmah) ---
  socket.on("send_message", async data => {
    const msg = {
      roomId: data.roomId,
      subRoom: data.subRoom || "default",
      username: data.nickname,
      text: data.text,
      ts: new Date(),
      isScheduled: false
    };
    const saved = await Message.create(msg);
    io.to(data.roomId).emit("message", saved.toObject());
  });

  // --- SCHEDULE MESSAGE (FIXED - bez duplikata) ---
  socket.on(
    "schedule_message",
    async ({ roomId, subRoom, text, delayMs, nickname }) => {
      const deliverAt = new Date(Date.now() + delayMs);

      // 🟣 1️⃣ Kreiramo JEDNU poruku koja će biti scheduled
      const scheduled = await Message.create({
        roomId,
        subRoom,
        username: nickname,
        text,
        ts: new Date(),
        isScheduled: true,
        deliverAt,
        scheduledSourceId: null // biće popunjen posle
      });

      // ✅ Postavi scheduledSourceId na sopstveni _id
      scheduled.scheduledSourceId = scheduled._id.toString();
      await scheduled.save();

      // ✅ Pošalji samo senderu da prikaže scheduled poruku sa ⏰
      socket.emit("scheduled_confirmed", {
        msg: scheduled.toObject(),
        delayMs,
        subRoom
      });
      console.log("📤 Emitted scheduled_confirmed to sender:", socket.id);

      // 🟢 2️⃣ Nakon isteka delay-a – UPDATE postojeću poruku
      setTimeout(async () => {
        // Pronađi scheduled poruku i update-uj je
        const updated = await Message.findByIdAndUpdate(
          scheduled._id,
          {
            isScheduled: false,
            ts: new Date(), // vreme dostave
            scheduledDelivered: true
          },
          { new: true }
        );

        if (updated) {
          // ✅ Emituj svima (uključujući pošiljaoca)
          io.to(roomId).emit("message", updated.toObject());
          console.log(`⏰ Delivered scheduled msg to ${roomId}/${subRoom}`);
        }
      }, delayMs);
    }
  );

  // --- DISCONNECT ---
  socket.on("disconnect", () => console.log("❌ Disconnected:", socket.id));
});

// ✅ Serviraj React build
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
server.listen(PORT, () =>
  console.log(`🚀 Server + Mongo running on ${PORT}`)
);