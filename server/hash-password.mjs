import { hashPassword } from './auth.mjs';
let password = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  password += chunk;
});
process.stdin.on('end', () => {
  password = password.replace(/\r?\n$/, '');
  if (password.length < 12) throw new Error('Use at least 12 characters');
  process.stdout.write(`${hashPassword(password)}\n`);
});
