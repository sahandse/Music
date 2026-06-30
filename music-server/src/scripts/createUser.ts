import { createUser, removeUser, getAllUsernames } from '../auth/users';

const args = process.argv.slice(2);

function usage(): never {
  console.log('Usage:');
  console.log('  npm run create-user -- <username> <password> [--admin]');
  console.log('  npm run create-user -- --list');
  console.log('  npm run create-user -- --remove <username>');
  process.exit(1);
}

if (args[0] === '--list') {
  console.log('Users:', getAllUsernames().join(', ') || '(none)');
} else if (args[0] === '--remove') {
  const username = args[1];
  if (!username) usage();
  console.log(removeUser(username) ? `Removed user "${username}"` : `User "${username}" not found`);
} else {
  const [username, password] = args;
  if (!username || !password) usage();
  const isAdmin = args.includes('--admin');
  createUser(username, password, isAdmin);
  console.log(`Created user "${username}"${isAdmin ? ' (admin)' : ''}`);
}
