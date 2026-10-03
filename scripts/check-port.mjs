import net from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkPort(port = 5173) {
  return new Promise((resolveCheck, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolveCheck));
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  checkPort().catch(error => {
    console.error(error.code === 'EADDRINUSE'
      ? 'Порт 5173 занят. Остановите предыдущий сервер через Ctrl+C в его консоли и повторите npm.cmd run start.'
      : `Не удалось проверить порт 5173: ${error.message}`);
    process.exitCode = 1;
  });
}
