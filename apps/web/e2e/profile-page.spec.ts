import { test, expect } from '@playwright/test';

/**
 * E2E tests for the public profile page (Task 15.4)
 * 
 * Tests cover:
 * - Rendering per mode (work vs casual)
 * - 404 handling for non-existent profiles
 * - vCard download functionality
 * - Mode change appears after revalidation
 * 
 * Requirements: 5.1-5.11, 6.1-6.5, 8.1-8.3, 8.8
 */

test.describe('Public Profile Page', () => {
  // Mock API responses for testing
  const mockWorkProfile = {
    publicId: 'abc123test',
    customName: 'johndoe',
    fullName: 'John Doe',
    designation: 'Software Engineer',
    company: 'Acme Corp',
    bio: 'Building amazing things',
    avatarUrl: 'https://example.com/avatar.jpg',
    contact: {
      email: 'john@example.com',
      phone: '+1234567890',
    },
    mode: 'work',
    links: [
      {
        id: 'link1',
        title: 'LinkedIn',
        url: 'https://linkedin.com/in/johndoe',
        icon: 'linkedin',
        category: 'linkedin',
      },
      {
        id: 'link2',
        title: 'GitHub',
        url: 'https://github.com/johndoe',
        icon: 'github',
        category: 'github',
      },
    ],
  };

  const mockCasualProfile = {
    ...mockWorkProfile,
    mode: 'casual',
    links: [
      {
        id: 'link3',
        title: 'Instagram',
        url: 'https://instagram.com/johndoe',
        icon: 'instagram',
        category: 'instagram',
      },
      {
        id: 'link4',
        title: 'Spotify',
        url: 'https://spotify.com/user/johndoe',
        icon: 'music',
        category: 'spotify',
      },
    ],
  };

  test.beforeEach(async ({ page }) => {
    // Intercept API calls to avoid needing a real backend
    await page.route('**/api.tapsync.app/**', (route) => {
      const url = route.request().url();
      
      if (url.includes('/public/profiles/c/abc123test')) {
        if (url.includes('/vcard')) {
          // Mock vCard response
          route.fulfill({
            status: 200,
            contentType: 'text/vcard; charset=utf-8',
            headers: {
              'Content-Disposition': 'attachment; filename="John_Doe.vcf"',
            },
            body: `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:;John Doe;;;
ORG:Acme Corp
TITLE:Software Engineer
EMAIL;TYPE=INTERNET:john@example.com
TEL;TYPE=WORK,VOICE:+1234567890
URL:https://tapsync.app/c/abc123test
END:VCARD`,
          });
        } else {
          // Return work profile by default
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockWorkProfile),
          });
        }
      } else if (url.includes('/public/profiles/c/nonexistent')) {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Profile not found' }),
        });
      } else if (url.includes('/analytics/events')) {
        // Mock analytics endpoint (just accept)
        route.fulfill({
          status: 204,
        });
      } else {
        route.continue();
      }
    });
  });

  test('should render profile in work mode with correct links', async ({ page }) => {
    await page.goto('/c/abc123test');

    // Check profile header
    await expect(page.locator('text=John Doe')).toBeVisible();
    await expect(page.locator('text=Software Engineer')).toBeVisible();
    await expect(page.locator('text=Acme Corp')).toBeVisible();
    await expect(page.locator('text=Building amazing things')).toBeVisible();

    // Check work mode links are present
    await expect(page.locator('text=LinkedIn')).toBeVisible();
    await expect(page.locator('text=GitHub')).toBeVisible();

    // Check action buttons
    await expect(page.locator('text=Save Contact')).toBeVisible();
    await expect(page.locator('text=Save to My Network')).toBeVisible();
  });

  test('should render profile in casual mode with different links', async ({ page }) => {
    // Override the API response to return casual mode
    await page.route('**/public/profiles/c/abc123test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockCasualProfile),
      });
    });

    await page.goto('/c/abc123test');

    // Check casual mode links are present
    await expect(page.locator('text=Instagram')).toBeVisible();
    await expect(page.locator('text=Spotify')).toBeVisible();

    // Work mode links should not be present
    await expect(page.locator('text=LinkedIn')).not.toBeVisible();
    await expect(page.locator('text=GitHub')).not.toBeVisible();
  });

  test('should show 404 page for non-existent profile', async ({ page }) => {
    const response = await page.goto('/c/nonexistent');
    
    // Should get a 404 response
    expect(response?.status()).toBe(404);

    // Should show not found content
    await expect(page.locator('text=not found')).toBeVisible();
  });

  test('should download vCard when Save Contact is clicked', async ({ page }) => {
    await page.goto('/c/abc123test');

    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent('download');
    
    await page.click('text=Save Contact');

    const download = await downloadPromise;
    
    // Check download filename
    expect(download.suggestedFilename()).toContain('.vcf');
    
    // Optionally check content
    const content = await download.path();
    expect(content).toBeTruthy();
  });

  test('should send view beacon on page load', async ({ page }) => {
    let beaconSent = false;

    // Intercept analytics events
    await page.route('**/analytics/events', (route) => {
      const postData = route.request().postDataJSON();
      if (postData?.type === 'view') {
        beaconSent = true;
      }
      route.fulfill({ status: 204 });
    });

    await page.goto('/c/abc123test');

    // Wait a bit for the beacon to fire
    await page.waitForTimeout(500);

    expect(beaconSent).toBe(true);
  });

  test('should track link clicks', async ({ page }) => {
    let clickTracked = false;

    await page.route('**/analytics/events', (route) => {
      const postData = route.request().postDataJSON();
      if (postData?.type === 'link_click') {
        clickTracked = true;
      }
      route.fulfill({ status: 204 });
    });

    await page.goto('/c/abc123test');

    // Click a link
    await page.click('text=LinkedIn');

    // Wait a bit for the tracking to fire
    await page.waitForTimeout(500);

    expect(clickTracked).toBe(true);
  });

  test('should track contact save events', async ({ page }) => {
    let savTracked = false;

    await page.route('**/analytics/events', (route) => {
      const postData = route.request().postDataJSON();
      if (postData?.type === 'contact_save') {
        savTracked = true;
      }
      route.fulfill({ status: 204 });
    });

    await page.goto('/c/abc123test');

    // Mock the download to avoid actual file download
    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Save Contact');
    await downloadPromise;

    // Wait a bit for the tracking to fire
    await page.waitForTimeout(500);

    expect(savTracked).toBe(true);
  });

  test('should show empty state when profile has no links', async ({ page }) => {
    const emptyProfile = {
      ...mockWorkProfile,
      links: [],
    };

    await page.route('**/public/profiles/c/abc123test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyProfile),
      });
    });

    await page.goto('/c/abc123test');

    // Should show empty state
    await expect(page.locator('text=No links yet')).toBeVisible();
  });

  test('should use placeholder name when no name is set', async ({ page }) => {
    const anonymousProfile = {
      ...mockWorkProfile,
      fullName: '',
    };

    await page.route('**/public/profiles/c/abc123test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(anonymousProfile),
      });
    });

    await page.goto('/c/abc123test');

    // Should show placeholder
    await expect(page.locator('text=TapSync user')).toBeVisible();
  });

  test('should open links in new tab with noopener noreferrer', async ({ page }) => {
    await page.goto('/c/abc123test');

    const link = page.locator('a:has-text("LinkedIn")');
    
    // Check target and rel attributes
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('should be mobile responsive', async ({ page, isMobile }) => {
    await page.goto('/c/abc123test');

    // Check that profile is visible on mobile
    await expect(page.locator('text=John Doe')).toBeVisible();
    
    // Links should stack vertically on mobile
    const linksSection = page.locator('.links-section');
    await expect(linksSection).toBeVisible();
  });
});

