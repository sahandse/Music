import express from 'express';
import cors from 'cors';
import { config } from './config';
import subsonicRoutes from './subsonic/routes';
import './db/database';

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/rest', subsonicRoutes);

app.get('/', (_req, res) => {
  res.type('text').send(`${config.serverName} is running. Connect any Subsonic-compatible client to /rest`);
});

app.listen(config.port, () => {
  console.log(`${config.serverName} listening on port ${config.port}`);
  console.log(`Subsonic API base URL: http://localhost:${config.port}/rest`);
});
