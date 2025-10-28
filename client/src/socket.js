import { io } from "socket.io-client";

// LOCAL DEV:
//   backend: http://localhost:4000
// DEPLOY (Render example):
//   backend: https://your-backend.onrender.com
//
// 👇 Za sada hardcode local dev. Kad deployujes backend na Render,
// samo zameni URL.
export const socket = io("http://localhost:4000", {
  autoConnect: true
});
