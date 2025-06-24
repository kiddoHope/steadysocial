
import { User } from '../types';

const USERS_STORAGE_KEY = 'socialMediaUsers';

export const getUsers = (): User[] => {
  const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
  // Users retrieved from localStorage will not have profilePictureUrl
  return storedUsers ? JSON.parse(storedUsers) : [];
};

export const saveUsers = (users: User[]): void => {
  // Create a new array of users where profilePictureUrl is omitted
  const usersToStore = users.map(user => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { profilePictureUrl, ...userWithoutPic } = user;
    return userWithoutPic;
  });
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(usersToStore));
};