test.describe('Mode Change Revalidation', () => {
  test('should show updated links after mode change and revalidation', async ({ page }) => {
    // This test simulates the revalidation flow
    // In a real scenario, this would require:
    // 1. Initial page load in work mode
    // 2. Mode toggle via API (requires auth)
    // 3. Revalidation webhook call
    // 4. Page reload or navigation shows new mode

    const workProfile = {
      publicId: 'abc123test',
      fullName: 'John Doe',
      mode: 'work',
      links: [
        {
          id: 'link1',
          title: 'LinkedIn',
          url: 'https://linkedin.com/in/johndoe',
          icon: 'linkedin',
          category: 'linkedin',
        },
      ],
      contact: {},
    };

    const casualProfile = {
      ...workProfile,
      mode: 'casual',
      links: [
        {
          id: 'link3',
          title: 'Instagram',
          url: 'https://instagram.com/johndoe',
          icon: 'instagram',
          category: 'instagram',
        },
      ],
    };

    let currentMode = 'work';

    await page.route('**/public/profiles/c/abc123test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentMode === 'work' ? workProfile : casualProfile),
      });
    });

    // Initial load - work mode
    await page.goto('/c/abc123test');
    await expect(page.locator('text=LinkedIn')).toBeVisible();

    // Simulate mode change
    currentMode = 'casual';

    // Reload page (simulating post-revalidation)
    await page.reload();

    // Should now show casual mode links
    await expect(page.locator('text=Instagram')).toBeVisible();
    await expect(page.locator('text=LinkedIn')).not.toBeVisible();
  });
});
