[CmdletBinding()]
param(
    [switch]$SyncOnly
)

# PowerShell Local Web Server for Solar Dashboard with FusionSolar API Sync
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

# Helper to check if a station name is in config.csv
function Is-StationActive {
    param([string]$stationName)
    if (-not $stationName) { return $false }
    
    # Load config.csv site names if not already loaded
    if ($script:activeConfigSites -eq $null) {
        $script:activeConfigSites = @{}
        $csvPath = Join-Path $PSScriptRoot "config.csv"
        if (Test-Path $csvPath) {
            $csvText = [System.IO.File]::ReadAllText($csvPath, [System.Text.Encoding]::UTF8)
            $rows = Parse-CSVHelper $csvText
            for ($i = 3; $i -lt $rows.Count; $i++) {
                $row = $rows[$i]
                if ($row.Count -gt 4 -and $row[4]) {
                    $script:activeConfigSites[$row[4].Trim().ToLower()] = $true
                }
                if ($row.Count -gt 15 -and $row[15]) {
                    $script:activeConfigSites[$row[15].Trim().ToLower()] = $true
                }
            }
        }
    }
    
    $normName = $stationName.Trim().ToLower()
    
    # Common mappings
    if ($normName -eq "ptt cg") { $normName = "ptt chester grill" }
    if ($normName -eq "siam cans") { $normName = "siam cans industry" }
    
    if ($script:activeConfigSites.ContainsKey($normName)) {
        return $true
    }
    
    # Substring checks
    foreach ($cfgSite in $script:activeConfigSites.Keys) {
        if ($normName.Contains($cfgSite) -or $cfgSite.Contains($normName)) {
            return $true
        }
    }
    
    return $false
}

