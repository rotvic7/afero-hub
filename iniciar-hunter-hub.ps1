$ErrorActionPreference = 'Stop'

$hubPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $hubPath 'local-server.cjs'
$port = 4377
$url = "http://127.0.0.1:$port/index.html"

try {
  $health = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 1
  if ($health.StatusCode -eq 200) {
    Start-Process $url
    exit 0
  }
} catch {
  # O servidor ainda não está em execução.
}

Start-Process -FilePath 'node' -ArgumentList "`"$serverPath`"" -WorkingDirectory $hubPath -WindowStyle Hidden
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 250
  try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 1
    if ($health.StatusCode -eq 200) { $ready = $true; break }
  } catch {
    # Aguarda o servidor local iniciar.
  }
}

if (-not $ready) { throw 'O servidor local do Hunter Hub não iniciou. Confirme se o Node.js está instalado.' }
Start-Process $url
