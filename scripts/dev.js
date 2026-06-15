import { spawn } from 'node:child_process';

const processes = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'client/vite.config.js'], {
    stdio: 'inherit',
    env: process.env
  })
];

for (const child of processes) {
  child.on('exit', (code) => {
    for (const other of processes) {
      if (other.pid && other.pid !== child.pid) {
        other.kill();
      }
    }
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });
}

process.on('SIGINT', () => {
  for (const child of processes) {
    child.kill();
  }
  process.exit(0);
});
