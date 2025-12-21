import { useEffect, useRef } from 'react';
import { useEditor } from '@/editor/context';

const EditorContainer = () => {
    const context = useEditor();
    const editorContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (editorContainerRef.current && context?.editor) {
            editorContainerRef.current.innerHTML = '';
            editorContainerRef.current.appendChild(context.editor);
        }
    }, [context?.editor]);

    return <div className="editor-container" ref={editorContainerRef}></div>;
};

export default EditorContainer;
