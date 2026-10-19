const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const local = join(__dirname, '..', 'python-ai', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const executable = process.env.PYTHON || (existsSync(local) ? local : process.platform === 'win32' ? 'python' : 'python3');
const result = spawnSync(executable, ['-m', 'unittest', 'discover', '-s', 'python-ai/tests', '-p', 'test_*.py'], {
  cwd: join(__dirname, '..'), stdio: 'inherit'
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
