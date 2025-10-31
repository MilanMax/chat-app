import { io } from "socket.io-client";

export const socket = io("http://localhost:10000", {
  transports: ["websocket"],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});