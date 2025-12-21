import { DocCollection, type Y, Schema } from '@blocksuite/store';
import { type BlobSource } from '@blocksuite/sync';
import { AffineSchemas } from '@blocksuite/blocks';
import { type EditorInitialData } from '@/types/editor';

/**
 * API client for backend communication
 */
class BackendClient {
    private get csrfToken(): string {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta?.getAttribute('content') || '';
    }

    async storeDocument(docId: string, rootDocId: string): Promise<void> {
        try {
            const response = await fetch('/editor/documents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': this.csrfToken,
                },
                body: JSON.stringify({ doc_id: docId, root_doc_id: rootDocId }),
            });
            if (!response.ok) {
                console.error(`Failed to store document ${docId}: ${response.status} ${response.statusText}`);
            } else {
                console.log(`Successfully stored document ${docId}`);
            }
        } catch (e) {
            console.error(`Error storing document ${docId}:`, e);
        }
    }

    async storeUpdate(docId: string, data: Uint8Array): Promise<void> {
        const base64Data = this.uint8ArrayToBase64(data);
        try {
            const response = await fetch('/editor/updates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': this.csrfToken,
                },
                body: JSON.stringify({ doc_id: docId, data: base64Data }),
            });
            if (!response.ok) {
                console.error(`Failed to store update for ${docId}: ${response.status} ${response.statusText}`);
            }
        } catch (e) {
            console.error(`Error storing update for ${docId}:`, e);
        }
    }

    async storeBlob(blobId: string, data: Blob): Promise<void> {
        const arrayBuffer = await data.arrayBuffer();
        const base64Data = this.uint8ArrayToBase64(new Uint8Array(arrayBuffer));
        await fetch('/editor/blobs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': this.csrfToken,
            },
            body: JSON.stringify({ blob_id: blobId, data: base64Data }),
        });
    }

    async getBlob(blobId: string): Promise<Blob | null> {
        const response = await fetch(`/editor/blobs/${blobId}`);
        if (!response.ok) return null;
        return response.blob();
    }

    async deleteBlob(blobId: string): Promise<void> {
        await fetch(`/editor/blobs/${blobId}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-TOKEN': this.csrfToken,
            },
        });
    }

    async listBlobs(): Promise<string[]> {
        const response = await fetch('/editor/blobs');
        const data = await response.json();
        return data.blobs || [];
    }

    private uint8ArrayToBase64(bytes: Uint8Array): string {
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    base64ToUint8Array(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
}

const client = new BackendClient();

export class CollectionProvider {
    collection!: DocCollection;
    activeDocId: string | null = null;

    static async init(initialData: EditorInitialData) {
        const hasData =
            initialData.documents.length > 0 &&
            Object.keys(initialData.updates).length > 0;

        if (hasData) {
            return CollectionProvider._loadCollectionFromData(initialData);
        } else {
            return CollectionProvider._initEmptyCollection(
                initialData.rootDocId,
            );
        }
    }

    private static async _initEmptyCollection(rootDocId: string) {
        const provider = new CollectionProvider();
        provider.collection = createCollection(rootDocId);
        provider._connectCollection();
        provider.collection.meta.initialize();

        createFirstDoc(provider.collection);
        return provider;
    }

    private static async _loadCollectionFromData(
        initialData: EditorInitialData,
    ) {
        const provider = new CollectionProvider();
        provider.collection = createCollection(initialData.rootDocId);

        // Apply root document updates
        const rootUpdates = initialData.updates[initialData.rootDocId] || [];
        rootUpdates.forEach((base64Update) => {
            const update = client.base64ToUint8Array(base64Update);
            DocCollection.Y.applyUpdate(provider.collection.doc, update);
        });

        // Apply sub-document updates
        provider.collection.docs.forEach((doc) => {
            const docUpdates = initialData.updates[doc.id] || [];
            docUpdates.forEach((base64Update) => {
                const update = client.base64ToUint8Array(base64Update);
                DocCollection.Y.applyUpdate(doc.spaceDoc, update);
            });
            doc.load();
            provider._connectSubDoc(doc.spaceDoc);
        });

        // Some docs might be added during the applyUpdate of root doc, 
        // ensure we check all doc keys in initialData.updates
        Object.keys(initialData.updates).forEach(docId => {
            if (docId === initialData.rootDocId) return;
            const doc = provider.collection.getDoc(docId);
            if (doc && !doc.spaceDoc.store.clients.size) { // Simple check if already loaded
                const docUpdates = initialData.updates[docId] || [];
                docUpdates.forEach((base64Update) => {
                    const update = client.base64ToUint8Array(base64Update);
                    DocCollection.Y.applyUpdate(doc.spaceDoc, update);
                });
                doc.load();
                provider._connectSubDoc(doc.spaceDoc);
            }
        });

        provider._connectCollection();
        return provider;
    }

    private _connectCollection() {
        const { collection } = this;
        collection.doc.on('update', async (update: Uint8Array) => {
            await client.storeUpdate(collection.id, update);
        });

        collection.doc.on('subdocs', (subdocs: { added: Set<Y.Doc> }) => {
            subdocs.added.forEach((doc: Y.Doc) => {
                const parentId = this.activeDocId || collection.id;
                client.storeDocument(doc.guid, parentId);
                this._connectSubDoc(doc);
            });
        });
    }

    private _connectSubDoc(doc: Y.Doc) {
        doc.on('update', async (update: Uint8Array) => {
            client.storeUpdate(doc.guid, update);
        });
    }

    public async storeDocument(docId: string, parentId: string) {
        await client.storeDocument(docId, parentId);
    }
}

function createCollection(id: string): DocCollection {
    const schema = new Schema().register(AffineSchemas);
    const collection = new DocCollection({
        schema,
        id,
        blobSources: {
            main: new BackendBlobSource(),
        },
    });
    return collection;
}

class BackendBlobSource implements BlobSource {
    readonly = false;
    name = 'backend';

    async get(key: string) {
        return client.getBlob(key);
    }

    async set(key: string, value: Blob) {
        await client.storeBlob(key, value);
        return key;
    }

    async delete(key: string) {
        return client.deleteBlob(key);
    }

    async list() {
        return client.listBlobs();
    }
}

function createFirstDoc(collection: DocCollection) {
    const doc = collection.createDoc();
    doc.load(() => {
        const pageBlockId = doc.addBlock('affine:page', {});
        doc.addBlock('affine:surface', {}, pageBlockId);
        const noteId = doc.addBlock('affine:note', {}, pageBlockId);
        doc.addBlock('affine:paragraph', {}, noteId);
    });
    doc.resetHistory();
}
