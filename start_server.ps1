$port = 3000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Output "HTTP Server listening on http://localhost:$port/"
} catch {
    Write-Output "Port $port already in use or error: $_"
}

$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawPath = $request.Url.LocalPath
        if ($rawPath -eq "/" -or [string]::IsNullOrWhiteSpace($rawPath)) {
            $rawPath = "/index.html"
        }

        $decodedPath = [System.Uri]::UnescapeDataString($rawPath).TrimStart('/')
        $filePath = [System.IO.Path]::Combine($root, $decodedPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))

        if ([System.IO.File]::Exists($filePath)) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".webp" { "image/webp" }
                ".mp4"  { "video/mp4" }
                ".webm" { "video/webm" }
                default { "application/octet-stream" }
            }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $total = [long]$bytes.Length
            $start = [long]0
            $end = $total - 1
            $partial = $false

            # Range support (needed so videos can be seeked / scrubbed)
            $rangeHeader = $request.Headers["Range"]
            if ($rangeHeader -and ($rangeHeader -match '^bytes=(\d*)-(\d*)$')) {
                $r1 = $matches[1]
                $r2 = $matches[2]
                if ($r1 -ne '') {
                    $start = [long]$r1
                    if ($r2 -ne '') { $end = [Math]::Min([long]$r2, $total - 1) }
                } elseif ($r2 -ne '') {
                    $start = [Math]::Max([long]0, $total - [long]$r2)
                }
                if ($start -le $end -and $start -lt $total) { $partial = $true } else { $start = [long]0; $end = $total - 1 }
            }

            $length = $end - $start + 1
            $response.ContentType = $mime
            $response.AddHeader("Accept-Ranges", "bytes")
            $response.AddHeader("Cache-Control", "no-cache")
            if ($partial) {
                $response.StatusCode = 206
                $response.AddHeader("Content-Range", "bytes $start-$end/$total")
            }
            $response.ContentLength64 = $length

            if ($request.HttpMethod -ne "HEAD") {
                $response.OutputStream.Write($bytes, [int]$start, [int]$length)
            }
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $msg.Length
            if ($request.HttpMethod -ne "HEAD") {
                $response.OutputStream.Write($msg, 0, $msg.Length)
            }
        }
        $response.OutputStream.Close()
    } catch {
        # Browsers often cancel video requests mid-way; ignore and keep serving
        try { $context.Response.Abort() } catch {}
    }
}
