import { worker } from "../worker.js";


export function createRouter() {
return worker.createRouter({
mediaCodecs: [
{
kind: "audio",
mimeType: "audio/opus",
clockRate: 48000,
channels: 2
},
{
kind: "video",
mimeType: "video/VP8",
clockRate: 90000
}
]
});
}