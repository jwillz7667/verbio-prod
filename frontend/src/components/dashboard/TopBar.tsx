import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import {
  Bell,
  Search,
  Menu as MenuIcon,
  X,
  ChevronDown,
  User,
  Settings,
  LogOut,
  CreditCard,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface TopBarProps {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({ onMenuClick, showMenuButton = false }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Error logging out');
    }
  };

  const notifications = [
    { id: 1, title: 'New order received', time: '5 minutes ago', unread: true },
    { id: 2, title: 'AI Agent updated', time: '1 hour ago', unread: true },
    { id: 3, title: 'Credits running low', time: '2 hours ago', unread: false },
  ];

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 shadow-sm">
      <div className="h-full flex items-center justify-between px-4 lg:px-6">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          {showMenuButton && (
            <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <MenuIcon className="w-5 h-5 text-gray-600" />
            </button>
          )}

          {/* Search Bar */}
          <div className="relative">
            <AnimatePresence>
              {showSearch ? (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 320, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center"
                >
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-full pl-10 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        setShowSearch(false);
                        setSearchQuery('');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <button
                  onClick={() => setShowSearch(true)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Search className="w-5 h-5 text-gray-600" />
                </button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          {/* Upgrade Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/pricing')}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:shadow-lg transition-all duration-200"
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Upgrade</span>
          </motion.button>

          {/* Credits Display */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-primary-50 rounded-lg">
            <CreditCard className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-medium text-primary-700">2,400 credits</span>
          </div>

          {/* Notifications */}
          <Menu as="div" className="relative">
            <Menu.Button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <Bell className="w-5 h-5 text-gray-600" />
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-200"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {notifications.map((notification) => (
                    <Menu.Item key={notification.id}>
                      {({ active }) => (
                        <button
                          className={clsx('w-full px-4 py-3 text-left transition-colors', {
                            'bg-gray-50': active,
                            'bg-primary-50': notification.unread,
                          })}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                              <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
                            </div>
                            {notification.unread && (
                              <span className="w-2 h-2 bg-primary-500 rounded-full mt-1.5"></span>
                            )}
                          </div>
                        </button>
                      )}
                    </Menu.Item>
                  ))}
                </div>

                <div className="px-4 py-3 border-t border-gray-200">
                  <button className="text-sm text-primary-600 font-medium hover:text-primary-700">
                    View all notifications
                  </button>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>

          {/* User Menu */}
          <Menu as="div" className="relative">
            <Menu.Button className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 flex items-center justify-center">
                <span className="text-white text-sm font-bold">{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-600" />
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-200"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{user?.businessName || 'Business'}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>

                <div className="py-1">
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => navigate('/dashboard/settings')}
                        className={clsx('w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700', {
                          'bg-gray-50': active,
                        })}
                      >
                        <User className="w-4 h-4" />
                        Profile
                      </button>
                    )}
                  </Menu.Item>

                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => navigate('/dashboard/settings')}
                        className={clsx('w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700', {
                          'bg-gray-50': active,
                        })}
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </button>
                    )}
                  </Menu.Item>
                </div>

                <div className="border-t border-gray-200 py-1">
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={handleLogout}
                        className={clsx('w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600', {
                          'bg-red-50': active,
                        })}
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    )}
                  </Menu.Item>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
