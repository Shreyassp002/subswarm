"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeUrl } from '@/lib/api';

export default function MarkdownText({ children, compact = false }: { children: string; compact?: boolean }) {
  return <div className={`artifact-body markdown-body${compact ? ' markdown-preview' : ''}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ href, children }) => {
        const url = href && safeUrl(href);
        return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
      },
      img: ({ alt }) => <span>{alt || 'Image'}</span>,
      table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
    }}>{children}</ReactMarkdown>
  </div>;
}
