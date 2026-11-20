import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Layout } from './Layout';

describe('Layout: skip link', () => {
  it('is the first Tab stop and moves focus to the main content without changing the URL', async () => {
    const router = createMemoryRouter(
      [{ element: <Layout />, children: [{ path: '*', element: <p>Page content</p> }] }],
      { initialEntries: ['/contacts'] },
    );
    render(<RouterProvider router={router} />);

    await userEvent.tab();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();

    await userEvent.click(skip);
    expect(screen.getByRole('main')).toHaveFocus();
    expect(router.state.location.hash).toBe('');
  });
});
