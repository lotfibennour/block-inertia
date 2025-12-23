export interface EditorDocument {
    doc_id: string;
    root_doc_id: string | null;
}

export interface EditorInitialData {
    rootDocId: string | null;
    documents: EditorDocument[];
    updates: Record<string, string[]>; // doc_id -> array of base64 encoded updates
}

export interface EditorPageProps {
    initialData: EditorInitialData;
}
