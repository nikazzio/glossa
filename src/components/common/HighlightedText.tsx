interface Props {
  html: string;
  className?: string;
}

export function HighlightedText({ html, className = '' }: Props) {
  return (
    <div
      className={`min-h-[420px] w-full resize-none text-[15px] leading-8 text-editorial-ink ${className}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
