
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dbForgotPassword } from '../services/userService';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import { APP_NAME } from '../constants';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await dbForgotPassword(email);
      // For security, always proceed as if successful to prevent email enumeration.
      setCodeSent(true);
    } catch (err: any) {
      console.error("Forgot password error:", err);
      // Still set codeSent to true for security.
      setCodeSent(true);
    } finally {
      setLoading(false);
    }
  };

  const handleProceed = () => {
    navigate('/reset-password', { state: { email } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-primary-800 dark:to-secondary-800 p-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <i className="fas fa-key text-5xl text-primary-500 dark:text-primary-400 mb-2"></i>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Forgot Password</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {codeSent
              ? 'A reset code has been dispatched.'
              : 'Enter your email to receive a reset code.'}
          </p>
        </div>

        {!codeSent ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              id="email"
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              disabled={loading}
            />
            <Button type="submit" className="w-full" isLoading={loading} size="lg" disabled={loading || !email}>
              {loading ? 'Sending...' : 'Send Reset Code'}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <Alert type="success" message="If an account with that email exists, a password reset code has been sent to it. The code will expire in 15 minutes." />
            <Button onClick={handleProceed} className="w-full" size="lg">
              Proceed to Reset Password
              <i className="fas fa-arrow-right ml-2"></i>
            </Button>
          </div>
        )}
        
        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
            <i className="fas fa-arrow-left mr-2"></i>
            Back to Login
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
