import MarkdownIt from 'markdown-it'
import mathjaxPlugin from 'markdown-it-mathjax3'

// Hoisted constants (created once)
const KNOWN_BARE_CMDS = new Set([
  'times', 'cdot', 'div', 'pm', 'mp', 'leq', 'geq', 'neq', 'approx',
  'equiv', 'propto', 'sim', 'simeq', 'cong', 'perp', 'parallel',
  'rightarrow', 'leftarrow', 'uparrow', 'downarrow', 'Rightarrow',
  'Leftarrow', 'leftrightarrow', 'mapsto', 'to', 'implies', 'iff',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta',
  'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho',
  'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega', 'Gamma',
  'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi',
  'Psi', 'Omega', 'infty', 'partial', 'nabla', 'forall', 'exists',
  'emptyset', 'varnothing', 'neg', 'wedge', 'vee', 'oplus', 'otimes',
  'subset', 'supset', 'subseteq', 'supseteq', 'in', 'notin', 'ni',
  'mid', 'cdot', 'ldots', 'cdots', 'vdots', 'ddots', 'circ', 'bullet',
  'angle', 'triangle', 'square', 'Box', 'diamond', 'hbar', 'ell',
  'wp', 'Re', 'Im', 'aleph', 'big', 'Big', 'bigg', 'Bigg',
  'left', 'right', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr',
  'text', 'mathbf', 'mathit', 'mathrm', 'mathsf', 'mathtt', 'mathbb',
  'mathcal', 'mathfrak', 'mathscr', 'bm', 'boldsymbol',
  'hat', 'tilde', 'bar', 'vec', 'dot', 'ddot', 'widehat', 'widetilde',
  'int', 'sum', 'prod', 'coprod', 'oint', 'bigcup', 'bigcap',
  'bigvee', 'bigwedge', 'bigoplus', 'bigotimes', 'biguplus', 'bigsqcup',
  'lim', 'log', 'ln', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'max', 'min',
  'sup', 'inf', 'det', 'dim', 'gcd', 'hom', 'ker', 'Pr', 'deg',
  'binom', 'dbinom', 'tbinom', 'brace', 'brack', 'choose',
  'overline', 'underline', 'overrightarrow', 'underrightarrow',
  'overleftarrow', 'underleftarrow', 'overbrace', 'underbrace',
  'xrightarrow', 'xleftarrow',
  'langle', 'rangle', 'lceil', 'rceil', 'lfloor', 'rfloor',
])

const MULTI_ARG_CMDS = new Set([
  'frac', 'binom', 'dbinom', 'tbinom', 'stackrel',
])

const EXTEND_RE = /^(\s*)([_^]\{[^{}]*\}|\\[a-zA-Z]+(?:\{[^{}]*\})*|[+\-*/=×÷<>≠≤≥≈±()[\]]|[0-9.]+|[a-zA-Z]+(?:\s*[_^]\{[^{}]*\})?)/

// Lazy MathJax/MarkdownIt initialization
let md: MarkdownIt | null = null

function getMd(): MarkdownIt {
  if (!md) {
    md = new MarkdownIt({ html: false, linkify: true, breaks: false })
    const mathjax3 = (mathjaxPlugin as any).default || mathjaxPlugin
    md.use(mathjax3, {
      tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        throwOnError: false,
      },
      svg: { fontCache: 'none' },
    })
  }
  return md
}

// Render cache
const renderCache = new Map<string, string>()

/**
 * Wrap raw LaTeX commands (e.g. \frac{}{}, \sqrt{}) in $ delimiters so
 * MathJax can render them. LLMs often output these without delimiters in
 * thinking blocks.
 */
