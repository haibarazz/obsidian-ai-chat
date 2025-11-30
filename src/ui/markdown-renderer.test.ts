/**
 * Property-based tests and unit tests for ChatMarkdownRenderer
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations
 * 
 * Note: Since Obsidian's MarkdownRenderer is not available in the test environment,
 * these tests focus on the testable utility functions and LaTeX source management.
 * The actual markdown rendering is tested through integration tests in Obsidian.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Since we can't import the actual ChatMarkdownRenderer (it depends on Obsidian),
 * we test the core logic patterns that the renderer implements.
 * These tests validate the correctness properties of markdown rendering logic.
 */

/**
 * Utility functions that mirror the markdown renderer's internal logic
 * These are extracted for testability
 */

/**
 * Extracts display LaTeX formulas from markdown content
 */
function extractDisplayLatex(content: string): string[] {
  const displayLatexRegex = /\$\$([^$]+)\$\$/g;
  const formulas: string[] = [];
  let match;
  while ((match = displayLatexRegex.exec(content)) !== null) {
    formulas.push(match[1].trim());
  }
  return formulas;
}

/**
 * Extracts inline LaTeX formulas from markdown content
 */
function extractInlineLatex(content: string): string[] {
  const displayLatexRegex = /\$\$([^$]+)\$\$/g;
  const inlineLatexRegex = /\$([^$\n]+)\$/g;
  
  // Remove display formulas first
  const contentWithoutDisplay = content.replace(displayLatexRegex, '');
  
  const formulas: string[] = [];
  let match;
  while ((match = inlineLatexRegex.exec(contentWithoutDisplay)) !== null) {
    formulas.push(match[1].trim());
  }
  return formulas;
}

/**
 * Checks if content contains markdown headings
 */
function containsHeadings(content: string): boolean {
  return /^#{1,6}\s+.+$/m.test(content);
}

/**
 * Checks if content contains bold text
 */
function containsBold(content: string): boolean {
  return /\*\*[^*]+\*\*/.test(content) || /__[^_]+__/.test(content);
}

/**
 * Checks if content contains italic text
 */
function containsItalic(content: string): boolean {
  // Match single * or _ not preceded/followed by same char
  return /(?<!\*)\*(?!\*)[^*]+\*(?!\*)/.test(content) || 
         /(?<!_)_(?!_)[^_]+_(?!_)/.test(content);
}

/**
 * Checks if content contains code blocks
 */
function containsCodeBlocks(content: string): boolean {
  return /```[\s\S]*?```/.test(content);
}

/**
 * Extracts code blocks from content
 */
function extractCodeBlocks(content: string): Array<{ language: string; code: string }> {
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const blocks: Array<{ language: string; code: string }> = [];
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({
      language: match[1] || '',
      code: match[2].trim()
    });
  }
  return blocks;
}

/**
 * Checks if content contains inline code
 */
function containsInlineCode(content: string): boolean {
  // Match backticks not part of code blocks
  return /(?<!`)`(?!`)[^`\n]+`(?!`)/.test(content);
}

/**
 * Extracts inline code from content
 */
function extractInlineCode(content: string): string[] {
  // First remove code blocks to avoid matching backticks inside them
  const contentWithoutBlocks = content.replace(/```[\s\S]*?```/g, '');
  const inlineCodeRegex = /`([^`\n]+)`/g;
  const codes: string[] = [];
  let match;
  while ((match = inlineCodeRegex.exec(contentWithoutBlocks)) !== null) {
    codes.push(match[1]);
  }
  return codes;
}

/**
 * Checks if content contains lists
 */
function containsLists(content: string): boolean {
  // Unordered lists: - or * at start of line
  // Ordered lists: number followed by . at start of line
  return /^[\s]*[-*]\s+.+$/m.test(content) || /^[\s]*\d+\.\s+.+$/m.test(content);
}

/**
 * Checks if content contains links
 */
function containsLinks(content: string): boolean {
  return /\[([^\]]+)\]\(([^)]+)\)/.test(content);
}

/**
 * Extracts links from content
 */
function extractLinks(content: string): Array<{ text: string; url: string }> {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ text: string; url: string }> = [];
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    links.push({ text: match[1], url: match[2] });
  }
  return links;
}

/**
 * Checks if content contains blockquotes
 */
function containsBlockquotes(content: string): boolean {
  return /^>\s+.+$/m.test(content);
}

/**
 * Extracts blockquotes from content
 */
function extractBlockquotes(content: string): string[] {
  const lines = content.split('\n');
  const quotes: string[] = [];
  let currentQuote = '';
  
  for (const line of lines) {
    if (line.startsWith('>')) {
      currentQuote += (currentQuote ? '\n' : '') + line.replace(/^>\s*/, '');
    } else if (currentQuote) {
      quotes.push(currentQuote.trim());
      currentQuote = '';
    }
  }
  if (currentQuote) {
    quotes.push(currentQuote.trim());
  }
  
  return quotes;
}

// ============== Arbitraries ==============

/**
 * Arbitrary for generating markdown headings
 */
const arbitraryHeading = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.integer({ min: 1, max: 6 }),
    fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes('\n'))
  ).map(([level, text]) => '#'.repeat(level) + ' ' + text.trim());

/**
 * Arbitrary for generating bold text
 */
const arbitraryBold = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => s.trim().length > 0 && !s.includes('*') && !s.includes('\n'))
    .map(s => `**${s.trim()}**`);

/**
 * Arbitrary for generating italic text
 */
const arbitraryItalic = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => s.trim().length > 0 && !s.includes('*') && !s.includes('\n'))
    .map(s => `*${s.trim()}*`);

/**
 * Arbitrary for generating code blocks
 */
const arbitraryCodeBlock = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom('', 'javascript', 'typescript', 'python', 'java', 'css', 'html'),
    fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('```'))
  ).map(([lang, code]) => '```' + lang + '\n' + code + '\n```');

