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

    async storeDocument(docId: string, rootDocId: string | null): Promise<void> {
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

    async storeUpdate(docId: string, data: Uint8Array, parentId?: string | null): Promise<void> {
        const base64Data = this.uint8ArrayToBase64(data);
        const attemptStore = async (token: string) => {
            const body: any = { doc_id: docId, data: base64Data };
            if (parentId) {
                body.root_doc_id = parentId;
            }
            return fetch('/editor/updates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': token,
                },
                body: JSON.stringify(body),
            });
        };

        try {
            let response = await attemptStore(this.csrfToken);

            if (response.status === 419) {
                console.warn('CSRF token expired. Refreshing page/token...');
                alert('Session expired. Please reload the page to save changes.');
                return;
            }

            if (!response.ok) {
                if (response.status === 404) {
                    // Ignore 404s, which happen if we try to update a deleted doc
                } else {
                    console.error(`Failed to store update for ${docId}: ${response.status} ${response.statusText}`);
                }
            }
        } catch (e) {
            console.error(`Error storing update for ${docId}:`, e);
        }
    }

    async deleteDocument(docId: string): Promise<void> {
        const response = await fetch(`/editor/documents/${docId}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-TOKEN': this.csrfToken,
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to delete document: ${response.statusText}`);
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

/**
 * Generate a random document ID.
 */
function generateDocId(): string {
    return Math.random().toString(36).substring(2, 12);
}

export class CollectionProvider {
    collection!: DocCollection;
    activeDocId: string | null = null;
    private deletedDocIds = new Set<string>();

    static async init(initialData: EditorInitialData) {
        if (initialData.rootDocId) {
            return CollectionProvider._loadCollectionFromData(initialData);
        } else {
            // Should strictly not happen with the new backend logic, but safe fallback
            // We use a temporary ID if for some reason the backend didn't provide one
            console.warn('No rootDocId provided by backend, using temporary workspace.');
            const rootDocId = generateDocId();
            return CollectionProvider._initEmptyCollection(rootDocId);
        }
    }

    private static async _initEmptyCollection(rootDocId: string) {
        const provider = new CollectionProvider();
        provider.collection = createCollection(rootDocId);

        // Persist the root document itself so the backend knows where to start
        // try {
        //     await client.storeDocument(rootDocId, null);
        // } catch (e) {
        //     console.error('Failed to store root document:', e);
        // }

        provider._connectCollection();
        provider.collection.meta.initialize();

        // Commented out to prevent automatic document creation
        // createFirstDoc(provider.collection);
        return provider;
    }

    private static async _loadCollectionFromData(
        initialData: EditorInitialData,
    ) {
        const provider = new CollectionProvider();
        // rootDocId should not be null here, but we add a fallback to be safe
        const rootDocId = initialData.rootDocId || generateDocId();
        provider.collection = createCollection(rootDocId);

        // Initialize meta BEFORE trying to create sub-documents
        provider.collection.meta.initialize();

        console.log('Loading collection from data:', {
            rootDocId,
            docsCount: initialData.documents.length,
            updatesCount: Object.keys(initialData.updates).length
        });

        // Apply root document updates
        const rootUpdates = initialData.updates[rootDocId] || [];
        rootUpdates.forEach((base64Update: string) => {
            const update = client.base64ToUint8Array(base64Update);
            DocCollection.Y.applyUpdate(provider.collection.doc, update);
        });

        // Ensure ALL documents from the backend are loaded into the collection
        // This is critical for the sidebar to show all documents
        initialData.documents.forEach((docInfo) => {
            if (docInfo.doc_id === rootDocId) return; // Skip root doc

            console.log('Loading existing doc:', docInfo.doc_id);

            // Check if document already exists, if not create it with the specific ID
            let doc = provider.collection.getDoc(docInfo.doc_id);

            if (!doc) {
                // Create the document with the specific ID from backend
                doc = provider.collection.createDoc({ id: docInfo.doc_id });
                if (!doc) console.error('Failed to create doc during load:', docInfo.doc_id);
            }

            if (doc) {
                // Apply updates BEFORE loading to prevent "Invalid access" warnings
                const docUpdates = initialData.updates[docInfo.doc_id] || [];
                docUpdates.forEach((base64Update: string) => {
                    const update = client.base64ToUint8Array(base64Update);
                    DocCollection.Y.applyUpdate(doc.spaceDoc, update);
                });

                if (docUpdates.length > 0) {
                    doc.load();
                } else {
                    // Always load the document, even if empty, to ensure it exists in the editor state
                    doc.load();
                }

                provider._connectSubDoc(doc.spaceDoc);
            }
        });

        provider._connectCollection();
        return provider;
    }

    private _connectCollection() {
        const { collection } = this;
        collection.doc.on('update', async (update: Uint8Array) => {
            if (this.deletedDocIds.has(collection.id)) return;
            await client.storeUpdate(collection.id, update);
        });

        collection.doc.on('subdocs', (subdocs: { added: Set<Y.Doc> }) => {
            subdocs.added.forEach((doc: Y.Doc) => {
                // Capture the parent ID BEFORE it might change
                // activeDocId should be set to the parent's ID, not the new doc's ID
                const parentId = this.activeDocId || collection.id;

                // We do NOT automatically store document here anymore.
                // Creation should be explicit.
                // client.storeDocument(doc.guid, parentId);
                this._connectSubDoc(doc, parentId);
            });
        });
    }

    private _connectSubDoc(doc: Y.Doc, parentId?: string | null) {
        doc.on('update', async (update: Uint8Array) => {
            if (this.deletedDocIds.has(doc.guid)) return;
            client.storeUpdate(doc.guid, update, parentId);
        });
    }

    public async storeDocument(docId: string, parentId: string) {
        await client.storeDocument(docId, parentId);
    }

    public async deleteDocument(docId: string) {
        // 1. Mark as deleted to prevent further updates from being synced
        this.deletedDocIds.add(docId);

        // 2. Delete from backend
        // We do this BEFORE removing from collection to ensure backend is consistent
        // If it fails, we might still want to remove from local? 
        // For now, if it fails, we throw and let UI handle it.
        await client.deleteDocument(docId);

        // 3. Remove from local Y.js collection
        if (this.collection.docs.has(docId)) {
            this.collection.removeDoc(docId);
        }
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
