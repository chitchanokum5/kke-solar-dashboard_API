# PowerShell Local Web Server for Solar Dashboard
$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

# Helper to enforce Gregorian year under Thai Buddhist Calendar systems
function Get-GregorianDate {
    param(
        [DateTime]$d = (Get-Date)
    )
    $y = $d.Year
    if ($y -gt 2500) {
        $y = $y - 543
    }
    return [DateTime]::new($y, $d.Month, $d.Day, $d.Hour, $d.Minute, $d.Second, $d.Millisecond)
}

# Robust CSV parser for multi-row header configurations
function Parse-CSVHelper {
    param([string]$text)
    $result = @()
    $row = @()
    $val = ""
    $inQuotes = $false
    for ($i = 0; $i -lt $text.Length; $i++) {
        $c = $text[$i]
        $next = ""
        if (($i + 1) -lt $text.Length) { $next = $text[$i+1] }
        
        if ($c -eq '"') {
            if ($inQuotes -and $next -eq '"') {
                $val += '"'
                $i++
            } else {
                $inQuotes = -not $inQuotes
            }
        } elseif ($c -eq ',' -and -not $inQuotes) {
            $row += $val
            $val = ""
        } elseif (($c -eq "`n" -or $c -eq "`r") -and -not $inQuotes) {
            if ($c -eq "`r" -and $next -eq "`n") { $i++ }
            $row += $val
            $result += ,$row
            $row = @()
            $val = ""
        } else {
            $val += $c
        }
    }
    if ($row.Count -gt 0 -or $val -ne "") {
        $row += $val
        $result += ,$row
    }
    return $result
}

