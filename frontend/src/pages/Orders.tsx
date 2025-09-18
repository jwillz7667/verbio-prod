import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
  FilterFn,
  SortingState,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  ShoppingCartIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  PhoneIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline';
import api from '../services/api';
import { supabase } from '../lib/supabase';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuthStore } from '../store/authStore';
import type { Order } from '../types';

const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
};

const rankItem = (rowValue: any, searchValue: string) => {
  const value = rowValue?.toString().toLowerCase() || '';
  const search = searchValue.toLowerCase();
  return {
    passed: value.includes(search),
    score: value.startsWith(search) ? 1 : 0.5,
  };
};

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const { user } = useAuthStore();

  useEffect(() => {
    fetchOrders();
    const subscription = subscribeToOrders();

    return () => {
      subscription?.unsubscribe();
    };
  }, [user?.businessId]);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const response = await api.getOrders();
      setOrders(response.orders || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeToOrders = () => {
    if (!user?.businessId) return;

    const channel = supabase
      .channel('orders-db')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `business_id=eq.${user.businessId}`,
        },
        (payload) => {
          console.log('New order received:', payload);
          setOrders((prev) => [payload.new as Order, ...prev]);
          toast.success('New order received!', {
            icon: '🛍️',
            duration: 5000,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `business_id=eq.${user.businessId}`,
        },
        (payload) => {
          console.log('Order updated:', payload);
          setOrders((prev) =>
            prev.map((order) =>
              order.id === payload.new.id ? (payload.new as Order) : order
            )
          );
          toast.success('Order updated', {
            icon: '📝',
            duration: 3000,
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to orders realtime updates');
        }
      });

    return channel;
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      await api.updateOrderStatus(orderId, newStatus);
      toast.success(`Order status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const handleRefund = async (orderId: string, amount: number) => {
    if (!confirm(`Are you sure you want to refund $${amount.toFixed(2)}?`)) {
      return;
    }

    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        toast.error('Order not found');
        return;
      }

      toast.loading('Processing refund...', { id: 'refund' });

      // Note: Actual Stripe refund would be processed here
      toast.success('Refund initiated. Check Stripe dashboard.', { id: 'refund' });

      // Open Stripe dashboard in new tab
      window.open('https://dashboard.stripe.com/payments', '_blank');
    } catch (error) {
      console.error('Error processing refund:', error);
      toast.error('Failed to process refund', { id: 'refund' });
    }
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    preparing: 'bg-orange-100 text-orange-800',
    ready: 'bg-green-100 text-green-800',
    completed: 'bg-emerald-100 text-emerald-800',
    delivered: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const paymentStatusColors = {
    pending: 'bg-gray-100 text-gray-800',
    paid: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    refunded: 'bg-purple-100 text-purple-800',
    partially_refunded: 'bg-orange-100 text-orange-800',
  };

  const columns = useMemo<ColumnDef<Order>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'Order ID',
        cell: ({ row }) => (
          <div className="font-mono text-xs text-gray-600">
            {row.original.id.slice(0, 8)}...
          </div>
        ),
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 hover:text-violet-600"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Date/Time
            {column.getIsSorted() === 'asc' ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ArrowsUpDownIcon className="h-4 w-4" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="font-medium">
              {format(new Date(row.original.created_at), 'MMM dd, yyyy')}
            </div>
            <div className="text-gray-500 text-xs">
              {format(new Date(row.original.created_at), 'h:mm a')}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'customer_phone',
        header: 'Customer',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <PhoneIcon className="h-4 w-4 text-gray-400" />
            <span className="text-sm">{row.original.customer_phone}</span>
          </div>
        ),
      },
      {
        accessorKey: 'items',
        header: 'Items',
        cell: ({ row }) => {
          const items = row.original.items || [];
          return (
            <div className="text-sm">
              {items.length === 0 ? (
                <span className="text-gray-500">No items</span>
              ) : items.length === 1 ? (
                <span>{items[0].name}</span>
              ) : (
                <span>
                  {items[0].name} +{items.length - 1} more
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'total',
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 hover:text-violet-600"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Total
            {column.getIsSorted() === 'asc' ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ArrowsUpDownIcon className="h-4 w-4" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1 font-medium">
            <CurrencyDollarIcon className="h-4 w-4 text-gray-400" />
            {row.original.total.toFixed(2)}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <select
            value={row.original.status}
            onChange={(e) => handleStatusUpdate(row.original.id, e.target.value)}
            className={`px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer ${
              statusColors[row.original.status]
            }`}
          >
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        ),
      },
      {
        accessorKey: 'payment_status',
        header: 'Payment',
        cell: ({ row }) => (
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${
              paymentStatusColors[row.original.payment_status]
            }`}
          >
            {row.original.payment_status}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.payment_status === 'paid' && (
              <button
                onClick={() => handleRefund(row.original.id, row.original.total)}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
              >
                Refund
              </button>
            )}
            <a
              href={`https://dashboard.stripe.com/payments?query=${row.original.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              Stripe
              <ArrowTopRightOnSquareIcon className="h-3 w-3" />
            </a>
          </div>
        ),
      },
    ],
    [orders]
  );

  const table = useReactTable({
    data: orders,
    columns,
    filterFns: {
      fuzzy: fuzzyFilter,
    },
    state: {
      globalFilter,
      sorting,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    globalFilterFn: fuzzyFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const stats = useMemo(() => {
    const total = orders.reduce((sum, order) => sum + order.total, 0);
    const pending = orders.filter((o) => o.status === 'pending').length;
    const paid = orders.filter((o) => o.payment_status === 'paid').length;
    const today = orders.filter(
      (o) =>
        format(new Date(o.created_at), 'yyyy-MM-dd') ===
        format(new Date(), 'yyyy-MM-dd')
    ).length;

    return { total, pending, paid, today };
  }, [orders]);

  if (isLoading) {
    return <LoadingSpinner fullScreen message="Loading orders..." />;
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor and manage customer orders in real-time
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Refresh
        </button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg shadow p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">
                ${stats.total.toFixed(2)}
              </p>
            </div>
            <CurrencyDollarIcon className="h-8 w-8 text-green-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Today's Orders</p>
              <p className="text-2xl font-bold text-gray-900">{stats.today}</p>
            </div>
            <ShoppingCartIcon className="h-8 w-8 text-blue-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-lg shadow p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
            </div>
            <ClockIcon className="h-8 w-8 text-yellow-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-lg shadow p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Paid Orders</p>
              <p className="text-2xl font-bold text-gray-900">{stats.paid}</p>
            </div>
            <CheckCircleIcon className="h-8 w-8 text-green-500" />
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-lg shadow"
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search orders..."
              className="flex-1 outline-none text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <AnimatePresence>
                {table.getRowModel().rows.map((row) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-gray-50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-6 py-4 whitespace-nowrap text-sm"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {orders.length === 0 && (
          <div className="text-center py-12">
            <ShoppingCartIcon className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">No orders yet</p>
            <p className="text-xs text-gray-400">
              New orders will appear here automatically
            </p>
          </div>
        )}

        <div className="px-6 py-3 flex items-center justify-between border-t border-gray-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="text-sm text-gray-500">
            Page {table.getState().pagination.pageIndex + 1} of{' '}
            {table.getPageCount()}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Orders;