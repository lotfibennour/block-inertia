<?php

namespace App\Http\Controllers;

use App\Models\Blob;
use App\Models\Document;
use App\Models\DocumentUpdate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class EditorController extends Controller
{
    /**
     * Display the editor page with initial data.
     */
    /**
     * Display the editor page with initial data.
     */
    public function index(): InertiaResponse
    {
        $userId = \Auth::id();
        
        // Use a deterministic Workspace ID based on the User ID
        // This effectively creates a "Per-User Workspace"
        $rootDocId = "workspace-user-{$userId}";

        // Get only documents that belong to this user's workspace
        // Documents belong to this collection if their root_doc_id matches the user's workspace ID
        // OR if they ARE the workspace root itself (doc_id = $rootDocId)
        // Fetch all documents recursively using a CTE
        // This ensures grandfathered and deeply nested subdocuments are also retrieved
        $query = "
            WITH RECURSIVE doc_tree AS (
                SELECT doc_id, root_doc_id
                FROM documents
                WHERE root_doc_id = ? OR doc_id = ?
                UNION
                SELECT d.doc_id, d.root_doc_id
                FROM documents d
                INNER JOIN doc_tree dt ON d.root_doc_id = dt.doc_id
            )
            SELECT doc_id, root_doc_id FROM doc_tree
        ";

        $allDocs = \Illuminate\Support\Facades\DB::select($query, [$rootDocId, $rootDocId]);

        $documents = collect($allDocs)->map(function ($doc) {
            return [
                'doc_id' => $doc->doc_id,
                'root_doc_id' => $doc->root_doc_id,
            ];
        });

        // Get all updates grouped by document, but filter only for relevant docs
        // We fetch ALL updates for simplicity in this prototype, but ideally distinct by doc_id
        $knownDocIds = $documents->pluck('doc_id');
        $updates = DocumentUpdate::whereIn('doc_id', $knownDocIds)
            ->get()
            ->groupBy('doc_id')
            ->map(function ($group) {
                return $group->map(function ($update) {
                    $data = $update->data;
                    if (is_resource($data)) {
                        $data = stream_get_contents($data);
                    }
                    return base64_encode($data);
                })->values();
            });

        return Inertia::render('editor', [
            'initialData' => [
                'rootDocId' => $rootDocId,
                'documents' => $documents,
                'updates' => $updates,
            ],
        ]);
    }

    /**
     * Store a new document.
     */
    public function storeDocument(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'doc_id' => 'required|string',
            'root_doc_id' => 'nullable|string',
        ]);

        Document::updateOrCreate(
            ['doc_id' => $validated['doc_id']],
            ['root_doc_id' => $validated['root_doc_id']]
        );

        return response()->json(['success' => true]);
    }

    /**
     * Store a Y.js update.
     */
    public function storeUpdate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'doc_id' => 'required|string',
            'data' => 'required|string', // base64 encoded
            'root_doc_id' => 'nullable|string', // Optional parent ID
        ]);

        // Decode base64 to binary stream
        $binaryData = base64_decode($validated['data']);
        $stream = fopen('php://memory', 'r+');
        fwrite($stream, $binaryData);
        rewind($stream);
        $validated['data'] = $stream;

        // Auto-create document if it doesn't exist (handling subdocs created by editor)
        if (!Document::where('doc_id', $validated['doc_id'])->exists()) {
            $userId = \Auth::id();
            if ($userId) {
                // Determine appropriate parent
                $rootDocId = $request->input('root_doc_id');
                
                // If no specific parent provided, assign to user's workspace root
                if (!$rootDocId) {
                    $rootDocId = "workspace-user-{$userId}";
                }

                Document::create([
                    'doc_id' => $validated['doc_id'],
                    'root_doc_id' => $rootDocId
                ]);
            } else {
                 return response()->json(['error' => 'Unauthorized'], 401);
            }
        }

        // We don't save root_doc_id in the update table, it's just for the document structure
        unset($validated['root_doc_id']);

        DocumentUpdate::create($validated);

        return response()->json(['success' => true]);
    }

    /**
     * Store a blob.
     */
    public function storeBlob(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'blob_id' => 'required|string',
            'data' => 'required|string', // base64 encoded
        ]);

        // Decode base64 to binary stream
        $binaryData = base64_decode($validated['data']);
        $stream = fopen('php://memory', 'r+');
        fwrite($stream, $binaryData);
        rewind($stream);
        $validated['data'] = $stream;

        Blob::updateOrCreate(
            ['blob_id' => $validated['blob_id']],
            ['data' => $validated['data']]
        );

        return response()->json(['success' => true]);
    }

    /**
     * Get a blob by ID.
     */
    public function getBlob(string $blobId): Response
    {
        $blob = Blob::where('blob_id', $blobId)->first();

        if (!$blob) {
            abort(404);
        }

        $data = $blob->data;
        if (is_resource($data)) {
            $data = stream_get_contents($data);
        }

        return response($data)
            ->header('Content-Type', 'application/octet-stream');
    }

    /**
     * Delete a blob.
     */
    public function deleteBlob(string $blobId): JsonResponse
    {
        Blob::where('blob_id', $blobId)->delete();

        return response()->json(['success' => true]);
    }

    /**
     * Get all blob IDs.
     */
    public function listBlobs(): JsonResponse
    {
        $blobIds = Blob::pluck('blob_id');

        return response()->json(['blobs' => $blobIds]);
    }

    /**
     * Delete a document and its sub-documents recursively.
     */
    public function deleteDocument(string $docId): JsonResponse
    {
        try {
            $document = Document::where('doc_id', $docId)->first();

            if (!$document) {
                return response()->json(['error' => 'Document not found in database'], 404);
            }

            $this->deleteDocumentRecursive($document);

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            \Log::error('Error deleting document: ' . $e->getMessage());
            return response()->json(['error' => 'Server error during deletion: ' . $e->getMessage()], 500);
        }
    }

    private function deleteDocumentRecursive(Document $doc)
    {
        // 1. Delete children (avoid infinite recursion if root_doc_id == doc_id)
        $children = Document::where('root_doc_id', $doc->doc_id)
            ->where('doc_id', '!=', $doc->doc_id)
            ->get();

        foreach ($children as $child) {
            $this->deleteDocumentRecursive($child);
        }

        // 2. Delete updates for this doc
        DocumentUpdate::where('doc_id', $doc->doc_id)->delete();

        // 3. Delete the doc itself
        $doc->delete();
    }

    /**
     * Generate a random document ID.
     */
    private function generateDocId(): string
    {
        return substr(str_replace('.', '', uniqid('', true)), 0, 10);
    }
}
