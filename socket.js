import jwt from 'jsonwebtoken';

export default function setupSocket(io) {
    io.on("connection", (socket) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) return socket.disconnect(true);

            const payload = jwt.verify(token, process.env.JWT_SECRET);

            socket.user = {
                id: payload.id,
                role: payload.role,
            }

            // Personal room so we can push a notification to this exact user
            // (e.g. the doctor of a checked-in patient).
            socket.join(`user_${payload.id}`);

            if (socket.user.role === "reception") {
                socket.join("reception_room");
            }

        } catch (error) {
            socket.disconnect(true);
        }
    })
}