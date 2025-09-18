import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Calendar, Clock, User, ArrowRight, Search, Tag } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { format } from 'date-fns';

const Blog: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { id: 'all', name: 'All Posts', count: 12 },
    { id: 'product', name: 'Product Updates', count: 4 },
    { id: 'tutorials', name: 'Tutorials', count: 3 },
    { id: 'industry', name: 'Industry Insights', count: 3 },
    { id: 'case-studies', name: 'Case Studies', count: 2 },
  ];

  const blogPosts = [
    {
      id: 1,
      title: 'How AI Voice Technology is Transforming Customer Service in 2025',
      excerpt:
        'Discover how businesses are leveraging AI voice technology to provide 24/7 customer support while reducing costs by 50%.',
      author: 'Sarah Johnson',
      date: new Date('2025-01-15'),
      readTime: '5 min read',
      category: 'industry',
      image: 'https://images.unsplash.com/photo-1590650213165-c1fef80648c4?w=400&h=250&fit=crop',
      featured: true,
    },
    {
      id: 2,
      title: 'Getting Started with Verbio: Your First AI Agent in 10 Minutes',
      excerpt: 'Step-by-step guide to creating and deploying your first AI voice agent with Verbio platform.',
      author: 'Michael Chen',
      date: new Date('2025-01-12'),
      readTime: '8 min read',
      category: 'tutorials',
      image: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=400&h=250&fit=crop',
      featured: false,
    },
    {
      id: 3,
      title: 'New Feature: Real-Time Voice Analytics Dashboard',
      excerpt:
        'Introducing our new analytics dashboard that provides real-time insights into your AI voice interactions.',
      author: 'Emily Rodriguez',
      date: new Date('2025-01-10'),
      readTime: '4 min read',
      category: 'product',
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=250&fit=crop',
      featured: false,
    },
    {
      id: 4,
      title: 'Case Study: How TechStart Reduced Call Wait Times by 80%',
      excerpt: 'Learn how TechStart implemented Verbio to handle 10,000+ customer calls daily with zero wait time.',
      author: 'David Park',
      date: new Date('2025-01-08'),
      readTime: '6 min read',
      category: 'case-studies',
      image: 'https://images.unsplash.com/photo-1556761175-4b46a572b786?w=400&h=250&fit=crop',
      featured: false,
    },
    {
      id: 5,
      title: 'OpenAI GPT-5 Integration: What This Means for Voice AI',
      excerpt: 'Exploring the capabilities of the latest GPT models and how they enhance natural voice conversations.',
      author: 'Lisa Wang',
      date: new Date('2025-01-05'),
      readTime: '7 min read',
      category: 'industry',
      image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&h=250&fit=crop',
      featured: true,
    },
    {
      id: 6,
      title: 'Best Practices for Training Your AI Voice Agent',
      excerpt: 'Tips and strategies for creating natural, effective conversation flows for your AI agents.',
      author: 'James Wilson',
      date: new Date('2025-01-03'),
      readTime: '10 min read',
      category: 'tutorials',
      image: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=400&h=250&fit=crop',
      featured: false,
    },
  ];

  const filteredPosts = blogPosts.filter((post) => {
    const matchesSearch =
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || post.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const featuredPost = blogPosts.find((post) => post.featured);

  return (
    <>
      <Helmet>
        <title>Blog - Verbio AI Voice Platform</title>
        <meta
          name="description"
          content="Insights, tutorials, and updates about AI voice technology and how to maximize your Verbio experience."
        />
      </Helmet>

      <Header />

      <main className="bg-white pt-24">
        {/* Hero Section */}
        <section className="section bg-gradient-to-r from-primary-50 to-primary-100">
          <div className="container-max">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-3xl mx-auto"
            >
              <h1 className="text-5xl md:text-6xl font-bold mb-6">
                Verbio <span className="text-gradient-blue">Blog</span>
              </h1>
              <p className="text-xl text-gray-600">
                Insights on AI voice technology, product updates, and industry trends
              </p>
            </motion.div>
          </div>
        </section>

        {/* Featured Post */}
        {featuredPost && (
          <section className="py-12">
            <div className="container-max">
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="card overflow-hidden"
              >
                <div className="grid md:grid-cols-2 gap-8">
                  <img
                    src={featuredPost.image}
                    alt={featuredPost.title}
                    className="w-full h-64 md:h-full object-cover rounded-lg"
                  />
                  <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="badge badge-info">Featured</span>
                      <span className="text-sm text-gray-600 capitalize">{featuredPost.category}</span>
                    </div>
                    <h2 className="text-3xl font-bold mb-4">{featuredPost.title}</h2>
                    <p className="text-gray-600 mb-6">{featuredPost.excerpt}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {featuredPost.author}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {format(featuredPost.date, 'MMM d, yyyy')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {featuredPost.readTime}
                        </span>
                      </div>
                      <Link
                        to={`/blog/${featuredPost.id}`}
                        className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Read More
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>
        )}

        {/* Main Content */}
        <section className="section">
          <div className="container-max">
            <div className="grid lg:grid-cols-4 gap-8">
              {/* Sidebar */}
              <motion.aside initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1">
                <div className="sticky top-24 space-y-6">
                  {/* Search */}
                  <div className="card">
                    <h3 className="font-semibold mb-4">Search</h3>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search posts..."
                        className="input pl-10"
                      />
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                  </div>

                  {/* Categories */}
                  <div className="card">
                    <h3 className="font-semibold mb-4">Categories</h3>
                    <ul className="space-y-2">
                      {categories.map((category) => (
                        <li key={category.id}>
                          <button
                            onClick={() => setSelectedCategory(category.id)}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                              selectedCategory === category.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50'
                            }`}
                          >
                            <span className="flex items-center justify-between">
                              <span>{category.name}</span>
                              <span className="text-sm text-gray-500">({category.count})</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Newsletter */}
                  <div className="card bg-gradient-to-r from-primary-50 to-primary-100">
                    <h3 className="font-semibold mb-2">Newsletter</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Get the latest updates and insights delivered to your inbox.
                    </p>
                    <input type="email" placeholder="Your email" className="input mb-3" />
                    <button className="w-full btn-primary">Subscribe</button>
                  </div>
                </div>
              </motion.aside>

              {/* Blog Posts Grid */}
              <div className="lg:col-span-3">
                <div className="grid md:grid-cols-2 gap-6">
                  {filteredPosts.map((post, index) => (
                    <motion.article
                      key={post.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="card hover:shadow-glow transition-all"
                    >
                      <img src={post.image} alt={post.title} className="w-full h-48 object-cover rounded-lg mb-4" />
                      <div className="flex items-center gap-2 mb-3">
                        <Tag className="w-4 h-4 text-primary-600" />
                        <span className="text-sm text-primary-600 capitalize">{post.category}</span>
                      </div>
                      <h3 className="text-xl font-semibold mb-2">
                        <Link to={`/blog/${post.id}`} className="hover:text-primary-600 transition-colors">
                          {post.title}
                        </Link>
                      </h3>
                      <p className="text-gray-600 mb-4 line-clamp-2">{post.excerpt}</p>
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <div className="flex items-center gap-3">
                          <span>{post.author}</span>
                          <span>•</span>
                          <span>{format(post.date, 'MMM d')}</span>
                        </div>
                        <span>{post.readTime}</span>
                      </div>
                    </motion.article>
                  ))}
                </div>

                {filteredPosts.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-gray-600">No posts found matching your criteria.</p>
                  </div>
                )}

                {/* Pagination */}
                {filteredPosts.length > 0 && (
                  <div className="mt-8 flex justify-center">
                    <nav className="flex gap-2">
                      <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                        Previous
                      </button>
                      <button className="px-4 py-2 bg-primary-500 text-white rounded-lg">1</button>
                      <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                        2
                      </button>
                      <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                        3
                      </button>
                      <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                        Next
                      </button>
                    </nav>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default Blog;
