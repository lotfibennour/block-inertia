import { AffineEditorContainer } from '@blocksuite/presets';
import { createContext, useContext } from 'react';
import { CollectionProvider } from './provider';

import { EditorInitialData } from '@/types/editor';

export interface EditorContextType {
    editor: AffineEditorContainer | null;
    provider: CollectionProvider | null;
    initialData: EditorInitialData | null;
    activeDocId?: string | null;
    setActiveDocId?: (id: string | null) => void;
}

export const EditorContext = createContext<EditorContextType | null>(null);

export function useEditor() {
    return useContext(EditorContext);
}
