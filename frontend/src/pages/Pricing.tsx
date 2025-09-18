import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  Check,
  X,
  ArrowRight,
  Phone,
  MessageSquare,
  Wifi,
  CreditCard,
  Zap,
  Building,
  Shield,
  Headphones,
} from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useAuthStore } from '../store/authStore';

const Pricing: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  const plans = [
    {
      name: 'Starter',
      price: '$9',
      period: '/month',
      description: 'Perfect for small businesses getting started',
      credits: '100 credits/month',
      features: [
        { name: '100 voice credits', included: true },
        { name: 'Basic analytics dashboard', included: true },
        { name: 'Email support', included: true },
        { name: 'Single AI agent', included: true },
        { name: 'Standard voices', included: true },
        { name: 'Real-time transcription', included: false },
        { name: 'Custom integrations', included: false },
        { name: 'Priority support', included: false },
      ],
      cta: 'Start Free Trial',
      popular: false,
    },
    {
      name: 'Pro',
      price: '$29',
      period: '/month',
      description: 'Ideal for growing businesses with higher volume',
      credits: '1,000 credits/month',
      features: [
        { name: '1,000 voice credits', included: true },
        { name: 'Advanced analytics', included: true },
        { name: 'Priority email support', included: true },
        { name: 'Up to 5 AI agents', included: true },
        { name: 'Premium voices', included: true },
        { name: 'Real-time transcription', included: true },
        { name: 'Webhook integrations', included: true },
        { name: 'Priority support', included: false },
      ],
      cta: 'Start Pro Trial',
      popular: true,
    },
    {
      name: 'Scale',
      price: 'Custom',
      period: '',
      description: 'Enterprise-grade solution with dedicated support',
      credits: 'Unlimited credits',
      features: [
        { name: 'Unlimited voice credits', included: true },
        { name: 'Custom analytics', included: true },
        { name: '24/7 phone support', included: true },
        { name: 'Unlimited AI agents', included: true },
        { name: 'Custom voice cloning', included: true },
        { name: 'Real-time everything', included: true },
        { name: 'Custom integrations', included: true },
        { name: 'Dedicated account manager', included: true },
      ],
      cta: 'Contact Sales',
      popular: false,
    },
  ];

  const creditPricing = [
    { service: 'Outbound Calls', credits: '150 credits/min', icon: Phone },
    { service: 'Inbound Calls', credits: '110 credits/min', icon: Phone },
    { service: 'Web Calls', credits: '100 credits/min', icon: Wifi },
    { service: 'SMS Messages', credits: '25 credits/message', icon: MessageSquare },
    { service: 'Phone Number Rental', credits: '$3.50/month', icon: CreditCard },
  ];

  const features = [
    {
      title: 'Pay As You Go',
      description: 'Only pay for what you use with transparent credit-based pricing',
      icon: CreditCard,
    },
    {
      title: 'No Setup Fees',
      description: 'Get started immediately without any upfront costs',
      icon: Zap,
    },
    {
      title: 'Enterprise Ready',
      description: 'Scale from startup to enterprise with flexible plans',
      icon: Building,
    },
    {
      title: 'Security First',
      description: 'Bank-level encryption and compliance certifications',
      icon: Shield,
    },
  ];

  return (
    <>
      <Helmet>
        <title>Pricing - Verbio AI Voice Platform</title>
        <meta
          name="description"
          content="Simple, transparent pricing for AI voice intelligence. Start with 100 free credits. No setup fees, pay only for what you use."
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
                Pricing Built For
                <span className="text-gradient-blue block">Businesses</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Natural AI voice intelligence. Pay only for what you use and scale monthly.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Credits Explanation */}
        <section className="pb-12">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="card bg-gradient-to-r from-primary-50 to-primary-100 p-8"
            >
              <h2 className="text-2xl font-bold mb-6 text-center">Credits cover all services</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {creditPricing.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className="text-center"
                    >
                      <Icon className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                      <div className="font-medium text-sm">{item.service}</div>
                      <div className="text-primary-700 font-semibold">{item.credits}</div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Pricing Plans */}
        <section className="section">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold">Subscription Plans</h2>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8">
              {plans.map((plan, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className={`relative ${plan.popular ? 'scale-105' : ''}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-0 right-0 flex justify-center">
                      <span className="bg-gradient-to-r from-primary-500 to-primary-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className={`card h-full ${plan.popular ? 'border-2 border-primary-500 shadow-glow' : ''}`}>
                    <div className="text-center mb-6">
                      <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                      <div className="flex items-baseline justify-center gap-1 mb-2">
                        <span className="text-4xl font-bold">{plan.price}</span>
                        <span className="text-gray-600">{plan.period}</span>
                      </div>
                      <p className="text-gray-600">{plan.description}</p>
                      <div className="mt-2 inline-flex items-center px-3 py-1 bg-primary-50 rounded-full">
                        <span className="text-sm font-medium text-primary-700">{plan.credits}</span>
                      </div>
                    </div>

                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          {feature.included ? (
                            <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                          ) : (
                            <X className="w-5 h-5 text-gray-300 mt-0.5 flex-shrink-0" />
                          )}
                          <span className={feature.included ? 'text-gray-700' : 'text-gray-400'}>{feature.name}</span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      to={isAuthenticated ? '/dashboard/billing' : '/register'}
                      className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-button font-medium transition-all ${
                        plan.popular
                          ? 'bg-primary-500 text-white hover:bg-primary-600 shadow-lg hover:shadow-glow-sm'
                          : 'bg-white text-primary-600 border-2 border-primary-500 hover:bg-primary-50'
                      }`}
                    >
                      {plan.cta}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="section bg-gray-50">
          <div className="container-max">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="text-center"
                  >
                    <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-6 h-6 text-primary-600" />
                    </div>
                    <h3 className="font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-gray-600">{feature.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="section">
          <div className="container-max max-w-3xl">
            <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>

            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="card"
              >
                <h3 className="font-semibold mb-2">How do credits work?</h3>
                <p className="text-gray-600">
                  Credits are our universal currency for all services. You can use them for voice calls, SMS messages,
                  and other features. Credits roll over month to month and never expire.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="card"
              >
                <h3 className="font-semibold mb-2">Can I change plans anytime?</h3>
                <p className="text-gray-600">
                  Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately and are
                  prorated for the current billing cycle.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="card"
              >
                <h3 className="font-semibold mb-2">Do you offer a free trial?</h3>
                <p className="text-gray-600">
                  Yes, all new accounts start with 100 free credits to test our platform. No credit card required to get
                  started.
                </p>
              </motion.div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default Pricing;
