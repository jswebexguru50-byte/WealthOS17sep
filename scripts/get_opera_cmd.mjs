import { execSync } from 'node:child_process';

try {
  const ps = `Get-Process opera -IncludeUserName -ErrorAction SilentlyContinue | Select-Object -First 1`;
  const out = execSync(`powershell -NoProfile -Command "Get-Process opera | Select-Object -First 3"`, { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.error(e.message);
}
