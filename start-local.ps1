$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Force $runtimeRoot | Out-Null

function Test-LocalPort([int]$Port) {
    $socket = New-Object System.Net.Sockets.TcpClient
    try { $socket.Connect('127.0.0.1', $Port); return $true }
    catch { return $false }
    finally { $socket.Dispose() }
}

function Start-LocalService($Name, $Executable, $Arguments, $Directory, $Port) {
    if (Test-LocalPort $Port) { Write-Host "$Name is already listening on port $Port"; return }
    $process = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot "$Name.log") -RedirectStandardError (Join-Path $runtimeRoot "$Name.error.log")
    Write-Host "Started $Name (PID $($process.Id))"
}

if (!(Test-LocalPort 27017)) {
    $mongoBinary = Get-ChildItem (Join-Path $runtimeRoot 'mongodb') -Filter mongod.exe -Recurse | Select-Object -First 1
    if (!$mongoBinary) { throw 'Portable MongoDB is missing from .local/mongodb.' }
    $databasePath = Join-Path $runtimeRoot 'data'
    New-Item -ItemType Directory -Force $databasePath | Out-Null
    Start-LocalService 'mongodb' $mongoBinary.FullName "--dbpath `"$databasePath`" --bind_ip 127.0.0.1 --port 27017" $projectRoot 27017
}

$env:PYTHONUTF8 = '1'
$env:NLTK_DATA = Join-Path $runtimeRoot 'nltk_data'
$env:BROWSER = 'none'
$chromePath = Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'
if (Test-Path $chromePath) { $env:PUPPETEER_EXECUTABLE_PATH = $chromePath }
Start-LocalService 'python-ai' (Join-Path $projectRoot 'python-ai/.venv/Scripts/python.exe') '-m uvicorn main:app --host 127.0.0.1 --port 8000' (Join-Path $projectRoot 'python-ai') 8000
Start-LocalService 'server' (Get-Command node.exe).Source 'server.js' (Join-Path $projectRoot 'server') 5000
Start-LocalService 'client' (Get-Command node.exe).Source 'node_modules/react-scripts/bin/react-scripts.js start' (Join-Path $projectRoot 'client') 3000
Write-Host "App: http://localhost:3000"
Write-Host "Service logs: $runtimeRoot"
