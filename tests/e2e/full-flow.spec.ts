import { test, expect } from '@playwright/test';

test.describe('Full E2E Flow', () => {
  test('complete user journey from registration to order management', async ({ page }) => {
    // 1. Registration
    await page.goto('/login');

    // Switch to registration
    await page.getByRole('button', { name: /Don't have an account/ }).click();

    // Fill registration form
    await page.getByPlaceholder('Your Business Name').fill('Test Restaurant E2E');
    await page.getByPlaceholder('you@example.com').fill(`test-${Date.now()}@example.com`);

    const passwordInputs = page.getByPlaceholder('••••••••');
    await passwordInputs.nth(0).fill('TestPassword123!');
    await passwordInputs.nth(1).fill('TestPassword123!');

    // Mock successful registration
    await page.route('/api/auth/register', async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'fake-jwt-token',
          user: {
            id: 'user-e2e',
            email: `test-${Date.now()}@example.com`,
            businessId: 'business-e2e',
            businessName: 'Test Restaurant E2E',
          },
        }),
      });
    });

    // Submit registration
    await page.getByRole('button', { name: 'Create Account' }).click();

    // Wait for redirect to dashboard
    await page.waitForURL('/');

    // 2. Dashboard - Business Data Upload
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Mock business data response
    await page.route('/api/business', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          business: {
            id: 'business-e2e',
            name: 'Test Restaurant E2E',
            data_json: {
              menu: [
                { name: 'Pizza', price: 15, description: 'Classic margherita' },
                { name: 'Burger', price: 12, description: 'Beef burger with fries' },
              ],
              hours: {
                monday: { open: '09:00', close: '21:00' },
                tuesday: { open: '09:00', close: '21:00' },
              },
              pricing: {
                delivery_fee: 5,
                minimum_order: 20,
              },
            },
          },
        }),
      });
    });

    // Mock agents response
    await page.route('/api/business/agents', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [],
        }),
      });
    });

    // Refresh to load business data
    await page.reload();

    // Verify business data is loaded
    await expect(page.getByText('Business Data')).toBeVisible();
    await expect(page.getByText('Pizza')).toBeVisible();

    // 3. Map Phone Number
    await page.getByPlaceholder('+1234567890').fill('+15551234567');

    // Mock phone mapping
    await page.route('/api/business/phone', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          phoneNumber: '+15551234567',
        }),
      });
    });

    await page.getByRole('button', { name: 'Map Number' }).click();

    // Verify success message
    await expect(page.getByText('Phone number mapped successfully')).toBeVisible();

    // 4. Create AI Agent
    await page.getByPlaceholder('Agent Name').fill('Order Assistant');
    await page.getByPlaceholder('Agent prompt instructions...').fill('Help customers place orders from our menu');

    const typeSelect = page.locator('select').nth(0);
    await typeSelect.selectOption('order');

    // Mock agent creation
    await page.route('/api/business/agents', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            agent: {
              id: 'agent-e2e',
              name: 'Order Assistant',
              type: 'order',
              prompt: 'Help customers place orders from our menu',
              voice_config: {
                voice: 'cedar',
                eagerness: 'medium',
                noise_reduction: 'auto',
              },
              is_active: true,
            },
          }),
        });
      }
    });

    await page.getByRole('button', { name: 'Create Agent' }).click();

    // Verify agent created
    await expect(page.getByText('Agent created successfully')).toBeVisible();

    // 5. Navigate to Orders Page
    await page.getByRole('link', { name: 'Orders' }).click();
    await page.waitForURL('/orders');

    // Mock orders data
    await page.route('/api/orders', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orders: [
            {
              id: 'order-e2e-001',
              business_id: 'business-e2e',
              customer_phone: '+15559876543',
              items: [
                { name: 'Pizza', quantity: 2, price: 15 },
                { name: 'Burger', quantity: 1, price: 12 },
              ],
              total: 42.00,
              status: 'pending',
              payment_status: 'paid',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    // Refresh orders
    await page.getByRole('button', { name: 'Refresh' }).click();

    // Verify order is displayed
    await expect(page.getByText('order-e2e-001', { exact: false })).toBeVisible();
    await expect(page.getByText('+15559876543')).toBeVisible();
    await expect(page.getByText('42.00')).toBeVisible();

    // 6. Update Order Status
    const statusSelect = page.locator('select').first();

    // Mock status update
    await page.route('/api/orders/*/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'preparing',
        }),
      });
    });

    await statusSelect.selectOption('preparing');

    // Verify status update
    await expect(page.getByText('Order status updated to preparing')).toBeVisible();

    // 7. Test Search Functionality
    await page.getByPlaceholder('Search orders...').fill('+15559876543');

    // Should still show the order
    await expect(page.getByText('+15559876543')).toBeVisible();

    // Clear search
    await page.getByPlaceholder('Search orders...').clear();

    // 8. Test Logout
    await page.getByRole('button', { name: 'Logout' }).click();

    // Mock logout
    await page.route('/api/auth/logout', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Should redirect to login
    await page.waitForURL('/login');
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  });

  test('simulate incoming call and order creation', async ({ page, context }) => {
    // Setup authentication
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'fake-jwt-token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.evaluate(() => {
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

    // Navigate to orders page
    await page.goto('/orders');

    // Initial empty state
    await page.route('/api/orders', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders: [] }),
      });
    });

    // Wait for empty state
    await expect(page.getByText('No orders yet')).toBeVisible();

    // Simulate WebSocket connection for realtime updates
    await page.evaluate(() => {
      // Mock Supabase realtime
      const mockChannel = {
        on: () => mockChannel,
        subscribe: () => mockChannel,
        unsubscribe: () => {},
      };

      (window as any).mockSupabaseChannel = mockChannel;

      // Simulate new order after 2 seconds
      setTimeout(() => {
        const event = new CustomEvent('newOrder', {
          detail: {
            id: 'order-realtime-001',
            business_id: 'business-456',
            customer_phone: '+15551112222',
            items: [{ name: 'Pizza', quantity: 1, price: 15 }],
            total: 15.00,
            status: 'pending',
            payment_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });
        window.dispatchEvent(event);
      }, 2000);
    });

    // Update orders API to return the new order
    await page.route('/api/orders', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orders: [
            {
              id: 'order-realtime-001',
              business_id: 'business-456',
              customer_phone: '+15551112222',
              items: [{ name: 'Pizza', quantity: 1, price: 15 }],
              total: 15.00,
              status: 'pending',
              payment_status: 'pending',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    // Click refresh after simulated order creation
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Refresh' }).click();

    // Verify new order appears
    await expect(page.getByText('+15551112222')).toBeVisible();
    await expect(page.getByText('15.00')).toBeVisible();
  });

  test('test responsive design', async ({ page, context }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/login');

    // Mobile menu should be hidden
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();

    // Login for mobile navigation test
    await page.route('/api/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'fake-jwt-token',
          user: { id: 'user-123', email: 'test@example.com' },
        }),
      });
    });

    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('••••••••').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Navigate to dashboard
    await page.waitForURL('/');

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();

    // Verify layout adjusts
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();

    // Sidebar should be visible on desktop
    await expect(page.getByRole('link', { name: 'Orders' })).toBeVisible();
  });
});