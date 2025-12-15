const { io } = require("socket.io-client");

const socket = io("http://localhost:3001", {
  reconnectionAttempts: 5,
  timeout: 5000,
  transports: ["websocket", "polling"]
});

socket.on("connect", () => console.log("Connected"));
socket.on("connect_error", (err) => console.error("Connect Error:", err.message));
socket.on("disconnect", () => console.log("Disconnected"));
