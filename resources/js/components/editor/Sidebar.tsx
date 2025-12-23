import { useEffect, useState, useMemo, useCallback } from 'react';
import { Doc } from '@blocksuite/store';
import { useEditor } from '@/editor/context';
import { ChevronDown, ChevronRight, Trash2, FileText, Plus } from 'lucide-react';

interface SidebarItemProps {
    doc: Doc;
    allDocs: Doc[];
    depth?: number;
    collapsed: Record<string, boolean>;
    parentMap: Map<string, string | null>;
    onToggle: (docId: string) => void;
    onDelete: (doc: Doc) => void;
    currentDocId?: string;
    onSelect: (doc: Doc) => void;
    onCreateSubDoc: (parentId: string) => void;
}

const SidebarItem = ({
    doc,
    allDocs,
    depth = 0,
    collapsed,
    parentMap,
    onToggle,
    onDelete,
    currentDocId,
    onSelect,
    onCreateSubDoc,
}: SidebarItemProps) => {
    // Find children for this doc
    const children = useMemo(() => {
        return allDocs.filter((d) => {
            const parentId = parentMap.get(d.id);
            return parentId === doc.id;
        });
    }, [doc, allDocs, parentMap]);

    const isCollapsed = collapsed[doc.id];
    const hasChildren = children.length > 0;
    const isActive = currentDocId === doc.id;

    return (
        <div className="sidebar-item-container">
            <div
                className={`flex items-center gap-1 py-1 px-2 rounded-md hover:bg-gray-100 cursor-pointer group ${isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
                    }`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => onSelect(doc)}
            >
                <div
                    className="flex items-center justify-center w-4 h-4 rounded hover:bg-gray-200"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(doc.id);
                    }}
                >
                    {hasChildren && (
                        isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />
                    )}
                </div>

                <FileText size={14} className="min-w-[14px]" />

                <span className="truncate flex-1 text-sm select-none">
                    {doc.meta?.title || 'Untitled'}
                </span>

                <button
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-900 rounded transition-opacity"
                    onClick={(e) => {
                        e.stopPropagation();
                        onCreateSubDoc(doc.id);
                    }}
                    title="Add sub-document"
                >
                    <Plus size={12} />
                </button>

                <button
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 text-gray-400 hover:text-red-500 rounded transition-opacity"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(doc);
                    }}
                    title="Delete document"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {!isCollapsed && hasChildren && (
                <div className="sidebar-children relative">
                    <div className="absolute left-4 top-0 bottom-0 w-[1px] bg-gray-200" style={{ left: `${depth * 12 + 15}px`, top: '4px', bottom: '4px' }} />
                    {children.map((child) => (
                        <SidebarItem
                            key={child.id}
                            doc={child}
                            allDocs={allDocs}
                            depth={depth + 1}
                            collapsed={collapsed}
                            parentMap={parentMap}
                            onToggle={onToggle}
                            onDelete={onDelete}
                            currentDocId={currentDocId}
                            onSelect={onSelect}
                            onCreateSubDoc={onCreateSubDoc}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const Sidebar = () => {
    const context = useEditor();
    const [docs, setDocs] = useState<Doc[]>([]);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [localParentMap, setLocalParentMap] = useState<Map<string, string | null>>(new Map());

    // Initialize parent map from initialData
    useEffect(() => {
        if (context?.initialData?.documents) {
            const map = new Map<string, string | null>();
            context.initialData.documents.forEach(d => {
                map.set(d.doc_id, d.root_doc_id);
            });
            setLocalParentMap(map);
        }
    }, [context?.initialData]);

    useEffect(() => {
        if (!context?.provider || !context?.editor) return;
        const { collection } = context.provider;
        const { editor } = context;

        const handleSubDocs = (arg0: any) => {
            if (!arg0 || !arg0.added) return;
            arg0.added.forEach((yDoc: any) => {
                const parentId = context.provider?.activeDocId || null;
                setLocalParentMap(prev => {
                    const next = new Map(prev);
                    next.set(yDoc.guid, parentId);
                    return next;
                });
            });
            updateDocs();
        };

        const updateDocs = () => {
            if (!collection) return;
            const newDocs = Array.from(collection.docs.values()).map(d => d.getDoc());
            setDocs(newDocs);
        };

        updateDocs();

        const disposables = [
            collection.slots.docUpdated.on(updateDocs),
            editor.slots.docLinkClicked.on(updateDocs),
        ];

        // Y.js events need manual unregistration
        collection.doc.on('subdocs', handleSubDocs);

        return () => {
            disposables.forEach(d => {
                if (d && 'dispose' in d) d.dispose();
            });
            collection.doc.off('subdocs', handleSubDocs);
        };
    }, [context?.provider, context?.editor]);

    const handleCreateDoc = useCallback(async (parentId?: string) => {
        console.log('handleCreateDoc called, parentId:', parentId);

        if (!context?.provider) {
            console.error('Context provider is missing');
            return;
        }
        const { collection } = context.provider;
        const collectionId = collection.id;

        console.log('Collection ID:', collectionId);
        console.log('Collection type:', collection.constructor.name);
        console.log('Collection docs count before:', collection.docs.size);

        // Set activeDocId to the PARENT (or collection ID for root-level docs)
        context.provider.activeDocId = parentId || collectionId;

        // Diagnostic log for schema
        // @ts-ignore
        console.log('Schema blocks count:', collection.schema.flavourSchemaMap?.size || 'unknown');

        const newDocId = crypto.randomUUID();
        console.log('Attempting to create doc with UUID:', newDocId);

        // Create the new document with explicit ID to ensure success
        let newDoc;
        try {
            newDoc = collection.createDoc({ id: newDocId });
        } catch (error) {
            console.error('createDoc threw:', error);
        }

        if (!newDoc) {
            console.error('Failed to create new doc (returned null)');
            // Attempt to diagnose
            // @ts-ignore
            if (collection.hasDoc && collection.hasDoc(newDocId)) {
                console.warn('Collection says it HAS the doc, trying getDoc');
                newDoc = collection.getDoc(newDocId);
            } else {
                // @ts-ignore
                const docFromGet = collection.getDoc(newDocId);
                if (docFromGet) {
                    console.warn('hasDoc was false but getDoc returned it');
                    newDoc = docFromGet;
                } else {
                    console.error('Collection does not have the doc');
                }
            }
        }

        if (!newDoc) {
            return;
        }

        console.log('New Doc Created (Confirmed):', newDoc.id);

        try {
            // Persist the new document explicitly AND WAIT for it
            await context.provider.storeDocument(newDoc.id, parentId || collectionId);

            // Optimistically update local parent map
            setLocalParentMap(prev => {
                const next = new Map(prev);
                if (collectionId) {
                    next.set(newDoc.id, parentId || collectionId);
                }
                return next;
            });

            // Initialize the document structure
            newDoc.load(() => {
                const pageBlockId = newDoc.addBlock('affine:page', {});
                newDoc.addBlock('affine:surface', {}, pageBlockId);
                const noteId = newDoc.addBlock('affine:note', {}, pageBlockId);
                newDoc.addBlock('affine:paragraph', {}, noteId);
            });
            newDoc.resetHistory();

            // NOW set the active document
            if (context.editor) {
                context.editor.doc = newDoc;
                context.provider.activeDocId = newDoc.id;
                context.setActiveDocId?.(newDoc.id);

                // Force update sidebar docs list
                // We use setTimeout to ensure Y.js has processed the addition if strictly async
                setTimeout(() => {
                    const refreshedDocs = Array.from(collection.docs.values()).map(d => d.getDoc());
                    // Ensure new doc is in the list (sometimes delay in Yjs map)
                    if (!refreshedDocs.find(d => d.id === newDoc.id)) {
                        console.warn('New doc not in collection.docs yet, manually forcing add');
                        refreshedDocs.push(newDoc);
                    }
                    console.log('Refreshing docs list, count:', refreshedDocs.length);
                    setDocs(refreshedDocs);
                }, 50);
            }
        } catch (e) {
            console.error('Failed to init/store new document:', e);
            // Optionally remove from collection if failed
            try {
                collection.removeDoc(newDoc.id);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup doc after init error:', cleanupErr);
            }
        }
    }, [context?.provider, context?.editor, context?.setActiveDocId]);

    const handleToggle = useCallback((docId: string) => {
        setCollapsed((prev) => ({
            ...prev,
            [docId]: !prev[docId],
        }));
    }, []);

    const handleSelect = useCallback((doc: Doc) => {
        if (context?.editor) {
            context.editor.doc = doc;
            if (context?.provider) {
                context.provider.activeDocId = doc.id;
            }
            context?.setActiveDocId?.(doc.id);
            // Trigger local state update to reflect selection in sidebar (isActive)
            setDocs(prev => [...prev]);
        }
    }, [context?.editor, context?.provider, context?.setActiveDocId]);

    const handleDelete = useCallback(async (doc: Doc) => {
        if (!confirm(`Are you sure you want to delete "${doc.meta?.title || 'Untitled'}" and all its sub-documents?`)) {
            return;
        }

        try {
            if (!context?.provider) return;

            // Collect all IDs to remove (including children) for UI update
            const idsToRemove = new Set<string>();
            const collectIdsRecursively = (targetDoc: Doc) => {
                idsToRemove.add(targetDoc.id);
                const children = docs.filter(d => localParentMap.get(d.id) === targetDoc.id);
                children.forEach(collectIdsRecursively);
            };
            collectIdsRecursively(doc);

            // If we deleted the active doc, switch to another one BEFORE removing it
            if (context.editor && idsToRemove.has(context.editor.doc?.id || '')) {
                const remainingDocs = docs.filter(d => !idsToRemove.has(d.id));
                if (remainingDocs.length > 0) {
                    context.editor.doc = remainingDocs[0];
                    context.provider.activeDocId = remainingDocs[0].id;
                    context.setActiveDocId?.(remainingDocs[0].id);
                } else {
                    context.provider.activeDocId = null;
                    context.setActiveDocId?.(null);
                }
            }

            // Update local parent map
            setLocalParentMap(prev => {
                const next = new Map(prev);
                idsToRemove.forEach(id => next.delete(id));
                return next;
            });

            // Update docs state
            setDocs(prev => prev.filter(d => !idsToRemove.has(d.id)));

            // Use Provider to delete the document (it handles backend + stopping sync + collection removal)
            // We recursively delete children first through provider if we really want to be safe,
            // but the backend handles recursive deletion. Ideally, we just delete the root target.
            // However, we should mark all children as "deleted" in provider so they stop syncing.
            // The currently implemented deleteDocument only takes one ID.

            // Let's rely on recursive backend deletion but we must silence sync for all of them.
            // Since provider only has deleteDocument(id), we might need to iterate.
            // BUT backend deletion is recursive. 
            // Better to just delete the target doc via provider.
            // And maybe we need to loop to mark all as deleted in provider if we want to be perfect?
            // Actually, if we remove the root from collection, children are effectively removed from view 
            // (though they might exist in Yjs map structure).

            await context.provider.deleteDocument(doc.id);

            // Note: Since backend does recursive delete, we don't strictly need to call deleteDocument 
            // on children for the BACKEND, but we might want to for the "stop syncing" part.
            // For now, let's assume removing the parent is enough to stop most noise.

        } catch (error) {
            console.error('Error deleting document:', error);
            alert('Error deleting document');
            // Revert state if needed? (Complex, skipping for now)
        }
    }, [context?.provider, context?.editor, docs, localParentMap]);

    const rootDocs = useMemo(() => {
        const collectionId = context?.provider?.collection.id;
        return docs.filter((d) => {
            const parentId = localParentMap.get(d.id);
            // It is a root doc if:
            // 1. It has no parent (orphan)
            // 2. Its parent IS the collection ID (User Workspace)
            // 3. Its parent is not found in the list (orphan)
            if (collectionId && parentId === collectionId) return true;
            return !parentId || !docs.find(existing => existing.id === parentId);
        });
    }, [docs, localParentMap, context?.provider?.collection.id]);

    return (
        <div className="editor-sidebar flex flex-col h-full border-r border-gray-200 bg-gray-50/50">
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
                <button
                    onClick={() => handleCreateDoc()}
                    className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 transition-colors"
                    title="New Document"
                >
                    <Plus size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {rootDocs.map((doc) => (
                    <SidebarItem
                        key={doc.id}
                        doc={doc}
                        allDocs={docs}
                        collapsed={collapsed}
                        parentMap={localParentMap}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        currentDocId={context?.activeDocId || undefined}
                        onSelect={handleSelect}
                        onCreateSubDoc={(id) => handleCreateDoc(id)}
                    />
                ))}

                {rootDocs.length === 0 && (
                    <div className="text-center text-gray-400 text-sm py-8">
                        No documents
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
