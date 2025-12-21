<?php

use App\Http\Controllers\EditorController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Laravel\Fortify\Features;

Route::get('/', function () {
    return Inertia::render('welcome', [
        'canRegister' => Features::enabled(Features::registration()),
    ]);
})->name('home');

// Editor routes
Route::get('editor', [EditorController::class, 'index'])->name('editor');
Route::post('editor/documents', [EditorController::class, 'storeDocument'])->name('editor.documents.store');
Route::post('editor/updates', [EditorController::class, 'storeUpdate'])->name('editor.updates.store');
Route::delete('editor/documents/{docId}', [EditorController::class, 'deleteDocument'])->name('editor.documents.delete');
Route::post('editor/blobs', [EditorController::class, 'storeBlob'])->name('editor.blobs.store');
Route::get('editor/blobs/{blobId}', [EditorController::class, 'getBlob'])->name('editor.blobs.get');
Route::delete('editor/blobs/{blobId}', [EditorController::class, 'deleteBlob'])->name('editor.blobs.delete');
Route::get('editor/blobs', [EditorController::class, 'listBlobs'])->name('editor.blobs.list');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', function () {
        return Inertia::render('dashboard');
    })->name('dashboard');
});

require __DIR__.'/settings.php';
