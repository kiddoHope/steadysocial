import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { User } from '../types';
import { 
    dbFetchUsers as apiFetchUsers, 
    dbAddUser as apiAddUser, 
    dbUpdateUserRole as apiUpdateUserRole 
} from '../services/userService';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const UserRow: React.FC<{user: Omit<User, 'password'>, onRoleChange: (userId: string, role: UserRole) => Promise<void>, isUpdating: boolean}> = ({ user, onRoleChange, isUpdating }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);
  const { currentUser } = useAuth();

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRole(e.target.value as UserRole);
  };

  const handleUpdateRole = async () => {
    await onRoleChange(user.id, selectedRole);
  };
  
  const isCurrentUser = currentUser?.id === user.id;

  return (
    <tr className="border-b-4 border-neo-black hover:bg-neo-secondary/10 transition-colors group">
      <td className="py-6 px-6">
        <span className="font-black text-xs uppercase tracking-tight">{user.username}</span>
      </td>
      <td className="py-6 px-6">
        <span className="font-mono text-[10px] font-bold opacity-60">{user.email}</span>
      </td>
      <td className="py-6 px-6">
        <Select
          value={selectedRole}
          onChange={handleSelectChange}
          options={Object.values(UserRole).map(role => ({ value: role, label: role.toUpperCase() }))}
          className="text-[10px] font-black uppercase tracking-widest !py-1"
          wrapperClassName="mb-0"
          disabled={isCurrentUser || isUpdating}
        />
      </td>
      <td className="py-6 px-6">
        <Button 
            onClick={handleUpdateRole} 
            size="sm" 
            variant="secondary" 
            disabled={selectedRole === user.role || isCurrentUser || isUpdating}
            isLoading={isUpdating}
            className="!py-2 !text-[8px]"
        >
          UPDATE_ROLE
        </Button>
      </td>
    </tr>
  );
};


const HumanResourcePage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ username: '', password_param: '', email: '', role: UserRole.CREATIVE });
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetchUsers();
      setUsers(data);
    } catch (err) {
      setNotification({ type: 'error', message: 'FAILED_TO_LOAD_DATA' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password_param || !newUser.email) {
      setNotification({ type: 'error', message: 'REQUIRED_FIELDS_MISSING' });
      return;
    }
    setIsAddingUser(true);
    setNotification(null);
    try {
      await apiAddUser({ ...newUser, role: newUser.role as UserRole }); 
      setNotification({ type: 'success', message: `ENTITY_${newUser.username}_PROVISIONED` });
      setNewUser({ username: '', password_param: '', email: '', role: UserRole.CREATIVE }); 
      fetchUsers(); // Refresh the list
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'PROVISIONING_FAILURE' });
    } finally {
      setIsAddingUser(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setIsUpdatingRole(userId);
    setNotification(null);
    try {
      await apiUpdateUserRole(userId, role);
      setNotification({ type: 'success', message: `CLEARANCE_LEVEL_MODIFIED` });
      fetchUsers(); // Refresh the list
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'MODIFICATION_ERROR' });
    } finally {
      setIsUpdatingRole(null);
      setTimeout(() => setNotification(null), 5000);
    }
  };


  return (
    <div className="min-h-full bg-neo-bg p-8 font-space relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-halftone opacity-5 pointer-events-none"></div>

      <header className="relative z-10 mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 max-w-[1400px] w-full mx-auto">
        <div>
          <div className="inline-block bg-neo-secondary text-neo-black px-2 py-0.5 mb-2 neo-border-sm -rotate-1">
            <span className="text-[10px] font-black uppercase tracking-widest">PERSONNEL_MANAGEMENT</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-neo-black leading-none">
            Human <span className="text-neo-accent outline-text">Resources</span>
          </h1>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] w-full mx-auto space-y-12">
        {notification && <Alert type={notification.type} message={notification.message} onClose={() => setNotification(null)} className="rotate-1" />}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Add User Section */}
          <div className="lg:col-span-4">
            <Card title="PROVISION_NEW_ENTITY" className="!p-8 neo-shadow-lg bg-white relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <i className="fas fa-user-plus text-8xl"></i>
              </div>
              <form onSubmit={handleAddUser} className="space-y-6 relative z-10">
                <Input
                  label="USERNAME_IDENTIFIER"
                  id="username"
                  name="username"
                  type="text"
                  value={newUser.username}
                  onChange={handleInputChange}
                  required
                  disabled={isAddingUser}
                />
                <Input
                  label="PRIMARY_COMM_NODE"
                  id="email"
                  name="email"
                  type="email"
                  value={newUser.email}
                  onChange={handleInputChange}
                  required
                  disabled={isAddingUser}
                />
                <Input
                  label="SECURE_KEY_ACCESS"
                  id="password_param"
                  name="password_param"
                  type="password"
                  value={newUser.password_param}
                  onChange={handleInputChange}
                  required
                  disabled={isAddingUser}
                />
                <Select
                  label="CLEARANCE_PROTOCOL"
                  id="role"
                  name="role"
                  value={newUser.role}
                  onChange={handleInputChange}
                  options={Object.values(UserRole).map(role => ({ value: role, label: role.toUpperCase() }))}
                  disabled={isAddingUser}
                />
                <Button type="submit" variant="primary" className="w-full !py-4" isLoading={isAddingUser} disabled={isAddingUser}>
                  PROVISION_ENTITY
                </Button>
              </form>
            </Card>
          </div>

          {/* Manage Users Section */}
          <div className="lg:col-span-8">
            <Card title="ACTIVE_DIRECTORY_STREAM" className="neo-shadow-lg bg-white overflow-hidden !p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-neo-black text-white">
                    <tr>
                      <th className="py-4 px-6 text-left text-[10px] font-black uppercase tracking-[0.2em]">IDENTIFIER</th>
                      <th className="py-4 px-6 text-left text-[10px] font-black uppercase tracking-[0.2em]">COMM_NODE</th>
                      <th className="py-4 px-6 text-left text-[10px] font-black uppercase tracking-[0.2em]">CLEARANCE</th>
                      <th className="py-4 px-6 text-left text-[10px] font-black uppercase tracking-[0.2em]">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && users.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-20 text-center">
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-10 h-10 neo-border bg-neo-accent animate-spin"></div>
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-40">SCANNING_NODES...</p>
                          </div>
                        </td>
                      </tr>
                    ) : users.length > 0 ? (
                      users.map(user => (
                        <UserRow 
                          key={user.id} 
                          user={user} 
                          onRoleChange={handleRoleChange} 
                          isUpdating={isUpdatingRole === user.id}
                        />
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-20 text-center opacity-20">
                          <i className="fas fa-users-slash text-6xl mb-4 block"></i>
                          <p className="font-black uppercase tracking-widest text-[10px]">NO_ENTITIES_DETECTED</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </main>

      <footer className="relative z-10 mt-20 text-center">
          <div className="inline-block px-6 py-3 bg-neo-muted neo-border-sm rotate-1">
            <p className="text-[8px] font-black uppercase tracking-[0.4em] text-neo-black/60">
              CORE_HR_DATABASE // ACCESS_LEVEL: ADMIN // v1.2.0
            </p>
          </div>
      </footer>
    </div>
  );
};

export default HumanResourcePage;