import React, { useEffect, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Markdown } from 'tiptap-markdown';

interface TipTapEditorProps {
  content: string;
  editable: boolean;
  onChange?: (markdown: string) => void;
  placeholder?: string;
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────
const ToolbarBtn: React.FC<{
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}> = ({ onClick, active, title, children, disabled }) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={`
      px-2 py-1 text-xs font-black uppercase border-2 border-neo-black transition-all
      ${active
        ? 'bg-neo-black text-white'
        : 'bg-white text-neo-black hover:bg-neo-secondary'}
      ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
    `}
  >
    {children}
  </button>
);

// ─── Toolbar ─────────────────────────────────────────────────────────────────
const Toolbar: React.FC<{ editor: Editor }> = ({ editor }) => {
  return (
    <div className="flex flex-wrap gap-1 p-2 border-b-4 border-neo-black bg-neo-bg sticky top-0 z-10">
      {/* Text style */}
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
      >
        <b>B</b>
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
      >
        <i>I</i>
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      >
        <s>S</s>
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        title="Inline Code"
      >
        {'</>'}
      </ToolbarBtn>

      {/* Divider */}
      <div className="w-px bg-neo-black/30 mx-1 self-stretch" />

      {/* Headings */}
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        H1
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        H2
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        H3
      </ToolbarBtn>

      {/* Divider */}
      <div className="w-px bg-neo-black/30 mx-1 self-stretch" />

      {/* Lists */}
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <i className="fas fa-list-ul" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Ordered List"
      >
        <i className="fas fa-list-ol" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
        title="Task List"
      >
        <i className="fas fa-tasks" />
      </ToolbarBtn>

      {/* Divider */}
      <div className="w-px bg-neo-black/30 mx-1 self-stretch" />

      {/* Block */}
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Blockquote"
      >
        <i className="fas fa-quote-right" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="Code Block"
      >
        {'{ }'}
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        —
      </ToolbarBtn>

      {/* Divider */}
      <div className="w-px bg-neo-black/30 mx-1 self-stretch" />

      {/* Table */}
      <ToolbarBtn
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        title="Insert Table"
      >
        <i className="fas fa-table" />
      </ToolbarBtn>

      {/* Divider */}
      <div className="w-px bg-neo-black/30 mx-1 self-stretch" />

      {/* History */}
      <ToolbarBtn
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <i className="fas fa-undo" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <i className="fas fa-redo" />
      </ToolbarBtn>
    </div>
  );
};

