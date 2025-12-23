import { AffineEditorContainer } from '@blocksuite/presets';
import { CollectionProvider } from './provider';
import { Doc } from '@blocksuite/store';
import { type EditorInitialData } from '@/types/editor';
import '@blocksuite/presets/themes/affine.css';

export async function initEditor(initialData: EditorInitialData) {
    const provider = await CollectionProvider.init(initialData);
    const { collection } = provider;
    const editor = new AffineEditorContainer();

    // @ts-ignore
    const docs = [...collection.docs.values()].map((blocks) => blocks.getDoc());
    editor.doc = docs[0];
    if (editor.doc) {
        provider.activeDocId = editor.doc.id;
    }

    editor.slots.docLinkClicked.on(({ docId }) => {
        const target = <Doc>collection.getDoc(docId);
        editor.doc = target;
        provider.activeDocId = docId;
    });
    return { editor, provider, collection };
}