function wrapNakedLatex(text: string): string {
  // Split into protected (code spans, existing display-math) and text segments
  const blocks: { type: 'text' | 'protected'; content: string }[] = []
  const splitRe = /(`[^`]*`|\$\$[\s\S]*?\$\$)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = splitRe.exec(text)) !== null) {
    if (m.index > last) blocks.push({ type: 'text', content: text.slice(last, m.index) })
    blocks.push({ type: 'protected', content: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) blocks.push({ type: 'text', content: text.slice(last) })

  return blocks
    .map((b) => {
      if (b.type === 'protected') return b.content
      return processSegment(b.content)
    })
    .join('')
}

/** Process a text segment (no code spans, no $$ blocks) for raw LaTeX. */
function processSegment(seg: string): string {
  // Regex to extend a math region forward with adjacent math tokens
  function extendMath(seg: string, start: number): number {
    let end = start
    while (end < seg.length) {
      const rest = seg.slice(end)
      const extMatch = rest.match(EXTEND_RE)
      if (extMatch && extMatch[2]) {
        const bareCheck = extMatch[2].match(/^\\([a-zA-Z]+)$/)
        if (bareCheck && !KNOWN_BARE_CMDS.has(bareCheck[1])) break
        end += extMatch[0].length
      } else {
        break
      }
    }
    return end
  }

  let out = ''
  let i = 0
  while (i < seg.length) {
    // Skip existing inline-math $...$
    if (seg[i] === '$') {
      let j = i + 1
      while (j < seg.length && seg[j] !== '$') j++
      if (j < seg.length) {
        out += seg.slice(i, j + 1)
        i = j + 1
        continue
      }
    }

    // ── Bare superscript / subscript: a_{…}  x^{…}  2^{…}  )^{…} ──
    if (
      i < seg.length - 2 &&
      /[a-zA-Z0-9)]/.test(seg[i]) &&
      /[_^]/.test(seg[i + 1]) &&
      seg[i + 2] === '{'
    ) {
      let depth = 1
      let k = i + 3
      while (k < seg.length && depth > 0) {
        if (seg[k] === '{') depth++
        else if (seg[k] === '}') depth--
        k++
      }
      if (depth > 0) {
        out += seg[i]
        i++
        continue // streaming — incomplete
      }
      const mathEnd = extendMath(seg, k)
      out += '$' + seg.slice(i, mathEnd) + '$'
      i = mathEnd
      continue
    }

    // Detect LaTeX command: \letters optionally followed by {braces}
    const cmdRe = /^\\[a-zA-Z]+/
    const cmdMatch = seg.slice(i).match(cmdRe)
    if (!cmdMatch) {
      out += seg[i]
      i++
      continue
    }

    // Count brace groups after the command name — only wrap if at least one
    // brace group exists (e.g. \frac{a}{b}) or if it's a known symbol that
    // needs math mode (e.g. \times, \alpha). For safety, always wrap if
    // braces present; for bare commands, check a known list.
    let j = i + cmdMatch[0].length
    let braceContent = ''
    let braceGroupCount = 0
    while (j < seg.length && seg[j] === '{') {
      let depth = 1
      let k = j + 1
      while (k < seg.length && depth > 0) {
        if (seg[k] === '{') depth++
        else if (seg[k] === '}') depth--
        k++
      }
      // Incomplete brace during streaming — don't wrap, math isn't ready yet
      if (depth > 0) {
        braceContent = ''
        braceGroupCount = 0
        break
      }
      braceContent += seg.slice(j, k)
      braceGroupCount++
      j = k
    }

    const cmdName = cmdMatch[0].slice(1)

    // Commands that require at least 2 brace arguments (e.g. \frac{}{}).
    // If fewer are present (incomplete streaming), don't wrap.
    if (MULTI_ARG_CMDS.has(cmdName) && braceGroupCount < 2) {
      out += cmdMatch[0] + braceContent
      i = j
      continue
    }

    // ── \begin{env} ... \end{env} → $$ display math ──
    if (cmdName === 'begin' && braceContent) {
      const envMatch = braceContent.match(/^\{([^}]*)\}/)
      if (envMatch) {
        const envName = envMatch[1]
        let depth = 1
        let pos = j
        while (pos < seg.length && depth > 0) {
          const rest = seg.slice(pos)
          const bIdx = rest.indexOf(`\\begin{${envName}}`)
          const eIdx = rest.indexOf(`\\end{${envName}}`)
          if (eIdx === -1) break // streaming: \end not yet received
          if (bIdx !== -1 && bIdx < eIdx) {
            depth++
            pos += bIdx + `\\begin{${envName}}`.length
          } else {
            depth--
            pos += eIdx + `\\end{${envName}}`.length
          }
        }
        if (depth === 0) {
          out += '$$' + seg.slice(i, pos) + '$$'
          i = pos
          continue
        }
        // Incomplete — output as-is, don't wrap partial math
        out += seg.slice(i, j)
        i = j
        continue
      }
    }

    // \end{...} appearing alone → don't wrap, it belongs to a \begin block
    if (cmdName === 'end') {
      out += cmdMatch[0] + braceContent
      i = j
      continue
    }

    const hasBraces = braceContent.length > 0
    const isBareSymbol = KNOWN_BARE_CMDS.has(cmdName)

    if (!hasBraces && !isBareSymbol) {
      // Not a recognized LaTeX math pattern — keep as-is
      out += cmdMatch[0]
      i += cmdMatch[0].length
      continue
    }

    const mathEnd = extendMath(seg, j)
    out += '$' + seg.slice(i, mathEnd) + '$'
    i = mathEnd
  }
  return out
}

export function renderMarkdown(text: string): string {
  if (!text) return ''

  const cached = renderCache.get(text)
  if (cached !== undefined) return cached

  let preprocessed = text
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')

  // Wrap raw LaTeX commands that lack $ delimiters (common in LLM thinking)
  preprocessed = wrapNakedLatex(preprocessed)

  // During streaming, delimiters may be unclosed. Escape only the unpaired
  // ones so MathJax won't render incomplete formulas.
  const codeSpans = preprocessed.split(/(`[^`]*`)/g)
  preprocessed = codeSpans.map((part, i) => {
    if (i % 2 === 1) return part // inside code span, don't touch

    // Handle $$ (display math)
    const displayPositions: number[] = []
    let idx = 0
    while ((idx = part.indexOf('$$', idx)) !== -1) {
      displayPositions.push(idx)
      idx += 2
    }

    // Handle $ (inline math) — skip escaped \$ and $$ already tracked
    const inlinePositions: number[] = []
    idx = 0
    while ((idx = part.indexOf('$', idx)) !== -1) {
      // Skip escaped \$
      if (idx > 0 && part[idx - 1] === '\\') {
        idx += 1
        continue
      }
      // Skip $$ positions (already tracked as display math)
      const isDisplayStart = displayPositions.includes(idx)
      if (!isDisplayStart) {
        inlinePositions.push(idx)
      }
      idx += 1
    }

    // Build set of paired delimiter positions
    const paired = new Set<number>()
    // Pair $$ sequentially
    for (let j = 0; j + 1 < displayPositions.length; j += 2) {
      paired.add(displayPositions[j]).add(displayPositions[j + 1])
    }
    // Pair $ sequentially
    for (let j = 0; j + 1 < inlinePositions.length; j += 2) {
      paired.add(inlinePositions[j]).add(inlinePositions[j + 1])
    }

    // Rebuild: escape unpaired delimiters
    let result = ''
    let pos = 0
    while (pos < part.length) {
      if (part.startsWith('$$', pos) && !paired.has(pos)) {
        result += '\\$\\$'
        pos += 2
      } else if (part[pos] === '$' && !paired.has(pos) && (pos === 0 || part[pos - 1] !== '\\')) {
        result += '\\$'
        pos += 1
      } else {
        result += part[pos]
        pos++
      }
    }
    return result
  }).join('')

  try {
    const result = getMd().render(preprocessed)

    // Cache with size limit
    if (renderCache.size > 200) {
      const firstKey = renderCache.keys().next().value
      if (firstKey !== undefined) renderCache.delete(firstKey)
    }
    renderCache.set(text, result)

    return result
  } catch {
    return text.replace(/\n/g, '<br>')
  }
}