# Function to pull daily energy yield from Huawei FusionSolar OpenAPI and save as CSV
function Sync-FusionSolarData {
    Write-Host "----------------------------------------------------------" -ForegroundColor Cyan
    Write-Host " Starting Huawei FusionSolar API sync..." -ForegroundColor Cyan
    Write-Host "----------------------------------------------------------" -ForegroundColor Cyan
    
    $apiUrl = "https://sg5.fusionsolar.huawei.com"
    $username = ""
    $password = ""
    
    $configPath = Join-Path $PSScriptRoot "fusionsolar_config.json"
    if (Test-Path $configPath) {
        try {
            $config = Get-Content $configPath -Raw | ConvertFrom-Json
            $apiUrl = $config.apiUrl
            $username = $config.username
            $password = $config.password
        } catch {
            Write-Host "Failed to parse fusionsolar_config.json: $_" -ForegroundColor Yellow
        }
    }
    
    # Environment variables override (critical for secure GitHub Actions workflows)
    if ($env:FUSIONSOLAR_API_URL) { $apiUrl = $env:FUSIONSOLAR_API_URL }
    if ($env:FUSIONSOLAR_USERNAME) { $username = $env:FUSIONSOLAR_USERNAME }
    if ($env:FUSIONSOLAR_PASSWORD) { $password = $env:FUSIONSOLAR_PASSWORD }
    
    if (-not $username -or -not $password) {
        return '{"success": false, "message": "API credentials (username/password) are not configured!"}'
    }
    
    if ($apiUrl.EndsWith("/")) { $apiUrl = $apiUrl.Substring(0, $apiUrl.Length - 1) }
    
    try {
        # 1. Login to FusionSolar
        $loginUrl = "$apiUrl/thirdData/login"
        $loginBody = @{
            userName = $username
            systemCode = $password
        } | ConvertTo-Json
        
        Write-Host "Logging in to FusionSolar: $loginUrl" -ForegroundColor Cyan
        # Ignore SSL Certificate errors in case of local intranet issues
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
        
        $loginRes = Invoke-WebRequest -Uri $loginUrl -Method Post -Body $loginBody -ContentType "application/json" -SessionVariable s -Headers @{"Content-Type"="application/json"}
        $sessVar = $s
        
        # Extract xsrf-token
        $xsrfToken = ""
        if ($loginRes.Headers.ContainsKey("xsrf-token")) {
            $xsrfToken = $loginRes.Headers["xsrf-token"]
        } else {
            # Check Set-Cookie headers
            $cookieHeaders = $loginRes.Headers["Set-Cookie"]
            if ($cookieHeaders -eq $null) { $cookieHeaders = $loginRes.Headers["set-cookie"] }
            if ($cookieHeaders -ne $null) {
                foreach ($cookie in $cookieHeaders) {
                    if ($cookie -match "xsrf-token=([^;]+)") {
                        $xsrfToken = $Matches[1]
                    }
                }
            }
        }
        
        if ($xsrfToken -eq "") {
            # Check session cookies
            $cookies = $sessVar.Cookies.GetCookies($loginUrl)
            foreach ($cookie in $cookies) {
                if ($cookie.Name.ToLower() -eq "xsrf-token") {
                    $xsrfToken = $cookie.Value
                }
            }
        }
        
        if ($xsrfToken -eq "") {
            Write-Host "Login failed: XSRF token not found in response headers/cookies!" -ForegroundColor Red
            return '{"success": false, "message": "ล็อกอินล้มเหลว: ไม่ได้รับรหัส XSRF-Token จากหัวกระดาษหรือคุกกี้"}'
        }
        
        Write-Host "Login successful. Session Token obtained." -ForegroundColor Green
        
        # Setup Headers
        $headers = @{
            "xsrf-token" = $xsrfToken
        }
        
        # Define cache paths
        $stationsCachePath = Join-Path $PSScriptRoot "stations_cache.json"
        $invertersCachePath = Join-Path $PSScriptRoot "inverters_cache.json"
        
        $stationMap = @{}
        $stationCodesList = @()
        $inverters = @()
        $useCache = $false
        
        if ((Test-Path $stationsCachePath) -and (Test-Path $invertersCachePath)) {
            try {
                Write-Host "Loading station list and inverter list from local cache..." -ForegroundColor Yellow
                $cachedStations = Get-Content $stationsCachePath -Raw | ConvertFrom-Json
                $cachedInverters = Get-Content $invertersCachePath -Raw | ConvertFrom-Json
                
                if ($cachedStations -and $cachedInverters -and $cachedInverters.Count -gt 0) {
                    foreach ($st in $cachedStations) {
                        $stationMap[$st.stationCode] = $st.stationName
                        $stationCodesList += $st.stationCode
                    }
                    $inverters = @()
                    foreach ($inv in $cachedInverters) {
                        $stName = ""
                        if ($stationMap.ContainsKey($inv.stationCode)) { $stName = $stationMap[$inv.stationCode] }
                        if (Is-StationActive $stName) {
                            $inverters += $inv
                        }
                    }
                    $useCache = $true
                }
            } catch {
                Write-Host "Failed to read cache files: $_. Fetching from API instead." -ForegroundColor Yellow
            }
        }
        
        if (-not $useCache) {
            # 2. Get Station List from API
            Write-Host "Fetching station list from FusionSolar API..." -ForegroundColor Cyan
            $stationsUrl = "$apiUrl/thirdData/getStationList"
            $stationsRes = Invoke-RestMethod -Uri $stationsUrl -Method Post -Body "{}" -ContentType "application/json" -Headers $headers -WebSession $sessVar
            
            if (-not $stationsRes.success -or $stationsRes.data.Count -eq 0) {
                Write-Host "Failed to fetch stations: $($stationsRes.failCode)" -ForegroundColor Red
                return '{"success": false, "message": "ดึงรายชื่อไซต์งานโครงการล้มเหลว!"}'
            }
            
            foreach ($st in $stationsRes.data) {
                $stationMap[$st.stationCode] = $st.stationName
                $stationCodesList += $st.stationCode
            }
            
            # Save stations to cache
            $stationsRes.data | ConvertTo-Json -Depth 5 | Out-File -FilePath $stationsCachePath -Encoding utf8
            
            Write-Host "Found $($stationsRes.data.Count) stations. Fetching device list..." -ForegroundColor Cyan
            
            # 3. Get Device List in chunks of 100 stations from API
            $devicesResData = @()
            for ($s = 0; $s -lt $stationCodesList.Count; $s += 100) {
                $endIdx = $s + 99
                if ($endIdx -ge $stationCodesList.Count) { $endIdx = $stationCodesList.Count - 1 }
                $chunkStations = $stationCodesList[$s..$endIdx]
                $chunkStationCodes = $chunkStations -join ","
                
                $devUrl = "$apiUrl/thirdData/getDevList"
                $devBody = @{ stationCodes = $chunkStationCodes } | ConvertTo-Json
                
                Write-Host "Fetching devices for station batch $([Math]::Floor($s/100) + 1) of $([Math]::Ceiling($stationCodesList.Count/100))..." -ForegroundColor Cyan
                $chunkDevicesRes = Invoke-RestMethod -Uri $devUrl -Method Post -Body $devBody -ContentType "application/json" -Headers $headers -WebSession $sessVar
                
                if ($chunkDevicesRes.success -and $chunkDevicesRes.data) {
                    $devicesResData += $chunkDevicesRes.data
                } else {
                    Write-Host "Batch failed: $($chunkDevicesRes.failCode) - $($chunkDevicesRes.data)" -ForegroundColor Red
                }
                
                if (($s + 100) -lt $stationCodesList.Count) {
                    Write-Host "Sleeping 125 seconds to respect FusionSolar API limit (1 call/min)..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 125
                }
            }
            
            if ($devicesResData.Count -eq 0) {
                Write-Host "Failed to fetch device list or list is empty." -ForegroundColor Red
                return '{"success": false, "message": "ดึงข้อมูลรายการอุปกรณ์ล้มเหลวหรือไม่มีอุปกรณ์ในระบบ!"}'
            }
            
            # Filter devTypeId = 1 (Inverter) and active stations only
            foreach ($d in $devicesResData) {
                if ($d.devTypeId -eq 1) {
                    $stName = ""
                    if ($stationMap.ContainsKey($d.stationCode)) { $stName = $stationMap[$d.stationCode] }
                    if (Is-StationActive $stName) {
                        $inverters += $d
                    }
                }
            }
            
            # Save inverters to cache
            $inverters | ConvertTo-Json -Depth 5 | Out-File -FilePath $invertersCachePath -Encoding utf8
            Write-Host "Cached $($inverters.Count) inverters to local storage." -ForegroundColor Green
        }
        
        # Get Real-time Station Health States to detect offline plants
        Write-Host "Querying station health states..." -ForegroundColor Cyan
        $stationHealthMap = @{}
        for ($s = 0; $s -lt $stationCodesList.Count; $s += 50) {
            $endIdx = $s + 49
            if ($endIdx -ge $stationCodesList.Count) { $endIdx = $stationCodesList.Count - 1 }
            $chunk = $stationCodesList[$s..$endIdx]
            $chunkCodes = $chunk -join ","
            
            $kpiUrl = "$apiUrl/thirdData/getStationRealKpi"
            $kpiBody = @{ stationCodes = $chunkCodes } | ConvertTo-Json
            
            try {
                $kpiRes = Invoke-RestMethod -Uri $kpiUrl -Method Post -Body $kpiBody -ContentType "application/json" -Headers $headers -WebSession $sessVar
                if ($kpiRes.success -and $kpiRes.data) {
                    foreach ($item in $kpiRes.data) {
                        $code = $item.stationCode
                        $health = 3
                        if ($item.dataItemMap -and $item.dataItemMap.real_health_state -ne $null) {
                            $health = [int]$item.dataItemMap.real_health_state
                        }
                        $stationHealthMap[$code] = $health
                    }
                }
            } catch {
                Write-Host "Failed to query station health state for batch: $_" -ForegroundColor Yellow
            }
            Start-Sleep -Milliseconds 500
        }
        
        Write-Host "Found $($inverters.Count) inverters. Fetching monthly KPIs..." -ForegroundColor Cyan
        
        # 4. Fetch daily generation KPIs
        $gNow = Get-GregorianDate
        $collectTime = ([DateTimeOffset]($gNow.Date.AddHours(12))).ToUnixTimeMilliseconds()
        $allKpis = @{}
        
        # Fetch in batches of 50
        for ($i = 0; $i -lt $inverters.Count; $i += 50) {
            $endIdx = $i + 49
            if ($endIdx -ge $inverters.Count) { $endIdx = $inverters.Count - 1 }
            $chunk = $inverters[$i..$endIdx]
            
            $devIdsList = @()
            foreach ($inv in $chunk) { $devIdsList += $inv.id }
            $devIds = $devIdsList -join ","
            
            $kpiUrl = "$apiUrl/thirdData/getDevKpiDay"
            $kpiBody = @{
                devIds = $devIds
                devTypeId = 1
                collectTime = $collectTime
            } | ConvertTo-Json
            
            Write-Host "Fetching KPIs for batch $([Math]::Floor($i/50) + 1) of $([Math]::Ceiling($inverters.Count/50))..." -ForegroundColor Cyan
            $kpiRes = Invoke-RestMethod -Uri $kpiUrl -Method Post -Body $kpiBody -ContentType "application/json" -Headers $headers -WebSession $sessVar
            
            if ($kpiRes.success -and $kpiRes.data) {
                foreach ($kpi in $kpiRes.data) {
                    $devId = $kpi.devId
                    
                    # Convert collectTime (milliseconds) to local day in Thailand timezone (UTC+7)
                    $day = [DateTimeOffset]::FromUnixTimeMilliseconds($kpi.collectTime).ToOffset([TimeSpan]::FromHours(7)).Day
                    
                    $energy = 0.0
                    if ($kpi.dataItemMap -and $kpi.dataItemMap.product_power -ne $null) {
                        $energy = [double]$kpi.dataItemMap.product_power
                    }
                    
                    if (-not $allKpis.ContainsKey($devId)) {
                        $allKpis[$devId] = @{}
                    }
                    $allKpis[$devId][$day] = $energy
                }
            }
            Start-Sleep -Seconds 3
        }
        
        # 5. Format into CSV structure
        $csvLines = @()
        $csvLines += 'ไซต์,ชื่ออุปกรณ์,กำลังการผลิต (kW),รวมการผลิต (kWh),วันที่ 1,วันที่ 2,วันที่ 3,วันที่ 4,วันที่ 5,วันที่ 6,วันที่ 7,วันที่ 8,วันที่ 9,วันที่ 10,วันที่ 11,วันที่ 12,วันที่ 13,วันที่ 14,วันที่ 15,วันที่ 16,วันที่ 17,วันที่ 18,วันที่ 19,วันที่ 20,วันที่ 21,วันที่ 22,วันที่ 23,วันที่ 24,วันที่ 25,วันที่ 26,วันที่ 27,วันที่ 28,วันที่ 29,วันที่ 30,วันที่ 31'
        
        foreach ($inv in $inverters) {
            $devId = $inv.id
            $devName = $inv.devName
            $stationCode = $inv.stationCode
            $stationName = ""
            if ($stationMap.ContainsKey($stationCode)) {
                $stationName = $stationMap[$stationCode]
            }
            $capacity = $inv.capacity
            if ($capacity -eq $null) { $capacity = "" }
            
            $devKpis = $allKpis[$devId]
            
            $dailyValues = @()
            $totalGen = 0.0
            for ($day = 1; $day -le 31; $day++) {
                $valStr = ""
                if ($devKpis -and $devKpis.ContainsKey($day)) {
                    $val = $devKpis[$day]
                    $totalGen += $val
                    $valStr = $val.ToString("F2")
                }
                $dailyValues += $valStr
            }
            
            $totalGenStr = $totalGen.ToString("F2")
            $rowStr = "`"$stationName`",`"$devName`",$capacity,$totalGenStr," + ($dailyValues -join ",")
            $csvLines += $rowStr
        }
        
        # 4.5 Query Active Alarms from FusionSolar
        Write-Host "Querying active alarms..." -ForegroundColor Cyan
        $allAlarms = @()
        $alarmUrl = "$apiUrl/thirdData/getAlarmList"
        # Query alarms from 7 days ago
        $alarmBeginTime = ([DateTimeOffset]($gNow.AddDays(-7))).ToUnixTimeMilliseconds()
        $alarmEndTime = ([DateTimeOffset]$gNow).ToUnixTimeMilliseconds()
        
        for ($sIdx = 0; $sIdx -lt $stationCodesList.Count; $sIdx += 50) {
            $endIdx = $sIdx + 49
            if ($endIdx -ge $stationCodesList.Count) { $endIdx = $stationCodesList.Count - 1 }
            $chunkStations = $stationCodesList[$sIdx..$endIdx]
            $chunkStationCodes = $chunkStations -join ","
            
            $alarmBody = @{
                stationCodes = $chunkStationCodes
                beginTime = $alarmBeginTime
                endTime = $alarmEndTime
                language = "en_US"
            } | ConvertTo-Json
            
            try {
                $alarmRes = Invoke-RestMethod -Uri $alarmUrl -Method Post -Body $alarmBody -ContentType "application/json" -Headers $headers -WebSession $sessVar
                if ($alarmRes.success -and $alarmRes.data) {
                    $allAlarms += $alarmRes.data
                }
            } catch {
                Write-Host "Error fetching alarms for batch $([Math]::Floor($sIdx/50) + 1): $_" -ForegroundColor Yellow
            }
            Start-Sleep -Milliseconds 500
        }
        
        # 4.6 Append Offline Stations to Alarms List
        Write-Host "Appending offline station alarms..." -ForegroundColor Cyan
        if ($stationHealthMap) {
            foreach ($stCode in $stationHealthMap.Keys) {
                $health = $stationHealthMap[$stCode]
                if ($health -ne 3) {
                    $hasExistingOfflineAlarm = $false
                    foreach ($al in $allAlarms) {
                        if ($al.stationCode -eq $stCode -and ($al.alarmName -match "Connection" -or $al.alarmName -match "Offline" -or $al.alarmName -match "Communication")) {
                            $hasExistingOfflineAlarm = $true
                            break
                        }
                    }
                    
                    if (-not $hasExistingOfflineAlarm) {
                        $alarmNameStr = "Station Offline (Communication Failure)"
                        $levelInt = 1
                        if ($health -eq 2) {
                            $alarmNameStr = "Station Faulty (Partial Offline)"
                            $levelInt = 2
                        }
                        
                        $customAlarm = [PSCustomObject]@{
                            stationCode = $stCode
                            devName = "Communication Gateway"
                            alarmName = $alarmNameStr
                            alarmLevel = $levelInt
                            alarmStatus = 1
                            raiseTime = ([DateTimeOffset]$gNow).ToUnixTimeMilliseconds()
                        }
                        $allAlarms += $customAlarm
                    }
                }
            }
        }
        
        # Format alarms into CSV
        $alarmCsvLines = @()
        $alarmCsvLines += 'ไซต์,ชื่ออุปกรณ์,ชื่อการแจ้งเตือน,ระดับความรุนแรง,เวลาที่เกิด'
        
        foreach ($al in $allAlarms) {
            # Only include alarms that are still active (alarmStatus = 1 or null/empty defaults to active)
            if ($al.alarmStatus -ne $null -and $al.alarmStatus -ne 1) {
                continue
            }
            $alStationCode = $al.stationCode
            $alStationName = ""
            if ($stationMap.ContainsKey($alStationCode)) {
                $alStationName = $stationMap[$alStationCode]
            }
            
            $alDevName = $al.devName
            if ($alDevName -eq $null) { $alDevName = "อินเวอร์เตอร์" }
            
            $alName = $al.alarmName
            if ($alName -eq $null) { $alName = $al.alarmId }
            
            # Map alarmLevel to string (1=Critical, 2=Major, 3=Minor, 4=Warning)
            $alLevel = "คำเตือน (Warning)"
            if ($al.alarmLevel -eq 1) { $alLevel = "วิกฤต (Critical)" }
            elseif ($al.alarmLevel -eq 2) { $alLevel = "รุนแรง (Major)" }
            elseif ($al.alarmLevel -eq 3) { $alLevel = "ปานกลาง (Minor)" }
            
            # Convert raiseTime (milliseconds) to UTC+7 string
            $alTimeStr = "-"
            if ($al.raiseTime -ne $null) {
                $alTimeStr = [DateTimeOffset]::FromUnixTimeMilliseconds($al.raiseTime).ToOffset([TimeSpan]::FromHours(7)).ToString("yyyy-MM-dd HH:mm:ss")
            }
            
            $alarmCsvLines += "`"$alStationName`",`"$alDevName`",`"$alName`",`"$alLevel`",`"$alTimeStr`""
        }
        
        $alarmOutputPath = Join-Path $PSScriptRoot "alarm_report.csv"
        $alarmCsvContent = $alarmCsvLines -join "`r`n"
        [System.IO.File]::WriteAllBytes($alarmOutputPath, [System.Text.Encoding]::UTF8.GetPreamble() + [System.Text.Encoding]::UTF8.GetBytes($alarmCsvContent))
        Write-Host "Alarm sync complete. Saved $($allAlarms.Count) alarms to $alarmOutputPath" -ForegroundColor Green
        
        # Write to inverter_report.csv with UTF-8 BOM
        $outputPath = Join-Path $PSScriptRoot "inverter_report.csv"
        $csvContent = $csvLines -join "`r`n"
        [System.IO.File]::WriteAllBytes($outputPath, [System.Text.Encoding]::UTF8.GetPreamble() + [System.Text.Encoding]::UTF8.GetBytes($csvContent))
        
        Write-Host "Success! Sync complete. Saved to $outputPath" -ForegroundColor Green
        
        # Auto-push updated data to GitHub so that the Vercel cloud dashboard stays in sync
        # Only run this if we are running locally (not in GitHub Actions) and have a .git folder
        if (-not $env:GITHUB_ACTIONS -and (Test-Path (Join-Path $PSScriptRoot ".git"))) {
            try {
                Write-Host "Auto-pushing updated CSVs to GitHub..." -ForegroundColor Cyan
                git add inverter_report.csv alarm_report.csv
                git commit -m "Auto-update FusionSolar data from local sync [skip ci]"
                git push origin main
                Write-Host "Successfully pushed updated CSVs to GitHub!" -ForegroundColor Green
            } catch {
                Write-Host "Failed to push to GitHub: $_" -ForegroundColor Yellow
            }
        }
        
        return '{"success": true, "message": "ดึงข้อมูลอินเวอร์เตอร์ ' + $inverters.Count + ' เครื่อง สำเร็จเรียบร้อย!"}'
    } catch {
        $err = $_.ToString()
        Write-Host "Error during FusionSolar API sync: $err" -ForegroundColor Red
        return '{"success": false, "message": "เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + $err.Replace('"', '\"') + '"}'
    }
}

