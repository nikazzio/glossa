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
        className={`min-h-[420px] w-full resize-none text-[15px] leading-8 text-editorial-ink ${className}`}
        style={style}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
);
