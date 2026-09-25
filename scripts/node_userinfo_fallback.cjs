// Work around Windows/libuv returning ENOMEM from os.userInfo() on this host.
// tsx uses only the username to name its temporary directory. Preserve the
// native implementation whenever it works and never suppress other failures.
const os = require('node:os');

try {
  os.userInfo();
} catch (error) {
  if (error?.code !== 'ERR_SYSTEM_ERROR' || error?.info?.code !== 'ENOMEM') {
    throw error;
  }
  const username = process.env.USERNAME;
  if (!username) throw error;
  os.userInfo = () => ({
    username,
    uid: -1,
    gid: -1,
    shell: null,
    homedir: os.homedir(),
  });
}
