// Loaded first so Sentry is initialised before any other module runs.
import './instrument.js';

import errorMiddleware from './middlewares/errorMiddleware.js';

import http from 'http';
import { Server } from 'socket.io';
import setupSocket from './socket.js';
import helmet from 'helmet';

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
const app = express();

// On Render we sit behind their proxy. Trust the FIRST proxy hop so rate-limit
// (and req.ip) see the real client IP instead of lumping everyone under the
// proxy's single IP. '1' = trust one hop, not a blind "trust everything".
app.set('trust proxy', 1);

import requestIdMiddleware from './middlewares/requestIdMiddleware.js';
app.use(requestIdMiddleware);

app.use(helmet());

// PROBLEM : broweser block the request from your frontend to backend
// SOLVE : Cors allows this connection , it provides the permission
// credentials:true : Allows authentication data (cookies / authorization headers) to be sent
import cors from 'cors';
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));

app.use(express.json());

// Append-only activity log: records successful mutations after the response is
// sent (reads req.user at finish-time, set by each route's authMiddleware).
import auditMiddleware from './middlewares/auditMiddleware.js';
app.use(auditMiddleware);

// Serve locally-stored case images in dev (when Supabase Storage env is absent).
// In production (Supabase) this folder is empty and the route is harmless.
import path from 'path';
import { fileURLToPath } from 'url';
const __dirnameMain = path.dirname(fileURLToPath(import.meta.url));
// Allow the frontend (a different origin in dev: Vite :5173 vs API :1000) to
// embed these images. Helmet's default Cross-Origin-Resource-Policy is
// 'same-origin', which otherwise blocks the <img> loads. In prod, images come
// from Supabase signed URLs, so this only affects locally-served uploads.
app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(path.join(__dirnameMain, 'uploads')));

app.get("/health", (req, res) => {
    res.status(200).json({ ok: true });
});



import authRoute from './routes/authRoute.js';
import patientRoute from './routes/patientRoute.js';
import appointmentRoute from './routes/appointmentRoute.js';
import sessionRoute from './routes/sessionRoute.js';
import docRoute from './routes/docRoute.js';
import historyRoute from "./routes/historyRoute.js";
import treatmentPlanRoute from './routes/treatmentPlanRoute.js';
import monthlyExpensesRoute from './routes/monthlyExpensesRoute.js';
import reportsRoute from './routes/reportsRoute.js';
import tenantRoute from './routes/tenantRoute.js';
import branchRoute from './routes/branchRoute.js';
import settingRoute from './routes/settingRoute.js';
import userRoute from './routes/userRoute.js';
import planRoute from './routes/planRoute.js';
import featureRoute from './routes/featureRoute.js';
import subscriptionRoute from './routes/subscriptionRoute.js';
import adminPlatformRoute from './routes/adminPlatformRoute.js';
import worksRoute from './routes/worksRoute.js';
import labRoute from './routes/labRoute.js';
import reminderRoute from './routes/reminderRoute.js';
import feedbackRoute from './routes/feedbackRoute.js';
import publicFeedbackRoute from './routes/publicFeedbackRoute.js';
import prescriptionRoute from './routes/prescriptionRoute.js';
import auditRoute from './routes/auditRoute.js';
import registrationRoute from './routes/registrationRoute.js';
import profileRoute from './routes/profileRoute.js';
import announcementRoute from './routes/announcementRoute.js';
const PORT = process.env.PORT || 1000;



app.use(authRoute);
app.use('/api/patients', patientRoute);
app.use('/api/appointments', appointmentRoute);
app.use('/api/sessions', sessionRoute);
app.use('/api/docs', docRoute);
app.use("/api/history", historyRoute);
app.use("/api/treatment-plans", treatmentPlanRoute);
app.use("/api/monthly-expenses", monthlyExpensesRoute);
app.use("/api/reports", reportsRoute);
app.use("/api/tenants", tenantRoute);
app.use("/api/branches", branchRoute);
app.use("/api/settings", settingRoute);
app.use('/api/users', userRoute)
app.use('/api/plans', planRoute)
app.use('/api/features', featureRoute)
app.use('/api/subscriptions', subscriptionRoute)
app.use('/api/admin-platform', adminPlatformRoute)
app.use('/api/works', worksRoute)
app.use('/api/labs', labRoute)
app.use('/api/reminders', reminderRoute)
app.use('/api/feedbacks', feedbackRoute)
app.use('/api/public/feedback', publicFeedbackRoute)
app.use('/api/prescriptions', prescriptionRoute)
app.use('/api/audit', auditRoute)
app.use('/api/register', registrationRoute)
app.use('/api/profile', profileRoute)
app.use('/api/announcements', announcementRoute)

app.use((req, res) => {
    res.status(404).json({ message: "Route not found", code: "ROUTE_NOT_FOUND", support_code: req.requestId || 'N/A' });
});

app.use(errorMiddleware)


const server = http.createServer(app);

export const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN,
        credentials: true
    }
});

setupSocket(io);

// In tests we import `app` into Supertest directly and never open a real port,
// so only start listening when NOT running tests.
if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => {
        console.log(`Server Runing on Port ${PORT}`);
    });
}

// Exported so Supertest (and any tooling) can use the app without a live server.
export default app;