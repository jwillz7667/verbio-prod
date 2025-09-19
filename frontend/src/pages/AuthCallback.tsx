import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the hash params from the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');

        if (!accessToken) {
          throw new Error('No access token found');
        }

        // Get the user session from Supabase
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);

        if (error || !user) {
          throw error || new Error('Failed to get user');
        }

        // Now we need to exchange this with our backend for a JWT token
        // First check if user exists in our backend
        try {
          // Try to login with the email (OAuth users might already exist)
          const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'https://verbio-backend-995705962018.us-central1.run.app'}/api/auth/oauth`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: user.email,
              id: user.id,
              name: user.user_metadata?.full_name || user.email?.split('@')[0],
              provider: 'google',
            }),
          });

          if (!response.ok) {
            // If user doesn't exist, create them
            const registerResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'https://verbio-backend-995705962018.us-central1.run.app'}/api/auth/oauth/register`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email: user.email,
                id: user.id,
                businessName: user.user_metadata?.full_name || 'My Business',
                provider: 'google',
              }),
            });

            if (!registerResponse.ok) {
              throw new Error('Failed to register OAuth user');
            }

            const data = await registerResponse.json();
            localStorage.setItem('auth_token', data.token);

            setUser({
              id: data.user.id,
              email: data.user.email,
              businessId: data.user.businessId,
              businessName: data.user.businessName,
            });
          } else {
            const data = await response.json();
            localStorage.setItem('auth_token', data.token);

            setUser({
              id: data.user.id,
              email: data.user.email,
              businessId: data.user.businessId,
              businessName: data.user.businessName,
            });
          }

          toast.success('Successfully signed in!');
          navigate('/dashboard');
        } catch (backendError) {
          console.error('Backend auth error:', backendError);
          throw new Error('Failed to authenticate with backend');
        }
      } catch (error: any) {
        console.error('Auth callback error:', error);
        toast.error(error.message || 'Authentication failed. Please try again.');
        navigate('/login');
      }
    };

    handleCallback();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;