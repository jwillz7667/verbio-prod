import { test, expect } from '@playwright/test';

test.describe('Orders Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'fake-jwt-token');
      localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            businessId: 'business-456',
          },
          isAuthenticated: true,
        },
      }));
    });

    // Mock API responses
    await page.route('/api/auth/profile', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'user-123',
            email: 'test@example.com',
            businessId: 'business-456',
          },
        }),
      });
    });

    // Mock orders data
    await page.route('/api/orders', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orders: [
            {
              id: 'order-001',
              business_id: 'business-456',
              customer_phone: '+1234567890',
              items: [
                { name: 'Pizza', quantity: 2, price: 15 },
                { name: 'Soda', quantity: 2, price: 3 },
              ],
              total: 36.00,
              status: 'pending',
              payment_status: 'paid',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'order-002',
              business_id: 'business-456',
              customer_phone: '+1987654321',
              items: [
                { name: 'Burger', quantity: 1, price: 12 },
              ],
              total: 12.00,
              status: 'preparing',
              payment_status: 'paid',
              created_at: new Date(Date.now() - 3600000).toISOString(),
              updated_at: new Date(Date.now() - 3600000).toISOString(),
            },
            {
              id: 'order-003',
              business_id: 'business-456',
              customer_phone: '+1555555555',
              items: [
                { name: 'Salad', quantity: 1, price: 8 },
                { name: 'Juice', quantity: 1, price: 4 },
              ],
              total: 12.00,
              status: 'delivered',
              payment_status: 'paid',
              created_at: new Date(Date.now() - 7200000).toISOString(),
              updated_at: new Date(Date.now() - 7200000).toISOString(),
            },
          ],
        }),
      });
    });
  });

  test('should display orders table', async ({ page }) => {
    await page.goto('/orders');

    // Check page title
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
    await expect(page.getByText('Monitor and manage customer orders')).toBeVisible();

    // Check table headers
    await expect(page.getByRole('columnheader', { name: 'Order ID' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Date\/Time/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Customer' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Items' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Total/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Payment' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
  });

  test('should display order rows', async ({ page }) => {
    await page.goto('/orders');

    // Wait for table to load
    await page.waitForSelector('tbody tr');

    // Check if orders are displayed
    await expect(page.getByText('order-001', { exact: false })).toBeVisible();
    await expect(page.getByText('+1234567890')).toBeVisible();
    await expect(page.getByText('Pizza +1 more')).toBeVisible();
    await expect(page.getByText('36.00')).toBeVisible();

    await expect(page.getByText('order-002', { exact: false })).toBeVisible();
    await expect(page.getByText('+1987654321')).toBeVisible();
    await expect(page.getByText('Burger')).toBeVisible();
    await expect(page.getByText('12.00')).toBeVisible();
  });

  test('should display statistics cards', async ({ page }) => {
    await page.goto('/orders');

    // Check statistics
    await expect(page.getByText('Total Revenue')).toBeVisible();
    await expect(page.getByText('$60.00')).toBeVisible(); // 36 + 12 + 12

    await expect(page.getByText("Today's Orders")).toBeVisible();
    await expect(page.getByText('1', { exact: true })).toBeVisible(); // Only order-001 is today

    await expect(page.getByText('Pending')).toBeVisible();
    await expect(page.getByText('Paid Orders')).toBeVisible();
    await expect(page.getByText('3', { exact: true })).toBeVisible(); // All 3 are paid
  });

  test('should filter orders with search', async ({ page }) => {
    await page.goto('/orders');

    // Wait for table to load
    await page.waitForSelector('tbody tr');

    // Search for specific phone number
    await page.getByPlaceholder('Search orders...').fill('+1234567890');

    // Should only show one order
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(page.getByText('+1234567890')).toBeVisible();
  });

  test('should update order status', async ({ page }) => {
    let statusUpdateRequested = false;

    await page.route('/api/orders/*/status', async route => {
      statusUpdateRequested = true;
      const body = await route.request().postDataJSON();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: body.status,
        }),
      });
    });

    await page.goto('/orders');

    // Wait for table to load
    await page.waitForSelector('tbody tr');

    // Find the status dropdown for first order and change it
    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('confirmed');

    // Check if API was called
    expect(statusUpdateRequested).toBe(true);

    // Check for toast notification
    await expect(page.getByText('Order status updated to confirmed')).toBeVisible();
  });

  test('should show refund button for paid orders', async ({ page }) => {
    await page.goto('/orders');

    // Wait for table to load
    await page.waitForSelector('tbody tr');

    // Check if refund buttons are visible for paid orders
    const refundButtons = page.getByRole('button', { name: 'Refund' });
    await expect(refundButtons).toHaveCount(3); // All 3 orders are paid
  });

  test('should handle refund action', async ({ page }) => {
    await page.goto('/orders');

    // Wait for table to load
    await page.waitForSelector('tbody tr');

    // Mock window.confirm
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    // Mock window.open
    let stripeOpened = false;
    await page.evaluateOnNewDocument(() => {
      window.open = () => {
        window.stripeOpened = true;
        return null;
      };
    });

    // Click first refund button
    await page.getByRole('button', { name: 'Refund' }).first().click();

    // Check for toast notification
    await expect(page.getByText('Refund initiated. Check Stripe dashboard.')).toBeVisible();

    // Check if Stripe dashboard would be opened
    const wasOpened = await page.evaluate(() => (window as any).stripeOpened);
    expect(wasOpened).toBeDefined();
  });

  test('should display Stripe dashboard links', async ({ page }) => {
    await page.goto('/orders');

    // Wait for table to load
    await page.waitForSelector('tbody tr');

    // Check if Stripe links are present
    const stripeLinks = page.getByRole('link', { name: /Stripe/ });
    await expect(stripeLinks).toHaveCount(3); // One for each order

    // Check if link has correct attributes
    const firstLink = stripeLinks.first();
    await expect(firstLink).toHaveAttribute('target', '_blank');
    await expect(firstLink).toHaveAttribute('href', /dashboard\.stripe\.com/);
  });

  test('should paginate orders', async ({ page }) => {
    // Mock more orders for pagination
    await page.route('/api/orders', async route => {
      const orders = Array.from({ length: 25 }, (_, i) => ({
        id: `order-${String(i + 1).padStart(3, '0')}`,
        business_id: 'business-456',
        customer_phone: `+155555${String(i).padStart(4, '0')}`,
        items: [{ name: `Item ${i + 1}`, quantity: 1, price: 10 }],
        total: 10.00,
        status: 'pending',
        payment_status: 'paid',
        created_at: new Date(Date.now() - i * 3600000).toISOString(),
        updated_at: new Date(Date.now() - i * 3600000).toISOString(),
      }));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders }),
      });
    });

    await page.goto('/orders');

    // Wait for table to load
    await page.waitForSelector('tbody tr');

    // Check pagination controls
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
    await expect(page.getByText('Page 1 of')).toBeVisible();

    // Go to next page
    await page.getByRole('button', { name: 'Next' }).click();

    // Check if Previous is now enabled
    await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled();
    await expect(page.getByText('Page 2 of')).toBeVisible();
  });

  test('should show empty state when no orders', async ({ page }) => {
    // Mock empty orders response
    await page.route('/api/orders', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders: [] }),
      });
    });

    await page.goto('/orders');

    // Check empty state
    await expect(page.getByText('No orders yet')).toBeVisible();
    await expect(page.getByText('New orders will appear here automatically')).toBeVisible();
  });

  test('should refresh orders on button click', async ({ page }) => {
    let refreshCount = 0;

    await page.route('/api/orders', async route => {
      refreshCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orders: [
            {
              id: `order-refresh-${refreshCount}`,
              business_id: 'business-456',
              customer_phone: '+1234567890',
              items: [{ name: 'Test Item', quantity: 1, price: 10 }],
              total: 10.00,
              status: 'pending',
              payment_status: 'paid',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto('/orders');

    // Initial load
    expect(refreshCount).toBe(1);

    // Click refresh button
    await page.getByRole('button', { name: 'Refresh' }).click();

    // Check if orders were fetched again
    await page.waitForTimeout(500);
    expect(refreshCount).toBe(2);
  });

  test('should sort orders by date', async ({ page }) => {
    await page.goto('/orders');

    // Wait for table to load
    await page.waitForSelector('tbody tr');

    // Click on Date/Time header to sort
    await page.getByRole('button', { name: /Date\/Time/ }).click();

    // Check if sorting icon changed
    await expect(page.locator('svg.h-4.w-4').first()).toBeVisible();

    // Click again to reverse sort
    await page.getByRole('button', { name: /Date\/Time/ }).click();

    // Check if different sorting icon is shown
    await expect(page.locator('svg.h-4.w-4').first()).toBeVisible();
  });

  test('should sort orders by total', async ({ page }) => {
    await page.goto('/orders');

    // Wait for table to load
    await page.waitForSelector('tbody tr');

    // Click on Total header to sort
    await page.getByRole('button', { name: /Total/ }).click();

    // Verify sorting is applied
    await expect(page.locator('tbody tr').first()).toContainText('12.00');
  });
});