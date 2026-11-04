import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders empty state with message', () => {
    render(<EmptyState />);

    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText(/This profile is just getting set up/i)).toBeInTheDocument();
  });

  it('renders decorative icon', () => {
    render(<EmptyState />);

    expect(screen.getByText('✨')).toBeInTheDocument();
  });
});
