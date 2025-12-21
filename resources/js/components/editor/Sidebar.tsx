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

    const handleCreateDoc = useCallback((parentId?: string) => {
        if (!context?.provider) return;
        const { collection } = context.provider;

        // Set parent for the upcoming subdocs event (caught by our internal listener too)
        context.provider.activeDocId = parentId || null;

        const newDoc = collection.createDoc();

        // Optimistically update local parent map if we have parentId
        if (parentId) {
            setLocalParentMap(prev => {
                const next = new Map(prev);
                next.set(newDoc.id, parentId);
                return next;
            });
        }

        newDoc.load(() => {
            const pageBlockId = newDoc.addBlock('affine:page', {});
            newDoc.addBlock('affine:surface', {}, pageBlockId);
            const noteId = newDoc.addBlock('affine:note', {}, pageBlockId);
            newDoc.addBlock('affine:paragraph', {}, noteId);
        });
        newDoc.resetHistory();

        if (context.editor) {
            context.editor.doc = newDoc;
            context.provider.activeDocId = newDoc.id;
        }
    }, [context?.provider, context?.editor]);

    const handleToggle = useCallback((docId: string) => {
        setCollapsed((prev) => ({
            ...prev,
            [docId]: !prev[docId],
        }));
    }, []);

    const handleSelect = useCallback((doc: Doc) => {
        if (context?.editor) {
            context.editor.doc = doc;
            if (context.provider) {
                context.provider.activeDocId = doc.id;
            }
            // Trigger local state update to reflect selection in sidebar (isActive)
            setDocs(prev => [...prev]);
        }
    }, [context?.editor, context?.provider]);

    const handleDelete = useCallback(async (doc: Doc) => {
        if (!confirm(`Are you sure you want to delete "${doc.meta?.title || 'Untitled'}" and all its sub-documents?`)) {
            return;
        }

        try {
            const response = await fetch(`/editor/documents/${doc.id}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '',
                },
            });

            if (!response.ok) {
                const data = await response.json();
                console.error('Failed to delete document from backend:', data.error);
                alert(`Failed to delete document: ${data.error || 'Unknown error'}`);
                return;
            }

            if (context?.provider?.collection) {
                const { collection } = context.provider;

                // Collect all IDs to remove (including children)
                const idsToRemove = new Set<string>();
                const collectIdsRecursively = (targetDoc: Doc) => {
                    idsToRemove.add(targetDoc.id);
                    const children = docs.filter(d => localParentMap.get(d.id) === targetDoc.id);
                    children.forEach(collectIdsRecursively);
                };
                collectIdsRecursively(doc);

                // Remove from collection
                idsToRemove.forEach(id => {
                    try {
                        collection.removeDoc(id);
                    } catch (e) {
                        console.warn(`Could not remove doc ${id} from collection:`, e);
                    }
                });

                // Update local parent map
                setLocalParentMap(prev => {
                    const next = new Map(prev);
                    idsToRemove.forEach(id => next.delete(id));
                    return next;
                });

                // Update docs state
                setDocs(prev => prev.filter(d => !idsToRemove.has(d.id)));

                // If we deleted the active doc, switch to another one
                if (context.editor && idsToRemove.has(context.editor.doc?.id || '')) {
                    const remainingDocs = docs.filter(d => !idsToRemove.has(d.id));
                    if (remainingDocs.length > 0) {
                        context.editor.doc = remainingDocs[0];
                        context.provider.activeDocId = remainingDocs[0].id;
                    }
                }
            }

        } catch (error) {
            console.error('Error deleting document:', error);
            alert('Error deleting document');
        }
    }, [context?.provider, context?.editor, docs, localParentMap]);

    const rootDocs = useMemo(() => {
        return docs.filter((d) => {
            const parentId = localParentMap.get(d.id);
            // Root doc has no parent, OR parent is not in our known list (top level orphan)
            return !parentId || !docs.find(existing => existing.id === parentId);
        });
    }, [docs, localParentMap]);

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
                        currentDocId={context?.editor?.doc?.id}
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
