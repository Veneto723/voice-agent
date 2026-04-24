import express from "express";
import dotenv from 'dotenv';
import externalRoutes from './routes/external.js';
import http from 'http';

// Load environment variables from .env file
dotenv.config();


const app = express();
const port = Number(process.env.PORT) || 3000;
const server = http.createServer(app);

// Twilio sends webhook params as application/x-www-form-urlencoded by default
app.use(express.urlencoded({ extended: false }));

app.use('/', externalRoutes);

// Bind explicitly for PaaS (Render, etc.) so the service accepts external connections
server.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});
