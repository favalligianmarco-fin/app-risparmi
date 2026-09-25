// Esegue uno script TypeScript passando da Vite (nessun build necessario).
import { createServer } from 'vite';
const [, , file, ...args] = process.argv;
process.argv = [process.argv[0], file, ...args];
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  await server.ssrLoadModule(file);
} finally {
  await server.close();
}
