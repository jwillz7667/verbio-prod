import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.route('/api/auth/profile', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'user-123',
            email: 'test@example.com',
            businessId: 'business-456',
            businessName: 'Test Business',
          },
        }),
      });
    });

    // Mock business data
    await page.route('/api/business', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          business: {
            id: 'business-456',
            name: 'Test Business',
            phone_number: '+1234567890',
            data_json: {
              menu: [
                { name: 'Pizza', price: 15 },
                { name: 'Burger', price: 12 },
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

    // Mock agents data
    await page.route('/api/business/agents', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [
            {
              id: 'agent-1',
              name: 'Service Agent',
              type: 'service',
              prompt: 'You are a helpful service agent',
              voice_config: {
                voice: 'cedar',
                eagerness: 'medium',
                noise_reduction: 'auto',
              },
              is_active: true,
            },
            {
              id: 'agent-2',
              name: 'Order Agent',
              type: 'order',
              prompt: 'You help customers place orders',
              voice_config: {
                voice: 'marin',
                eagerness: 'high',
                noise_reduction: 'auto',
              },
              is_active: true,
            },
          ],
        }),
      });
    });

    // Set auth in localStorage
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'fake-jwt-token');
      localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
          },
          isAuthenticated: true,
        },
      }));
    });

    // Login first
    await page.goto('/login');
    await page.route('/api/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'fake-jwt-token',
          user: {
            id: 'user-123',
            email: 'test@example.com',
          },
        }),
      });
    });

    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('••••••••').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL('/');
  });

  test('should display dashboard with business data', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Manage your business data')).toBeVisible();

    // Check phone number display
    await expect(page.getByText('+1234567890')).toBeVisible();

    // Check if JSON viewer is present
    await expect(page.getByText('Business Data')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save Changes/ })).toBeVisible();
  });

  test('should display agents list', async ({ page }) => {
    await expect(page.getByText('AI Agents')).toBeVisible();
    await expect(page.getByText('2 Agents')).toBeVisible();

    // Check if agents are displayed
    await expect(page.getByText('Service Agent')).toBeVisible();
    await expect(page.getByText('Order Agent')).toBeVisible();

    // Check agent types
    await expect(page.getByText('service', { exact: true })).toBeVisible();
    await expect(page.getByText('order', { exact: true })).toBeVisible();
  });

  test('should edit JSON data and save', async ({ page }) => {
    let saveRequestMade = false;

    await page.route('/api/business/*/data', async route => {
      saveRequestMade = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Data updated successfully',
        }),
      });
    });

    // Click on Save Changes button
    await page.getByRole('button', { name: /Save Changes/ }).click();

    // Wait for the save request
    await page.waitForTimeout(500);

    // Check if toast appears
    await expect(page.getByText('Business data updated successfully')).toBeVisible();

    expect(saveRequestMade).toBe(true);
  });

  test('should add new phone number', async ({ page }) => {
    let phoneRequestMade = false;

    await page.route('/api/business/phone', async route => {
      phoneRequestMade = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Phone number mapped successfully',
        }),
      });
    });

    // Enter phone number
    await page.getByPlaceholder('+1234567890').fill('+19876543210');

    // Click Map Number button
    await page.getByRole('button', { name: 'Map Number' }).click();

    // Wait for the request
    await page.waitForTimeout(500);

    // Check if toast appears
    await expect(page.getByText('Phone number mapped successfully')).toBeVisible();

    expect(phoneRequestMade).toBe(true);
  });

  test('should create new agent', async ({ page }) => {
    let createAgentRequestMade = false;

    await page.route('/api/business/agents', async route => {
      if (route.request().method() === 'POST') {
        createAgentRequestMade = true;
        const body = await route.request().postDataJSON();

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            agent: {
              id: 'agent-3',
              name: body.name,
              type: body.type,
              prompt: body.prompt,
              voice_config: body.voice_config,
              is_active: true,
            },
          }),
        });
      }
    });

    // Fill in new agent form
    await page.getByPlaceholder('Agent Name').fill('Payment Agent');
    await page.getByPlaceholder('Agent prompt instructions...').fill('You handle payment processing');

    // Select payment type
    const typeSelect = page.locator('select').nth(0);
    await typeSelect.selectOption('payment');

    // Click Create Agent button
    await page.getByRole('button', { name: 'Create Agent' }).click();

    // Wait for the request
    await page.waitForTimeout(500);

    // Check if toast appears
    await expect(page.getByText('Agent created successfully')).toBeVisible();

    expect(createAgentRequestMade).toBe(true);
  });

  test('should edit existing agent', async ({ page }) => {
    // Click edit button for first agent
    await page.getByRole('button').filter({ has: page.locator('svg.h-4.w-4') }).first().click();

    // Should show edit form
    await expect(page.locator('textarea').first()).toBeVisible();

    // Modify the prompt
    await page.locator('textarea').first().fill('Updated prompt for the agent');

    let updateRequestMade = false;
    await page.route('/api/business/agents/*', async route => {
      if (route.request().method() === 'PUT') {
        updateRequestMade = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Agent updated successfully',
          }),
        });
      }
    });

    // Click Save button
    await page.getByRole('button', { name: 'Save' }).click();

    // Wait for the request
    await page.waitForTimeout(500);

    // Check if toast appears
    await expect(page.getByText('Agent updated successfully')).toBeVisible();

    expect(updateRequestMade).toBe(true);
  });

  test('should delete agent', async ({ page }) => {
    let deleteRequestMade = false;

    await page.route('/api/business/agents/*', async route => {
      if (route.request().method() === 'DELETE') {
        deleteRequestMade = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Agent deleted successfully',
          }),
        });
      }
    });

    // Mock window.confirm
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    // Click delete button for first agent
    const deleteButtons = page.getByRole('button').filter({ has: page.locator('svg.h-4.w-4') });
    await deleteButtons.nth(1).click();

    // Wait for the request
    await page.waitForTimeout(500);

    // Check if toast appears
    await expect(page.getByText('Agent deleted successfully')).toBeVisible();

    expect(deleteRequestMade).toBe(true);
  });

  test('should validate phone number format', async ({ page }) => {
    // Enter invalid phone number
    await page.getByPlaceholder('+1234567890').fill('invalid');

    // Click Map Number button
    await page.getByRole('button', { name: 'Map Number' }).click();

    // Check if error toast appears
    await expect(page.getByText('Please enter a valid phone number')).toBeVisible();
  });

  test('should show warning when no phone number is mapped', async ({ page }) => {
    // Mock business without phone number
    await page.route('/api/business', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          business: {
            id: 'business-456',
            name: 'Test Business',
            data_json: {},
          },
        }),
      });
    });

    await page.reload();

    // Check warning message
    await expect(page.getByText('No phone number mapped')).toBeVisible();
    await expect(page.getByText('Map a Twilio phone number to start receiving calls')).toBeVisible();
  });
});