# Robust CSV serializer
function Save-CSVHelper {
    param($rows)
    $lines = @()
    foreach ($row in $rows) {
        $fields = @()
        foreach ($field in $row) {
            $escaped = $field.Replace('"', '""')
            $fields += "`"$escaped`""
        }
        $lines += ($fields -join ",")
    }
    return $lines -join "`r`n"
}

try {
    $listener.Start()
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " Local server running at http://localhost:$port/" -ForegroundColor Green
    Write-Host " Please do not close this window while using the dashboard." -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
    
    # Open default browser
    Start-Process "http://localhost:$port/"

    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $req = $context.Request
            $res = $context.Response
            
            $url = $req.Url.LocalPath
            
            # Intercept API save config route
            if ($url -eq "/api/save-config") {
                $res.AddHeader("Access-Control-Allow-Origin", "*")
                $res.AddHeader("Access-Control-Allow-Headers", "Content-Type, Accept")
                $res.AddHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
                
                if ($req.HttpMethod -eq "OPTIONS") {
                    $res.StatusCode = 200
                    $res.Close()
                    continue
                }
                
                if ($req.HttpMethod -ne "POST") {
                    $res.StatusCode = 405
                    $res.Close()
                    continue
                }
                
                $reader = New-Object System.IO.StreamReader($req.InputStream)
                $body = $reader.ReadToEnd()
                $reader.Close()
                
                try {
                    $data = $body | ConvertFrom-Json
                    
                    $csvPath = Join-Path $PSScriptRoot "config.csv"
                    $csvText = [System.IO.File]::ReadAllText($csvPath, [System.Text.Encoding]::UTF8)
                    
                    $rows = Parse-CSVHelper $csvText
                    $currentMonth = (Get-GregorianDate).ToString("MMMM", [System.Globalization.CultureInfo]::InvariantCulture)
                    
                    $monthRowIdx = -1
                    for ($i = 3; $i -lt $rows.Count; $i++) {
                        if ($rows[$i].Count -gt 25 -and $rows[$i][25].Trim().ToLower() -eq $currentMonth.ToLower()) {
                            $monthRowIdx = $i
                            break
                        }
                    }
                    
                    $found = $false
                    for ($i = 3; $i -lt $rows.Count; $i++) {
                        $row = $rows[$i]
                        if ($data.type -eq "PPA") {
                            if ($row.Count -gt 6 -and $row[3] -eq $data.id.ToString()) {
                                $rows[$i][6] = $data.capacity.ToString("F2")
                                $rows[$i][9] = $data.dailyTarget.ToString("F2")
                                
                                if ($monthRowIdx -ne -1) {
                                    $colIdx = 24 + [int]$data.id
                                    if ($colIdx -lt $rows[$monthRowIdx].Count) {
                                        $rows[$monthRowIdx][$colIdx] = $data.monthlyTarget.ToString("F2")
                                    }
                                }
                                $found = $true
                                break
                            }
                        } elseif ($data.type -eq "EPC") {
                            if ($row.Count -gt 17 -and $row[14] -eq $data.id.ToString()) {
                                $rows[$i][17] = $data.capacity.ToString("F2")
                                $rows[$i][20] = $data.dailyTarget.ToString("F2")
                                
                                if ($monthRowIdx -ne -1) {
                                    $colIdx = 75 + [int]$data.id
                                    if ($colIdx -lt $rows[$monthRowIdx].Count) {
                                        $rows[$monthRowIdx][$colIdx] = $data.monthlyTarget.ToString("F2")
                                    }
                                }
                                $found = $true
                                break
                            }
                        }
                    }
                    
                    if (-not $found) {
                        $res.StatusCode = 400
                        $res.ContentType = "application/json; charset=utf-8"
                        $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success": false, "message": "ไม่พบไซต์งานที่ระบุในฐานข้อมูล config.csv!"}')
                        $res.ContentLength64 = $errBytes.Length
                        $res.OutputStream.Write($errBytes, 0, $errBytes.Length)
                        $res.Close()
                        continue
                    }
                    
                    $newCsvText = Save-CSVHelper $rows
                    [System.IO.File]::WriteAllBytes($csvPath, [System.Text.Encoding]::UTF8.GetPreamble() + [System.Text.Encoding]::UTF8.GetBytes($newCsvText))
                    
                    # Copy to git repo folder for deployment
                    $gitConfigPath = "C:\Users\6700530\Documents\GitHub\kke-solar-dashboard_API-cloud\config.csv"
                    if (Test-Path "C:\Users\6700530\Documents\GitHub\kke-solar-dashboard_API-cloud") {
                        Copy-Item -Path $csvPath -Destination $gitConfigPath -Force
                    }
                    
                    # Auto-push updated config to GitHub
                    if (-not $env:GITHUB_ACTIONS -and (Test-Path (Join-Path $PSScriptRoot ".git"))) {
                        $gitPushScript = {
                            param($scriptRoot)
                            try {
                                cd $scriptRoot
                                git add config.csv
                                git commit -m "Update config.csv target from UI [skip ci]"
                                git push origin main
                            } catch {}
                        }
                        $null = Start-Job -ScriptBlock $gitPushScript -ArgumentList $PSScriptRoot
                    }
                    
                    $res.StatusCode = 200
                    $res.ContentType = "application/json; charset=utf-8"
                    $successBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success": true, "message": "บันทึกและอัปเดตเป้าหมายลงฐานข้อมูลสำเร็จ!"}')
                    $res.ContentLength64 = $successBytes.Length
                    $res.OutputStream.Write($successBytes, 0, $successBytes.Length)
                } catch {
                    $res.StatusCode = 500
                    $res.ContentType = "application/json; charset=utf-8"
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success": false, "message": "เกิดข้อผิดพลาดในการบันทึก: ' + $_.ToString().Replace('"', '\"') + '"}')
                    $res.ContentLength64 = $errBytes.Length
                    $res.OutputStream.Write($errBytes, 0, $errBytes.Length)
                }
                $res.Close()
                continue
            }
            
            if ($url -eq "/") { $url = "/index.html" }
            $path = Join-Path $PSScriptRoot $url
            
            if (Test-Path $path -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($path)
                
                if ($path.EndsWith(".html")) {
                    $res.ContentType = "text/html; charset=utf-8"
                } elseif ($path.EndsWith(".css")) {
                    $res.ContentType = "text/css; charset=utf-8"
                } elseif ($path.EndsWith(".js")) {
                    $res.ContentType = "application/javascript; charset=utf-8"
                } elseif ($path.EndsWith(".png")) {
                    $res.ContentType = "image/png"
                } elseif ($path.EndsWith(".jpg") -or $path.EndsWith(".jpeg")) {
                    $res.ContentType = "image/jpeg"
                } elseif ($path.EndsWith(".svg")) {
                    $res.ContentType = "image/svg+xml"
                } elseif ($path.EndsWith(".ico")) {
                    $res.ContentType = "image/x-icon"
                } elseif ($path.EndsWith(".csv")) {
                    $res.ContentType = "text/csv; charset=utf-8"
                }
                
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
                Write-Host "404 Not Found: $url" -ForegroundColor Red
            }
            $res.Close()
        } catch {
            Write-Host "Request handler network error caught: $_" -ForegroundColor Yellow
            try { if ($res) { $res.Close() } } catch {}
        }
    }
} catch {
    Write-Error $_
} finally {
    $listener.Stop()
}
