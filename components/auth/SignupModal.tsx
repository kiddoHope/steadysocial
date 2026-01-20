import React, { useState } from 'react';
import { useAuth, UserRole } from '../../contexts/AuthContext';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Alert from '../ui/Alert';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SignupModal: React.FC<SignupModalProps> = ({ isOpen, onClose }) => {
  const { addUser, loading } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: UserRole.CREATIVE,
  });
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  // FIX: Widened the event type to include HTMLTextAreaElement for compatibility with the reusable Input component.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (formData.password !== formData.confirmPassword) {
      setNotification({ type: 'error', message: 'Passwords do not match.' });
      return;
    }
    if (formData.password.length < 8) {
        setNotification({ type: 'error', message: 'Password must be at least 8 characters long.' });
        return;
    }

    try {
      await addUser({
        username: formData.username,
        email: formData.email,
        password_param: formData.password,
        role: formData.role,
      });
      setNotification({ type: 'success', message: 'Account created! Please check your email to verify your account before logging in.' });
      setSignupSuccess(true);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to create account. The username or email might already be in use.' });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900 bg-opacity-25 flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-modal-title"
    >
      <Card
        title="Create Your Account"
        className="w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        actions={<Button onClick={onClose} variant="secondary" size="sm" aria-label="Close modal"><i className="fas fa-times"></i></Button>}
      >
        <div id="signup-modal-title" className="sr-only">Sign up for an account</div>

        {notification && <Alert type={notification.type} message={notification.message} onClose={() => setNotification(null)} className="mb-4" />}

        {signupSuccess ? (
          <div className="text-center">
            <p className="text-slate-600 dark:text-slate-400 mb-4">You can now close this window and proceed to verify your email.</p>
            <Button onClick={onClose} variant="primary">Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Username"
              id="username"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              required
              disabled={loading}
              autoFocus
            />
            <Input
              label="Email"
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading}
            />
            <Input
              label="Password"
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="Minimum 8 characters"
            />
            <Input
              label="Confirm Password"
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              disabled={loading}
            />
            <div className="flex justify-end space-x-3 pt-2">
              <Button type="button" onClick={onClose} variant="secondary" disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={loading} disabled={loading}>
                Sign Up
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
};

export default SignupModal;