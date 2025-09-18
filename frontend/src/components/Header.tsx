import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown, User, LogOut, Settings, CreditCard, Phone } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

interface HeaderProps {
  variant?: 'landing' | 'auth' | 'dashboard';
}

const Header: React.FC<HeaderProps> = ({ variant = 'landing' }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const navLinks = [
    { name: 'About', href: '/about' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'Blog', href: '/blog' },
  ];

  if (variant === 'auth') {
    return (
      <header className="fixed top-0 left-0 right-0 z-50 bg-white">
        <div className="container-max">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <span className="logo-text text-2xl">VERBIO</span>
            </Link>
            <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors">
              Back to Home
            </Link>
          </div>
        </div>
      </header>
    );
  }

  return (
    <>
      <motion.header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? 'bg-white/95 backdrop-blur-md shadow-lg' : 'bg-white'
        }`}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="container-max">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center">
                <motion.span
                  className="logo-text text-2xl flex items-center gap-2"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Phone className="w-6 h-6" />
                  VERBIO
                </motion.span>
              </Link>

              <nav className="hidden md:flex items-center space-x-6">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    to={link.href}
                    className={`text-sm font-medium transition-all duration-200 hover:text-primary-500 ${
                      location.pathname === link.href ? 'text-primary-500' : 'text-gray-700'
                    }`}
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="flex items-center space-x-2 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary-400 to-primary-600 flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    </button>
                  </DropdownMenu.Trigger>

                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="min-w-[200px] bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
                      sideOffset={5}
                    >
                      <DropdownMenu.Item className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer outline-none">
                        <Link to="/dashboard" className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Dashboard
                        </Link>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer outline-none">
                        <Link to="/dashboard/settings" className="flex items-center gap-2">
                          <Settings className="w-4 h-4" />
                          Settings
                        </Link>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer outline-none">
                        <Link to="/dashboard/billing" className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4" />
                          Billing
                        </Link>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className="h-[1px] bg-gray-200 my-1" />
                      <DropdownMenu.Item
                        className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer outline-none"
                        onClick={handleLogout}
                      >
                        <div className="flex items-center gap-2">
                          <LogOut className="w-4 h-4" />
                          Logout
                        </div>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="hidden md:block text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    Login
                  </Link>
                  <Link to="/register" className="btn-primary text-sm px-4 py-2 shadow-lg hover:shadow-glow-sm">
                    Get Started
                  </Link>
                </>
              )}

              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {isMobileMenuOpen ? (
                  <X className="w-5 h-5 text-gray-700" />
                ) : (
                  <Menu className="w-5 h-5 text-gray-700" />
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="fixed top-16 left-0 right-0 bg-white shadow-lg z-40 md:hidden"
          >
            <nav className="container-max py-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {link.name}
                </Link>
              ))}
              {!isAuthenticated && (
                <>
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-4 py-2 text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors text-center"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
