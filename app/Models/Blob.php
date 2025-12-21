<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Blob extends Model
{
    protected $fillable = [
        'blob_id',
        'data',
    ];

    protected $casts = [
        'data' => 'string', // Will be base64 encoded binary
    ];
}
