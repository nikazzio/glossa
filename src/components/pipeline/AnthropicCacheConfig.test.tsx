import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicCacheConfig } from './AnthropicCacheConfig';

describe('AnthropicCacheConfig', () => {
  it('is off by default and hides the TTL toggle', () => {
    render(<AnthropicCacheConfig onChange={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'pipeline.anthropicCache.toggle' })).not.toBeChecked();
    expect(screen.queryByRole('switch', { name: 'pipeline.anthropicCache.extendedTtlToggle' })).not.toBeInTheDocument();
  });

  it('enables caching without touching extendedCacheTtl', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AnthropicCacheConfig value={{ temperature: 0.3 }} onChange={onChange} />);
    await user.click(screen.getByRole('switch', { name: 'pipeline.anthropicCache.toggle' }));
    expect(onChange).toHaveBeenCalledWith({ temperature: 0.3, enableCaching: true });
  });

  it('shows the TTL toggle once caching is enabled and reports the extended value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AnthropicCacheConfig value={{ enableCaching: true }} onChange={onChange} />);
    const ttlToggle = screen.getByRole('switch', { name: 'pipeline.anthropicCache.extendedTtlToggle' });
    expect(ttlToggle).not.toBeChecked();
    await user.click(ttlToggle);
    expect(onChange).toHaveBeenCalledWith({ enableCaching: true, extendedCacheTtl: true });
  });

  it('disables both toggles when disabled is set', () => {
    render(<AnthropicCacheConfig value={{ enableCaching: true }} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('switch', { name: 'pipeline.anthropicCache.toggle' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'pipeline.anthropicCache.extendedTtlToggle' })).toBeDisabled();
  });
});
