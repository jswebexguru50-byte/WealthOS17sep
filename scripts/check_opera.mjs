import { execSync } from 'node:child_process';

try {
  const output = execSync('powershell -NoProfile -Command "Get-Process -Name opera -ErrorAction SilentlyContinue | Select-Object Id, MainWindowTitle, Responding, Path | Format-Table -AutoSize"', { encoding: 'utf8' });
  console.log(output);
} catch (e) {
  console.error(e.message);
}
