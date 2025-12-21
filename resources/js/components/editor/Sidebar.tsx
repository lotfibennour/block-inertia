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
                <div className="sidebar-children">
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

    // Build parent map from initialData
    const parentMap = useMemo(() => {
        const map = new Map<string, string | null>();
        if (context?.initialData?.documents) {
            context.initialData.documents.forEach(d => {
                map.set(d.doc_id, d.root_doc_id);
            });
        }
        return map;
    }, [context?.initialData]);

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

    const handleCreateDoc = useCallback(() => {
        if (!context?.provider) return;
        const { collection } = context.provider;

        const newDoc = collection.createDoc();
        newDoc.load(() => {
            const pageBlockId = newDoc.addBlock('affine:page', {});
            newDoc.addBlock('affine:surface', {}, pageBlockId);
            const noteId = newDoc.addBlock('affine:note', {}, pageBlockId);
            newDoc.addBlock('affine:paragraph', {}, noteId);
        });
        newDoc.resetHistory();

        if (context.editor) {
            context.editor.doc = newDoc;
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
            // Force update
            setDocs(prev => [...prev]);
        }
    }, [context?.editor]);

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
                console.error('Failed to delete document from backend');
                alert('Failed to delete document');
                return;
            }

            if (context?.provider?.collection) {
                const { collection } = context.provider;

                const removeDocRecursively = (targetDoc: Doc) => {
                    // Find children using our map
                    const children = docs.filter(d => parentMap.get(d.id) === targetDoc.id);
                    children.forEach(removeDocRecursively);
                    collection.removeDoc(targetDoc.id);
                };

                removeDocRecursively(doc);
            }

            // Reload page to refresh structure (simplest way to sync parentMap and state)
            window.location.reload();

        } catch (error) {
            console.error('Error deleting document:', error);
            alert('Error deleting document');
        }
    }, [context?.provider, docs, parentMap]);

    const rootDocs = useMemo(() => {
        return docs.filter((d) => {
            const parentId = parentMap.get(d.id);
            // Root doc has no parent, OR parent is not in our known list (top level orphan)
            return !parentId || !docs.find(existing => existing.id === parentId);
        });
    }, [docs, parentMap]);

    return (
        <div className="editor-sidebar flex flex-col h-full border-r border-gray-200 bg-gray-50/50">
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
                <button
                    onClick={handleCreateDoc}
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
                        parentMap={parentMap}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        currentDocId={context?.editor?.doc?.id}
                        onSelect={handleSelect}
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
