import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Phone,
  CreditCard,
  Bot,
  ShoppingCart,
  Building2,
  BarChart3,
  Settings,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Activity,
  Users,
  FileText,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
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

  const navigation = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Voice Sessions', href: '/dashboard/sessions', icon: Phone },
    { name: 'AI Agents', href: '/dashboard/agents', icon: Bot },
    { name: 'Orders', href: '/dashboard/orders', icon: ShoppingCart },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Activities', href: '/dashboard/activities', icon: Activity },
    { name: 'Customers', href: '/dashboard/customers', icon: Users },
    { name: 'Business', href: '/dashboard/business', icon: Building2 },
    { name: 'Billing', href: '/dashboard/billing', icon: CreditCard },
    { name: 'Reports', href: '/dashboard/reports', icon: FileText },
  ];

  const bottomNavigation = [
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
    { name: 'Help & Support', href: '/dashboard/help', icon: HelpCircle },
  ];

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 80 : 260 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed left-0 top-0 z-40 h-screen bg-white border-r border-gray-200 shadow-sm flex flex-col"
    >
      {/* Logo Section */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">V</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Verbio</span>
          </motion.div>
        )}
        <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          {collapsed ? (
            <ChevronRight className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                'hover:bg-primary-50 hover:text-primary-700',
                {
                  'bg-primary-50 text-primary-700 border-l-4 border-primary-500 font-medium': isActive,
                  'text-gray-700': !isActive,
                  'justify-center': collapsed,
                }
              )
            }
            title={collapsed ? item.name : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-sm font-medium"
              >
                {item.name}
              </motion.span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 py-4 border-t border-gray-200 space-y-1">
        {bottomNavigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                'hover:bg-gray-100 hover:text-gray-900',
                {
                  'bg-gray-100 text-gray-900 font-medium': isActive,
                  'text-gray-600': !isActive,
                  'justify-center': collapsed,
                }
              )
            }
            title={collapsed ? item.name : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-sm font-medium"
              >
                {item.name}
              </motion.span>
            )}
          </NavLink>
        ))}

        <button
          onClick={handleLogout}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
            'text-gray-600 hover:bg-red-50 hover:text-red-600',
            {
              'justify-center': collapsed,
            }
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-sm font-medium"
            >
              Logout
            </motion.span>
          )}
        </button>
      </div>

      {/* User Profile Section */}
      <div className="px-3 py-4 border-t border-gray-200">
        <div
          className={clsx('flex items-center gap-3 p-2 rounded-lg bg-gray-50', {
            'justify-center': collapsed,
          })}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">{user?.email?.charAt(0).toUpperCase() || 'U'}</span>
          </div>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex-1 min-w-0"
            >
              <p className="text-sm font-medium text-gray-900 truncate">{user?.businessName || 'Business'}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </motion.div>
          )}
        </div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