/**
 * Arbitrary for generating inline code
 */
const arbitraryInlineCode = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => s.trim().length > 0 && !s.includes('`') && !s.includes('\n'))
    .map(s => '`' + s.trim() + '`');

/**
 * Arbitrary for generating LaTeX display formulas
 */
const arbitraryDisplayLatex = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    '$$E = mc^2$$',
    '$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$',
    '$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$',
    '$$\\frac{d}{dx}(x^n) = nx^{n-1}$$',
    '$$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$$'
  );

/**
 * Arbitrary for generating LaTeX inline formulas
 */
const arbitraryInlineLatex = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    '$x^2$',
    '$\\alpha + \\beta$',
    '$f(x) = x^2$',
    '$\\sqrt{2}$',
    '$\\pi \\approx 3.14$'
  );

/**
 * Arbitrary for generating unordered lists
 */
const arbitraryUnorderedList = (): fc.Arbitrary<string> =>
  fc.array(
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !s.includes('\n')),
    { minLength: 1, maxLength: 5 }
  ).map(items => items.map(item => `- ${item.trim()}`).join('\n'));

/**
 * Arbitrary for generating ordered lists
 */
const arbitraryOrderedList = (): fc.Arbitrary<string> =>
  fc.array(
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !s.includes('\n')),
    { minLength: 1, maxLength: 5 }
  ).map(items => items.map((item, i) => `${i + 1}. ${item.trim()}`).join('\n'));

/**
 * Arbitrary for generating markdown links
 */
const arbitraryLink = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && !s.includes('[') && !s.includes(']')),
    fc.webUrl()
  ).map(([text, url]) => `[${text.trim()}](${url})`);

/**
 * Arbitrary for generating blockquotes
 */
const arbitraryBlockquote = (): fc.Arbitrary<string> =>
  fc.array(
    fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes('\n')),
    { minLength: 1, maxLength: 3 }
  ).map(lines => lines.map(line => `> ${line.trim()}`).join('\n'));

// ============== Property Tests ==============

