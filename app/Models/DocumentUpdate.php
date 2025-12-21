<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentUpdate extends Model
{
    protected $fillable = [
        'doc_id',
        'data',
    ];

    protected $casts = [
        'data' => 'string', // Will be base64 encoded binary
    ];

    /**
     * Get the document this update belongs to.
     */
    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class, 'doc_id', 'doc_id');
    }
}