// ─── Main Editor Component ────────────────────────────────────────────────────
const TipTapEditor: React.FC<TipTapEditorProps> = ({
  content,
  editable,
  onChange,
  placeholder = 'START WRITING YOUR PLAN...',
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: {},
      }),
      Typography,
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({
        html: false,
        tightLists: true,
        tightListClass: 'tight',
        bulletListMarker: '-',
        linkify: false,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: false,
      }),
    ],
    content,
    editable,
    onUpdate({ editor }) {
      if (onChange) {
        const md = (editor.storage as any).markdown?.getMarkdown?.() ?? '';
        // Defer to avoid "Cannot update a component while rendering a different component"
        // TipTap's onUpdate can fire synchronously during content initialization.
        setTimeout(() => onChange(md), 0);
      }
    },
  });

  // Sync content when active file changes
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentMd = (editor.storage as any).markdown?.getMarkdown?.() ?? '';
      if (currentMd !== content) {
        editor.commands.setContent(content, { emitUpdate: false });
      }
    }
  }, [content, editor]);

  // Sync editable mode
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  if (!editor) return null;

  return (
    <div className="tiptap-wrapper flex flex-col h-full">
      {editable && <Toolbar editor={editor} />}
      <div
        className={`tiptap-content-area flex-1 overflow-y-auto ${
          editable
            ? 'p-4 bg-neo-bg focus-within:outline-none'
            : 'p-2'
        }`}
      >
        <EditorContent
          editor={editor}
          className="tiptap-editor h-full outline-none"
        />
      </div>

      <style>{`
        /* ── Prose base ── */
        .tiptap-editor .ProseMirror {
          outline: none;
          min-height: 300px;
          font-family: 'Space Grotesk', 'Inter', sans-serif;
          font-size: 0.9rem;
          line-height: 1.75;
          color: #111;
        }

        /* Placeholder */
        .tiptap-editor .ProseMirror .is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #aaa;
          pointer-events: none;
          height: 0;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.1em;
        }

        /* Headings */
        .tiptap-editor .ProseMirror h1 {
          font-size: 1.8rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -0.03em;
          border-bottom: 4px solid #111;
          padding-bottom: 4px;
          margin-bottom: 1rem;
          margin-top: 1.5rem;
          line-height: 1.1;
        }
        .tiptap-editor .ProseMirror h2 {
          font-size: 1.3rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -0.02em;
          border-left: 6px solid #FF6B6B;
          padding-left: 10px;
          margin-bottom: 0.75rem;
          margin-top: 1.25rem;
        }
        .tiptap-editor .ProseMirror h3 {
          font-size: 1rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #FF6B6B;
          margin-bottom: 0.5rem;
          margin-top: 1rem;
        }
        .tiptap-editor .ProseMirror h4 {
          font-size: 0.85rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          opacity: 0.6;
          margin-bottom: 0.5rem;
          margin-top: 0.75rem;
        }

        /* Paragraphs */
        .tiptap-editor .ProseMirror p {
          margin-bottom: 0.75rem;
        }

        /* Bold / Italic / Strike */
        .tiptap-editor .ProseMirror strong { font-weight: 900; }
        .tiptap-editor .ProseMirror em { font-style: italic; }
        .tiptap-editor .ProseMirror s { text-decoration: line-through; opacity: 0.6; }

        /* Inline code */
        .tiptap-editor .ProseMirror code {
          background: #111;
          color: #FFD93D;
          padding: 2px 6px;
          font-family: 'Fira Code', monospace;
          font-size: 0.8em;
          font-weight: 700;
          border-radius: 2px;
        }

        /* Code block */
        .tiptap-editor .ProseMirror pre {
          background: #111;
          color: #FFD93D;
          padding: 1rem;
          border: 4px solid #111;
          box-shadow: 4px 4px 0 #FF6B6B;
          margin: 1rem 0;
          overflow-x: auto;
          font-family: 'Fira Code', monospace;
          font-size: 0.8rem;
        }
        .tiptap-editor .ProseMirror pre code {
          background: none;
          color: inherit;
          padding: 0;
        }

        /* Blockquote */
        .tiptap-editor .ProseMirror blockquote {
          border-left: 6px solid #FFD93D;
          background: #FFD93D22;
          padding: 8px 12px;
          margin: 1rem 0;
          font-style: italic;
          font-weight: 700;
        }

        /* Lists */
        .tiptap-editor .ProseMirror ul,
        .tiptap-editor .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .tiptap-editor .ProseMirror ul li { list-style-type: disc; }
        .tiptap-editor .ProseMirror ol li { list-style-type: decimal; }
        .tiptap-editor .ProseMirror li { margin-bottom: 0.25rem; }

        /* Task list */
        .tiptap-editor .ProseMirror ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }
        .tiptap-editor .ProseMirror ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .tiptap-editor .ProseMirror ul[data-type="taskList"] li > label {
          flex-shrink: 0;
          margin-top: 2px;
        }
        .tiptap-editor .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: #FF6B6B;
          cursor: pointer;
        }

        /* Horizontal rule */
        .tiptap-editor .ProseMirror hr {
          border: none;
          border-top: 4px solid #111;
          margin: 1.5rem 0;
        }

        /* Tables */
        .tiptap-editor .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
          border: 2px solid #111;
        }
        .tiptap-editor .ProseMirror th {
          background: #111;
          color: #fff;
          font-weight: 900;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          padding: 8px 12px;
          border: 1px solid #111;
          text-align: left;
        }
        .tiptap-editor .ProseMirror td {
          border: 1px solid #111;
          padding: 8px 12px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .tiptap-editor .ProseMirror tr:nth-child(even) td {
          background: #fafaf8;
        }
        .tiptap-editor .ProseMirror .selectedCell {
          background: #FFD93D44;
        }

        /* Selection */
        .tiptap-editor .ProseMirror ::selection {
          background: #FF6B6B44;
        }
      `}</style>
    </div>
  );
};

export default TipTapEditor;
