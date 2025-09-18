import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  Target,
  Lightbulb,
  Heart,
  Phone,
  ShoppingCart,
  Calendar,
  Briefcase,
  ArrowRight,
  CheckCircle,
  Award,
  Globe,
} from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const About: React.FC = () => {
  const values = [
    {
      title: 'Innovation',
      description: 'Pushing the boundaries of AI voice technology',
      icon: Lightbulb,
    },
    {
      title: 'Reliability',
      description: '99.99% uptime with enterprise-grade infrastructure',
      icon: Target,
    },
    {
      title: 'Customer First',
      description: 'Your success is our primary mission',
      icon: Heart,
    },
    {
      title: 'Global Reach',
      description: 'Supporting businesses in 50+ countries',
      icon: Globe,
    },
  ];

  const useCases = [
    {
      title: 'Inbound Support',
      description: 'Handle customer inquiries 24/7 with intelligent responses',
      icon: Phone,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'Outbound Campaigns',
      description: 'Automate sales calls and appointment reminders',
      icon: Briefcase,
      color: 'bg-green-50 text-green-600',
    },
    {
      title: 'Order Management',
      description: 'Process orders and handle payment collection seamlessly',
      icon: ShoppingCart,
      color: 'bg-purple-50 text-purple-600',
    },
    {
      title: 'Appointment Booking',
      description: 'Schedule and manage appointments automatically',
      icon: Calendar,
      color: 'bg-orange-50 text-orange-600',
    },
  ];

  const timeline = [
    {
      year: '2023',
      title: 'Founded',
      description: 'Verbio was born from a vision to revolutionize voice communications',
    },
    {
      year: '2024',
      title: 'First 1000 Customers',
      description: 'Reached our first milestone serving businesses globally',
    },
    {
      year: '2025',
      title: 'OpenAI Partnership',
      description: 'Integrated cutting-edge GPT models for natural conversations',
    },
    {
      year: 'Future',
      title: 'Your Success',
      description: 'Continuing to innovate and grow with our customers',
    },
  ];

  const stats = [
    { value: '10,000+', label: 'Active Businesses' },
    { value: '50M+', label: 'Calls Handled' },
    { value: '99.99%', label: 'Uptime' },
    { value: '50+', label: 'Countries Served' },
  ];

  return (
    <>
      <Helmet>
        <title>About - Verbio AI Voice Platform</title>
        <meta
          name="description"
          content="Learn about Verbio's mission to transform business communications with AI-powered voice intelligence. Serving 10,000+ businesses globally."
        />
      </Helmet>

      <Header />

      <main className="bg-white pt-24">
        {/* Hero Section */}
        <section className="section">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-3xl mx-auto"
            >
              <h1 className="text-5xl md:text-6xl font-bold mb-6">
                About <span className="text-gradient-blue">Verbio</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Empowering businesses with AI voice intelligence that transforms customer communications into
                competitive advantages.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12">
                {stats.map((stat, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="text-center"
                  >
                    <div className="text-3xl font-bold text-primary-600">{stat.value}</div>
                    <div className="text-sm text-gray-600">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Mission Section */}
        <section className="section bg-gradient-to-r from-primary-50 to-primary-100">
          <div className="container-max">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                <h2 className="text-3xl font-bold mb-4">Our Mission</h2>
                <p className="text-gray-700 mb-6">
                  We believe every business deserves access to enterprise-grade voice AI technology. Our mission is to
                  democratize AI voice intelligence, making it accessible, affordable, and amazingly simple to
                  implement.
                </p>
                <p className="text-gray-700 mb-6">
                  From small startups to large enterprises, we're committed to helping businesses deliver exceptional
                  customer experiences through natural, intelligent voice conversations.
                </p>
                <Link to="/register" className="inline-flex items-center gap-2 btn-primary">
                  Start Your Journey
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="relative"
              >
                <img
                  src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop"
                  alt="Team collaboration"
                  className="rounded-2xl shadow-xl"
                />
                <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-lg shadow-lg">
                  <Award className="w-8 h-8 text-primary-600 mb-2" />
                  <div className="font-semibold">Industry Leader</div>
                  <div className="text-sm text-gray-600">Voice AI Innovation</div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="section">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold mb-4">Our Values</h2>
              <p className="text-xl text-gray-600">The principles that guide everything we do</p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((value, index) => {
                const Icon = value.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="card text-center hover:shadow-glow transition-all"
                  >
                    <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-6 h-6 text-primary-600" />
                    </div>
                    <h3 className="font-semibold mb-2">{value.title}</h3>
                    <p className="text-sm text-gray-600">{value.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Timeline Section */}
        <section className="section bg-gray-50">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold mb-4">Our Journey</h2>
              <p className="text-xl text-gray-600">Building the future of voice communications</p>
            </motion.div>

            <div className="max-w-3xl mx-auto">
              {timeline.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="flex gap-6 mb-8"
                >
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-primary-500 rounded-full flex items-center justify-center text-white font-bold">
                      {index + 1}
                    </div>
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-sm text-primary-600 font-medium">{item.year}</span>
                      <h3 className="text-xl font-semibold">{item.title}</h3>
                    </div>
                    <p className="text-gray-600">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Use Cases Section */}
        <section className="section">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold mb-4">Use Cases</h2>
              <p className="text-xl text-gray-600">Verbio powers voice intelligence across industries</p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {useCases.map((useCase, index) => {
                const Icon = useCase.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="card hover:shadow-glow transition-all"
                  >
                    <div className={`w-12 h-12 ${useCase.color} rounded-lg flex items-center justify-center mb-4`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold mb-2">{useCase.title}</h3>
                    <p className="text-sm text-gray-600">{useCase.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How It Works (Reused) */}
        <section className="section bg-gray-50">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold mb-4">How Verbio Works</h2>
              <p className="text-xl text-gray-600">Simple setup, powerful results</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  step: '1',
                  title: 'Configure Your AI',
                  items: ['Choose voice', 'Set up agent', 'Define flows'],
                },
                {
                  step: '2',
                  title: 'Connect Your Systems',
                  items: ['Link phone numbers', 'Integrate APIs', 'Set webhooks'],
                },
                {
                  step: '3',
                  title: 'Go Live',
                  items: ['Receive calls', 'Track analytics', 'Scale instantly'],
                },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.2 }}
                  className="card text-center"
                >
                  <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold mb-4">{item.title}</h3>
                  <ul className="space-y-2">
                    {item.items.map((subItem, idx) => (
                      <li key={idx} className="flex items-center gap-2 justify-center text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        {subItem}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="section">
          <div className="container-max text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="card bg-gradient-to-r from-primary-50 to-primary-100 p-12"
            >
              <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Voice Communications?</h2>
              <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                Join thousands of businesses using Verbio to deliver exceptional customer experiences.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/register" className="inline-flex items-center gap-2 btn-primary">
                  Get Started Free
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link to="/pricing" className="inline-flex items-center gap-2 btn-secondary">
                  View Pricing
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default About;
