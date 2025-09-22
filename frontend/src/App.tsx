import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { HelmetProvider } from 'react-helmet-async';
import { useAuthStore } from './store/authStore';
import LoadingSpinner from './components/LoadingSpinner';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Lazy load pages for better performance
const Landing = lazy(() => import('./pages/Landing'));
const About = lazy(() => import('./pages/About'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Blog = lazy(() => import('./pages/Blog'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Orders = lazy(() => import('./pages/Orders'));
const Business = lazy(() => import('./pages/Business'));
const Agents = lazy(() => import('./pages/Agents'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const Billing = lazy(() => import('./pages/Billing'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const VoiceAgentsDashboard = lazy(() => import('./pages/VoiceAgentsDashboard'));

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
};

const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.2,
      ease: 'easeIn',
    },
  },
};

const App: React.FC = () => {
  const location = useLocation();

  return (
    <HelmetProvider>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Public Routes */}
          <Route
            path="/"
            element={
              <Suspense fallback={<LoadingSpinner fullScreen />}>
                <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                  <Landing />
                </motion.div>
              </Suspense>
            }
          />

          <Route
            path="/about"
            element={
              <Suspense fallback={<LoadingSpinner fullScreen />}>
                <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                  <About />
                </motion.div>
              </Suspense>
            }
          />

          <Route
            path="/pricing"
            element={
              <Suspense fallback={<LoadingSpinner fullScreen />}>
                <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                  <Pricing />
                </motion.div>
              </Suspense>
            }
          />

          <Route
            path="/blog"
            element={
              <Suspense fallback={<LoadingSpinner fullScreen />}>
                <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                  <Blog />
                </motion.div>
              </Suspense>
            }
          />

          <Route
            path="/blog/:id"
            element={
              <Suspense fallback={<LoadingSpinner fullScreen />}>
                <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                  <Blog />
                </motion.div>
              </Suspense>
            }
          />

          {/* Auth Routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Suspense fallback={<LoadingSpinner fullScreen />}>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <Login />
                  </motion.div>
                </Suspense>
              </PublicRoute>
            }
          />

          <Route
            path="/register"
            element={
              <PublicRoute>
                <Suspense fallback={<LoadingSpinner fullScreen />}>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <Register />
                  </motion.div>
                </Suspense>
              </PublicRoute>
            }
          />

          <Route
            path="/auth/callback"
            element={
              <Suspense fallback={<LoadingSpinner fullScreen />}>
                <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                  <AuthCallback />
                </motion.div>
              </Suspense>
            }
          />

          {/* Protected Dashboard Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <Dashboard />
                  </motion.div>
                </Suspense>
              }
            />

            <Route
              path="orders"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <Orders />
                  </motion.div>
                </Suspense>
              }
            />

            <Route
              path="business"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <Business />
                  </motion.div>
                </Suspense>
              }
            />

            <Route
              path="agents"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <Agents />
                  </motion.div>
                </Suspense>
              }
            />

            <Route
              path="analytics"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <Analytics />
                  </motion.div>
                </Suspense>
              }
            />

            <Route
              path="settings"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <Settings />
                  </motion.div>
                </Suspense>
              }
            />

            <Route
              path="billing"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <Billing />
                  </motion.div>
                </Suspense>
              }
            />

            <Route
              path="voice-agents"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                    <VoiceAgentsDashboard />
                  </motion.div>
                </Suspense>
              }
            />
          </Route>

          {/* Old protected routes redirect to dashboard */}
          <Route path="/orders" element={<Navigate to="/dashboard/orders" replace />} />
          <Route path="/business" element={<Navigate to="/dashboard/business" replace />} />
          <Route path="/agents" element={<Navigate to="/dashboard/agents" replace />} />
          <Route path="/analytics" element={<Navigate to="/dashboard/analytics" replace />} />
          <Route path="/settings" element={<Navigate to="/dashboard/settings" replace />} />

          {/* 404 Page */}
          <Route
            path="*"
            element={
              <Suspense fallback={<LoadingSpinner fullScreen />}>
                <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
                  <NotFound />
                </motion.div>
              </Suspense>
            }
          />
        </Routes>
      </AnimatePresence>
    </HelmetProvider>
  );
};

export default App;
