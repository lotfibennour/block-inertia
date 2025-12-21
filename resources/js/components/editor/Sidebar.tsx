import { useEffect, useState } from 'react';
import { Doc } from '@blocksuite/store';
import { useEditor } from '@/editor/context';

const Sidebar = () => {
    const context = useEditor();
    const [docs, setDocs] = useState<Doc[]>([]);

    useEffect(() => {
        if (!context?.provider || !context?.editor) return;
        const { collection } = context.provider;
        const updateDocs = () => {
            const docs = [...collection.docs.values()].map((blocks) =>
                blocks.getDoc(),
            );
            setDocs(docs);
        };
        updateDocs();

        const disposable = [
            collection.slots.docUpdated.on(updateDocs),
            context.editor.slots.docLinkClicked.on(updateDocs),
        ];

        return () => disposable.forEach((d) => d.dispose());
    }, [context?.provider, context?.editor]);

    return (
        <div className="editor-sidebar">
            <div className="editor-sidebar-header">All Docs</div>
            <div className="editor-doc-list">
                {docs.map((doc) => (
                    <div
                        className={`editor-doc-item ${context?.editor?.doc === doc ? 'active' : ''}`}
                        key={doc.id}
                        onClick={() => {
                            if (context?.editor) context.editor.doc = doc;
                            const docs = [
                                ...context!.provider!.collection.docs.values(),
                            ].map((blocks) => blocks.getDoc());
                            setDocs(docs);
                        }}
                    >
                        {doc.meta?.title || 'Untitled'}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Sidebar;
