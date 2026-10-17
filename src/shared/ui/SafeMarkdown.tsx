import ReactMarkdown, { type Components } from 'react-markdown';
import type { ComponentProps } from 'react';

const components: Components = {
  img: ({ alt }) => <span className="document-image-placeholder">{alt ? `[Изображение: ${alt}]` : '[Встроенное изображение скрыто]'}</span>,
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;
    try {
      const url = new URL(href, window.location.origin);
      if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return <span>{children}</span>;
      return <a href={url.href} target="_blank" rel="noopener noreferrer">{children}</a>;
    } catch { return <span>{children}</span>; }
  },
};

export function SafeMarkdown(props: ComponentProps<typeof ReactMarkdown>) {
  if ((props.children?.length ?? 0) > 1_000_000) return <p role="status">Текст превышает предел безопасного предпросмотра.</p>;
  return <ReactMarkdown {...props} remarkPlugins={[...(props.remarkPlugins ?? []), remarkRenderBudget]} skipHtml components={components} />;
}

type RenderNode = { type: string; children?: RenderNode[]; value?: string };
function remarkRenderBudget() {
  return (tree: RenderNode) => {
    const queue = [{ node: tree, depth: 0 }]; let count = 0;
    while (queue.length) {
      const current = queue.pop()!;
      if (++count > 10_000 || current.depth > 32) {
        tree.children = [{ type: 'paragraph', children: [{ type: 'text', value: 'Структура документа превышает предел безопасного предпросмотра. Скачайте проверенный оригинал.' }] }];
        return;
      }
      for (const child of current.node.children ?? []) queue.push({ node: child, depth: current.depth + 1 });
    }
  };
}
