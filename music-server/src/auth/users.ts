import { insertUser, getUserByUsername, listUsers, deleteUserByUsername } from '../db/queries';
import { encryptPassword, randomId } from './crypto';

export function createUser(username: string, password: string, isAdmin = false): void {
  if (getUserByUsername.get(username)) {
    throw new Error(`User "${username}" already exists`);
  }
  insertUser.run({
    id: randomId(),
    username,
    password: encryptPassword(password),
    isAdmin: isAdmin ? 1 : 0,
    createdAt: new Date().toISOString(),
  });
}

export function removeUser(username: string): boolean {
  const result = deleteUserByUsername.run(username);
  return result.changes > 0;
}

export function getAllUsernames(): string[] {
  return listUsers.all().map((u) => u.username);
}
