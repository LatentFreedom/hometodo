import { Fragment } from 'react';

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/**
 * Plain text with line breaks kept and web addresses turned into links. React escapes
 * every text node, so notes can never inject markup; only http and https become links.
 */
export function LinkedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <p className={`whitespace-pre-wrap break-words ${className ?? ''}`}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
