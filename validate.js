
const ALLOWED_COMMANDS = [
  'uptime', 'whoami', 'ls', 'df', 'free',
  'hostname', 'uname', 'echo', 'date', 'pwd'
];


const FORBIDDEN_CHARS = /[;&|`$<>\n\r\\]/;

function isCommandAllowed(command) {
  if (typeof command !== 'string') return false;
  const cmd = command.trim();
  if (!cmd || cmd.length > 200) return false;
  if (FORBIDDEN_CHARS.test(cmd)) return false;
  return ALLOWED_COMMANDS.includes(cmd.split(/\s+/)[0]);
}

module.exports = { isCommandAllowed, ALLOWED_COMMANDS };
