import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Mail, MapPin, Twitter, Linkedin, Github, ArrowRight } from 'lucide-react';

const Footer: React.FC = () => {
  const footerLinks = {
    product: [
      { name: 'Features', href: '/#features' },
      { name: 'Pricing', href: '/pricing' },
      { name: 'API Docs', href: '#' },
      { name: 'Integrations', href: '#' },
    ],
    company: [
      { name: 'About', href: '/about' },
      { name: 'Blog', href: '/blog' },
      { name: 'Careers', href: '#' },
      { name: 'Contact', href: '#' },
    ],
    legal: [
      { name: 'Privacy Policy', href: '#' },
      { name: 'Terms of Service', href: '#' },
      { name: 'Cookie Policy', href: '#' },
      { name: 'GDPR', href: '#' },
    ],
    support: [
      { name: 'Help Center', href: '#' },
      { name: 'Documentation', href: '#' },
      { name: 'Status', href: '#' },
      { name: 'Community', href: '#' },
    ],
  };

  const socialLinks = [
    { name: 'Twitter', icon: Twitter, href: '#' },
    { name: 'LinkedIn', icon: Linkedin, href: '#' },
    { name: 'GitHub', icon: Github, href: '#' },
  ];

  return (
    <footer className="bg-gray-50 border-t border-gray-200">
      <div className="container-max py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8">
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center mb-4">
              <span className="logo-text text-2xl flex items-center gap-2">
                <Phone className="w-6 h-6" />
                VERBIO
              </span>
            </Link>
            <p className="text-gray-600 mb-6 max-w-sm">
              AI-powered voice intelligence platform that transforms your business communications with natural,
              low-latency conversations.
            </p>
            <div className="flex space-x-4">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <motion.a
                    key={social.name}
                    href={social.href}
                    className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:text-primary-500 hover:shadow-glow-sm transition-all duration-200"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    aria-label={social.name}
                  >
                    <Icon className="w-5 h-5" />
                  </motion.a>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Product</h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <Link to={link.href} className="text-gray-600 hover:text-primary-500 transition-colors duration-200">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Company</h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link to={link.href} className="text-gray-600 hover:text-primary-500 transition-colors duration-200">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Legal</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link to={link.href} className="text-gray-600 hover:text-primary-500 transition-colors duration-200">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Support</h3>
            <ul className="space-y-3">
              {footerLinks.support.map((link) => (
                <li key={link.name}>
                  <Link to={link.href} className="text-gray-600 hover:text-primary-500 transition-colors duration-200">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-6">
              <p className="text-sm text-gray-600">© 2025 Verbio. All rights reserved.</p>
              <div className="flex space-x-6 text-sm">
                <a
                  href="mailto:support@verbio.app"
                  className="text-gray-600 hover:text-primary-500 flex items-center gap-1"
                >
                  <Mail className="w-4 h-4" />
                  support@verbio.app
                </a>
                <span className="text-gray-600 flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  San Francisco, CA
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Built with</span>
              <div className="flex space-x-2">
                <span className="px-2 py-1 bg-primary-50 text-primary-600 text-xs rounded-full">Twilio</span>
                <span className="px-2 py-1 bg-primary-50 text-primary-600 text-xs rounded-full">OpenAI</span>
                <span className="px-2 py-1 bg-primary-50 text-primary-600 text-xs rounded-full">Stripe</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-primary-500 to-primary-600 py-4">
        <div className="container-max">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-2 md:space-y-0">
            <p className="text-white text-sm">🚀 Get started with 100 free credits today!</p>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-primary-600 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
