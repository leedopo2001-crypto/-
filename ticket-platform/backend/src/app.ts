import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import ticketsRouter from './routes/tickets.js';
import qrRouter from './routes/qr.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ticket-platform-backend' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/qr', qrRouter);

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
});
