
import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-4 bg-slate-100 dark:bg-slate-900">
      <i className="fas fa-ghost text-8xl text-primary-500 dark:text-primary-400 mb-6 animate-bounce"></i>
      <h1 className="text-5xl font-extrabold text-slate-800 dark:text-slate-100 mb-3">404 - Page Not Found</h1>
      <p className="text-xl text-slate-600 dark:text-slate-400 mb-8">
        Oops! The page you're looking for doesn't seem to exist.
      </p>
      <Link to="/dashboard">
        <Button variant="primary" size="lg">
          <i className="fas fa-home mr-2"></i>
          Go to Dashboard
        </Button>
      </Link>
    </div>
  );
};

export default NotFoundPage;
    