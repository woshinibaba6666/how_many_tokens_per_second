/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module 'markdown-it' {
  interface MarkdownItOptions {
    html?: boolean
    xhtmlOut?: boolean
    breaks?: boolean
    langPrefix?: string
    linkify?: boolean
    typographer?: boolean
    quotes?: string | string[]
    highlight?: (str: string, lang: string, attrs: string) => string
  }

  interface MarkdownIt {
    render(src: string, env?: unknown): string
    renderInline(src: string, env?: unknown): string
    use(plugin: unknown, ...options: unknown[]): MarkdownIt
  }

  const MarkdownIt: {
    new (presetName?: string, options?: MarkdownItOptions): MarkdownIt
    new (options?: MarkdownItOptions): MarkdownIt
  }

  export default MarkdownIt
}

declare module 'markdown-it-mathjax3' {
  const plugin: unknown
  export default plugin
}
