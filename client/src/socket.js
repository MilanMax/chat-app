import { io } from "socket.io-client";

const URL =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : window.location.origin;

export const socket = io(URL);
