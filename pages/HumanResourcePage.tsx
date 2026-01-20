import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { User } from '../types'; // Keep User type, Omit<User, 'password'> is handled by context
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const UserRow: React.FC<{user: Omit<User, 'password'>, onRoleChange: (userId: string, role: UserRole) => Promise<void>, isUpdating: boolean}> = ({ user, onRoleChange, isUpdating }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);
  const { currentUser } = useAuth(); // No password on currentUser from context

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRole(e.target.value as UserRole);
  };

  const handleUpdateRole = async () => {
    await onRoleChange(user.id, selectedRole);
  };
  
  const isCurrentUser = currentUser?.id === user.id;

  return (
    <tr className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
      <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300">{user.username}</td>
      <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300">{user.email}</td>
      <td className="py-3 px-4 text-sm">
        <Select
          value={selectedRole}
          onChange={handleSelectChange}
          options={Object.values(UserRole).map(role => ({ value: role, label: role.charAt(0).toUpperCase() + role.slice(1) }))}
          className="text-sm dark:bg-slate-700"
          wrapperClassName="mb-0"
          disabled={isCurrentUser || isUpdating}
        />
      </td>
      <td className="py-3 px-4 text-sm">
        <Button 
            onClick={handleUpdateRole} 
            size="sm" 
            variant="secondary" 
            disabled={selectedRole === user.role || isCurrentUser || isUpdating}
            isLoading={isUpdating} // Show spinner on this specific button if this row is being updated
        >
          Update Role
        </Button>
      </td>
    </tr>
  );
};


const HumanResourcePage: React.FC = () => {
  const { users, addUser, updateUserRole, loading, fetchUsers } = useAuth();
  const [newUser, setNewUser] = useState({ username: '', password_param: '', email: '', role: UserRole.CREATIVE });
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null); // Store ID of user being updated

  useEffect(() => {
    fetchUsers(); // Fetch users when component mounts
  }, [fetchUsers]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password_param || !newUser.email) {
      setNotification({ type: 'error', message: 'Username, email, and password are required.' });
      return;
    }
    setIsAddingUser(true);
    setNotification(null);
    try {
      await addUser({ ...newUser, role: newUser.role as UserRole }); 
      setNotification({ type: 'success', message: `User ${newUser.username} added successfully. They must verify their email before logging in.` });
      setNewUser({ username: '', password_param: '', email: '', role: UserRole.CREATIVE }); 
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to add user.' });
    } finally {
      setIsAddingUser(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setIsUpdatingRole(userId);
    setNotification(null);
    try {
      await updateUserRole(userId, role);
      setNotification({ type: 'success', message: `User role updated successfully.` });
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'Failed to update user role.' });
    } finally {
      setIsUpdatingRole(null);
      setTimeout(() => setNotification(null), 3000);
    }
  };


  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-100">Human Resources</h1>
      {notification && <Alert type={notification.type} message={notification.message} onClose={() => setNotification(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card title="Add New User">
            <form onSubmit={handleAddUser} className="space-y-4">
              <Input
                label="Username"
                id="username"
                name="username"
                type="text"
                value={newUser.username}
                onChange={handleInputChange}
                required
                disabled={isAddingUser}
              />
              <Input
                label="Email"
                id="email"
                name="email"
                type="email"
                value={newUser.email}
                onChange={handleInputChange}
                required
                disabled={isAddingUser}
              />
              <Input
                label="Password"
                id="password_param" // Ensure name matches state key
                name="password_param" // Ensure name matches state key
                type="password"
                value={newUser.password_param}
                onChange={handleInputChange}
                required
                disabled={isAddingUser}
              />
              <Select
                label="Role"
                id="role"
                name="role"
                value={newUser.role}
                onChange={handleInputChange}
                options={Object.values(UserRole).map(role => ({ value: role, label: role.charAt(0).toUpperCase() + role.slice(1) }))}
                disabled={isAddingUser}
              />
              <Button type="submit" variant="primary" className="w-full" isLoading={isAddingUser} disabled={isAddingUser}>
                {isAddingUser ? 'Adding User...' : 'Add User'}
              </Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card title="Manage Users">
            {loading && users.length === 0 ? ( // Show spinner if loading and no users yet
                <div className="flex justify-center items-center py-10">
                    <LoadingSpinner size="lg" />
                    <p className="ml-3 text-slate-500 dark:text-slate-400">Loading Users...</p>
                </div>
            ) : users.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead className="bg-slate-100 dark:bg-slate-700">
                    <tr>
                      <th className="py-3 px-4 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">Username</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">Email</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">Role</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {users.map(user => (
                      <UserRow 
                        key={user.id} 
                        user={user} 
                        onRoleChange={handleRoleChange} 
                        isUpdating={isUpdatingRole === user.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-slate-500 dark:text-slate-400 py-10">No users found.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default HumanResourcePage;