# If run with -SyncOnly parameter, just run sync and exit immediately
if ($SyncOnly) {
    $result = Sync-FusionSolarData
    Write-Host "SyncOnly result: $result"
    if ($result -like '*"success": false*') {
        exit 1
    }
    exit 0
}

try {
    # Always perform an initial sync on startup to ensure data is fresh
    Write-Host "Launching initial FusionSolar sync on startup..." -ForegroundColor Yellow
    $syncResult = Sync-FusionSolarData
    Write-Host "Initial sync result: $syncResult" -ForegroundColor Cyan

    # Start the background scheduler to run automatic sync every 4 hours (14400 seconds)
    $schedulerScript = {
        param($scriptRoot)
        Write-Output "Background sync scheduler started."
        while ($true) {
            # Sleep first, sync every 14400 seconds (4 hours)
            Start-Sleep -Seconds 14400
            Write-Output "Triggering background scheduled sync..."
            powershell -NoProfile -ExecutionPolicy Bypass -Command "& '$scriptRoot\server.ps1' -SyncOnly"
        }
    }
    $syncJob = Start-Job -ScriptBlock $schedulerScript -ArgumentList $PSScriptRoot

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
            
            # Intercept API sync route
            if ($url -eq "/api/sync" -or $url -eq "/api/refresh") {
                $syncResult = Sync-FusionSolarData
                $res.ContentType = "application/json; charset=utf-8"
                $res.StatusCode = 200
                
                $res.AddHeader("Access-Control-Allow-Origin", "*")
                $res.AddHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
                
                if ($req.HttpMethod -eq "OPTIONS") {
                    $res.Close()
                    continue
                }
                
                $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($syncResult)
                $res.ContentLength64 = $jsonBytes.Length
                $res.OutputStream.Write($jsonBytes, 0, $jsonBytes.Length)
                $res.Close()
                continue
            }
            
            # Intercept API save config route
            if ($url -eq "/api/save-config") {
                $res.AddHeader("Access-Control-Allow-Origin", "*")
                $res.AddHeader("Access-Control-Allow-Headers", "Content-Type")
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
    if ($syncJob) {
        Write-Host "Stopping background sync job..." -ForegroundColor Yellow
        Stop-Job $syncJob
        Remove-Job $syncJob
    }
}
