$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://127.0.0.1:8765/')
$listener.Start()
while ($listener.IsListening) {
  $context = $listener.GetContext()
  $path = Join-Path $PSScriptRoot 'visual-preview.html'
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $context.Response.ContentType = 'text/html; charset=utf-8'
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.Close()
}
