import { useEffect, useRef } from 'react';
import { useEditor } from '@/editor/context';

const EditorContainer = () => {
    const context = useEditor();
    const editorContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!editorContainerRef.current) return;

        if (context?.editor && context.activeDocId) {
            // If the editor is already the child, don't do anything
            // This prevents unmounting/remounting the web component which causes errors
            if (editorContainerRef.current.firstElementChild !== context.editor) {
                editorContainerRef.current.innerHTML = '';
                editorContainerRef.current.appendChild(context.editor);
            }
        } else {
            // Only set placeholder if not already showing it
            const placeholder = '<div class="flex items-center justify-center h-full text-gray-400">Select or create a document to start editing</div>';
            if (editorContainerRef.current.innerHTML !== placeholder) {
                editorContainerRef.current.innerHTML = placeholder;
            }
        }
    }, [context?.editor, context?.activeDocId]);

    return <div className="editor-container" ref={editorContainerRef}></div>;
};

export default EditorContainer;
