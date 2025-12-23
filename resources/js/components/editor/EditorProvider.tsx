import { useEffect, useState, type ReactNode } from 'react';
import { initEditor } from '@/editor/editor';
import { AffineEditorContainer } from '@blocksuite/presets';
import { CollectionProvider } from '@/editor/provider';
import { EditorContext } from '@/editor/context';
import { type EditorInitialData } from '@/types/editor';

interface EditorProviderProps {
    children: ReactNode;
    initialData: EditorInitialData;
}

export const EditorProvider = ({
    children,
    initialData,
}: EditorProviderProps) => {
    const [editor, setEditor] = useState<AffineEditorContainer | null>(null);
    const [provider, setProvider] = useState<CollectionProvider | null>(null);
    const [activeDocId, setActiveDocId] = useState<string | null>(null);

    useEffect(() => {
        initEditor(initialData).then(({ editor, provider }) => {
            setEditor(editor);
            setProvider(provider);
            if (provider.activeDocId) {
                setActiveDocId(provider.activeDocId);
            }
        });
    }, [initialData]);

    return (
        <EditorContext.Provider
            value={{
                editor,
                provider,
                initialData,
                activeDocId,
                setActiveDocId
            }}
        >
            {editor && provider ? children : <div className="editor-loading">Loading Editor...</div>}
        </EditorContext.Provider>
    );
};
