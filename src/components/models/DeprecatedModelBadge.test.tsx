import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DeprecatedModelBadge } from './DeprecatedModelBadge';

describe('DeprecatedModelBadge', () => {
  it('renders nothing for a stable model', () => {
    const { container } = render(<DeprecatedModelBadge provider="openai" model="gpt-5.6-sol" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a warning indicator for a deprecated model', () => {
    const { container } = render(<DeprecatedModelBadge provider="openai" model="gpt-4.1-mini" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
