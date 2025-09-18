import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form by default', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('should switch to register form when toggle is clicked', async ({ page }) => {
    await page.getByRole('button', { name: /Don't have an account/ }).click();

    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByPlaceholder('Your Business Name')).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  test('should show password when eye icon is clicked', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('••••••••').first();
    const eyeButton = page.getByRole('button').filter({ has: page.locator('svg') }).nth(1);

    await expect(passwordInput).toHaveAttribute('type', 'password');
    await eyeButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('should validate email format', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('invalid-email');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Invalid email address')).toBeVisible();
  });

  test('should validate password length', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('••••••••').fill('123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();
  });

  test('should successfully login and redirect to dashboard', async ({ page }) => {
    await page.route('/api/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'fake-jwt-token',
          user: {
            id: 'user-123',
            email: 'test@example.com',
            businessId: 'business-456',
            businessName: 'Test Business',
          },
        }),
      });
    });

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

    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('••••••••').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('should show error message on failed login', async ({ page }) => {
    await page.route('/api/auth/login', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Invalid credentials',
        }),
      });
    });

    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Invalid credentials')).toBeVisible({ timeout: 10000 });
  });

  test('should successfully register and redirect to dashboard', async ({ page }) => {
    await page.getByRole('button', { name: /Don't have an account/ }).click();

    await page.route('/api/auth/register', async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'fake-jwt-token',
          user: {
            id: 'user-789',
            email: 'new@example.com',
            businessId: 'business-101',
            businessName: 'New Business',
          },
        }),
      });
    });

    await page.route('/api/auth/profile', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'user-789',
            email: 'new@example.com',
            businessId: 'business-101',
            businessName: 'New Business',
          },
        }),
      });
    });

    await page.getByPlaceholder('Your Business Name').fill('New Business');
    await page.getByPlaceholder('you@example.com').fill('new@example.com');

    const passwordInputs = page.getByPlaceholder('••••••••');
    await passwordInputs.nth(0).fill('password123');
    await passwordInputs.nth(1).fill('password123');

    await page.getByRole('button', { name: 'Create Account' }).click();

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('should validate password confirmation match', async ({ page }) => {
    await page.getByRole('button', { name: /Don't have an account/ }).click();

    await page.getByPlaceholder('Your Business Name').fill('Test Business');
    await page.getByPlaceholder('you@example.com').fill('test@example.com');

    const passwordInputs = page.getByPlaceholder('••••••••');
    await passwordInputs.nth(0).fill('password123');
    await passwordInputs.nth(1).fill('differentpassword');

    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByText(/Passwords don't match/)).toBeVisible();
  });

  test('should redirect authenticated users away from login', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'fake-jwt-token',
        domain: 'localhost',
        path: '/',
      },
    ]);

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

    await page.goto('/login');
    await expect(page).toHaveURL('/');
  });
});

test.describe('Protected Routes', () => {
  test('should redirect to login when accessing protected route without auth', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('should allow access to protected route with auth', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'auth_token',
        value: 'fake-jwt-token',
        domain: 'localhost',
        path: '/',
      },
    ]);

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

    await page.goto('/');
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Dashboard', { exact: false })).toBeVisible({ timeout: 10000 });
  });
});