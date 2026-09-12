[CmdletBinding()]
param(
  [switch]$ByFile
)

$ErrorActionPreference = "Stop"
$repositoryPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$repositoryName = Split-Path -Leaf $repositoryPath
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$reportPath = Join-Path $PSScriptRoot "$timestamp-linecount.txt"
$report = [System.Text.StringBuilder]::new()

function Add-ReportLine {
  param([AllowEmptyString()][string]$Text = "")

  [void]$report.AppendLine($Text)
}

function Add-LanguageTable {
  param([Parameter(Mandatory)][object[]]$Rows)

  Add-ReportLine ("{0,-24} {1,8} {2,12} {3,12} {4,12} {5,12} {6,12} {7,14}" -f `
      "Language", "Files", "Lines", "Code", "Comments", "Blanks", "Complexity", "Bytes")
  Add-ReportLine ("-" * 122)

  foreach ($row in $Rows) {
    Add-ReportLine ("{0,-24} {1,8:N0} {2,12:N0} {3,12:N0} {4,12:N0} {5,12:N0} {6,12:N0} {7,14:N0}" -f `
        $row.Name, $row.Files, $row.Lines, $row.Code, $row.Comments,
        $row.Blanks, $row.Complexity, $row.Bytes)
  }
}

function Add-FileTable {
  param([Parameter(Mandatory)][object[]]$Rows)

  Add-ReportLine "Path | Language | Lines | Code | Comments | Blanks | Complexity | Bytes"
  Add-ReportLine ("-" * 122)

  foreach ($row in $Rows) {
    Add-ReportLine ("{0} | {1} | {2:N0} | {3:N0} | {4:N0} | {5:N0} | {6:N0} | {7:N0}" -f `
        $row.Path, $row.Language, $row.Lines, $row.Code, $row.Comments,
        $row.Blanks, $row.Complexity, $row.Bytes)
  }
}

function ConvertTo-LanguageRow {
  param([Parameter(Mandatory)]$Language)

  [pscustomobject]@{
    Name       = [string]$Language.Name
    Files      = [long]$Language.Count
    Lines      = [long]$Language.Lines
    Code       = [long]$Language.Code
    Comments   = [long]$Language.Comment
    Blanks     = [long]$Language.Blank
    Complexity = [long]$Language.Complexity
    Bytes      = [long]$Language.Bytes
  }
}

function Get-TotalRow {
  param(
    [Parameter(Mandatory)][object[]]$Rows,
    [string]$Name = "TOTAL"
  )

  [pscustomobject]@{
    Name       = $Name
    Files      = [long](($Rows | Measure-Object Files -Sum).Sum)
    Lines      = [long](($Rows | Measure-Object Lines -Sum).Sum)
    Code       = [long](($Rows | Measure-Object Code -Sum).Sum)
    Comments   = [long](($Rows | Measure-Object Comments -Sum).Sum)
    Blanks     = [long](($Rows | Measure-Object Blanks -Sum).Sum)
    Complexity = [long](($Rows | Measure-Object Complexity -Sum).Sum)
    Bytes      = [long](($Rows | Measure-Object Bytes -Sum).Sum)
  }
}

$sccCommand = Get-Command scc -ErrorAction SilentlyContinue
if (-not $sccCommand) {
  throw "SCC was not found in PATH."
}

if (-not (Test-Path -LiteralPath (Join-Path $repositoryPath ".git"))) {
  throw "Repository root was not found at $repositoryPath."
}

Add-ReportLine "SCC Line Count: $repositoryName"
Add-ReportLine "Generated:  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
Add-ReportLine "Repository: $repositoryPath"
Add-ReportLine "SCC:        $(& $sccCommand.Source --version)"
Add-ReportLine "By file:    $ByFile"

$ignorePath = Join-Path $repositoryPath ".sccignore"
if (Test-Path -LiteralPath $ignorePath) {
  Add-ReportLine "Configuration: $ignorePath (automatically loaded by SCC)"
}
else {
  Add-ReportLine "Configuration: SCC defaults and repository ignore files"
}

$tempPath = [System.IO.Path]::GetTempFileName()
try {
  Push-Location -LiteralPath $repositoryPath
  try {
    $diagnostics = @(& $sccCommand.Source --format json --no-cocomo --output $tempPath . 2>&1)
    $exitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }

  if ($exitCode -ne 0) {
    throw "SCC exited with code ${exitCode}: $($diagnostics -join ' ')"
  }

  $languages = ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText($tempPath))
  $rows = @(
    foreach ($language in $languages) {
      ConvertTo-LanguageRow $language
    }
  )
  $rows = @($rows | Sort-Object Code -Descending)

  Add-ReportLine ""
  if ($rows.Count -eq 0) {
    Add-ReportLine "No countable files matched this repository's SCC configuration."
  }
  else {
    $total = Get-TotalRow -Rows $rows
    Add-LanguageTable -Rows @($rows + $total)

    if ($ByFile) {
      $fileRows = @(
        foreach ($language in $languages) {
          foreach ($file in $language.Files) {
            [pscustomobject]@{
              Path       = [string]$file.Location
              Language   = [string]$file.Language
              Lines      = [long]$file.Lines
              Code       = [long]$file.Code
              Comments   = [long]$file.Comment
              Blanks     = [long]$file.Blank
              Complexity = [long]$file.Complexity
              Bytes      = [long]$file.Bytes
            }
          }
        }
      )

      Add-ReportLine ""
      Add-ReportLine "FILE-BY-FILE DETAIL ($($fileRows.Count) files)"
      $sortedFileRows = @($fileRows | Sort-Object -Property `
          @{ Expression = "Code"; Descending = $true }, Path)
      Add-FileTable -Rows $sortedFileRows
    }
  }
}
finally {
  if (Test-Path -LiteralPath $tempPath) {
    Remove-Item -LiteralPath $tempPath -Force
  }
}

[System.IO.File]::WriteAllText(
  $reportPath,
  $report.ToString(),
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Wrote SCC report for $repositoryName to:"
Write-Host $reportPath
