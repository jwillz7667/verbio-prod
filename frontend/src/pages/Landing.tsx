import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  CheckCircle,
  Phone,
  Mic,
  Globe,
  Zap,
  BarChart3,
  Clock,
  Star,
  Play,
  ChevronRight,
  Sparkles,
  Bot,
} from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import toast from 'react-hot-toast';

const Landing: React.FC = () => {
  const [demoForm, setDemoForm] = useState({
    name: '',
    phone: '',
    language: 'en',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      toast.success("Demo call scheduled! We'll call you in 1 minute.");
      setDemoForm({ name: '', phone: '', language: 'en' });
      setIsSubmitting(false);
    }, 2000);
  };

  const features = [
    {
      title: 'Natural Voice',
      description: 'Human-like conversations with advanced voice synthesis',
      icon: Mic,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      title: '24/7 Availability',
      description: 'Never miss a call with round-the-clock AI assistance',
      icon: Clock,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Real-Time Analytics',
      description: 'Track performance and insights instantly',
      icon: BarChart3,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Automated Workflows',
      description: 'Streamline operations with intelligent automation',
      icon: Zap,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Easy Integrations',
      description: 'Connect with your existing tools seamlessly',
      icon: Globe,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-50',
    },
  ];

  const testimonials = [
    {
      quote: 'Verbio cut our call handling time by 40%',
      author: 'Sarah Johnson',
      role: 'COO, Fintech Startup',
      avatar: 'https://i.pravatar.cc/150?img=1',
      rating: 5,
    },
    {
      quote: 'Integration took hours, not weeks',
      author: 'Michael Chen',
      role: 'CTO, Healthcare Platform',
      avatar: 'https://i.pravatar.cc/150?img=2',
      rating: 5,
    },
    {
      quote: 'The voice quality is absolutely stunning',
      author: 'Emily Rodriguez',
      role: 'Head of CX, SaaS Company',
      avatar: 'https://i.pravatar.cc/150?img=3',
      rating: 5,
    },
  ];

  const stats = [
    { value: '300%', label: 'Efficiency Increase' },
    { value: '50%', label: 'Cost Reduction' },
    { value: '24/7', label: 'Intelligent Support' },
  ];

  return (
    <>
      <Helmet>
        <title>Verbio - AI-Powered Voice Intelligence Platform</title>
        <meta
          name="description"
          content="Transform your business communications with Verbio's AI voice intelligence platform. Natural conversations, 24/7 availability, seamless integrations."
        />
      </Helmet>

      <Header />

      <main className="bg-white">
        {/* Hero Section */}
        <section className="pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center max-w-4xl mx-auto"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 rounded-full mb-6">
                <Sparkles className="w-4 h-4 text-primary-600" />
                <span className="text-sm font-medium text-primary-700">Your Voice, Intelligent</span>
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 text-gray-900">
                AI-Powered Voice
                <span className="text-gradient-blue block mt-2">Intelligence For Your Business</span>
              </h1>

              <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                Power inbound and outbound conversations 24/7 with our low-latency, natural AI voice platform that
                integrates seamlessly and scales effortlessly.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-primary-500 text-white rounded-button font-semibold hover:bg-primary-600 shadow-lg hover:shadow-glow transition-all duration-200"
                  >
                    Get Started
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <button className="inline-flex items-center gap-2 px-8 py-4 bg-white text-primary-600 border-2 border-primary-500 rounded-button font-semibold hover:bg-primary-50 transition-all duration-200">
                    <Play className="w-5 h-5" />
                    See in Action
                  </button>
                </motion.div>
              </div>

              <div className="mt-12 flex flex-wrap justify-center gap-8">
                {stats.map((stat, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 + 0.3 }}
                    className="text-center"
                  >
                    <div className="text-3xl font-bold text-primary-600">{stat.value}</div>
                    <div className="text-sm text-gray-600">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="absolute inset-0 -z-10 bg-grid opacity-5" />
        </section>

        {/* How It Works Section */}
        <section className="section bg-gray-50">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-4xl font-bold mb-4">Get started in minutes</h2>
              <p className="text-xl text-gray-600">Our AI-powered voice platform is just 3 steps away</p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="space-y-6"
              >
                <div className="card-glow p-6">
                  <h3 className="text-2xl font-semibold mb-4">Step 1: Configure Your AI</h3>
                  <ul className="space-y-3">
                    {['Choose a natural voice', 'Name your AI agent', 'Define conversation flows'].map(
                      (item, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                          <span className="text-gray-700">{item}</span>
                        </li>
                      )
                    )}
                  </ul>
                </div>

                <div className="card p-6 bg-primary-50 border-2 border-primary-200">
                  <div className="flex items-center gap-3 mb-3">
                    <Phone className="w-6 h-6 text-primary-600" />
                    <h4 className="text-lg font-semibold">Get a phone number</h4>
                  </div>
                  <p className="text-gray-700">
                    Connect a Twilio number or use our provided numbers to start receiving calls instantly.
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="space-y-6"
              >
                <div className="card-glow p-6">
                  <h3 className="text-2xl font-semibold mb-4">Step 2: Train Your Agent</h3>
                  <ul className="space-y-3">
                    {['Add FAQs and responses', 'Integrate service details', 'Update workflows dynamically'].map(
                      (item, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                          <span className="text-gray-700">{item}</span>
                        </li>
                      )
                    )}
                  </ul>
                  <p className="mt-4 text-gray-600">
                    Equip your AI with business knowledge to handle any conversation naturally.
                  </p>
                </div>

                <motion.div whileHover={{ scale: 1.02 }} className="card p-6 bg-accent-light border-2 border-green-300">
                  <div className="flex items-center gap-3 mb-3">
                    <Bot className="w-6 h-6 text-green-700" />
                    <h4 className="text-lg font-semibold">Step 3: Go Live!</h4>
                  </div>
                  <p className="text-gray-700">
                    Your AI agent is ready to handle calls 24/7 with human-like conversations.
                  </p>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="section">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-4xl font-bold mb-4">Everything your voice platform should be</h2>
              <p className="text-xl text-gray-600">Without the complexity</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.05 }}
                    className="card-glow group"
                  >
                    <div
                      className={`w-12 h-12 ${feature.bgColor} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                    >
                      <Icon className={`w-6 h-6 ${feature.color}`} />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                    <p className="text-gray-600">{feature.description}</p>
                  </motion.div>
                );
              })}
            </div>

            <div className="relative">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="bg-gradient-to-r from-primary-50 to-primary-100 rounded-2xl p-8 md:p-12"
              >
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h3 className="text-3xl font-bold mb-4">See Verbio in Action</h3>
                    <p className="text-gray-700 mb-6">
                      Watch how businesses are transforming customer interactions with AI voice intelligence that sounds
                      remarkably human.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {['300% Efficiency Increase', '50% Cost Reduction', '24/7 Support'].map((badge, index) => (
                        <span key={index} className="badge badge-success">
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <img
                      src="https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?w=600&h=400&fit=crop"
                      alt="AI Voice Agent"
                      className="rounded-lg shadow-xl"
                      loading="lazy"
                    />
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <div className="w-16 h-16 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 text-primary-600 ml-1" />
                      </div>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Demo Section */}
        <section className="section bg-gray-50">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="max-w-2xl mx-auto text-center"
            >
              <h2 className="text-4xl font-bold mb-4">Try talking to Verbio AI</h2>
              <p className="text-xl text-gray-600 mb-8">
                Experience the future of voice communication. Schedule a demo call now.
              </p>

              <form onSubmit={handleDemoSubmit} className="card-glow p-8">
                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="label">Your Name</label>
                    <input
                      type="text"
                      required
                      value={demoForm.name}
                      onChange={(e) => setDemoForm({ ...demoForm, name: e.target.value })}
                      className="input"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="label">Phone Number</label>
                    <input
                      type="tel"
                      required
                      value={demoForm.phone}
                      onChange={(e) => setDemoForm({ ...demoForm, phone: e.target.value })}
                      className="input"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="label">Preferred Language</label>
                  <select
                    value={demoForm.language}
                    onChange={(e) => setDemoForm({ ...demoForm, language: e.target.value })}
                    className="input"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="zh">Chinese</option>
                  </select>
                </div>

                <motion.button
                  type="submit"
                  disabled={isSubmitting}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    <>
                      <Phone className="w-5 h-5" />
                      Call Me Now
                    </>
                  )}
                </motion.button>

                <p className="text-sm text-gray-600 mt-4">
                  We'll call you within 1 minute to demonstrate our AI voice capabilities. Your information is secure
                  and will never be shared.
                </p>
              </form>
            </motion.div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="section">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-4xl font-bold mb-4">Testimonials</h2>
              <p className="text-xl text-gray-600">Hear from businesses already using Verbio</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="card-glow"
                >
                  <div className="flex mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  <p className="text-gray-700 mb-6 italic">"{testimonial.quote}"</p>
                  <div className="flex items-center gap-3">
                    <img src={testimonial.avatar} alt={testimonial.author} className="w-12 h-12 rounded-full" />
                    <div>
                      <div className="font-semibold">{testimonial.author}</div>
                      <div className="text-sm text-gray-600">{testimonial.role}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="section bg-gradient-to-r from-primary-500 to-primary-600">
          <div className="container-max text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Ready to transform your voice communications?
              </h2>
              <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
                Join thousands of businesses using AI voice intelligence to deliver exceptional customer experiences
                24/7.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-white text-primary-600 rounded-button font-semibold hover:bg-gray-50 shadow-lg transition-all duration-200"
                  >
                    Start Free Trial
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Link
                    to="/pricing"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-transparent text-white border-2 border-white rounded-button font-semibold hover:bg-white/10 transition-all duration-200"
                  >
                    View Pricing
                    <ChevronRight className="w-5 h-5" />
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default Landing;
