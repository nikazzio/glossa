import { forwardRef } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  html: string;
  className?: string;
  style?: CSSProperties;
}

export const HighlightedText = forwardRef<HTMLDivElement, Props>(
  function HighlightedText({ html, className = '', style, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={`w-full whitespace-pre-wrap break-words ${className}`}
        style={style}
        {...rest}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
);
