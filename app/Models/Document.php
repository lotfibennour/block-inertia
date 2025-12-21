<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Document extends Model
{
    protected $fillable = [
        'doc_id',
        'root_doc_id',
    ];

    /**
     * Get the updates for this document.
     */
    public function updates(): HasMany
    {
        return $this->hasMany(DocumentUpdate::class, 'doc_id', 'doc_id');
    }

    /**
     * Get child documents (sub-documents).
     */
    public function children(): HasMany
    {
        return $this->hasMany(Document::class, 'root_doc_id', 'doc_id');
    }

    /**
     * Check if this is a root document.
     */
    public function isRoot(): bool
    {
        return is_null($this->root_doc_id);
    }
}
