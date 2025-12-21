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
    public function index(): InertiaResponse
    {
        // Get root document or create one if none exists
        $rootDoc = Document::whereNull('root_doc_id')->first();

        if (!$rootDoc) {
            // Create a new root document
            $rootDocId = $this->generateDocId();
            $rootDoc = Document::create([
                'doc_id' => $rootDocId,
                'root_doc_id' => null,
            ]);
        }

        // Get all documents
        $documents = Document::all()->map(function ($doc) {
            return [
                'doc_id' => $doc->doc_id,
                'root_doc_id' => $doc->root_doc_id,
            ];
        });

        // Get all updates grouped by document
        $updates = DocumentUpdate::all()->groupBy('doc_id')->map(function ($group) {
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
                'rootDocId' => $rootDoc->doc_id,
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
            'root_doc_id' => 'required|string',
        ]);

        Document::firstOrCreate(
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
        ]);

        // Decode base64 to binary stream
        $binaryData = base64_decode($validated['data']);
        $stream = fopen('php://memory', 'r+');
        fwrite($stream, $binaryData);
        rewind($stream);
        $validated['data'] = $stream;

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
     * Generate a random document ID.
     */
    private function generateDocId(): string
    {
        return substr(str_replace('.', '', uniqid('', true)), 0, 10);
    }
}
