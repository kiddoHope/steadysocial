
import { User } from '../types';

const USERS_STORAGE_KEY = 'socialMediaUsers';

export const getUsers = (): User[] => {
  const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
  return storedUsers ? JSON.parse(storedUsers) : [];
};

export const saveUsers = (users: User[]): void => {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
};
    