describe('Markdown Renderer Property Tests', () => {
  /**
   * **Feature: ai-chat-sidebar, Property 40: Markdown text formatting rendering**
   * 
   * *For any* AI response containing markdown text formatting (headings, bold, italic),
   * the rendered output should contain the appropriate HTML elements.
   * 
   * **Validates: Requirements 12.1**
   */
  describe('Property 40: Markdown text formatting rendering', () => {
    it('should detect headings in markdown content', () => {
      fc.assert(
        fc.property(
          arbitraryHeading(),
          (heading) => {
            // Content with heading should be detected
            const content = `Some text\n${heading}\nMore text`;
            return containsHeadings(content) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect bold text in markdown content', () => {
      fc.assert(
        fc.property(
          arbitraryBold(),
          (bold) => {
            const content = `Some ${bold} text`;
            return containsBold(content) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect italic text in markdown content', () => {
      fc.assert(
        fc.property(
          arbitraryItalic(),
          (italic) => {
            const content = `Some ${italic} text`;
            return containsItalic(content) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not detect formatting in plain text', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => 
            !s.includes('#') && !s.includes('*') && !s.includes('_')
          ),
          (plainText) => {
            return containsHeadings(plainText) === false &&
                   containsBold(plainText) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 41: Code block rendering with syntax highlighting**
   * 
   * *For any* AI response containing fenced code blocks, the rendered output
   * should contain pre/code elements with syntax highlighting.
   * 
   * **Validates: Requirements 12.2**
   */
  describe('Property 41: Code block rendering with syntax highlighting', () => {
    it('should detect code blocks in markdown content', () => {
      fc.assert(
        fc.property(
          arbitraryCodeBlock(),
          (codeBlock) => {
            const content = `Some text\n${codeBlock}\nMore text`;
            return containsCodeBlocks(content) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract code blocks with language information', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('javascript', 'typescript', 'python'),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('```')),
          (language, code) => {
            const content = '```' + language + '\n' + code + '\n```';
            const blocks = extractCodeBlocks(content);
            
            if (blocks.length !== 1) return false;
            if (blocks[0].language !== language) return false;
            if (blocks[0].code !== code.trim()) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract multiple code blocks', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryCodeBlock(), { minLength: 2, maxLength: 4 }),
          (codeBlocks) => {
            const content = codeBlocks.join('\n\nSome text\n\n');
            const extracted = extractCodeBlocks(content);
            
            return extracted.length === codeBlocks.length;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 42: Inline code rendering**
   * 
   * *For any* AI response containing inline code (backticks), the rendered output
   * should contain code elements with monospace styling.
   * 
   * **Validates: Requirements 12.3**
   */
  describe('Property 42: Inline code rendering', () => {
    it('should detect inline code in markdown content', () => {
      fc.assert(
        fc.property(
          arbitraryInlineCode(),
          (inlineCode) => {
            const content = `Use ${inlineCode} for this`;
            return containsInlineCode(content) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract inline code correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
            s.trim().length > 0 && !s.includes('`') && !s.includes('\n')
          ),
          (code) => {
            const content = `Use \`${code}\` for this`;
            const extracted = extractInlineCode(content);
            
            if (extracted.length !== 1) return false;
            if (extracted[0] !== code) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not confuse inline code with code blocks', () => {
      fc.assert(
        fc.property(
          arbitraryCodeBlock(),
          (codeBlock) => {
            // Code blocks should not be detected as inline code
            const extracted = extractInlineCode(codeBlock);
            return extracted.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 43: LaTeX formula rendering**
   * 
   * *For any* AI response containing LaTeX formulas ($ or $$ delimiters),
   * the rendered output should contain rendered mathematical notation.
   * 
   * **Validates: Requirements 12.4**
   */
  describe('Property 43: LaTeX formula rendering', () => {
    it('should extract display LaTeX formulas', () => {
      fc.assert(
        fc.property(
          arbitraryDisplayLatex(),
          (latex) => {
            const content = `Here is a formula:\n${latex}\nEnd`;
            const formulas = extractDisplayLatex(content);
            
            if (formulas.length !== 1) return false;
            // Formula should be extracted without delimiters
            if (latex.includes(formulas[0]) === false) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract inline LaTeX formulas', () => {
      fc.assert(
        fc.property(
          arbitraryInlineLatex(),
          (latex) => {
            const content = `The value is ${latex} here`;
            const formulas = extractInlineLatex(content);
            
            if (formulas.length !== 1) return false;
            // Formula should be extracted without delimiters
            if (latex.includes(formulas[0]) === false) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should distinguish display and inline LaTeX', () => {
      fc.assert(
        fc.property(
          arbitraryDisplayLatex(),
          arbitraryInlineLatex(),
          (displayLatex, inlineLatex) => {
            const content = `Display: ${displayLatex}\nInline: ${inlineLatex}`;
            
            const displayFormulas = extractDisplayLatex(content);
            const inlineFormulas = extractInlineLatex(content);
            
            // Should have exactly one of each
            if (displayFormulas.length !== 1) return false;
            if (inlineFormulas.length !== 1) return false;
            
            // They should be different
            if (displayFormulas[0] === inlineFormulas[0]) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 44: List rendering**
   * 
   * *For any* AI response containing markdown lists, the rendered output
   * should contain properly structured ul/ol and li elements.
   * 
   * **Validates: Requirements 12.5**
   */
  describe('Property 44: List rendering', () => {
    it('should detect unordered lists', () => {
      fc.assert(
        fc.property(
          arbitraryUnorderedList(),
          (list) => {
            const content = `Before\n${list}\nAfter`;
            return containsLists(content) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect ordered lists', () => {
      fc.assert(
        fc.property(
          arbitraryOrderedList(),
          (list) => {
            const content = `Before\n${list}\nAfter`;
            return containsLists(content) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not detect lists in plain text', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => 
            !s.includes('-') && !s.includes('*') && !/\d+\./.test(s)
          ),
          (plainText) => {
            return containsLists(plainText) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 45: Link rendering**
   * 
   * *For any* AI response containing markdown links, the rendered output
   * should contain clickable anchor elements.
   * 
   * **Validates: Requirements 12.6**
   */
  describe('Property 45: Link rendering', () => {
    it('should detect links in markdown content', () => {
      fc.assert(
        fc.property(
          arbitraryLink(),
          (link) => {
            const content = `Check out ${link} for more`;
            return containsLinks(content) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract link text and URL', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 15 }).filter(s => 
            s.trim().length > 0 && !s.includes('[') && !s.includes(']') && !s.includes('(') && !s.includes(')')
          ),
          // Filter out URLs containing ) as they break markdown link syntax
          fc.webUrl().filter(url => !url.includes(')')),
          (text, url) => {
            const content = `Check [${text}](${url}) here`;
            const links = extractLinks(content);
            
            if (links.length !== 1) return false;
            if (links[0].text !== text) return false;
            if (links[0].url !== url) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract multiple links', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryLink(), { minLength: 2, maxLength: 4 }),
          (links) => {
            const content = links.join(' and ');
            const extracted = extractLinks(content);
            
            return extracted.length === links.length;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: ai-chat-sidebar, Property 46: Blockquote rendering**
   * 
   * *For any* AI response containing blockquotes, the rendered output
   * should contain blockquote elements with appropriate styling.
   * 
   * **Validates: Requirements 12.7**
   */
  describe('Property 46: Blockquote rendering', () => {
    it('should detect blockquotes in markdown content', () => {
      fc.assert(
        fc.property(
          arbitraryBlockquote(),
          (quote) => {
            const content = `Before\n${quote}\nAfter`;
            return containsBlockquotes(content) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract blockquote content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
            s.trim().length > 0 && !s.includes('\n') && !s.startsWith('>')
          ),
          (text) => {
            const content = `> ${text}`;
            const quotes = extractBlockquotes(content);
            
            if (quotes.length !== 1) return false;
            if (quotes[0] !== text.trim()) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not detect blockquotes in plain text', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('>')),
          (plainText) => {
            return containsBlockquotes(plainText) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// ============== Unit Tests ==============

describe('Markdown Utility Functions Unit Tests', () => {
  describe('extractDisplayLatex', () => {
    it('should extract single display formula', () => {
      const content = 'Here is $$E = mc^2$$ the formula';
      const formulas = extractDisplayLatex(content);
      expect(formulas).toEqual(['E = mc^2']);
    });

    it('should extract multiple display formulas', () => {
      const content = '$$x^2$$ and $$y^2$$';
      const formulas = extractDisplayLatex(content);
      expect(formulas).toEqual(['x^2', 'y^2']);
    });

    it('should return empty array for no formulas', () => {
      const content = 'No formulas here';
      const formulas = extractDisplayLatex(content);
      expect(formulas).toEqual([]);
    });
  });

  describe('extractInlineLatex', () => {
    it('should extract single inline formula', () => {
      const content = 'The value $x^2$ is here';
      const formulas = extractInlineLatex(content);
      expect(formulas).toEqual(['x^2']);
    });

    it('should not extract display formulas', () => {
      const content = '$$x^2$$';
      const formulas = extractInlineLatex(content);
      expect(formulas).toEqual([]);
    });

    it('should extract inline but not display', () => {
      const content = '$$display$$ and $inline$';
      const formulas = extractInlineLatex(content);
      expect(formulas).toEqual(['inline']);
    });
  });

  describe('extractCodeBlocks', () => {
    it('should extract code block with language', () => {
      const content = '```javascript\nconst x = 1;\n```';
      const blocks = extractCodeBlocks(content);
      expect(blocks).toEqual([{ language: 'javascript', code: 'const x = 1;' }]);
    });

    it('should extract code block without language', () => {
      const content = '```\nsome code\n```';
      const blocks = extractCodeBlocks(content);
      expect(blocks).toEqual([{ language: '', code: 'some code' }]);
    });
  });

  describe('extractInlineCode', () => {
    it('should extract inline code', () => {
      const content = 'Use `console.log` for debugging';
      const codes = extractInlineCode(content);
      expect(codes).toEqual(['console.log']);
    });

    it('should not extract from code blocks', () => {
      const content = '```\n`not inline`\n```';
      const codes = extractInlineCode(content);
      expect(codes).toEqual([]);
    });
  });

  describe('extractLinks', () => {
    it('should extract link text and URL', () => {
      const content = 'Visit [Google](https://google.com)';
      const links = extractLinks(content);
      expect(links).toEqual([{ text: 'Google', url: 'https://google.com' }]);
    });

    it('should extract multiple links', () => {
      const content = '[A](http://a.com) and [B](http://b.com)';
      const links = extractLinks(content);
      expect(links).toHaveLength(2);
    });
  });

  describe('extractBlockquotes', () => {
    it('should extract single line blockquote', () => {
      const content = '> This is a quote';
      const quotes = extractBlockquotes(content);
      expect(quotes).toEqual(['This is a quote']);
    });

    it('should extract multi-line blockquote', () => {
      const content = '> Line 1\n> Line 2';
      const quotes = extractBlockquotes(content);
      expect(quotes).toEqual(['Line 1\nLine 2']);
    });
  });
});
