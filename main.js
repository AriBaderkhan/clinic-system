import errorMiddleware from './middlewares/errorMiddleware.js';

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
const app = express();

import requestIdMiddleware from './middlewares/requestIdMiddleware.js';
app.use(requestIdMiddleware);


// PROBLEM : broweser block the request from your frontend to backend
// SOLVE : Cors allows this connection , it provides the permission
// credentials:true : Allows authentication data (cookies / authorization headers) to be sent
import cors from 'cors';
app.use(cors({  
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));

app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});



import authRoute from './routes/authRoute.js';
import patientRoute from './routes/patientRoute.js';
import appointmentRoute from './routes/appointmentRoute.js';
import sessionRoute from './routes/sessionRoute.js';
import docRoute from './routes/docRoute.js';
import workRoute from "./routes/workRoute.js";
import historyRoute from "./routes/historyRoute.js";
import treatmentPlanRoute from './routes/treatmentPlanRoute.js';
import monthlyExpensesRoute from './routes/monthlyExpensesRoute.js';
import reportsRoute from './routes/reportsRoute.js';

const PORT = process.env.PORT || 1000;



app.use(authRoute);
app.use('/api/patients', patientRoute);
app.use('/api/appointments', appointmentRoute);
app.use('/api/sessions', sessionRoute);
app.use('/api/docs', docRoute);
app.use("/api/work-catalog", workRoute);
app.use("/api/history", historyRoute);
app.use("/api/treatment-plans", treatmentPlanRoute);
app.use("/api/monthly-expenses", monthlyExpensesRoute);
app.use("/api/reports", reportsRoute);


app.use((req, res) => {
    res.status(404).json({ message: "Route not found", code: "ROUTE_NOT_FOUND", support_code: req.requestId || 'N/A' });
});

app.use(errorMiddleware)


app.listen(PORT, () => {
    console.log(`Server Runing on Port ${PORT}`);
});