import { forwardRef } from 'react';
import type { CSSProperties } from 'react';

interface Props {
  html: string;
  className?: string;
  style?: CSSProperties;
}

export const HighlightedText = forwardRef<HTMLDivElement, Props>(
  function HighlightedText({ html, className = '', style }, ref) {
    return (
      <div
        ref={ref}
        className={`w-full whitespace-pre-wrap break-words ${className}`}
        style={style}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
);
