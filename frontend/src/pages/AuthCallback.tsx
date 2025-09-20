import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuthStore();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the session from Supabase
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          throw sessionError;
        }

        if (!session) {
          // If no session, check if we have access token in URL hash
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (!accessToken) {
            throw new Error('No session found');
          }

          // Get user info using the access token
          const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

          if (userError || !user) {
            throw userError || new Error('Failed to get user info');
          }

          // Send to backend to create JWT
          await handleOAuthCallback(accessToken, refreshToken || '', user);
        } else {
          // We have a session, send to backend
          await handleOAuthCallback(
            session.access_token,
            session.refresh_token || '',
            session.user
          );
        }

        toast.success('Successfully signed in!');
        navigate('/dashboard');
      } catch (error: any) {
        console.error('OAuth callback error:', error);

        // Provide specific error messages
        if (error.message?.includes('No session')) {
          toast.error('Authentication failed. Please try signing in again.');
        } else if (error.message?.includes('Network')) {
          toast.error('Network error. Please check your connection and try again.');
        } else {
          toast.error(error.message || 'Failed to authenticate. Please try again.');
        }

        navigate('/login');
      }
    };

    handleCallback();
  }, [navigate, handleOAuthCallback]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="text-center"
      >
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
              <svg
                className="w-8 h-8 text-white animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Completing Sign In
          </h2>
          <p className="text-gray-600">
            Please wait while we verify your account...
          </p>

          <div className="mt-6 flex justify-center">
            <div className="flex space-x-2">
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthCallback;